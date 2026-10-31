import { z } from 'zod'

// Mensagens de validação padrão em português do Brasil (vale para main e interface).
z.config(z.locales.ptBR())

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export const prioritySchema = z.enum(PRIORITIES)
export type Priority = z.infer<typeof prioritySchema>

export const RECURRENCES = ['weekly', 'once'] as const
export const recurrenceSchema = z.enum(RECURRENCES)
export type Recurrence = z.infer<typeof recurrenceSchema>

const id = z.number().int().positive()
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida')
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido (HH:MM)')
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (AAAA-MM-DD)')
const optionalText = (max: number): z.ZodNullable<z.ZodString> =>
  z.string().trim().max(max).nullable()

// Temas (árvore: Cybersegurança > Redes > Camada de transporte)

const topicFields = {
  // Títulos de seção de livro podem ser longos ("3.7.2 Notificação explícita de...").
  name: z.string().trim().min(1, 'Informe um nome').max(200),
  parentId: id.nullable(),
  color: hexColor,
  description: optionalText(2000),
  trackProgress: z.boolean(),
  weeklyGoal: z.number().int().min(1).max(100).nullable()
}

export const topicCreateSchema = z
  .object(topicFields)
  .partial()
  .required({ name: true, color: true })
export const topicUpdateSchema = z.object({ ...topicFields, completed: z.boolean() }).partial()
export type TopicCreate = z.input<typeof topicCreateSchema>
export type TopicUpdate = z.input<typeof topicUpdateSchema>

/** Um item do sumário importado, com os subitens. */
export interface OutlineNodeInput {
  title: string
  /** Onde abrir no livro, como na URL do leitor: "pagina=12" ou "href=cap03.xhtml#s2". */
  bookLocation?: string | null
  children: OutlineNodeInput[]
}

const outlineNodeSchema: z.ZodType<OutlineNodeInput> = z.lazy(() =>
  z.object({
    title: z.string().trim().min(1).max(200),
    bookLocation: z
      .string()
      .regex(/^(pagina|href)=/)
      .max(1000)
      .nullable()
      .optional(),
    children: z.array(outlineNodeSchema).max(2000)
  })
)

export const importOutlineSchema = z.object({
  /** Onde criar: dentro deste tema, ou como tema principal (null). */
  parentId: id.nullable(),
  /** Tema novo que recebe o sumário (ex.: o nome do livro); null = os itens vão direto em parentId. */
  root: z.object({ name: topicFields.name, color: hexColor }).nullable(),
  /** Livro da biblioteca de onde veio o sumário (os temas ficam ligados às páginas). */
  bookId: id.nullable(),
  /** Acompanhar o progresso pelo sumário. */
  trackProgress: z.boolean(),
  items: z.array(outlineNodeSchema).min(1, 'Nada para importar').max(2000)
})
export type ImportOutlineInput = z.input<typeof importOutlineSchema>

/** Texto sem estrutura clara (ex.: lista de aulas de um curso) para a IA organizar. */
export const structureOutlineSchema = z.string().trim().min(10).max(200_000)

// Tarefas

const taskFields = {
  title: z.string().trim().min(1, 'Informe um título').max(300),
  description: optionalText(5000),
  topicId: id.nullable(),
  priority: prioritySchema,
  dueDate: isoDateSchema.nullable()
}

export const taskCreateSchema = z.object(taskFields).partial().required({ title: true })
export const taskUpdateSchema = z.object({ ...taskFields, completed: z.boolean() }).partial()
export type TaskCreate = z.input<typeof taskCreateSchema>
export type TaskUpdate = z.input<typeof taskUpdateSchema>

export const taskFilterSchema = z
  .object({
    topicId: id.optional(),
    status: z.enum(['open', 'done', 'all']).optional()
  })
  .optional()
export type TaskFilter = z.input<typeof taskFilterSchema>

// Agenda: blocos semanais recorrentes ou em uma data específica

const scheduleBlockFields = {
  title: z.string().trim().min(1, 'Informe um título').max(200),
  topicId: id.nullable(),
  /** Projeto do GitHub trabalhado no bloco (horários de projetos da Semana). */
  projectId: id.nullable(),
  color: hexColor.nullable(),
  recurrence: recurrenceSchema,
  weekday: z.number().int().min(0).max(6).nullable(),
  date: isoDateSchema.nullable(),
  startTime: time,
  endTime: time,
  notes: optionalText(2000)
}

export const scheduleBlockSchema = z
  .object(scheduleBlockFields)
  .superRefine((b, ctx) => {
    if (b.recurrence === 'weekly' && b.weekday === null) {
      ctx.addIssue({ code: 'custom', path: ['weekday'], message: 'Informe o dia da semana' })
    }
    if (b.recurrence === 'once' && b.date === null) {
      ctx.addIssue({ code: 'custom', path: ['date'], message: 'Informe a data' })
    }
    if (b.endTime <= b.startTime) {
      ctx.addIssue({
        code: 'custom',
        path: ['endTime'],
        message: 'O fim precisa ser depois do início'
      })
    }
  })
  .transform((b) => ({
    ...b,
    weekday: b.recurrence === 'weekly' ? b.weekday : null,
    date: b.recurrence === 'once' ? b.date : null
  }))

export const scheduleBlockCreateSchema = z
  .object(scheduleBlockFields)
  .partial()
  .required({ title: true, recurrence: true, startTime: true, endTime: true })
export const scheduleBlockUpdateSchema = z.object(scheduleBlockFields).partial()
export type ScheduleBlockCreate = z.input<typeof scheduleBlockCreateSchema>
export type ScheduleBlockUpdate = z.input<typeof scheduleBlockUpdateSchema>

export const dateRangeSchema = z.object({ from: isoDateSchema, to: isoDateSchema })
export type DateRange = z.input<typeof dateRangeSchema>

// Semana: horários livres do estudante (para estudos ou projetos) e o plano montado neles

export const WINDOW_KINDS = ['estudos', 'projetos'] as const
export type WindowKind = (typeof WINDOW_KINDS)[number]

export const weekWindowSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startTime: time,
    endTime: time,
    kind: z.enum(WINDOW_KINDS)
  })
  .refine((w) => w.endTime > w.startTime, {
    path: ['endTime'],
    message: 'O fim precisa ser depois do início'
  })
export type WeekWindow = z.infer<typeof weekWindowSchema>

export const weekAvailabilitySchema = z.object({ windows: z.array(weekWindowSchema).max(100) })
export type WeekAvailability = z.infer<typeof weekAvailabilitySchema>

export const planWeekSchema = z
  .object({
    topicIds: z.array(id).max(20),
    projectIds: z.array(id).max(20),
    /** Divide em subtópicos (com a IA) os temas escolhidos que ainda não têm nenhum. */
    splitTopics: z.boolean(),
    /** Tira os blocos semanais que caem nos horários livres (o plano novo fica no lugar). */
    replace: z.boolean()
  })
  .refine((p) => p.topicIds.length + p.projectIds.length > 0, {
    message: 'Escolha pelo menos um tema ou projeto'
  })
export type PlanWeekInput = z.input<typeof planWeekSchema>

/**
 * Proposta de mudanças (da mentora na conversa ou do plano da semana): temas novos e blocos
 * semanais. Nada é criado até o estudante confirmar.
 */
export interface ProposedTopic {
  name: string
  children: ProposedTopic[]
}

const proposedTopicSchema: z.ZodType<ProposedTopic> = z.lazy(() =>
  z.object({
    name: topicFields.name,
    children: z.array(proposedTopicSchema).max(50)
  })
)

export const proposedBlockSchema = z.object({
  title: scheduleBlockFields.title,
  topicId: id.nullable(),
  /** Tema pelo nome, quando ele é criado na mesma proposta (ainda sem id). */
  topicName: z.string().max(200).nullable(),
  projectId: id.nullable(),
  weekday: z.number().int().min(0).max(6),
  startTime: time,
  endTime: time,
  notes: optionalText(2000)
})
export type ProposedBlock = z.infer<typeof proposedBlockSchema>

export const proposalSchema = z.object({
  /** Temas novos, agrupados pelo tema onde entram (null = temas principais). */
  topics: z
    .array(z.object({ parentId: id.nullable(), items: z.array(proposedTopicSchema).max(50) }))
    .max(30),
  blocks: z.array(proposedBlockSchema).max(60),
  /** Blocos semanais que saem para os novos entrarem (plano da semana com "substituir"). */
  replaceBlockIds: z.array(id).max(200)
})
export type Proposal = z.infer<typeof proposalSchema>

/**
 * O que o estudante desmarcou na proposta. Temas por chave "grupo.item.subitem" (desmarcar um
 * tema tira os subtópicos dele); blocos pelo índice.
 */
export const proposalSkipSchema = z.object({
  topics: z.array(z.string().max(30)).max(500),
  blocks: z.array(z.number().int().min(0)).max(60)
})
export type ProposalSkip = z.infer<typeof proposalSkipSchema>

// Anotações (conteúdo = blocos do BlockNote)

const noteFields = {
  title: z.string().trim().max(200),
  topicId: id.nullable(),
  content: z.array(z.unknown())
}

export const noteCreateSchema = z
  .object({ title: noteFields.title, topicId: noteFields.topicId })
  .partial()
export const noteUpdateSchema = z.object(noteFields).partial()
export type NoteCreate = z.input<typeof noteCreateSchema>
export type NoteUpdate = z.input<typeof noteUpdateSchema>

export const noteSearchSchema = z.string().trim().max(200)

// Biblioteca

export const BOOK_FORMATS = ['pdf', 'epub', 'mobi', 'azw3', 'fb2', 'cbz'] as const
export type BookFormat = (typeof BOOK_FORMATS)[number]

/** Extensão do arquivo → formato. MOBI cobre os .azw/.prc antigos. */
export const BOOK_EXTENSIONS: Record<string, BookFormat> = {
  pdf: 'pdf',
  epub: 'epub',
  mobi: 'mobi',
  azw: 'mobi',
  prc: 'mobi',
  azw3: 'azw3',
  kf8: 'azw3',
  fb2: 'fb2',
  cbz: 'cbz'
}

export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink'] as const
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]

const folderFields = { name: z.string().trim().min(1, 'Informe um nome').max(80), color: hexColor }
export const folderCreateSchema = z.object(folderFields)
export const folderUpdateSchema = z.object(folderFields).partial()
export type FolderCreate = z.input<typeof folderCreateSchema>
export type FolderUpdate = z.input<typeof folderUpdateSchema>

export const bookPathsSchema = z.array(z.string().min(1).max(4096)).max(500)

export const bookUpdateSchema = z
  .object({
    title: z.string().trim().min(1, 'Informe um título').max(300),
    author: optionalText(300),
    folderId: id.nullable(),
    topicId: id.nullable(),
    pageCount: z.number().int().positive().nullable(),
    metadataReady: z.boolean(),
    progress: z.number().min(0).max(1),
    location: z.string().max(20_000).nullable()
  })
  .partial()
export type BookUpdate = z.input<typeof bookUpdateSchema>

export const coverSchema = z
  .instanceof(Uint8Array)
  .refine((d) => d.byteLength <= 5 * 1024 * 1024, 'Capa maior que 5 MB')

const highlightFields = {
  bookId: id,
  location: z.string().min(1).max(50_000),
  sortKey: z.number(),
  text: z.string().max(20_000),
  color: z.enum(HIGHLIGHT_COLORS),
  note: optionalText(5000)
}
export const highlightCreateSchema = z.object(highlightFields).partial({ color: true, note: true })
export const highlightUpdateSchema = z
  .object({ color: highlightFields.color, note: highlightFields.note })
  .partial()
export type HighlightCreate = z.input<typeof highlightCreateSchema>
export type HighlightUpdate = z.input<typeof highlightUpdateSchema>

// OCR (páginas de PDFs escaneados renderizadas como imagem pela interface)

export const ocrPageInputSchema = z.object({
  bookId: id,
  page: z.number().int().positive(),
  width: z.number().int().positive().max(10_000),
  height: z.number().int().positive().max(10_000),
  image: z
    .instanceof(Uint8Array)
    .refine((d) => d.byteLength <= 40 * 1024 * 1024, 'Imagem da página grande demais')
})
export type OcrPageInput = z.input<typeof ocrPageInputSchema>

// GitHub

export const githubTokenSchema = z
  .string()
  .trim()
  .min(20, 'Token muito curto')
  .max(300)
  .regex(/^[\w-]+$/, 'Token com caracteres inválidos')

/** "dono/repositorio" ou URL do GitHub (https://github.com/dono/repositorio[.git]). */
export const repoInputSchema = z
  .string()
  .trim()
  .transform((s) =>
    s
      .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
      .replace(/\.git$/i, '')
      .replace(/\/+$/, '')
  )
  .pipe(
    z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'Use o formato dono/repositorio ou o endereço do GitHub')
  )

export const projectUpdateSchema = z
  .object({
    topicId: id.nullable(),
    staleDays: z.number().int().min(1).max(365),
    notes: optionalText(2000)
  })
  .partial()
export type ProjectUpdate = z.input<typeof projectUpdateSchema>

// IA mentora

export const AI_PROVIDERS = ['anthropic', 'openai', 'ollama'] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]
export const aiProviderSchema = z.enum(AI_PROVIDERS)

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]
export const EXERCISE_KINDS = ['multiple_choice', 'open'] as const
export type ExerciseKind = (typeof EXERCISE_KINDS)[number]
export const EXERCISE_RESULTS = ['correct', 'partial', 'wrong'] as const
export type ExerciseResult = (typeof EXERCISE_RESULTS)[number]

export const aiSettingsUpdateSchema = z
  .object({
    provider: aiProviderSchema,
    /** Modelo do provedor ativo. */
    model: z.string().trim().min(1).max(200),
    ollamaUrl: z.url({ protocol: /^https?$/, message: 'Endereço inválido (use http://...)' })
  })
  .partial()
export type AiSettingsUpdate = z.input<typeof aiSettingsUpdateSchema>

export const aiKeySchema = z.object({
  provider: z.enum(['anthropic', 'openai']),
  key: z.string().trim().min(20, 'Chave muito curta').max(500)
})
export type AiKeyInput = z.input<typeof aiKeySchema>

export const suggestTopicsSchema = z.object({
  topicId: id,
  instructions: optionalText(1000).optional()
})
export type SuggestTopicsInput = z.input<typeof suggestTopicsSchema>

export const suggestScheduleSchema = z.object({
  topicIds: z.array(id).min(1, 'Escolha pelo menos um tema').max(20),
  hoursPerWeek: z.number().int().min(1).max(80),
  availability: z.string().trim().min(3, 'Diga quando você pode estudar').max(1000)
})
export type SuggestScheduleInput = z.input<typeof suggestScheduleSchema>

export const generateExercisesSchema = z.object({
  topicId: id,
  count: z.number().int().min(1).max(20),
  difficulty: z.enum(DIFFICULTIES),
  kinds: z.array(z.enum(EXERCISE_KINDS)).min(1, 'Escolha pelo menos um tipo'),
  focus: optionalText(1000).optional()
})
export type GenerateExercisesInput = z.input<typeof generateExercisesSchema>

export const exerciseAnswerSchema = z
  .object({
    choice: z.number().int().min(0).max(9),
    text: z.string().max(10_000),
    result: z.enum(EXERCISE_RESULTS)
  })
  .partial()
export type ExerciseAnswerInput = z.input<typeof exerciseAnswerSchema>

export const mentorSendSchema = z.object({
  conversationId: id.nullable(),
  text: z.string().trim().min(1).max(8000)
})
export type MentorSendInput = z.input<typeof mentorSendSchema>

export const mentorCompactSchema = z.object({
  conversationId: id,
  /** O que o resumo deve preservar com mais cuidado (opcional). */
  instructions: optionalText(1000).optional()
})
export type MentorCompactInput = z.input<typeof mentorCompactSchema>

// Lembretes (notificações do sistema e bandeja)

export const remindersUpdateSchema = z
  .object({
    enabled: z.boolean(),
    blocks: z.boolean(),
    /** Antecedência do aviso de bloco da agenda, em minutos. */
    blockMinutes: z.number().int().min(0).max(120),
    tasks: z.boolean(),
    projects: z.boolean(),
    /** Horário do resumo diário (tarefas importantes e projetos parados), HH:MM. */
    digestTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido'),
    closeToTray: z.boolean(),
    openAtLogin: z.boolean()
  })
  .partial()
export type RemindersUpdate = z.input<typeof remindersUpdateSchema>

// Busca inteligente (RAG)

/** book = página de PDF; ebook = seção de EPUB/MOBI/AZW3. */
export const RAG_KINDS = ['note', 'highlight', 'ocr', 'book', 'ebook'] as const
export type RagKind = (typeof RAG_KINDS)[number]

export const ragSettingsUpdateSchema = z
  .object({
    enabled: z.boolean(),
    /** Modelo de embedding do Ollama; null = escolher sozinho entre os instalados. */
    embedModel: z.string().trim().min(1).max(200).nullable()
  })
  .partial()
export type RagSettingsUpdate = z.input<typeof ragSettingsUpdateSchema>

export const ragSearchSchema = z.string().trim().min(1).max(1000)

export const bookTextSchema = z.object({
  bookId: id,
  /** Página (PDF) ou seção (EPUB/MOBI), a partir de 1. Vazio = livro sem texto (escaneado). */
  pages: z
    .array(z.object({ page: z.number().int().min(1), text: z.string().max(500_000) }))
    .max(20_000)
})
export type BookTextInput = z.input<typeof bookTextSchema>

// Anexos (imagens coladas nas anotações)

export const ATTACHMENT_MIME_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp'
} as const
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

export const attachmentSchema = z.object({
  mimeType: z.enum(Object.keys(ATTACHMENT_MIME_TYPES) as [keyof typeof ATTACHMENT_MIME_TYPES], {
    message: 'Só imagens PNG, JPG, GIF ou WEBP'
  }),
  data: z
    .instanceof(Uint8Array)
    .refine((d) => d.byteLength <= MAX_ATTACHMENT_BYTES, 'Imagem maior que 20 MB')
})
export type AttachmentInput = z.input<typeof attachmentSchema>
