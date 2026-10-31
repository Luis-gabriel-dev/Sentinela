import type { WeekWindow, WindowKind } from '@shared/schemas'
import type { Project, ScheduleBlock, Topic } from '@shared/types'
import { DEFAULT_COLOR, startOfWeek, toIsoDate } from './format'

/** Ordem dos dias na Semana: segunda primeiro (0 = domingo, como no resto do app). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

export const toMinutes = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))

const pad = (n: number): string => String(n).padStart(2, '0')
export const fromMinutes = (m: number): string => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`

export const KIND_LABEL: Record<WindowKind, string> = { estudos: 'Estudos', projetos: 'Projetos' }

/** Data (AAAA-MM-DD) de cada dia da semana `offset` semanas a partir da atual. */
export function weekDates(offset: number): Map<number, string> {
  const monday = startOfWeek()
  monday.setDate(monday.getDate() + offset * 7)
  return new Map(
    WEEK_ORDER.map((weekday, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      return [weekday, toIsoDate(d)]
    })
  )
}

/** Blocos de um dia: os semanais desse dia da semana e os avulsos daquela data. */
export const blocksOn = (blocks: ScheduleBlock[], weekday: number, date: string): ScheduleBlock[] =>
  blocks
    .filter((b) => (b.recurrence === 'weekly' ? b.weekday === weekday : b.date === date))
    .toSorted((a, b) => a.startTime.localeCompare(b.startTime))

export interface Area {
  key: string
  label: string
  color: string
}

/** Área do bloco: o tema principal (o de cima da árvore), o projeto ou "Outros". */
export function areaOf(
  block: ScheduleBlock,
  topicsById: Map<number, Topic>,
  projectsById: Map<number, Project>
): Area {
  if (block.topicId !== null) {
    let topic = topicsById.get(block.topicId)
    while (topic?.parentId != null && topicsById.has(topic.parentId)) {
      topic = topicsById.get(topic.parentId)
    }
    if (topic) return { key: `t${topic.id}`, label: topic.name, color: topic.color }
  }
  if (block.projectId !== null && projectsById.has(block.projectId)) {
    return { key: 'projetos', label: 'Projetos', color: '#a855f7' }
  }
  return { key: 'outros', label: 'Outros', color: block.color ?? DEFAULT_COLOR }
}

/**
 * Partes dos horários livres do dia que não têm bloco (para mostrar como "livre"). Menos de 30
 * minutos é pausa entre blocos, não conta.
 */
export function freeSegments(
  windows: WeekWindow[],
  blocks: ScheduleBlock[],
  weekday: number
): WeekWindow[] {
  const out: WeekWindow[] = []
  for (const w of windows.filter((x) => x.weekday === weekday)) {
    let cursor = toMinutes(w.startTime)
    const end = toMinutes(w.endTime)
    const inside = blocks
      .map((b) => [toMinutes(b.startTime), toMinutes(b.endTime)] as const)
      .filter(([s, e]) => s < end && e > cursor)
      .toSorted((a, b) => a[0] - b[0])
    for (const [s, e] of inside) {
      if (s - cursor >= 30)
        out.push({ ...w, startTime: fromMinutes(cursor), endTime: fromMinutes(s) })
      cursor = Math.max(cursor, e)
    }
    if (end - cursor >= 30)
      out.push({ ...w, startTime: fromMinutes(cursor), endTime: fromMinutes(end) })
  }
  return out
}

/** "1h30", "45 min". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} min`
  return m ? `${h}h${pad(m)}` : `${h}h`
}
