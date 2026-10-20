import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core'
// Import relativo (e não @shared) porque o drizzle-kit lê este arquivo fora do Vite.
import { PRIORITIES, RECURRENCES } from '../../shared/schemas'

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())
}

/** Árvore de temas de estudo. Folhas com completedAt contam para a barra de progresso do pai. */
export const topics = sqliteTable(
  'topics',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    parentId: integer('parent_id').references((): AnySQLiteColumn => topics.id, {
      onDelete: 'cascade'
    }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#6366f1'),
    description: text('description'),
    position: integer('position').notNull().default(0),
    trackProgress: integer('track_progress', { mode: 'boolean' }).notNull().default(false),
    weeklyGoal: integer('weekly_goal'),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    ...timestamps
  },
  (t) => [index('topics_parent_idx').on(t.parentId)]
)

export const tasks = sqliteTable(
  'tasks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    description: text('description'),
    topicId: integer('topic_id').references(() => topics.id, { onDelete: 'set null' }),
    priority: text('priority', { enum: PRIORITIES }).notNull().default('normal'),
    dueDate: text('due_date'),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    ...timestamps
  },
  (t) => [index('tasks_topic_idx').on(t.topicId)]
)

export const scheduleBlocks = sqliteTable('schedule_blocks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  topicId: integer('topic_id').references(() => topics.id, { onDelete: 'set null' }),
  color: text('color'),
  recurrence: text('recurrence', { enum: RECURRENCES }).notNull(),
  weekday: integer('weekday'),
  date: text('date'),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  notes: text('notes'),
  ...timestamps
})

/** Um registro por dia em que o bloco da agenda foi cumprido. */
export const blockCheckins = sqliteTable(
  'block_checkins',
  {
    blockId: integer('block_id')
      .notNull()
      .references(() => scheduleBlocks.id, { onDelete: 'cascade' }),
    date: text('date').notNull()
  },
  (t) => [primaryKey({ columns: [t.blockId, t.date] })]
)

/** Configurações gerais (chave → JSON). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})
