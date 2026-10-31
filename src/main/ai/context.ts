import { desc, eq, inArray, isNull } from 'drizzle-orm'
import { subtreeProgress, type SubtreeProgress } from '@shared/progress'
import type { Db } from '../db/client'
import { readWeekAvailability, vacantSlots } from '../services/week'
import {
  bookHighlights,
  books,
  exerciseSets,
  exercises,
  notes,
  projects,
  scheduleBlocks,
  tasks,
  topics
} from '../db/schema'

type TopicRow = typeof topics.$inferSelect

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const PRIORITY = { urgent: 'urgente', high: 'alta', normal: 'normal', low: 'baixa' } as const

function startOfWeek(now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

const daysAgo = (date: Date): number => Math.floor((Date.now() - date.getTime()) / 86_400_000)

/**
 * Linhas de uma seção do retrato, com um teto para o retrato não crescer sem fim com o uso
 * (e não tomar o espaço da conversa). Avisa quantos itens ficaram de fora.
 */
function capped<T>(items: T[], max: number, line: (item: T) => string): string[] {
  const out = items.slice(0, max).map(line)
  if (items.length > max) out.push(`- … e mais ${items.length - max} não listados`)
  return out
}

/** Caminho "Cybersegurança / Redes / TCP" e utilitários da árvore de temas. */
export function topicTree(db: Db): {
  all: TopicRow[]
  path: (id: number | null) => string
  children: (id: number) => TopicRow[]
  subtreeIds: (id: number) => number[]
  /** Progresso pelo nível mais fundo (veja subtreeProgress), com os pendentes em ordem. */
  progress: (id: number) => SubtreeProgress<TopicTreeNode>
} {
  const all = db.select().from(topics).all()
  const byId = new Map(all.map((t) => [t.id, t]))
  const children = (id: number): TopicRow[] =>
    all.filter((t) => t.parentId === id).toSorted((a, b) => a.position - b.position)
  const path = (id: number | null): string => {
    const parts: string[] = []
    for (
      let t = id !== null ? byId.get(id) : undefined;
      t;
      t = t.parentId ? byId.get(t.parentId) : undefined
    ) {
      parts.unshift(t.name)
    }
    return parts.join(' / ')
  }
  const subtreeIds = (id: number): number[] => [
    id,
    ...children(id).flatMap((c) => subtreeIds(c.id))
  ]
  const node = (row: TopicRow): TopicTreeNode => ({ ...row, children: children(row.id).map(node) })
  const progress = (id: number): SubtreeProgress<TopicTreeNode> =>
    subtreeProgress(node(byId.get(id)!), startOfWeek())
  return { all, path, children, subtreeIds, progress }
}

type TopicTreeNode = TopicRow & { children: TopicTreeNode[] }

/** Retrato dos estudos em texto, para a mentora se basear em dados reais. */
export function studySnapshot(db: Db): string {
  const tree = topicTree(db)
  const lines: string[] = [
    `Hoje é ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`
  ]

  lines.push('', '## Temas e progresso')
  // Temas com meta semanal primeiro: são os que a mentora mais precisa acompanhar.
  const tracked = tree.all
    .filter((t) => t.trackProgress)
    .toSorted((a, b) => Number(!!b.weeklyGoal) - Number(!!a.weeklyGoal))
  lines.push(
    ...capped(tracked, 40, (topic) => {
      const p = tree.progress(topic.id)
      return (
        `- [id ${topic.id}] ${tree.path(topic.id)}: ${p.done}/${p.total} tópicos concluídos` +
        (topic.weeklyGoal
          ? ` (meta ${topic.weeklyGoal}/semana; ${p.doneThisWeek} nesta semana)`
          : '') +
        (p.pending.length
          ? `. Próximos pendentes: ${p.pending
              .slice(0, 12)
              .map((t) => t.name)
              .join(', ')}`
          : '')
      )
    })
  )
  const roots = tree.all.filter((t) => t.parentId === null && !t.trackProgress)
  if (roots.length) {
    lines.push(
      `- Outros temas: ${roots
        .slice(0, 30)
        .map((t) => `[id ${t.id}] ${t.name}`)
        .join(', ')}`
    )
  }
  if (!tracked.length && !roots.length) lines.push('- (nenhum tema cadastrado)')

  lines.push('', '## Agenda semanal')
  const blocks = db.select().from(scheduleBlocks).all()
  const weekly = blocks
    .filter((b) => b.recurrence === 'weekly')
    .toSorted(
      (a, b) => (a.weekday ?? 0) - (b.weekday ?? 0) || a.startTime.localeCompare(b.startTime)
    )
  lines.push(
    ...capped(
      weekly,
      50,
      (b) =>
        `- ${WEEKDAYS[b.weekday ?? 0]} ${b.startTime}–${b.endTime}: ${b.title}` +
        (b.topicId ? ` [${tree.path(b.topicId)}]` : '')
    )
  )
  if (!weekly.length) lines.push('- (nenhum bloco semanal)')

  const { windows } = readWeekAvailability(db)
  if (windows.length) {
    lines.push('', '## Horários livres do estudante (página Semana)')
    lines.push(
      ...windows.map((w) => `- ${WEEKDAYS[w.weekday]} ${w.startTime}–${w.endTime}: ${w.kind}`)
    )
    // Já descontados os blocos: é onde dá para propor blocos novos sem sobrepor.
    const vacant = vacantSlots(windows, weekly)
    lines.push(
      '',
      '## Horários livres ainda vagos (sem bloco)',
      ...(vacant.length
        ? vacant.map((w) => `- ${WEEKDAYS[w.weekday]} ${w.startTime}–${w.endTime}: ${w.kind}`)
        : ['- (nenhum: a semana está cheia; para mudar, use Semana > Planejar com IA)'])
    )
  }

  lines.push('', '## Tarefas abertas')
  const open = db
    .select()
    .from(tasks)
    .where(isNull(tasks.completedAt))
    .all()
    .toSorted((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
  // Já marca o atraso: modelos pequenos erram ao comparar datas por conta própria.
  const today = new Date().toLocaleDateString('sv-SE')
  const due = (date: string): string =>
    `, prazo ${date}` +
    (date < today
      ? ` (ATRASADA há ${daysAgo(new Date(`${date}T00:00`))} dias)`
      : date === today
        ? ' (vence hoje)'
        : '')
  lines.push(
    ...capped(
      open,
      20,
      (t) =>
        `- ${t.title} (prioridade ${PRIORITY[t.priority]}${t.dueDate ? due(t.dueDate) : ''})` +
        (t.topicId ? ` [${tree.path(t.topicId)}]` : '')
    )
  )
  if (!open.length) lines.push('- (nenhuma)')

  lines.push('', '## Exercícios (últimas listas)')
  const sets = db.select().from(exerciseSets).orderBy(desc(exerciseSets.createdAt)).limit(10).all()
  for (const set of sets) {
    const items = db.select().from(exercises).where(eq(exercises.setId, set.id)).all()
    const answered = items.filter((e) => e.result)
    const correct = answered.filter((e) => e.result === 'correct').length
    const partial = answered.filter((e) => e.result === 'partial').length
    lines.push(
      `- ${set.title}${set.topicId ? ` [${tree.path(set.topicId)}]` : ''}: ` +
        (answered.length
          ? `${correct} certas, ${partial} parciais, ${answered.length - correct - partial} erradas de ${answered.length} respondidas (de ${items.length})`
          : `não respondida (${items.length} questões)`) +
        `, há ${daysAgo(set.createdAt)} dias`
    )
  }
  if (!sets.length) lines.push('- (nenhuma lista feita ainda)')

  lines.push('', '## Projetos de programação (GitHub)')
  const repos = db
    .select()
    .from(projects)
    .all()
    .toSorted((a, b) => Number(a.archived) - Number(b.archived))
  lines.push(
    ...capped(
      repos,
      20,
      (p) =>
        `- ${p.repo}: ` +
        (p.lastCommitAt ? `último commit há ${daysAgo(p.lastCommitAt)} dias` : 'sem commits') +
        ` (avisar após ${p.staleDays} dias)${p.archived ? ', arquivado' : ''}`
    )
  )
  if (!repos.length) lines.push('- (nenhum projeto acompanhado)')

  lines.push('', '## Anotações por tema')
  const noteRows = db.select({ title: notes.title, topicId: notes.topicId }).from(notes).all()
  const byTopic = new Map<string, string[]>()
  for (const n of noteRows) {
    const key = n.topicId ? tree.path(n.topicId) : 'Sem tema'
    byTopic.set(key, [...(byTopic.get(key) ?? []), n.title.trim() || 'Sem título'])
  }
  lines.push(
    ...capped(
      [...byTopic],
      30,
      ([key, titles]) =>
        `- ${key}: ${titles.slice(0, 10).join('; ')}` +
        (titles.length > 10 ? ` (e mais ${titles.length - 10})` : '')
    )
  )
  if (!byTopic.size) lines.push('- (nenhuma anotação)')

  return lines.join('\n')
}

/**
 * Material de estudo de um tema (e subtemas): texto das anotações e destaques dos livros
 * ligados a ele, até `maxChars`. `complete` diz se coube tudo.
 */
export function topicMaterial(
  db: Db,
  topicId: number,
  maxChars: number
): { text: string; complete: boolean } {
  const tree = topicTree(db)
  const ids = tree.subtreeIds(topicId)
  const parts: string[] = []
  let size = 0
  let complete = true
  const push = (text: string): boolean => {
    if (size + text.length > maxChars) {
      complete = false
      return false
    }
    parts.push(text)
    size += text.length
    return true
  }

  const noteRows = db.select().from(notes).where(inArray(notes.topicId, ids)).all()
  for (const n of noteRows) {
    if (!n.contentText.trim()) continue
    if (
      !push(
        `### Anotação: ${n.title || 'Sem título'} [${tree.path(n.topicId)}]\n${n.contentText}\n`
      )
    )
      break
  }

  const bookRows = db.select().from(books).where(inArray(books.topicId, ids)).all()
  for (const book of bookRows) {
    const hl = db.select().from(bookHighlights).where(eq(bookHighlights.bookId, book.id)).all()
    if (!hl.length) continue
    const text = hl.map((h) => `- "${h.text}"${h.note ? ` (nota: ${h.note})` : ''}`).join('\n')
    if (!push(`### Destaques do livro "${book.title}"\n${text}\n`)) break
  }
  return { text: parts.join('\n'), complete }
}
