import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import {
  proposalSchema,
  proposalSkipSchema,
  type Proposal,
  type ProposalSkip,
  type ProposedTopic
} from '@shared/schemas'
import type { ProposalResult } from '@shared/types'
import type { Db } from '../db/client'
import { projects, scheduleBlocks, topics } from '../db/schema'

/*
 * Propostas de mudança (temas e blocos semanais) feitas pela mentora na conversa ou pelo plano
 * da semana: conferência do que a IA devolveu e criação do que o estudante confirmou.
 */

/** Cores dos temas principais novos (as mesmas opções do seletor de cor). */
const ROOT_COLORS = ['#f97316', '#6366f1', '#22c55e', '#ec4899', '#3b82f6', '#eab308', '#14b8a6']

export const toMinutes = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))

const DAYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']

/** "Sexta-feira", "sábado", "sex" ou o número (0 = domingo) → 0–6. */
export function parseWeekday(value: unknown): number | null {
  if (typeof value === 'number')
    return Number.isInteger(value) && value >= 0 && value <= 6 ? value : null
  if (typeof value !== 'string') return null
  const day = value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const i = DAYS.findIndex((d) => day.startsWith(d.slice(0, 3)))
  return i >= 0 ? i : null
}

/** "9:00", "09h", "9h30" → "09:00". */
export function parseTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = value.trim().match(/^(\d{1,2})(?:[:h](\d{2})?)?h?$/i)
  if (!m) return null
  const hours = Number(m[1])
  const minutes = Number(m[2] ?? 0)
  if (hours > 23 || minutes > 59) return null
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export interface Slot {
  weekday: number
  startTime: string
  endTime: string
}

export const overlaps = (a: Slot, b: Slot): boolean =>
  a.weekday === b.weekday &&
  toMinutes(a.startTime) < toMinutes(b.endTime) &&
  toMinutes(a.endTime) > toMinutes(b.startTime)

/** Quantos temas a proposta cria (com os subtópicos). */
export const countProposedTopics = (items: ProposedTopic[]): number =>
  items.reduce((sum, t) => sum + 1 + countProposedTopics(t.children), 0)

/**
 * Cria o que o estudante deixou marcado, tudo ou nada. Os subtópicos entram com a cor do tema
 * de cima; um tema que passa a ter subtópicos e não estava sendo acompanhado passa a ser, para
 * os subtópicos contarem no progresso. Blocos ligam ao tema pelo id ou, se o tema é criado na
 * mesma proposta, pelo nome.
 */
export function applyProposal(db: Db, input: Proposal, skipInput: ProposalSkip): ProposalResult {
  const proposal = proposalSchema.parse(input)
  const skip = proposalSkipSchema.parse(skipInput)
  const skipTopics = new Set(skip.topics)
  const skipBlocks = new Set(skip.blocks)

  return db.transaction((tx) => {
    const all = tx.select().from(topics).all()
    const byId = new Map(all.map((t) => [t.id, t]))
    const byName = new Map(all.map((t) => [t.name.toLowerCase(), t.id]))
    const tracked = (id: number | null): boolean => {
      for (let t = id !== null ? byId.get(id) : undefined; t;) {
        if (t.trackProgress) return true
        t = t.parentId !== null ? byId.get(t.parentId) : undefined
      }
      return false
    }
    const nextPosition = (parentId: number | null): number =>
      (tx
        .select({ max: sql<number>`coalesce(max(${topics.position}), -1)` })
        .from(topics)
        .where(parentId === null ? isNull(topics.parentId) : eq(topics.parentId, parentId))
        .get()?.max ?? -1) + 1
    let rootColor = all.filter((t) => t.parentId === null).length

    let topicCount = 0
    const add = (
      items: ProposedTopic[],
      parentId: number | null,
      color: string | null,
      key: string
    ): void => {
      let position = nextPosition(parentId)
      const siblings = tx
        .select({ id: topics.id, name: topics.name, color: topics.color })
        .from(topics)
        .where(parentId === null ? isNull(topics.parentId) : eq(topics.parentId, parentId))
        .all()
      items.forEach((item, i) => {
        if (skipTopics.has(`${key}.${i}`)) return
        // Já existe ali (outra proposta criou, ou o estudante): os subtópicos entram nele.
        const same = siblings.find((s) => s.name.toLowerCase() === item.name.toLowerCase())
        if (same) {
          byName.set(item.name.toLowerCase(), same.id)
          add(item.children, same.id, same.color, `${key}.${i}`)
          return
        }
        const ownColor = color ?? ROOT_COLORS[rootColor++ % ROOT_COLORS.length]
        const id = tx
          .insert(topics)
          .values({
            name: item.name,
            color: ownColor,
            parentId,
            position: position++,
            trackProgress: parentId === null && item.children.length > 0
          })
          .returning({ id: topics.id })
          .get().id
        topicCount++
        byName.set(item.name.toLowerCase(), id)
        add(item.children, id, ownColor, `${key}.${i}`)
      })
    }
    proposal.topics.forEach((group, g) => {
      const parent = group.parentId !== null ? byId.get(group.parentId) : undefined
      const kept = group.items.some((_, i) => !skipTopics.has(`${g}.${i}`))
      if (parent && kept && !tracked(parent.id)) {
        tx.update(topics).set({ trackProgress: true }).where(eq(topics.id, parent.id)).run()
      }
      add(group.items, parent?.id ?? null, parent?.color ?? null, String(g))
    })

    const projectIds = new Set(
      tx
        .select({ id: projects.id })
        .from(projects)
        .all()
        .map((p) => p.id)
    )
    const chosen = proposal.blocks.filter(
      (b, i) => !skipBlocks.has(i) && toMinutes(b.endTime) > toMinutes(b.startTime)
    )
    // Os blocos antigos só saem se algum novo entrar no lugar.
    if (chosen.length && proposal.replaceBlockIds.length) {
      tx.delete(scheduleBlocks)
        .where(
          and(
            inArray(scheduleBlocks.id, proposal.replaceBlockIds),
            eq(scheduleBlocks.recurrence, 'weekly')
          )
        )
        .run()
    }
    for (const b of chosen) {
      const topicId =
        (b.topicId !== null && byId.has(b.topicId) ? b.topicId : null) ??
        (b.topicName ? (byName.get(b.topicName.toLowerCase()) ?? null) : null)
      tx.insert(scheduleBlocks)
        .values({
          title: b.title,
          topicId,
          projectId: b.projectId !== null && projectIds.has(b.projectId) ? b.projectId : null,
          color: null,
          recurrence: 'weekly',
          weekday: b.weekday,
          date: null,
          startTime: b.startTime,
          endTime: b.endTime,
          notes: b.notes
        })
        .run()
    }
    return { topics: topicCount, blocks: chosen.length }
  })
}
