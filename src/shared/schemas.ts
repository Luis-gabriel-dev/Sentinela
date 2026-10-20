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
  name: z.string().trim().min(1, 'Informe um nome').max(120),
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
