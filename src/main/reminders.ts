import { app, Notification } from 'electron'
import { and, eq, inArray, isNull, lte } from 'drizzle-orm'
import type { Api } from '@shared/api'
import { remindersUpdateSchema } from '@shared/schemas'
import type { ReminderSettings, ReminderStatus } from '@shared/types'
import { getSetting, setSetting } from './ai/config'
import { topicTree } from './ai/context'
import type { Db } from './db/client'
import { blockCheckins, projects, scheduleBlocks, tasks } from './db/schema'

const CONFIG_KEY = 'reminders.config'
/** Avisos já mostrados (chave → dia), para não repetir nem depois de reiniciar o app. */
const SENT_KEY = 'reminders.sent'
const TICK_MS = 30_000
const DAY_MS = 86_400_000

const DEFAULTS: ReminderSettings = {
  enabled: true,
  blocks: true,
  blockMinutes: 10,
  tasks: true,
  projects: true,
  digestTime: '08:00',
  closeToTray: true,
  openAtLogin: false
}

/** "AAAA-MM-DD" no fuso local. */
const isoDate = (d: Date): string => d.toLocaleDateString('sv-SE')
const at = (date: Date, time: string): Date => {
  const d = new Date(date)
  d.setHours(Number(time.slice(0, 2)), Number(time.slice(3)), 0, 0)
  return d
}

/** Até `max` itens e "e mais N". */
const listed = (items: string[], max = 3): string =>
  items.slice(0, max).join('\n') + (items.length > max ? `\ne mais ${items.length - max}` : '')

export interface RemindersOptions {
  icon: string
  /** Mostra a janela principal na rota indicada (clique na notificação). */
  open: (route: string) => void
  /** Atualiza os projetos no GitHub antes do aviso de projeto parado. */
  syncProjects: () => Promise<unknown>
}

export interface Reminders {
  api: Api['reminders']
  settings(): ReminderSettings
  setEnabled(enabled: boolean): void
  /** Avisa uma vez que o app continua na bandeja depois de fechar a janela. */
  notifyTrayOnce(): void
  stop(): void
}

export function createReminders(db: Db, options: RemindersOptions): Reminders {
  // Notificações precisam de referência até o clique, senão o coletor de lixo some com o handler.
  const alive = new Set<Notification>()

  const settings = (): ReminderSettings => {
    const stored = getSetting(db, CONFIG_KEY)
    return { ...DEFAULTS, ...(stored ? (JSON.parse(stored) as Partial<ReminderSettings>) : {}) }
  }

  const sentMap = (): Record<string, string> => {
    const stored = getSetting(db, SENT_KEY)
    return stored ? (JSON.parse(stored) as Record<string, string>) : {}
  }
  const wasSent = (key: string): boolean => key in sentMap()
  const markSent = (key: string): void => {
    const cutoff = isoDate(new Date(Date.now() - 3 * DAY_MS))
    const kept = Object.fromEntries(Object.entries(sentMap()).filter(([, day]) => day >= cutoff))
    setSetting(db, SENT_KEY, JSON.stringify({ ...kept, [key]: isoDate(new Date()) }))
  }

  const notify = (title: string, body: string, route: string): void => {
    if (!Notification.isSupported()) return
    const notification = new Notification({ title, body, icon: options.icon })
    alive.add(notification)
    notification.on('click', () => {
      alive.delete(notification)
      options.open(route)
    })
    notification.on('close', () => alive.delete(notification))
    notification.show()
  }

  /** Blocos de hoje que começam dentro da antecedência escolhida (e ainda não foram feitos). */
  const checkBlocks = (now: Date, minutes: number): void => {
    const today = isoDate(now)
    const tree = topicTree(db)
    const blocks = db
      .select()
      .from(scheduleBlocks)
      .all()
      .filter((b) => (b.recurrence === 'weekly' ? b.weekday === now.getDay() : b.date === today))
    for (const block of blocks) {
      const untilStart = (at(now, block.startTime).getTime() - now.getTime()) / 60_000
      if (untilStart <= -1 || untilStart > minutes) continue
      const key = `block:${block.id}:${today}`
      if (wasSent(key)) continue
      const done = db
        .select()
        .from(blockCheckins)
        .where(and(eq(blockCheckins.blockId, block.id), eq(blockCheckins.date, today)))
        .get()
      markSent(key)
      if (done) continue
      const when = untilStart < 1 ? 'Começando agora' : `Daqui a ${Math.round(untilStart)} min`
      notify(
        `${when}: ${block.title}`,
        `${block.startTime}–${block.endTime}` +
          (block.topicId ? ` · ${tree.path(block.topicId)}` : ''),
        '/agenda'
      )
    }
  }

  /** Tarefas urgentes ou de prioridade alta atrasadas, de hoje ou de amanhã. */
  const taskDigest = (now: Date): void => {
    const today = isoDate(now)
    const tomorrow = isoDate(new Date(now.getTime() + DAY_MS))
    const rows = db
      .select()
      .from(tasks)
      .where(
        and(
          isNull(tasks.completedAt),
          inArray(tasks.priority, ['urgent', 'high']),
          lte(tasks.dueDate, tomorrow)
        )
      )
      .all()
      .toSorted((a, b) => a.dueDate!.localeCompare(b.dueDate!))
    if (!rows.length) return
    const label = (due: string): string =>
      due < today ? 'Atrasada' : due === today ? 'Hoje' : 'Amanhã'
    notify(
      rows.length === 1 ? 'Tarefa importante' : `${rows.length} tarefas importantes`,
      listed(rows.map((t) => `${label(t.dueDate!)}: ${t.title}`)),
      '/tarefas'
    )
  }

  const projectDigest = async (now: Date): Promise<void> => {
    // Dados frescos do GitHub; sem internet, vale o que já estava salvo.
    await options.syncProjects().catch(() => undefined)
    const stale = db
      .select()
      .from(projects)
      .where(eq(projects.archived, false))
      .all()
      .flatMap((p) => {
        if (!p.lastCommitAt) return []
        const days = Math.floor((now.getTime() - p.lastCommitAt.getTime()) / DAY_MS)
        return days > p.staleDays ? [{ name: p.repo.split('/').pop()!, days }] : []
      })
      .toSorted((a, b) => b.days - a.days)
    if (!stale.length) return
    notify(
      stale.length === 1 ? 'Projeto parado' : `${stale.length} projetos parados`,
      listed(stale.map((p) => `${p.name}: ${p.days} dias sem commit`)),
      '/projetos'
    )
  }

  let running = false
  const tick = async (): Promise<void> => {
    const s = settings()
    if (!s.enabled || running) return
    running = true
    try {
      const now = new Date()
      if (s.blocks) checkBlocks(now, s.blockMinutes)
      // Resumo do dia: no horário escolhido, ou ao abrir o app se o horário já passou.
      const digestKey = `digest:${isoDate(now)}`
      if (now >= at(now, s.digestTime) && !wasSent(digestKey)) {
        markSent(digestKey)
        if (s.tasks) taskDigest(now)
        if (s.projects) await projectDigest(now)
      }
    } catch (error) {
      console.error('Lembretes:', error)
    } finally {
      running = false
    }
  }

  const applyLogin = (openAtLogin: boolean): void => {
    // No modo de desenvolvimento, registraria o electron.exe solto; só vale no app instalado.
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin, args: ['--hidden'] })
  }

  const status = (): ReminderStatus => ({
    ...settings(),
    supported: Notification.isSupported(),
    canOpenAtLogin: app.isPackaged
  })

  const save = (next: ReminderSettings): void => setSetting(db, CONFIG_KEY, JSON.stringify(next))

  const timer = setInterval(() => void tick(), TICK_MS)
  // Primeira verificação logo depois de abrir (dá tempo da janela aparecer).
  const first = setTimeout(() => void tick(), 8000)

  return {
    settings,

    setEnabled(enabled) {
      save({ ...settings(), enabled })
    },

    notifyTrayOnce() {
      if (getSetting(db, 'reminders.trayNotice')) return
      setSetting(db, 'reminders.trayNotice', '1')
      notify(
        'O Sentinela continua aberto',
        'Ele fica na bandeja para mandar os lembretes. Para sair de vez, use "Sair" no ícone da bandeja.',
        '/'
      )
    },

    stop() {
      clearInterval(timer)
      clearTimeout(first)
    },

    api: {
      async status() {
        return status()
      },

      async updateSettings(input) {
        const data = remindersUpdateSchema.parse(input)
        const next = { ...settings(), ...data }
        save(next)
        if (data.openAtLogin !== undefined) applyLogin(next.openAtLogin)
        return status()
      },

      async test() {
        if (!Notification.isSupported()) {
          throw new Error('Este sistema não mostra notificações')
        }
        notify('Lembretes funcionando', 'É assim que os avisos do Sentinela vão aparecer.', '/')
      }
    }
  }
}
