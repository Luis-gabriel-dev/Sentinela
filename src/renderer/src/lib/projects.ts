import type { Project } from '@shared/types'

const DAY = 86_400_000
const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

/** "hoje", "ontem", "há 3 dias", "há 2 semanas", "há 5 meses". */
export function timeAgo(date: Date, now = new Date()): string {
  const days = Math.floor((startOfDay(now) - startOfDay(date)) / DAY)
  if (days < 7) return relative.format(-days, 'day')
  if (days < 60) return relative.format(-Math.floor(days / 7), 'week')
  if (days < 730) return relative.format(-Math.floor(days / 30), 'month')
  return relative.format(-Math.floor(days / 365), 'year')
}

const startOfDay = (d: Date): number =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

export type ProjectHealth =
  | { kind: 'active'; days: number }
  | { kind: 'stale'; days: number }
  | { kind: 'archived' }
  | { kind: 'empty' }

/** Situação do projeto pelo último commit e pelo limite de dias configurado nele. */
export function projectHealth(project: Project, now = new Date()): ProjectHealth {
  if (project.archived) return { kind: 'archived' }
  if (!project.lastCommitAt) return { kind: 'empty' }
  const days = Math.floor((startOfDay(now) - startOfDay(project.lastCommitAt)) / DAY)
  return days > project.staleDays ? { kind: 'stale', days } : { kind: 'active', days }
}

/** Cores do GitHub para as linguagens mais comuns (sempre exibidas junto com o nome). */
export const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572a5',
  Rust: '#dea584',
  Go: '#00add8',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  Java: '#b07219',
  Kotlin: '#a97bff',
  HTML: '#e34c26',
  CSS: '#663399',
  Shell: '#89e051',
  PowerShell: '#012456',
  PHP: '#4f5d95',
  Ruby: '#701516',
  Dart: '#00b4ab',
  Lua: '#000080',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  Assembly: '#6e4c13',
  Jupyter: '#da5b0b',
  'Jupyter Notebook': '#da5b0b'
}
