import type { Difficulty, Priority } from '@shared/schemas'
import type { Task } from '@shared/types'

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export const PRIORITY_META: Record<Priority, { label: string; className: string; rank: number }> = {
  urgent: {
    label: 'Urgente',
    rank: 0,
    className: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30'
  },
  high: {
    label: 'Alta',
    rank: 1,
    className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30'
  },
  normal: {
    label: 'Normal',
    rank: 2,
    className: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30'
  },
  low: {
    label: 'Baixa',
    rank: 3,
    className: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30'
  }
}

/** Abertas primeiro; depois prioridade, prazo mais próximo e mais recentes. */
export function compareTasks(a: Task, b: Task): number {
  return (
    Number(a.completedAt !== null) - Number(b.completedAt !== null) ||
    PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank ||
    (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
    b.createdAt.getTime() - a.createdAt.getTime()
  )
}

export const noteTitle = (title: string): string => title.trim() || 'Sem título'

/** Cor de quem não tem cor escolhida (bloco sem tema, pasta sem cor): o laranja do app. */
export const DEFAULT_COLOR = '#f97316'

export const COLOR_PRESETS = [
  '#f97316',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#64748b',
  '#a16207'
]

const pad = (n: number): string => String(n).padStart(2, '0')

/** Date → "AAAA-MM-DD" no fuso local. */
export const toIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Date → "HH:MM" no fuso local. */
export const toTime = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** "AAAA-MM-DD" → Date à meia-noite local (evita o deslocamento de fuso do new Date(string)). */
export const parseIsoDate = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const formatDate = (s: string): string =>
  parseIsoDate(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

export const todayIso = (): string => toIsoDate(new Date())

/** Início da semana (segunda-feira, 00:00). */
export function startOfWeek(d = new Date()): Date {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return start
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Fácil',
  medium: 'Média',
  hard: 'Difícil'
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  const decimal = (n: number): string => n.toFixed(1).replace('.', ',')
  if (bytes < 1024 ** 3) return `${decimal(bytes / 1024 ** 2)} MB`
  return `${decimal(bytes / 1024 ** 3)} GB`
}
