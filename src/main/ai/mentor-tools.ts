import { z } from 'zod'
import { proposalSchema, type Proposal, type ProposedTopic } from '@shared/schemas'
import type { MessageProposal } from '@shared/types'
import type { Db } from '../db/client'
import { scheduleBlocks } from '../db/schema'
import {
  countProposedTopics,
  overlaps,
  parseTime,
  parseWeekday,
  toMinutes
} from '../services/proposals'
import { topicTree } from './context'
import type { AiTool } from './providers'

/*
 * Ferramentas da mentora na conversa: ela propõe temas e blocos na agenda, e o estudante
 * confirma num cartão. O que o modelo manda é conferido aqui (dias, horários, temas que
 * existem, sobreposição com a agenda), porque modelos locais erram nos detalhes.
 */

const DAY_NAMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'] as const

export const MENTOR_TOOLS: AiTool[] = [
  {
    name: 'propor_temas',
    description:
      'Propõe temas de estudo novos, com subtópicos, para o estudante confirmar antes de criar. ' +
      'Para colocar dentro de um tema que já existe, informe o id dele em parent_id.',
    schema: z.object({
      parent_id: z
        .number()
        .int()
        .nullable()
        .describe('id de um tema existente onde os novos entram; null = temas principais'),
      temas: z.array(
        z.object({
          nome: z.string().describe('nome curto do tema'),
          subtopicos: z.array(z.string()).describe('subtópicos na ordem de estudo; pode ser vazio')
        })
      )
    })
  },
  {
    name: 'propor_blocos',
    description:
      'Propõe blocos de estudo na agenda, que se repetem toda semana, para o estudante ' +
      'confirmar. Use os horários livres dele e não sobreponha os blocos que já existem.',
    schema: z.object({
      blocos: z.array(
        z.object({
          titulo: z.string().describe('o que fazer no bloco, curto'),
          tema: z.string().describe('nome do tema do bloco: um que já existe ou um proposto agora'),
          dia: z.enum(DAY_NAMES),
          inicio: z.string().describe('HH:MM, 24h'),
          fim: z.string().describe('HH:MM, 24h')
        })
      )
    })
  }
]

export const MENTOR_TOOLS_PROMPT = `# Ações no Sentinela

Você pode propor mudanças nos dados do estudante com as ferramentas propor_temas (temas e subtópicos novos) e propor_blocos (blocos semanais na agenda). O que você propõe aparece para o estudante como um cartão com o botão "Criar"; nada é criado sem ele confirmar. Use as ferramentas quando ele pedir para criar, adicionar, montar ou colocar algo (temas, tópicos, agenda); para só sugerir ideias, responda em texto. Para colocar temas dentro de um que já existe, use o id que aparece entre colchetes no retrato, como [id 12]. Blocos novos vão nos "horários livres ainda vagos" do retrato, ou no horário que o estudante pedir; se não houver horário vago, não proponha blocos: diga que a semana está cheia e sugira Semana > Planejar com IA. Depois de chamar uma ferramenta, diga em uma ou duas frases o que propôs e peça para ele revisar o cartão; não diga que já criou.`

const text = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** Campo do objeto pelo primeiro nome presente (modelos às vezes trocam por inglês). */
function field(o: unknown, ...names: string[]): unknown {
  if (!o || typeof o !== 'object') return undefined
  for (const name of names) if (name in o) return (o as Record<string, unknown>)[name]
  return undefined
}

const nameOf = (v: unknown): string =>
  (typeof v === 'string' ? text(v) : text(field(v, 'nome', 'name', 'title'))).slice(0, 200)

export interface ToolCall {
  name: string
  input: unknown
}

/**
 * Proposta a partir das chamadas de ferramenta. `invalid` conta os blocos descartados por dia ou
 * horário inválido; `busy`, os que batiam com outro bloco. Sem nada aproveitável, devolve null.
 */
export function proposalFromToolCalls(
  db: Db,
  calls: ToolCall[]
): { proposal: Proposal; invalid: number; busy: number } | null {
  const tree = topicTree(db)
  const proposal: Proposal = { topics: [], blocks: [], replaceBlockIds: [] }
  const proposed = new Map<string, string>()

  for (const call of calls.filter((c) => c.name === 'propor_temas')) {
    const raw = field(call.input, 'parent_id', 'parentId')
    const parentId = typeof raw === 'string' ? Number(raw) : raw
    const parent = tree.all.find((t) => t.id === parentId)
    const siblings = parent ? tree.children(parent.id) : tree.all.filter((t) => !t.parentId)
    const seen = new Set<string>()
    const items: ProposedTopic[] = []
    for (const t of list(field(call.input, 'temas', 'topics'))) {
      const name = nameOf(t)
      if (!name || seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      // Tema que já existe ali: fica só se trouxer subtópicos novos (ao criar, entram nele).
      const existing = siblings.find((s) => s.name.toLowerCase() === name.toLowerCase())
      const subSeen = new Set(
        existing ? tree.children(existing.id).map((c) => c.name.toLowerCase()) : []
      )
      const children = list(field(t, 'subtopicos', 'subtopics', 'children'))
        .map(nameOf)
        .filter((n) => n && !subSeen.has(n.toLowerCase()) && subSeen.add(n.toLowerCase()))
        .slice(0, 50)
        .map((n) => ({ name: n, children: [] }))
      if (existing && !children.length) continue
      items.push({ name, children })
      for (const n of [name, ...children.map((c) => c.name)]) proposed.set(n.toLowerCase(), n)
    }
    if (items.length)
      proposal.topics.push({ parentId: parent?.id ?? null, items: items.slice(0, 50) })
  }

  // Tema do bloco: pelo id, por um proposto agora (o nome pode repetir o de um tema antigo em
  // outro lugar), pelo nome exato ou pelo começo do nome.
  const topicFor = (value: unknown): { topicId: number | null; topicName: string | null } => {
    if (typeof value === 'number' && tree.all.some((t) => t.id === value)) {
      return { topicId: value, topicName: null }
    }
    const name = text(value).toLowerCase()
    if (!name) return { topicId: null, topicName: null }
    if (proposed.has(name)) return { topicId: null, topicName: proposed.get(name)! }
    const exact = tree.all.find((t) => t.name.toLowerCase() === name)
    if (exact) return { topicId: exact.id, topicName: null }
    const partial =
      name.length >= 4 ? tree.all.find((t) => t.name.toLowerCase().startsWith(name)) : undefined
    return { topicId: partial?.id ?? null, topicName: null }
  }

  const weekly = db
    .select()
    .from(scheduleBlocks)
    .all()
    .flatMap((b) =>
      b.recurrence === 'weekly' && b.weekday !== null ? [{ ...b, weekday: b.weekday }] : []
    )
  let invalid = 0
  let busy = 0
  for (const call of calls.filter((c) => c.name === 'propor_blocos')) {
    for (const b of list(field(call.input, 'blocos', 'blocks'))) {
      const weekday = parseWeekday(field(b, 'dia', 'weekday', 'day'))
      const startTime = parseTime(field(b, 'inicio', 'start', 'start_time'))
      const endTime = parseTime(field(b, 'fim', 'end', 'end_time'))
      const title = text(field(b, 'titulo', 'title')).slice(0, 200)
      if (
        weekday === null ||
        !startTime ||
        !endTime ||
        !title ||
        toMinutes(endTime) <= toMinutes(startTime)
      ) {
        invalid++
        continue
      }
      const slot = { weekday, startTime, endTime }
      if (weekly.some((w) => overlaps(w, slot)) || proposal.blocks.some((o) => overlaps(o, slot))) {
        busy++
        continue
      }
      proposal.blocks.push({
        title,
        ...topicFor(field(b, 'tema', 'topic', 'topic_id')),
        projectId: null,
        weekday,
        startTime,
        endTime,
        notes: null
      })
    }
  }
  if (!proposal.topics.length && !proposal.blocks.length) return null
  return { proposal: proposalSchema.parse(proposal), invalid, busy }
}

/** Uma linha sobre a proposta, para o histórico que vai à IA (ela não vê o cartão). */
export function proposalNote(p: MessageProposal): string {
  const topics = p.topics.reduce((sum, g) => sum + countProposedTopics(g.items), 0)
  const what = [topics && `${topics} temas`, p.blocks.length && `${p.blocks.length} blocos`]
    .filter(Boolean)
    .join(' e ')
  const status = {
    pending: 'aguardando o estudante confirmar',
    applied: 'o estudante confirmou e foi criada',
    discarded: 'o estudante descartou'
  }[p.status]
  return `[Proposta com ${what}: ${status}.]`
}
