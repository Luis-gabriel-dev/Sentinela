import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core'
// Import relativo (e não @shared) porque o drizzle-kit lê este arquivo fora do Vite.
import { BOOK_FORMATS, HIGHLIGHT_COLORS, PRIORITIES, RECURRENCES } from '../../shared/schemas'

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

/**
 * Anotações. `content` guarda os blocos do BlockNote em JSON; `contentText` é o texto puro
 * extraído deles, indexado pela tabela virtual FTS5 `notes_fts` (criada em migration manual).
 */
export const notes = sqliteTable(
  'notes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    topicId: integer('topic_id').references(() => topics.id, { onDelete: 'set null' }),
    title: text('title').notNull().default(''),
    content: text('content').notNull().default('[]'),
    contentText: text('content_text').notNull().default(''),
    ...timestamps
  },
  (t) => [index('notes_topic_idx').on(t.topicId)]
)

/** Pastas da biblioteca (Cybersegurança, Desenvolvimento web, Projetos...). */
export const libraryFolders = sqliteTable('library_folders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#6366f1'),
  position: integer('position').notNull().default(0),
  ...timestamps
})

/**
 * Livros. O arquivo continua onde o usuário guardou; aqui fica só o caminho.
 * `location` é a posição de leitura: JSON com página/zoom no PDF, CFI no EPUB/MOBI.
 */
export const books = sqliteTable(
  'books',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    folderId: integer('folder_id').references(() => libraryFolders.id, { onDelete: 'set null' }),
    topicId: integer('topic_id').references(() => topics.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    author: text('author'),
    format: text('format', { enum: BOOK_FORMATS }).notNull(),
    filePath: text('file_path').notNull().unique(),
    fileSize: integer('file_size').notNull(),
    pageCount: integer('page_count'),
    /** 0 = sem capa; incrementa a cada capa nova (versiona a URL da imagem). */
    coverVersion: integer('cover_version').notNull().default(0),
    /** Título, autor e capa já foram lidos do arquivo. */
    metadataReady: integer('metadata_ready', { mode: 'boolean' }).notNull().default(false),
    progress: real('progress').notNull().default(0),
    location: text('location'),
    lastOpenedAt: integer('last_opened_at', { mode: 'timestamp_ms' }),
    ...timestamps
  },
  (t) => [index('books_folder_idx').on(t.folderId)]
)

/** Trechos marcados nos livros. `location`: retângulos por página (PDF) ou CFI (EPUB/MOBI). */
export const bookHighlights = sqliteTable(
  'book_highlights',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    bookId: integer('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    location: text('location').notNull(),
    /** Página (PDF) ou fração 0–1 (EPUB), só para ordenar a lista. */
    sortKey: real('sort_key').notNull().default(0),
    text: text('text').notNull(),
    color: text('color', { enum: HIGHLIGHT_COLORS }).notNull().default('yellow'),
    note: text('note'),
    ...timestamps
  },
  (t) => [index('book_highlights_book_idx').on(t.bookId)]
)

/**
 * Texto reconhecido por OCR nas páginas de PDFs escaneados.
 * `lines`: JSON com as linhas e suas posições normalizadas (0–1) na página.
 */
export const bookOcrPages = sqliteTable(
  'book_ocr_pages',
  {
    bookId: integer('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    page: integer('page').notNull(),
    text: text('text').notNull(),
    lines: text('lines').notNull(),
    /** Confiança média do Tesseract, 0–100. */
    confidence: real('confidence').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
  },
  (t) => [primaryKey({ columns: [t.bookId, t.page] })]
)

/**
 * Projetos acompanhados no GitHub. As colunas depois de `notes` são um cache do que veio da
 * API na última sincronização (`syncedAt`); `weeklyCommits` é JSON com 12 números (mais antiga →
 * semana atual).
 */
export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  repo: text('repo').notNull().unique(),
  topicId: integer('topic_id').references(() => topics.id, { onDelete: 'set null' }),
  /** Dias sem commit até o projeto ser considerado parado. */
  staleDays: integer('stale_days').notNull().default(7),
  notes: text('notes'),
  description: text('description'),
  htmlUrl: text('html_url'),
  defaultBranch: text('default_branch'),
  language: text('language'),
  stars: integer('stars').notNull().default(0),
  openIssues: integer('open_issues').notNull().default(0),
  openPrs: integer('open_prs').notNull().default(0),
  isPrivate: integer('is_private', { mode: 'boolean' }).notNull().default(false),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  lastCommitAt: integer('last_commit_at', { mode: 'timestamp_ms' }),
  lastCommitMessage: text('last_commit_message'),
  lastCommitUrl: text('last_commit_url'),
  weeklyCommits: text('weekly_commits').notNull().default('[]'),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  syncError: text('sync_error'),
  ...timestamps
})

/** Configurações gerais (chave → JSON). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})
