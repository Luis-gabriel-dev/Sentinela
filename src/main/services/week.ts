import type { Api } from '@shared/api'
import {
  weekAvailabilitySchema,
  type ProposedBlock,
  type WeekAvailability,
  type WeekWindow,
  type WindowKind
} from '@shared/schemas'
import { getSetting, setSetting } from '../ai/config'
import type { Db } from '../db/client'
import { applyProposal, overlaps, toMinutes, type Slot } from './proposals'

const WEEK_KEY = 'week.availability'

/** Horários livres guardados (vazio se ainda não foram informados). */
export function readWeekAvailability(db: Db): WeekAvailability {
  try {
    const parsed = weekAvailabilitySchema.safeParse(JSON.parse(getSetting(db, WEEK_KEY) ?? ''))
    if (parsed.success) return parsed.data
  } catch {
    // Nada guardado ainda.
  }
  return { windows: [] }
}

const BLOCK_MAX = 120
const BLOCK_MIN = 45
const PAUSE = 15

const hhmm = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/**
 * Completa os horários livres que ficaram vazios: a IA costuma usar só o começo de cada um.
 * As sobras viram blocos de até 2h (com 15 min de pausa), revezando os temas nos horários de
 * estudos e os projetos nos de projetos. `pools` vem na ordem de prioridade.
 */
export function fillWindows(
  windows: WeekWindow[],
  blocks: ProposedBlock[],
  busy: Slot[],
  pools: Record<WindowKind, Omit<ProposedBlock, 'weekday' | 'startTime' | 'endTime'>[]>
): ProposedBlock[] {
  const out = [...blocks]
  const turn: Record<WindowKind, number> = { estudos: 0, projetos: 0 }
  const ordered = windows.toSorted(
    (a, b) =>
      ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.startTime.localeCompare(b.startTime)
  )
  for (const w of ordered) {
    const pool = pools[w.kind]
    if (!pool.length) continue
    const start = toMinutes(w.startTime)
    const end = toMinutes(w.endTime)
    const taken = [...out, ...busy]
      .filter((b) => b.weekday === w.weekday)
      .map((b) => [toMinutes(b.startTime), toMinutes(b.endTime)] as const)
      .filter(([s, e]) => s < end && e > start)
      .toSorted((a, b) => a[0] - b[0])
    const gaps: [number, number][] = []
    let cursor = start
    for (const [s, e] of taken) {
      if (s > cursor) gaps.push([cursor, s])
      cursor = Math.max(cursor, e)
    }
    if (end > cursor) gaps.push([cursor, end])
    for (const [gapStart, gapEnd] of gaps) {
      // Depois de um bloco, uma pausa antes do próximo.
      let at = gapStart === start ? gapStart : gapStart + PAUSE
      while (gapEnd - at >= BLOCK_MIN) {
        // Sobra pequena demais para outro bloco: fica neste.
        const left = gapEnd - at
        const length = left - BLOCK_MAX < BLOCK_MIN + PAUSE ? Math.min(left, 150) : BLOCK_MAX
        const subject = pool[turn[w.kind]++ % pool.length]
        out.push({
          ...subject,
          weekday: w.weekday,
          startTime: hhmm(at),
          endTime: hhmm(at + length)
        })
        at += length + PAUSE
      }
    }
  }
  return out
}

/** Partes dos horários livres sem nenhum bloco, de pelo menos 45 minutos. */
export function vacantSlots(
  windows: WeekWindow[],
  blocks: { weekday: number | null; startTime: string; endTime: string }[]
): WeekWindow[] {
  const out: WeekWindow[] = []
  for (const w of windows) {
    let cursor = toMinutes(w.startTime)
    const end = toMinutes(w.endTime)
    const taken = blocks
      .filter((b) => b.weekday === w.weekday)
      .map((b) => [toMinutes(b.startTime), toMinutes(b.endTime)] as const)
      .filter(([s, e]) => s < end && e > cursor)
      .toSorted((a, b) => a[0] - b[0])
    for (const [s, e] of taken) {
      if (s - cursor >= BLOCK_MIN) out.push({ ...w, startTime: hhmm(cursor), endTime: hhmm(s) })
      cursor = Math.max(cursor, e)
    }
    if (end - cursor >= BLOCK_MIN) out.push({ ...w, startTime: hhmm(cursor), endTime: hhmm(end) })
  }
  return out
}

export function createWeekService(db: Db): Api['week'] {
  return {
    async availability() {
      return readWeekAvailability(db)
    },

    async saveAvailability(input) {
      const windows = weekAvailabilitySchema
        .parse(input)
        .windows.toSorted(
          (a, b) =>
            ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.startTime.localeCompare(b.startTime)
        )
      windows.forEach((w, i) => {
        if (windows.slice(i + 1).some((o) => overlaps(w, o))) {
          throw new Error('Dois horários do mesmo dia se sobrepõem')
        }
      })
      setSetting(db, WEEK_KEY, JSON.stringify({ windows }))
      return { windows }
    },

    async applyPlan(proposal, skip) {
      return applyProposal(db, proposal, skip)
    }
  }
}
