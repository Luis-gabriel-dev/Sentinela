import { z } from 'zod'

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
