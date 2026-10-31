import { and, asc, desc, eq, gt, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { AI_STREAM_CHANNEL, OUTLINE_PROGRESS_CHANNEL, type Api } from '@shared/api'
import {
  aiKeySchema,
  aiProviderSchema,
  aiSettingsUpdateSchema,
  EXERCISE_KINDS,
  exerciseAnswerSchema,
  generateExercisesSchema,
  mentorCompactSchema,
  mentorSendSchema,
  planWeekSchema,
  proposalSkipSchema,
  suggestScheduleSchema,
  structureOutlineSchema,
  suggestTopicsSchema,
  type AiProvider,
  type PlanWeekInput,
  type Proposal,
  type ProposedBlock,
  type RagKind
} from '@shared/schemas'
import type {
  AiSettings,
  AiStreamEvent,
  ChatMessage,
  Exercise,
  ExerciseSet,
  MessageProposal,
  OutlineLine,
  RagSource,
  ScheduleSuggestion,
  TopicSuggestion,
  WeekPlan
} from '@shared/types'
import { AI_CONFIG_KEY, getSetting, readAiConfig, setSetting, type AiConfig } from '../ai/config'
import {
  MENTOR_TOOLS,
  MENTOR_TOOLS_PROMPT,
  proposalFromToolCalls,
  proposalNote,
  type ToolCall
} from '../ai/mentor-tools'
import { createAiClient, type AiClient } from '../ai/providers'
import { studySnapshot, topicMaterial, topicTree } from '../ai/context'
import { applyProposal, overlaps, parseTime, parseWeekday, toMinutes } from './proposals'
import { fillWindows, readWeekAvailability } from './week'
import type { RagIndex, RagMatch } from '../ai/rag'
import type { Db } from '../db/client'
import {
  aiConversations,
  aiMessages,
  exerciseSets,
  exercises,
  notes,
  projects,
  scheduleBlocks,
  settings
} from '../db/schema'
import type { Secrets } from '../secrets'

const keyName = (provider: 'anthropic' | 'openai'): string => `ai.key.${provider}`

const BASE_SYSTEM =
  'Você é a mentora de estudos do Sentinela, um app pessoal de organização de estudos de um ' +
  'estudante brasileiro (cybersegurança, programação, IA, eletrônica e outros temas). Escreva ' +
  'sempre em português do Brasil, com clareza e sem enrolação.'

const MENTOR_SYSTEM = `${BASE_SYSTEM}

Seu papel é acompanhar o estudante: dizer se ele está no rumo certo e sugerir próximos passos concretos com base nos dados dele (progresso nos temas, agenda, tarefas, resultados de exercícios e projetos). Seja honesta: se os dados mostram atraso ou pouca prática, diga isso com gentileza e proponha um ajuste realista. Não invente dados que não aparecem no retrato abaixo; se faltar informação para responder bem, pergunte. Prefira respostas curtas e acionáveis.

Quando sugerir algo que o próprio Sentinela faz, diga onde: dividir um tema em tópicos (Temas e progresso), montar a semana nos horários livres (Semana > Planejar com IA), gerar exercícios com gabarito (IA mentora > Exercícios).`

const SUMMARY_SYSTEM = `${BASE_SYSTEM}

Agora sua tarefa é resumir uma conversa entre o estudante e a mentora, para a conversa continuar depois só com o resumo. Preserve com precisão: o que o estudante contou sobre si (nomes, apelidos, rotina, preferências, objetivos, prazos, dificuldades), decisões e planos combinados, recomendações já feitas, perguntas em aberto e o assunto do momento. Não invente nada. Escreva em tópicos curtos, sem introdução, com no máximo 350 palavras.`

type MessageRow = typeof aiMessages.$inferSelect

const toMessage = (row: MessageRow): ChatMessage => ({
  ...row,
  sources: row.sources ? (JSON.parse(row.sources) as RagSource[]) : null,
  proposal: row.proposal ? (JSON.parse(row.proposal) as MessageProposal) : null
})

const SOURCE_LABEL: Record<RagSource['kind'], (s: Pick<RagSource, 'title' | 'page'>) => string> = {
  note: (s) => `Anotação "${s.title}"`,
  highlight: (s) => `Destaque no livro "${s.title}"${s.page ? `, p. ${s.page}` : ''}`,
  ocr: (s) => `Livro "${s.title}", p. ${s.page} (texto reconhecido por OCR)`,
  book: (s) => `Livro "${s.title}", p. ${s.page}`,
  ebook: (s) => `Livro "${s.title}", seção ${s.page}`
}

/** Instruções da conversa: papel, retrato dos estudos, resumo do que foi compactado e trechos. */
function mentorSystem(
  snapshot: string,
  summary: string | null,
  matches: (RagMatch & { n: number })[]
): string {
  return [
    MENTOR_SYSTEM,
    MENTOR_TOOLS_PROMPT,
    `# Retrato atual dos estudos\n\n${snapshot}`,
    summary &&
      '# Resumo da conversa até aqui\n\nAs mensagens mais antigas desta conversa foram ' +
        `compactadas neste resumo:\n\n${summary}\n\nSe o estudante perguntar algo que não está ` +
        'no resumo nem nas mensagens, diga que não lembra e peça para ele repetir. Nunca tente ' +
        'adivinhar.',
    matches.length &&
      '# Trechos das anotações e livros do estudante\n\nAchados por busca automática a partir ' +
        'da pergunta, então podem não ter relação com ela. Use os que ajudarem e cite o número ' +
        'entre colchetes, como [1]; ignore os outros.\n\n' +
        matches.map((m) => `[${m.n}] ${SOURCE_LABEL[m.kind](m)}\n${m.text}`).join('\n\n')
  ]
    .filter(Boolean)
    .join('\n\n')
}

const chars = (rows: Pick<MessageRow, 'content'>[]): number =>
  rows.reduce((sum, m) => sum + m.content.length, 0)

/**
 * Resume as mensagens (somando ao resumo anterior). Se não couberem de uma vez no modelo, vão em
 * partes, e cada parte atualiza o resumo.
 */
async function summarize(
  ai: AiClient,
  previous: string | null,
  rows: MessageRow[],
  instructions?: string | null
): Promise<string> {
  const budget = Math.floor(ai.maxInputChars * 0.6)
  let summary = previous
  let batch: string[] = []

  const flush = async (): Promise<void> => {
    // Tags separam o material das instruções; sem elas, modelos pequenos copiam mensagens inteiras.
    const prompt = [
      summary && `<resumo_anterior>\n${summary}\n</resumo_anterior>`,
      `<conversa>\n${batch.join('\n\n')}\n</conversa>`,
      instructions && `Dê atenção especial a: ${instructions}`,
      'Escreva só o resumo atualizado de toda a conversa (o anterior mais o que veio depois), com ' +
        'suas palavras. Não copie as mensagens nem repita trechos longos.'
    ]
      .filter(Boolean)
      .join('\n\n')
    summary = (
      await ai.chat({
        system: SUMMARY_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
        onDelta: () => {}
      })
    ).trim()
    batch = []
  }

  for (const m of rows) {
    const line = `${m.role === 'user' ? 'Estudante' : 'Mentora'}: ${m.content}`.slice(0, budget)
    const size = batch.reduce((s, l) => s + l.length, 0) + (summary?.length ?? 0)
    if (batch.length && size + line.length > budget) await flush()
    batch.push(line)
  }
  if (batch.length) await flush()
  if (!summary) throw new Error('A IA não conseguiu resumir a conversa. Tente de novo.')
  return summary
}

const DIFFICULTY_TEXT = {
  easy: 'fácil (conceitos básicos e definições)',
  medium: 'média (aplicar conceitos em situações comuns)',
  hard: 'difícil (análise, casos menos óbvios, combinar conceitos)'
} as const

// A IA devolve o nome do dia; modelos pequenos erram a conversão para número (0 = domingo).
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'] as const

// Formatos pedidos à IA (saída estruturada). Faixas e regras são conferidas depois em código.
const topicsOutput = z.object({
  topics: z.array(
    z.object({
      name: z.string().describe('Nome curto do tópico'),
      description: z.string().describe('Uma frase dizendo o que estudar')
    })
  )
})

const scheduleOutput = z.object({
  blocks: z.array(
    z.object({
      title: z.string().describe('O que estudar no bloco, curto'),
      topic_id: z.number().int().describe('Um dos ids de tema informados'),
      weekday: z.enum(WEEKDAYS).describe('Dia da semana do bloco'),
      start_time: z.string().describe('Início, HH:MM 24h'),
      end_time: z.string().describe('Fim, HH:MM 24h'),
      reason: z.string().describe('Por que este bloco, em uma frase')
    })
  )
})

const planOutput = z.object({
  blocks: z.array(
    z.object({
      weekday: z.enum(WEEKDAYS).describe('Dia da semana do bloco'),
      start_time: z.string().describe('Início, HH:MM 24h'),
      end_time: z.string().describe('Fim, HH:MM 24h'),
      kind: z.enum(['tema', 'projeto']),
      id: z.number().int().describe('id do tema ou do projeto'),
      title: z.string().describe('O que fazer no bloco, curto')
    })
  )
})

const exercisesOutput = z.object({
  title: z.string().describe('Título curto da lista'),
  exercises: z.array(
    z.object({
      kind: z.enum(EXERCISE_KINDS),
      question: z.string(),
      options: z.array(z.string()).describe('4 alternativas; vazio na dissertativa'),
      correct_option: z.number().int().describe('Índice 0–3 da correta; -1 na dissertativa'),
      answer: z.string().describe('Gabarito: a resposta esperada'),
      explanation: z.string().describe('Por que a resposta está certa')
    })
  )
})

// O sumário vem como títulos de Markdown, não JSON: com JSON, o modelo local gasta o dobro de
// tokens (chaves, aspas, recuo) e um sumário de livro levava uns 4 minutos. Pedir para
// "transcrever" (e não "organizar") evita que o modelo resuma e fique só com os capítulos.
const OUTLINE_PROMPT =
  'Transcreva este material de estudo (sumário de livro, lista de aulas de um curso, ementa) ' +
  'para uma lista com níveis. Copie todos os itens do material, um por linha e na mesma ordem, ' +
  'sem pular nenhum: cada linha que é um título de capítulo, seção, subseção, módulo ou aula ' +
  'vira uma linha da lista. Marque o nível com # como nos títulos de Markdown: "#" para ' +
  'capítulo, módulo ou parte principal; "##" para seção ou item dentro dele; "###" para ' +
  'subseção ou subitem (e "####" se houver mais um nível). Mantenha os títulos e a numeração ' +
  'como estão; tire só números de página, durações (como "12min") e marcações como ** e -. ' +
  'Ignore textos que não são itens (apresentação, observações). Escreva só a lista.'

// Trechos menores rendem progresso visível, e modelos pequenos param no meio de listas longas.
const OUTLINE_PART_CHARS = 6000

/**
 * Lê a resposta linha a linha: títulos (#) e, se o modelo misturar, itens de lista (-) logo
 * abaixo do último título, pelo recuo.
 */
function outlineReader(): (line: string) => OutlineLine | null {
  let headingLevel = 0
  return (line) => {
    const heading = line.match(/^\s*(#{1,6})\s+(.+?)[\s#]*$/)
    const bullet = heading ? null : line.match(/^(\s*)[-*+•]\s+(.+)$/)
    const title = (heading?.[2] ?? bullet?.[2])
      ?.replace(/\*\*|__/g, '')
      .replace(/^[#\-*+•\s]+/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200)
    if (!title) return null
    if (heading) {
      headingLevel = heading[1].length
      return { level: headingLevel, title }
    }
    const indent = Math.floor(bullet![1].replace(/\t/g, '  ').length / 2)
    return { level: Math.min(6, headingLevel + 1 + indent), title }
  }
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

// Modelos pequenos (Ollama) às vezes devolvem uma lista vazia. Pede de novo antes de desistir.
async function untilNotEmpty<T>(attempt: () => Promise<T[]>, tries = 3): Promise<T[]> {
  let out: T[] = []
  for (let i = 0; i < tries && !out.length; i++) out = await attempt()
  return out
}

type ExerciseRow = typeof exercises.$inferSelect

const toExercise = (row: ExerciseRow): Exercise => ({
  ...row,
  options: row.options ? (JSON.parse(row.options) as string[]) : null
})

export function createMentorService(
  db: Db,
  secrets: Secrets,
  broadcast: (channel: string, payload: unknown) => void,
  rag: RagIndex
): Pick<Api, 'ai' | 'mentor' | 'exercises'> {
  const config = (): AiConfig => readAiConfig(db)

  const apiKey = (provider: AiProvider): string | null => {
    if (provider === 'ollama') return null
    const stored = getSetting(db, keyName(provider))
    if (!stored) return null
    try {
      return secrets.decrypt(stored)
    } catch {
      return null
    }
  }

  const settingsView = (): AiSettings => {
    const c = config()
    return {
      ...c,
      keys: { anthropic: apiKey('anthropic') !== null, openai: apiKey('openai') !== null },
      encryptionAvailable: secrets.available()
    }
  }

  const client = (provider?: AiProvider): { ai: AiClient; label: string } => {
    const c = config()
    const p = provider ?? c.provider
    const model = c.models[p]
    return {
      ai: createAiClient(p, { model, apiKey: apiKey(p), ollamaUrl: c.ollamaUrl }),
      label: `${p}/${model}`
    }
  }

  const conversationRow = (id: number): typeof aiConversations.$inferSelect => {
    const row = db.select().from(aiConversations).where(eq(aiConversations.id, id)).get()
    if (!row) throw new Error('Conversa não encontrada')
    return row
  }

  /** Mensagens que ainda vão inteiras para a IA (as de antes do resumo, não). */
  const liveMessages = (conversation: typeof aiConversations.$inferSelect): MessageRow[] =>
    db
      .select()
      .from(aiMessages)
      .where(
        and(
          eq(aiMessages.conversationId, conversation.id),
          gt(aiMessages.id, conversation.summaryUntil ?? 0)
        )
      )
      .orderBy(asc(aiMessages.id))
      .all()

  const saveSummary = (
    conversationId: number,
    summary: string,
    until: number
  ): typeof aiConversations.$inferSelect =>
    db
      .update(aiConversations)
      .set({ summary, summaryUntil: until, compactedAt: new Date() })
      .where(eq(aiConversations.id, conversationId))
      .returning()
      .get()!

  const proposalRow = (messageId: number): { row: MessageRow; proposal: MessageProposal } => {
    const row = db.select().from(aiMessages).where(eq(aiMessages.id, messageId)).get()
    if (!row?.proposal) throw new Error('Proposta não encontrada')
    return { row, proposal: JSON.parse(row.proposal) as MessageProposal }
  }

  const saveProposal = (messageId: number, proposal: MessageProposal): ChatMessage =>
    toMessage(
      db
        .update(aiMessages)
        .set({ proposal: JSON.stringify(proposal) })
        .where(eq(aiMessages.id, messageId))
        .returning()
        .get()!
    )

  const exerciseSetView = (setId: number): ExerciseSet => {
    const set = db.select().from(exerciseSets).where(eq(exerciseSets.id, setId)).get()
    if (!set) throw new Error('Lista de exercícios não encontrada')
    const items = db
      .select()
      .from(exercises)
      .where(eq(exercises.setId, setId))
      .orderBy(asc(exercises.position))
      .all()
      .map(toExercise)
    return {
      ...set,
      total: items.length,
      answered: items.filter((e) => e.result).length,
      correct: items.filter((e) => e.result === 'correct').length,
      exercises: items
    }
  }

  /** Subtópicos sugeridos para um tema (não salva). */
  const suggestTopicsFor = async (
    topicId: number,
    instructions: string | null
  ): Promise<TopicSuggestion[]> => {
    const tree = topicTree(db)
    const topic = tree.all.find((t) => t.id === topicId)
    if (!topic) throw new Error('Tema não encontrado')
    const existing = tree.children(topicId).map((t) => t.name)
    const noteTitles = db
      .select({ title: notes.title })
      .from(notes)
      .where(inArray(notes.topicId, tree.subtreeIds(topicId)))
      .all()
      .map((n) => n.title)
      .filter(Boolean)

    const prompt = [
      `Tema: ${tree.path(topicId)}`,
      topic.description ? `Descrição: ${topic.description}` : '',
      existing.length ? `Subtópicos que já existem (não repita): ${existing.join('; ')}` : '',
      noteTitles.length ? `Anotações já feitas nesse tema: ${noteTitles.join('; ')}` : '',
      instructions ? `Pedido do estudante: ${instructions}` : '',
      '',
      'Divida esse tema em tópicos de estudo, na ordem em que faz sentido estudar. Cada tópico ' +
        'deve caber em uma ou duas sessões de 1 a 3 horas. Entre 4 e 12 tópicos, com nomes ' +
        'curtos (até 60 caracteres) e uma descrição de uma frase do que estudar.'
    ]
      .filter(Boolean)
      .join('\n')

    const { ai } = client()
    return untilNotEmpty(async () => {
      const result = await ai.generate({
        system: BASE_SYSTEM,
        prompt,
        schema: topicsOutput,
        name: 'topicos'
      })
      const seen = new Set(existing.map((n) => n.toLowerCase()))
      return result.topics
        .map((t) => ({ name: t.name.trim().slice(0, 120), description: t.description.trim() }))
        .filter((t) => t.name && !seen.has(t.name.toLowerCase()) && seen.add(t.name.toLowerCase()))
        .slice(0, 15)
    })
  }

  /**
   * Semana nos horários livres: os temas vão nos horários de estudos e os projetos nos de
   * projetos. A IA escolhe o que vai onde; o código confere se cada bloco cabe num horário livre
   * do tipo certo e não bate com outro.
   */
  const planWeek = async (input: PlanWeekInput): Promise<WeekPlan> => {
    const { topicIds, projectIds, splitTopics, replace } = planWeekSchema.parse(input)
    const { windows } = readWeekAvailability(db)
    if (!windows.length) throw new Error('Informe seus horários livres primeiro')
    const tree = topicTree(db)
    const themes = tree.all.filter((t) => topicIds.includes(t.id))
    const repos = db
      .select()
      .from(projects)
      .all()
      .filter((p) => projectIds.includes(p.id))
    const notesOut: string[] = []
    if (themes.length && !windows.some((w) => w.kind === 'estudos')) {
      notesOut.push('Você não tem horário livre para estudos: os temas ficaram sem bloco.')
    }
    if (repos.length && !windows.some((w) => w.kind === 'projetos')) {
      notesOut.push('Você não tem horário livre para projetos: os projetos ficaram sem bloco.')
    }

    // Temas sem nenhum subtópico ganham uma divisão (para o bloco mostrar o assunto da vez).
    const topicGroups: Proposal['topics'] = []
    if (splitTopics) {
      for (const theme of themes.filter((t) => !tree.children(t.id).length)) {
        const suggestions = await suggestTopicsFor(theme.id, null).catch(() => [])
        if (suggestions.length) {
          topicGroups.push({
            parentId: theme.id,
            items: suggestions.map((s) => ({ name: s.name, children: [] }))
          })
        }
      }
    }

    const weekly = db
      .select()
      .from(scheduleBlocks)
      .all()
      .flatMap((b) =>
        b.recurrence === 'weekly' && b.weekday !== null ? [{ ...b, weekday: b.weekday }] : []
      )
    const replaceIds = replace
      ? weekly.filter((b) => windows.some((w) => overlaps(w, b))).map((b) => b.id)
      : []
    const busy = weekly.filter((b) => !replaceIds.includes(b.id))

    const themeLines = themes.map((t) => {
      const p = tree.progress(t.id)
      const next = p.pending.length
        ? p.pending.slice(0, 6).map((k) => k.name)
        : (topicGroups.find((g) => g.parentId === t.id)?.items.map((i) => i.name) ?? [])
      return (
        `- [tema ${t.id}] ${tree.path(t.id)}` +
        (p.total ? `: ${p.total - p.done} tópicos pendentes de ${p.total}` : '') +
        (t.weeklyGoal ? `; meta de ${t.weeklyGoal} tópicos/semana` : '') +
        (next.length ? `; próximos: ${next.slice(0, 6).join(', ')}` : '')
      )
    })
    const projectLines = repos.map(
      (p) =>
        `- [projeto ${p.id}] ${p.repo}` +
        (p.description ? `: ${p.description}` : '') +
        (p.lastCommitAt
          ? ` (último commit há ${Math.floor((Date.now() - p.lastCommitAt.getTime()) / 86_400_000)} dias)`
          : '')
    )
    const prompt = [
      'Monte a semana do estudante nos horários livres dele. Os blocos se repetem toda semana.',
      '',
      'Horários livres:',
      ...windows.map((w) => `- ${WEEKDAYS[w.weekday]} ${w.startTime}–${w.endTime}: ${w.kind}`),
      '',
      themes.length ? 'Temas de estudo (use nos horários de estudos):' : '',
      ...themeLines,
      repos.length ? 'Projetos (use nos horários de projetos):' : '',
      ...projectLines,
      busy.length
        ? '\nBlocos que já existem na agenda (não sobreponha):\n' +
          busy
            .map((b) => `- ${WEEKDAYS[b.weekday]} ${b.startTime}–${b.endTime}: ${b.title}`)
            .join('\n')
        : '',
      '',
      'Regras: cada bloco fica inteiro dentro de um horário livre do tipo certo (tipo "tema" nos ' +
        'de estudos, tipo "projeto" nos de projetos), com o id do tema ou do projeto. Divida ' +
        'horários longos em blocos de 1h a 2h30, com 15 minutos de pausa entre eles, e use todos ' +
        'os horários livres. Varie os temas ao longo da semana e dê mais tempo a quem tem mais ' +
        'pendências ou meta semanal. Título curto do que fazer no bloco (ex.: "Kurose: leitura", ' +
        '"Sentinela: tela da semana"), sem citar capítulo ou assunto específico: o bloco se ' +
        'repete toda semana e mostra sozinho o próximo assunto pendente. Horários HH:MM, 24h.'
    ]
      .filter((l) => l !== '')
      .join('\n')

    const themeIds = new Set(themes.map((t) => t.id))
    const repoIds = new Set(repos.map((p) => p.id))
    const nameOf = (kind: 'tema' | 'projeto', id: number): string =>
      kind === 'tema'
        ? (themes.find((t) => t.id === id)?.name ?? 'Estudo')
        : (repos
            .find((p) => p.id === id)
            ?.repo.split('/')
            .pop() ?? 'Projeto')
    const { ai } = client()
    const blocks = await untilNotEmpty(async () => {
      const result = await ai.generate({
        system: BASE_SYSTEM,
        prompt,
        schema: planOutput,
        name: 'semana'
      })
      const out: ProposedBlock[] = []
      for (const b of result.blocks) {
        const weekday = parseWeekday(b.weekday)
        const startTime = parseTime(b.start_time)
        let endTime = parseTime(b.end_time)
        if (weekday === null || !startTime || !endTime) continue
        // Bloco longo demais (a IA às vezes ocupa o horário inteiro): fica com 2h e o resto do
        // horário é completado depois.
        if (toMinutes(endTime) - toMinutes(startTime) > 150) {
          const end = toMinutes(startTime) + 120
          endTime = `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
        }
        const slot = { weekday, startTime, endTime }
        const kind = b.kind === 'tema' ? 'estudos' : 'projetos'
        const fits = windows.some(
          (w) =>
            w.weekday === weekday &&
            w.kind === kind &&
            toMinutes(startTime) >= toMinutes(w.startTime) &&
            toMinutes(endTime) <= toMinutes(w.endTime)
        )
        const known = b.kind === 'tema' ? themeIds.has(b.id) : repoIds.has(b.id)
        if (
          !fits ||
          !known ||
          toMinutes(endTime) <= toMinutes(startTime) ||
          busy.some((o) => overlaps(o, slot)) ||
          out.some((o) => overlaps(o, slot))
        ) {
          continue
        }
        out.push({
          title: b.title.trim().slice(0, 200) || nameOf(b.kind, b.id),
          topicId: b.kind === 'tema' ? b.id : null,
          topicName: null,
          projectId: b.kind === 'projeto' ? b.id : null,
          weekday,
          startTime,
          endTime,
          notes: null
        })
      }
      return out.slice(0, 60)
    })
    // O que a IA deixou vazio nos horários é completado revezando os temas (quem tem mais
    // pendências primeiro) e os projetos.
    const pending = (id: number): number =>
      tree.progress(id).pending.length ||
      (topicGroups.find((g) => g.parentId === id)?.items.length ?? 1)
    const filled = fillWindows(windows, blocks, busy, {
      estudos: themes
        .toSorted((a, b) => pending(b.id) - pending(a.id))
        .map((t) => ({
          title: t.name,
          topicId: t.id,
          topicName: null,
          projectId: null,
          notes: null
        })),
      projetos: repos.map((p) => ({
        title: nameOf('projeto', p.id),
        topicId: null,
        topicName: null,
        projectId: p.id,
        notes: null
      }))
    }).slice(0, 60)
    const unused = windows.filter((w) => !filled.some((b) => overlaps(w, b))).length
    if (unused) notesOut.push(`${unused} horário(s) livre(s) ficaram sem bloco.`)
    return {
      proposal: {
        topics: topicGroups,
        blocks: filled,
        replaceBlockIds: filled.length ? replaceIds : []
      },
      notes: notesOut
    }
  }

  return {
    ai: {
      async settings() {
        return settingsView()
      },

      async updateSettings(input) {
        const data = aiSettingsUpdateSchema.parse(input)
        const c = config()
        const provider = data.provider ?? c.provider
        setSetting(
          db,
          AI_CONFIG_KEY,
          JSON.stringify({
            provider,
            ollamaUrl: data.ollamaUrl ?? c.ollamaUrl,
            models: data.model ? { ...c.models, [provider]: data.model } : c.models
          } satisfies AiConfig)
        )
        return settingsView()
      },

      async setKey(input) {
        if (!secrets.available()) {
          throw new Error('Este sistema não oferece armazenamento seguro para a chave')
        }
        const { provider, key } = aiKeySchema.parse(input)
        // Valida a chave antes de guardar: listar modelos é barato e não consome tokens.
        await createAiClient(provider, {
          model: config().models[provider],
          apiKey: key,
          ollamaUrl: ''
        }).listModels()
        setSetting(db, keyName(provider), secrets.encrypt(key))
        return settingsView()
      },

      async clearKey(provider) {
        const p = z.enum(['anthropic', 'openai']).parse(provider)
        db.delete(settings)
          .where(eq(settings.key, keyName(p)))
          .run()
        return settingsView()
      },

      async listModels(provider) {
        return client(
          provider === undefined ? undefined : aiProviderSchema.parse(provider)
        ).ai.listModels()
      }
    },

    mentor: {
      async suggestTopics(input) {
        const { topicId, instructions } = suggestTopicsSchema.parse(input)
        return suggestTopicsFor(topicId, instructions ?? null)
      },

      async planWeek(input) {
        return planWeek(input)
      },

      async suggestSchedule(input) {
        const { topicIds, hoursPerWeek, availability } = suggestScheduleSchema.parse(input)
        const tree = topicTree(db)
        const chosen = tree.all.filter((t) => topicIds.includes(t.id))
        if (!chosen.length) throw new Error('Nenhum dos temas foi encontrado')

        const topicLines = chosen.map((t) => {
          const p = tree.progress(t.id)
          return (
            `- [topic_id ${t.id}] ${tree.path(t.id)}` +
            (p.total ? `: ${p.done}/${p.total} tópicos concluídos` : '') +
            (p.pending.length
              ? `; próximos pendentes: ${p.pending
                  .slice(0, 10)
                  .map((k) => k.name)
                  .join(', ')}`
              : '') +
            (t.weeklyGoal ? `; meta de ${t.weeklyGoal} tópicos/semana` : '')
          )
        })
        const existing = db.select().from(scheduleBlocks).all()
        const weekly = existing.filter((b) => b.recurrence === 'weekly')

        const prompt = [
          'Monte uma agenda semanal de estudos recorrente.',
          `Disponibilidade do estudante: ${availability}`,
          `Total desejado: cerca de ${hoursPerWeek} horas por semana.`,
          '',
          'Temas a distribuir (use exatamente estes topic_id):',
          ...topicLines,
          '',
          weekly.length
            ? 'Blocos que já existem na agenda (não sobreponha):\n' +
              weekly
                .map((b) => `- ${WEEKDAYS[b.weekday ?? 0]} ${b.startTime}–${b.endTime}: ${b.title}`)
                .join('\n')
            : 'A agenda está vazia.',
          '',
          'Regras: use só os dias e horários que o estudante citou na disponibilidade; horários ' +
            'HH:MM no formato 24h; cada bloco entre 45 minutos e 3 horas; dê mais tempo a quem ' +
            'tem mais pendências ou meta semanal; title curto dizendo o que estudar no bloco.'
        ].join('\n')

        const valid = new Set(chosen.map((t) => t.id))
        const overlaps = (weekday: number, start: number, end: number): boolean =>
          weekly.some(
            (b) =>
              b.weekday === weekday && start < toMinutes(b.endTime) && end > toMinutes(b.startTime)
          )
        const { ai } = client()
        return untilNotEmpty(async () => {
          const result = await ai.generate({
            system: BASE_SYSTEM,
            prompt,
            schema: scheduleOutput,
            name: 'agenda'
          })
          const out: ScheduleSuggestion[] = []
          for (const b of result.blocks) {
            const weekday = WEEKDAYS.indexOf(b.weekday)
            if (weekday < 0) continue
            if (!TIME.test(b.start_time) || !TIME.test(b.end_time)) continue
            const start = toMinutes(b.start_time)
            const end = toMinutes(b.end_time)
            if (end <= start || overlaps(weekday, start, end)) continue
            if (
              out.some(
                (o) =>
                  o.weekday === weekday &&
                  start < toMinutes(o.endTime) &&
                  end > toMinutes(o.startTime)
              )
            )
              continue
            out.push({
              title: b.title.trim().slice(0, 200) || 'Estudo',
              topicId: valid.has(b.topic_id) ? b.topic_id : null,
              weekday,
              startTime: b.start_time,
              endTime: b.end_time,
              reason: b.reason.trim()
            })
          }
          return out.slice(0, 28)
        })
      },

      async structureOutline(input) {
        const text = structureOutlineSchema.parse(input)
        const { ai } = client()
        // Em partes: a resposta (a lista inteira) também ocupa contexto.
        const budget = Math.min(OUTLINE_PART_CHARS, Math.floor(ai.maxInputChars * 0.45))
        const parts: string[][] = []
        let current: string[] = []
        let size = 0
        // Sem as marcações de Markdown do material (#, -, **): o modelo as copia para dentro dos
        // títulos. O recuo fica, porque ele mostra o que está dentro do quê.
        const plain = text
          .split('\n')
          .map((l) => l.replace(/^(\s*)(#{1,6}\s+|>\s*|[-*+•]\s+)/, '$1').replace(/\*\*|__/g, ''))
        for (const line of plain.map((l) => l.slice(0, budget))) {
          if (current.length && size + line.length > budget) {
            parts.push(current)
            current = []
            size = 0
          }
          current.push(line)
          size += line.length + 1
        }
        if (current.some((l) => l.trim())) parts.push(current)

        const key = (title: string): string => title.toLowerCase().replace(/\s+/g, ' ')
        const lines: OutlineLine[] = []
        for (const part of parts) {
          // Cada pedido escolhe os próprios níveis (os capítulos podem vir com # numa parte e ##
          // na outra). Por isso cada parte começa com a linhagem do último item já transcrito
          // (capítulo, seção, subseção): ela dá o contexto, e o nível em que a IA a repete mostra
          // o deslocamento. A repetição é descartada.
          const overlap: OutlineLine[] = []
          for (const line of lines.toReversed()) {
            if (!overlap.length || line.level < overlap[0].level) overlap.unshift(line)
          }
          const material = [...overlap.map((l) => l.title), ...part].join('\n')
          const prompt = `${OUTLINE_PROMPT}\n\n<material>\n${material}\n</material>`
          const items = await untilNotEmpty(async () => {
            const found: OutlineLine[] = []
            const read = outlineReader()
            let pending = ''
            const take = (line: string): void => {
              const item = read(line)
              if (!item) return
              found.push(item)
              broadcast(
                OUTLINE_PROGRESS_CHANNEL,
                lines.length + Math.max(0, found.length - overlap.length)
              )
            }
            await ai.chat({
              system: BASE_SYSTEM,
              messages: [{ role: 'user', content: prompt }],
              onDelta: (delta) => {
                const split = (pending + delta).split('\n')
                pending = split.pop() ?? ''
                split.forEach(take)
              }
            })
            take(pending)
            return found
          })
          const known = new Map(overlap.map((l) => [key(l.title), l.level]))
          let shift: number | null = null
          let skip = 0
          items.slice(0, overlap.length * 2).forEach((item, j) => {
            const level = known.get(key(item.title))
            if (level === undefined) return
            // O item mais alto da linhagem (o capítulo) é a âncora mais firme.
            shift ??= level - item.level
            skip = j + 1
          })
          const offset = shift ?? 0
          lines.push(
            ...items
              .slice(skip)
              .map((l) => ({ ...l, level: Math.min(6, Math.max(1, l.level + offset)) }))
          )
        }
        if (!lines.length) throw new Error('A IA não conseguiu organizar este texto')
        const top = Math.min(...lines.map((l) => l.level))
        // Um único item no nível de cima, logo no começo, é o nome do material, não um capítulo.
        const named = lines.length > 2 && lines.filter((l) => l.level === top).length === 1
        const body = named && lines[0].level === top ? lines.slice(1) : lines
        const bodyTop = Math.min(...body.map((l) => l.level))
        return body.map((l) => ({ ...l, level: l.level - bodyTop + 1 }))
      },

      async generateExercises(input) {
        const { topicId, count, difficulty, kinds, focus } = generateExercisesSchema.parse(input)
        const tree = topicTree(db)
        if (!tree.all.some((t) => t.id === topicId)) throw new Error('Tema não encontrado')
        const { ai, label } = client()
        const ids = tree.subtreeIds(topicId)
        // Metade do orçamento vai para o material; o resto fica para o pedido e a resposta.
        const budget = Math.floor(ai.maxInputChars / 2)
        const query = [tree.path(topicId), focus].filter(Boolean).join(': ')
        /** Trechos da busca inteligente mais ligados ao tema e ao foco, até `room` caracteres. */
        const relevant = async (kinds: RagKind[] | undefined, room: number): Promise<string[]> => {
          const matches = await rag
            .search(query, { topicIds: ids, kinds, limit: 40, perSource: 6 })
            .catch(() => [])
          const picked: string[] = []
          let size = 0
          for (const m of matches) {
            const piece = `### ${SOURCE_LABEL[m.kind](m)}\n${m.text}\n`
            if (size + piece.length > room) break
            picked.push(piece)
            size += piece.length
          }
          return picked
        }
        const whole = topicMaterial(db, topicId, budget)
        let material: string
        if (whole.complete) {
          // Coube tudo: o espaço que sobra vai para os trechos dos livros do tema.
          const fromBooks = await relevant(['book', 'ebook', 'ocr'], budget - whole.text.length)
          material = [whole.text, ...fromBooks].filter(Boolean).join('\n')
        } else {
          // Não coube: a busca escolhe o que mais tem a ver com o tema e o foco pedido.
          const picked = await relevant(undefined, budget)
          material = picked.length ? picked.join('\n') : whole.text
        }
        const wrong = db
          .select({ question: exercises.question })
          .from(exercises)
          .innerJoin(exerciseSets, eq(exercises.setId, exerciseSets.id))
          .where(and(inArray(exerciseSets.topicId, ids), eq(exercises.result, 'wrong')))
          .orderBy(desc(exercises.answeredAt))
          .limit(8)
          .all()

        const kindText =
          kinds.length === 2
            ? 'misture múltipla escolha e dissertativas'
            : kinds[0] === 'multiple_choice'
              ? 'só múltipla escolha'
              : 'só dissertativas'

        const prompt = [
          `Crie uma lista com ${count} exercícios sobre: ${tree.path(topicId)}.`,
          `Dificuldade: ${DIFFICULTY_TEXT[difficulty]}.`,
          `Tipos: ${kindText}.`,
          focus ? `Foco pedido pelo estudante: ${focus}` : '',
          '',
          material
            ? 'Material do próprio estudante (anotações, destaques e trechos dos livros). Baseie as questões ' +
              'nele e complemente com conhecimento correto do assunto:\n<material>\n' +
              material +
              '\n</material>'
            : 'O estudante ainda não tem anotações sobre esse tema; use conhecimento correto e ' +
              'didático do assunto.',
          wrong.length
            ? `\nQuestões que o estudante errou recentemente nesse tema (reforce esses conceitos com perguntas novas):\n${wrong.map((w) => `- ${w.question}`).join('\n')}`
            : '',
          '',
          'Regras: múltipla escolha com exatamente 4 alternativas plausíveis, uma só correta, sem ' +
            '"todas as anteriores"; correct_option é o índice (0 a 3) da correta. Dissertativa: ' +
            'options vazio e correct_option -1. Em todas, answer traz o gabarito completo e ' +
            'explanation explica o porquê, de forma didática.'
        ]
          .filter(Boolean)
          .join('\n')

        type Generated = z.infer<typeof exercisesOutput>['exercises'][number]
        type Checked = Omit<Generated, 'options' | 'correct_option'> & {
          options: string[] | null
          correct_option: number | null
        }
        let title = ''
        const items = await untilNotEmpty(async () => {
          const result = await ai.generate({
            system: BASE_SYSTEM,
            prompt,
            schema: exercisesOutput,
            name: 'exercicios'
          })
          title = result.title
          // Confere o que veio: alternativas, índice da correta e tipos pedidos.
          return result.exercises
            .filter((e) => kinds.includes(e.kind) && e.question.trim())
            .flatMap((e): Checked[] => {
              if (e.kind === 'open') {
                return [{ ...e, options: null, correct_option: null }]
              }
              const options = e.options.map((o) => o.trim()).filter(Boolean)
              if (
                options.length < 2 ||
                e.correct_option < 0 ||
                e.correct_option >= options.length
              ) {
                return []
              }
              return [{ ...e, options, correct_option: e.correct_option }]
            })
            .slice(0, count)
        })
        if (!items.length) throw new Error('A IA não gerou exercícios válidos. Tente de novo.')

        const set = db
          .insert(exerciseSets)
          .values({
            topicId,
            title: title.trim().slice(0, 200) || `Exercícios: ${tree.path(topicId)}`,
            difficulty,
            generatedBy: label
          })
          .returning()
          .get()
        db.insert(exercises)
          .values(
            items.map((e, position) => ({
              setId: set.id,
              position,
              kind: e.kind,
              question: e.question.trim(),
              options: e.options ? JSON.stringify(e.options) : null,
              correctOption: e.correct_option,
              answer: e.answer.trim(),
              explanation: e.explanation.trim() || null
            }))
          )
          .run()
        return exerciseSetView(set.id)
      },

      async conversations() {
        return db.select().from(aiConversations).orderBy(desc(aiConversations.updatedAt)).all()
      },

      async messages(conversationId) {
        return db
          .select()
          .from(aiMessages)
          .where(eq(aiMessages.conversationId, conversationId))
          .orderBy(asc(aiMessages.id))
          .all()
          .map(toMessage)
      },

      async send(input) {
        const { conversationId, text } = mentorSendSchema.parse(input)
        const { ai } = client()

        const isNew = conversationId === null
        let conversation = isNew
          ? db
              .insert(aiConversations)
              .values({ title: text.replace(/\s+/g, ' ').slice(0, 60) })
              .returning()
              .get()
          : conversationRow(conversationId)

        const userMessage = db
          .insert(aiMessages)
          .values({ conversationId: conversation.id, role: 'user', content: text })
          .returning()
          .get()
        const emit = (event: AiStreamEvent): void => broadcast(AI_STREAM_CHANNEL, event)

        let reply: string
        let sources: RagSource[]
        const calls: ToolCall[] = []
        try {
          let rows = liveMessages(conversation)

          // Trechos das anotações e livros ligados à pergunta. Uma pergunta curta ("e o
          // segundo?") costuma depender da anterior, então as duas vão juntas para a busca.
          const previous = rows.findLast((m) => m.role === 'user' && m.id !== userMessage.id)
          const query =
            text.length < 80 && previous ? `${previous.content.slice(0, 300)}\n${text}` : text
          const matches: (RagMatch & { n: number })[] = []
          let ragSize = 0
          for (const match of await rag.search(query).catch(() => [])) {
            // Até 1/4 do orçamento para os trechos.
            if (ragSize + match.text.length > ai.maxInputChars / 4) break
            matches.push({ ...match, n: matches.length + 1 })
            ragSize += match.text.length
          }
          sources = matches.map((m) => ({
            n: m.n,
            kind: m.kind,
            sourceId: m.sourceId,
            highlightId: m.highlightId,
            page: m.page,
            title: m.title,
            excerpt: m.excerpt
          }))

          // O retrato é refeito a cada mensagem, então a mentora sempre vê os dados atuais.
          const snapshot = studySnapshot(db)
          let system = mentorSystem(snapshot, conversation.summary, matches)

          // Não cabe mais: compacta sozinho, mantendo inteiras as mensagens mais recentes.
          if (system.length + chars(rows) > ai.maxInputChars) {
            emit({
              conversationId: conversation.id,
              type: 'status',
              text: 'Compactando a conversa para caber no contexto do modelo...'
            })
            let keepFrom = rows.length - 1
            let kept = rows[keepFrom].content.length
            while (
              keepFrom > 0 &&
              kept + rows[keepFrom - 1].content.length <= ai.maxInputChars * 0.3
            ) {
              keepFrom--
              kept += rows[keepFrom].content.length
            }
            // A parte mantida começa sempre por uma mensagem do estudante.
            while (rows[keepFrom].role === 'assistant') keepFrom++
            if (keepFrom > 0) {
              const old = rows.slice(0, keepFrom)
              const summary = await summarize(ai, conversation.summary, old)
              conversation = saveSummary(conversation.id, summary, old.at(-1)!.id)
              rows = rows.slice(keepFrom)
              system = mentorSystem(snapshot, summary, matches)
            }
          }

          reply = await ai.chat({
            system,
            // A IA não vê os cartões: cada proposta vira uma nota no fim da resposta.
            messages: rows.map((m) => {
              const proposal = m.proposal ? (JSON.parse(m.proposal) as MessageProposal) : null
              return {
                role: m.role,
                content: proposal ? `${m.content}\n\n${proposalNote(proposal)}` : m.content
              }
            }),
            onDelta: (delta) =>
              emit({ conversationId: conversation.id, type: 'delta', text: delta }),
            tools: MENTOR_TOOLS,
            onToolCall: (name, input) => calls.push({ name, input })
          })
        } catch (error) {
          // Falhou: desfaz a mensagem (e a conversa nova) para o estudante tentar de novo.
          db.delete(aiMessages).where(eq(aiMessages.id, userMessage.id)).run()
          if (isNew) db.delete(aiConversations).where(eq(aiConversations.id, conversation.id)).run()
          throw error
        }

        const proposed = proposalFromToolCalls(db, calls)
        if (proposed) {
          // Ao chamar a ferramenta, modelos locais às vezes não escrevem nada.
          if (!reply.trim()) reply = 'Preparei a proposta abaixo. Revise e clique em **Criar**.'
          const left = [
            proposed.busy && `${proposed.busy} batiam com blocos que já estão na agenda`,
            proposed.invalid && `${proposed.invalid} vieram com dia ou horário inválido`
          ].filter(Boolean)
          if (left.length) {
            reply += `\n\n_Blocos que ficaram de fora: ${left.join('; ')}._`
          }
        } else if (!reply.trim() && calls.length) {
          reply = 'Tentei preparar uma proposta, mas ela veio incompleta. Pode pedir de novo?'
        }
        const message = db
          .insert(aiMessages)
          .values({
            conversationId: conversation.id,
            role: 'assistant',
            content: reply,
            sources: sources.length ? JSON.stringify(sources) : null,
            proposal: proposed
              ? JSON.stringify({
                  ...proposed.proposal,
                  status: 'pending',
                  result: null
                } satisfies MessageProposal)
              : null
          })
          .returning()
          .get()
        const updated = db
          .update(aiConversations)
          .set({ updatedAt: new Date() })
          .where(eq(aiConversations.id, conversation.id))
          .returning()
          .get()!
        emit({ conversationId: conversation.id, type: 'done', text: reply })
        return { conversation: updated, message: toMessage(message) }
      },

      async applyProposal(messageId, skip) {
        const { row, proposal } = proposalRow(messageId)
        if (proposal.status !== 'pending') throw new Error('Esta proposta já foi resolvida')
        const result = applyProposal(db, proposal, proposalSkipSchema.parse(skip))
        return saveProposal(row.id, { ...proposal, status: 'applied', result })
      },

      async discardProposal(messageId) {
        const { row, proposal } = proposalRow(messageId)
        if (proposal.status !== 'pending') throw new Error('Esta proposta já foi resolvida')
        return saveProposal(row.id, { ...proposal, status: 'discarded' })
      },

      async compact(input) {
        const { conversationId, instructions } = mentorCompactSchema.parse(input)
        const conversation = conversationRow(conversationId)
        const rows = liveMessages(conversation)
        if (rows.length < 2) throw new Error('Ainda não há o que compactar nesta conversa')
        const summary = await summarize(client().ai, conversation.summary, rows, instructions)
        return saveSummary(conversationId, summary, rows.at(-1)!.id)
      },

      async contextUsage(conversationId) {
        const conversation = conversationRow(conversationId)
        const rows = liveMessages(conversation)
        const system = mentorSystem(studySnapshot(db), conversation.summary, [])
        return {
          used: system.length + chars(rows),
          max: client().ai.maxInputChars,
          liveMessages: rows.length
        }
      },

      async deleteConversation(id) {
        db.delete(aiConversations).where(eq(aiConversations.id, id)).run()
      }
    },

    exercises: {
      async sets() {
        const sets = db.select().from(exerciseSets).orderBy(desc(exerciseSets.createdAt)).all()
        // A lista não leva as questões, só os totais.
        return sets.map((set) => ({ ...exerciseSetView(set.id), exercises: undefined }))
      },

      async get(setId) {
        return exerciseSetView(setId)
      },

      async answer(exerciseId, input) {
        const data = exerciseAnswerSchema.parse(input)
        const row = db.select().from(exercises).where(eq(exercises.id, exerciseId)).get()
        if (!row) throw new Error('Exercício não encontrado')

        let result = data.result ?? row.result
        // Múltipla escolha é corrigida aqui; dissertativa usa a autoavaliação do estudante.
        if (row.kind === 'multiple_choice' && data.choice !== undefined) {
          result = data.choice === row.correctOption ? 'correct' : 'wrong'
        }
        const updated = db
          .update(exercises)
          .set({
            ...(data.choice !== undefined && { userChoice: data.choice }),
            ...(data.text !== undefined && { userAnswer: data.text }),
            result,
            answeredAt: new Date()
          })
          .where(eq(exercises.id, exerciseId))
          .returning()
          .get()!
        return toExercise(updated)
      },

      async removeSet(setId) {
        db.delete(exerciseSets).where(eq(exerciseSets.id, setId)).run()
      }
    }
  }
}
