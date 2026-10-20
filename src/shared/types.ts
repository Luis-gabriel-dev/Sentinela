import type { Priority, Recurrence } from './schemas'

export interface Topic {
  id: number
  parentId: number | null
  name: string
  color: string
  description: string | null
  position: number
  trackProgress: boolean
  weeklyGoal: number | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface Task {
  id: number
  title: string
  description: string | null
  topicId: number | null
  priority: Priority
  dueDate: string | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface ScheduleBlock {
  id: number
  title: string
  topicId: number | null
  color: string | null
  recurrence: Recurrence
  /** 0 = domingo ... 6 = sábado (só quando recurrence = 'weekly') */
  weekday: number | null
  /** AAAA-MM-DD (só quando recurrence = 'once') */
  date: string | null
  startTime: string
  endTime: string
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

export interface BlockCheckin {
  blockId: number
  date: string
}

/** Anotação sem o conteúdo (para listas e árvore). */
export interface NoteSummary {
  id: number
  topicId: number | null
  title: string
  createdAt: Date
  updatedAt: Date
}

export interface Note extends NoteSummary {
  /** Blocos do BlockNote. */
  content: unknown[]
}

export interface NoteSearchResult {
  id: number
  topicId: number | null
  title: string
  /** Trecho do texto; os termos encontrados ficam entre SNIPPET_MARK.start e SNIPPET_MARK.end. */
  snippet: string
}

export const SNIPPET_MARK = { start: '\u0001', end: '\u0002' } as const

export interface AppInfo {
  version: string
  dbPath: string
}
