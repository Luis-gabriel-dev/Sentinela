import { and, asc, desc, eq, gt, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { AI_STREAM_CHANNEL, type Api } from '@shared/api'
import {
  aiKeySchema,
  aiProviderSchema,
  aiSettingsUpdateSchema,
  EXERCISE_KINDS,
  exerciseAnswerSchema,
  generateExercisesSchema,
  mentorCompactSchema,
  mentorSendSchema,
  suggestScheduleSchema,
  suggestTopicsSchema,
  type AiProvider
} from '@shared/schemas'
import type {
  AiSettings,
  AiStreamEvent,
  ChatMessage,
  Exercise,
  ExerciseSet,
  RagSource,
  ScheduleSuggestion
} from '@shared/types'
import { AI_CONFIG_KEY, getSetting, readAiConfig, setSetting, type AiConfig } from '../ai/config'
import { createAiClient, type AiClient } from '../ai/providers'
import { studySnapshot, topicMaterial, topicTree } from '../ai/context'
import type { RagIndex, RagMatch } from '../ai/rag'
import type { Db } from '../db/client'
import {
  aiConversations,
  aiMessages,
  exerciseSets,
  exercises,
  notes,
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

Quando sugerir algo que o próprio Sentinela faz, diga onde: dividir um tema em tópicos (Temas e progresso), montar a semana (Agenda), gerar exercícios com gabarito (IA mentora > Exercícios).`

const SUMMARY_SYSTEM = `${BASE_SYSTEM}

Agora sua tarefa é resumir uma conversa entre o estudante e a mentora, para a conversa continuar depois só com o resumo. Preserve com precisão: o que o estudante contou sobre si (nomes, apelidos, rotina, preferências, objetivos, prazos, dificuldades), decisões e planos combinados, recomendações já feitas, perguntas em aberto e o assunto do momento. Não invente nada. Escreva em tópicos curtos, sem introdução, com no máximo 350 palavras.`

type MessageRow = typeof aiMessages.$inferSelect

const toMessage = (row: MessageRow): ChatMessage => ({
  ...row,
  sources: row.sources ? (JSON.parse(row.sources) as RagSource[]) : null
})

const SOURCE_LABEL: Record<RagSource['kind'], (s: Pick<RagSource, 'title' | 'page'>) => string> = {
  note: (s) => `Anotação "${s.title}"`,
  highlight: (s) => `Destaque no livro "${s.title}"${s.page ? `, p. ${s.page}` : ''}`,
  ocr: (s) => `Livro "${s.title}", p. ${s.page} (texto reconhecido por OCR)`
}

/** Instruções da conversa: papel, retrato dos estudos, resumo do que foi compactado e trechos. */
function mentorSystem(
  snapshot: string,
  summary: string | null,
  matches: (RagMatch & { n: number })[]
): string {
  return [
    MENTOR_SYSTEM,
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

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const toMinutes = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))

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
            .filter(
              (t) => t.name && !seen.has(t.name.toLowerCase()) && seen.add(t.name.toLowerCase())
            )
            .slice(0, 15)
        })
      },

      async suggestSchedule(input) {
        const { topicIds, hoursPerWeek, availability } = suggestScheduleSchema.parse(input)
        const tree = topicTree(db)
        const chosen = tree.all.filter((t) => topicIds.includes(t.id))
        if (!chosen.length) throw new Error('Nenhum dos temas foi encontrado')

        const topicLines = chosen.map((t) => {
          const kids = tree.children(t.id)
          const pending = kids.filter((k) => !k.completedAt).map((k) => k.name)
          return (
            `- [topic_id ${t.id}] ${tree.path(t.id)}` +
            (kids.length
              ? `: ${kids.length - pending.length}/${kids.length} tópicos concluídos`
              : '') +
            (pending.length ? `; pendentes: ${pending.slice(0, 10).join(', ')}` : '') +
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

      async generateExercises(input) {
        const { topicId, count, difficulty, kinds, focus } = generateExercisesSchema.parse(input)
        const tree = topicTree(db)
        if (!tree.all.some((t) => t.id === topicId)) throw new Error('Tema não encontrado')
        const { ai, label } = client()
        const ids = tree.subtreeIds(topicId)
        // Metade do orçamento vai para o material; o resto fica para o pedido e a resposta. Se o
        // material do tema não couber inteiro, a busca inteligente escolhe os trechos mais ligados
        // ao tema e ao foco pedido (incluindo páginas de OCR dos livros do tema).
        const budget = Math.floor(ai.maxInputChars / 2)
        const whole = topicMaterial(db, topicId, budget)
        let material = whole.text
        if (!whole.complete) {
          const matches = await rag
            .search([tree.path(topicId), focus].filter(Boolean).join(': '), {
              topicIds: ids,
              limit: 40,
              perSource: 6
            })
            .catch(() => [])
          const picked: string[] = []
          let size = 0
          for (const m of matches) {
            const piece = `### ${SOURCE_LABEL[m.kind](m)}\n${m.text}\n`
            if (size + piece.length > budget) break
            picked.push(piece)
            size += piece.length
          }
          if (picked.length) material = picked.join('\n')
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
            ? 'Material do próprio estudante (anotações e trechos destacados). Baseie as questões ' +
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
            messages: rows.map((m) => ({ role: m.role, content: m.content })),
            onDelta: (delta) =>
              emit({ conversationId: conversation.id, type: 'delta', text: delta })
          })
        } catch (error) {
          // Falhou: desfaz a mensagem (e a conversa nova) para o estudante tentar de novo.
          db.delete(aiMessages).where(eq(aiMessages.id, userMessage.id)).run()
          if (isNew) db.delete(aiConversations).where(eq(aiConversations.id, conversation.id)).run()
          throw error
        }

        const message = db
          .insert(aiMessages)
          .values({
            conversationId: conversation.id,
            role: 'assistant',
            content: reply,
            sources: sources.length ? JSON.stringify(sources) : null
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
