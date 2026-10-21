import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { AI_STREAM_CHANNEL, type Api } from '@shared/api'
import {
  aiKeySchema,
  aiSettingsUpdateSchema,
  EXERCISE_KINDS,
  exerciseAnswerSchema,
  generateExercisesSchema,
  mentorSendSchema,
  suggestScheduleSchema,
  suggestTopicsSchema,
  type AiProvider
} from '@shared/schemas'
import type {
  AiSettings,
  AiStreamEvent,
  Exercise,
  ExerciseSet,
  ScheduleSuggestion
} from '@shared/types'
import { createAiClient, DEFAULT_MODELS, type AiClient } from '../ai/providers'
import { studySnapshot, topicMaterial, topicTree } from '../ai/context'
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

const CONFIG_KEY = 'ai.config'
const keyName = (provider: 'anthropic' | 'openai'): string => `ai.key.${provider}`

interface AiConfig {
  provider: AiProvider
  models: Record<AiProvider, string>
  ollamaUrl: string
}

const DEFAULT_CONFIG: AiConfig = {
  provider: 'anthropic',
  models: DEFAULT_MODELS,
  ollamaUrl: 'http://localhost:11434'
}

const BASE_SYSTEM =
  'Você é a mentora de estudos do Sentinela, um app pessoal de organização de estudos de um ' +
  'estudante brasileiro (cybersegurança, programação, IA, eletrônica e outros temas). Escreva ' +
  'sempre em português do Brasil, com clareza e sem enrolação.'

const MENTOR_SYSTEM = `${BASE_SYSTEM}

Seu papel é acompanhar o estudante: dizer se ele está no rumo certo e sugerir próximos passos concretos com base nos dados dele (progresso nos temas, agenda, tarefas, resultados de exercícios e projetos). Seja honesta: se os dados mostram atraso ou pouca prática, diga isso com gentileza e proponha um ajuste realista. Não invente dados que não aparecem no retrato abaixo; se faltar informação para responder bem, pergunte. Prefira respostas curtas e acionáveis.

Quando sugerir algo que o próprio Sentinela faz, diga onde: dividir um tema em tópicos (Temas e progresso), montar a semana (Agenda), gerar exercícios com gabarito (IA mentora > Exercícios).`

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
  broadcast: (channel: string, payload: unknown) => void
): Pick<Api, 'ai' | 'mentor' | 'exercises'> {
  const getSetting = (key: string): string | null =>
    db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null
  const setSetting = (key: string, value: string): void => {
    db.insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
      .run()
  }

  const config = (): AiConfig => {
    const stored = getSetting(CONFIG_KEY)
    const parsed = stored ? (JSON.parse(stored) as Partial<AiConfig>) : {}
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      models: { ...DEFAULT_CONFIG.models, ...parsed.models }
    }
  }

  const apiKey = (provider: AiProvider): string | null => {
    if (provider === 'ollama') return null
    const stored = getSetting(keyName(provider))
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

  const client = (): { ai: AiClient; label: string } => {
    const c = config()
    const model = c.models[c.provider]
    return {
      ai: createAiClient(c.provider, { model, apiKey: apiKey(c.provider), ollamaUrl: c.ollamaUrl }),
      label: `${c.provider}/${model}`
    }
  }

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
          CONFIG_KEY,
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
        setSetting(keyName(provider), secrets.encrypt(key))
        return settingsView()
      },

      async clearKey(provider) {
        const p = z.enum(['anthropic', 'openai']).parse(provider)
        db.delete(settings)
          .where(eq(settings.key, keyName(p)))
          .run()
        return settingsView()
      },

      async listModels() {
        return client().ai.listModels()
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
        const material = topicMaterial(db, topicId)
        const ids = tree.subtreeIds(topicId)
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

        const { ai, label } = client()
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
      },

      async send(input) {
        const { conversationId, text } = mentorSendSchema.parse(input)
        const { ai } = client()

        const isNew = conversationId === null
        const conversation = isNew
          ? db
              .insert(aiConversations)
              .values({ title: text.replace(/\s+/g, ' ').slice(0, 60) })
              .returning()
              .get()
          : db.select().from(aiConversations).where(eq(aiConversations.id, conversationId)).get()
        if (!conversation) throw new Error('Conversa não encontrada')

        const userMessage = db
          .insert(aiMessages)
          .values({ conversationId: conversation.id, role: 'user', content: text })
          .returning()
          .get()
        const history = db
          .select()
          .from(aiMessages)
          .where(eq(aiMessages.conversationId, conversation.id))
          .orderBy(asc(aiMessages.id))
          .all()
          .slice(-30)
          .map((m) => ({ role: m.role, content: m.content }))

        const emit = (event: AiStreamEvent): void => broadcast(AI_STREAM_CHANNEL, event)
        let reply: string
        try {
          reply = await ai.chat({
            system: `${MENTOR_SYSTEM}\n\n# Retrato atual dos estudos\n\n${studySnapshot(db)}`,
            messages: history,
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
          .values({ conversationId: conversation.id, role: 'assistant', content: reply })
          .returning()
          .get()
        const updated = db
          .update(aiConversations)
          .set({ updatedAt: new Date() })
          .where(eq(aiConversations.id, conversation.id))
          .returning()
          .get()!
        emit({ conversationId: conversation.id, type: 'done', text: reply })
        return { conversation: updated, message }
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
