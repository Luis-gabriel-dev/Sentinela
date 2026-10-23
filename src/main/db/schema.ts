import {
  blob,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core'
// Import relativo (e não @shared) porque o drizzle-kit lê este arquivo fora do Vite.
import {
  BOOK_FORMATS,
  DIFFICULTIES,
  EXERCISE_KINDS,
  EXERCISE_RESULTS,
  HIGHLIGHT_COLORS,
  PRIORITIES,
  RAG_KINDS,
  RECURRENCES
} from '../../shared/schemas'

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
    /** Quando o texto do livro foi lido para a busca inteligente (null = ainda não). */
    textReadAt: integer('text_read_at', { mode: 'timestamp_ms' }),
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
    /**
     * Modelo de visão que reescreveu `text` (páginas de baixa confiança). As linhas (`lines`)
     * continuam as do Tesseract, que têm as posições para a seleção no leitor.
     */
    refinedBy: text('refined_by'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
  },
  (t) => [primaryKey({ columns: [t.bookId, t.page] })]
)

/**
 * Texto dos livros, para a busca inteligente: por página no PDF, por seção (capítulo) no
 * EPUB/MOBI. PDFs escaneados não têm texto aqui; para eles vale o OCR.
 */
export const bookTexts = sqliteTable(
  'book_texts',
  {
    bookId: integer('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    page: integer('page').notNull(),
    text: text('text').notNull()
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

/**
 * Conversas com a IA mentora. Quando a conversa é compactada (pelo estudante ou porque não cabia
 * mais), `summary` resume tudo até a mensagem `summaryUntil` (id); dali para trás, a IA recebe só
 * o resumo.
 */
export const aiConversations = sqliteTable('ai_conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  summary: text('summary'),
  summaryUntil: integer('summary_until'),
  compactedAt: integer('compacted_at', { mode: 'timestamp_ms' }),
  ...timestamps
})

export const aiMessages = sqliteTable(
  'ai_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => aiConversations.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    /** JSON com os trechos (RagSource[]) que a busca inteligente entregou para esta resposta. */
    sources: text('sources'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
  },
  (t) => [index('ai_messages_conversation_idx').on(t.conversationId)]
)

/** Listas de exercícios geradas pela IA, com o gabarito. */
export const exerciseSets = sqliteTable('exercise_sets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  topicId: integer('topic_id').references(() => topics.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  difficulty: text('difficulty', { enum: DIFFICULTIES }).notNull(),
  /** "provedor/modelo" que gerou a lista. */
  generatedBy: text('generated_by').notNull(),
  ...timestamps
})

export const exercises = sqliteTable(
  'exercises',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    setId: integer('set_id')
      .notNull()
      .references(() => exerciseSets.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    kind: text('kind', { enum: EXERCISE_KINDS }).notNull(),
    question: text('question').notNull(),
    /** JSON com as alternativas (só múltipla escolha). */
    options: text('options'),
    correctOption: integer('correct_option'),
    /** Gabarito: resposta esperada. */
    answer: text('answer').notNull(),
    explanation: text('explanation'),
    userChoice: integer('user_choice'),
    userAnswer: text('user_answer'),
    result: text('result', { enum: EXERCISE_RESULTS }),
    answeredAt: integer('answered_at', { mode: 'timestamp_ms' })
  },
  (t) => [index('exercises_set_idx').on(t.setId)]
)

/**
 * Índice da busca inteligente (RAG): anotações, destaques e páginas de OCR cortados em trechos.
 * `sourceKey` diz de onde veio o trecho ("note:3", "highlight:8", "ocr:2:15"). `embedding` é o
 * vetor (Float32 normalizado) calculado pelo `embedModel`, ou null enquanto não foi calculado. O
 * texto também vai para a FTS5 `rag_chunks_fts` (migration manual): a busca usa as duas coisas.
 */
export const ragChunks = sqliteTable(
  'rag_chunks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sourceKey: text('source_key').notNull(),
    kind: text('kind', { enum: RAG_KINDS }).notNull(),
    /** Id da anotação (note) ou do livro (highlight, ocr). */
    sourceId: integer('source_id').notNull(),
    highlightId: integer('highlight_id'),
    page: integer('page'),
    topicId: integer('topic_id'),
    /** Nome para mostrar: título da anotação ou do livro. */
    title: text('title').notNull(),
    position: integer('position').notNull(),
    text: text('text').notNull(),
    embedding: blob('embedding', { mode: 'buffer' }),
    embedModel: text('embed_model')
  },
  (t) => [index('rag_chunks_source_idx').on(t.sourceKey)]
)

/** O que já está no índice: uma linha por origem, com a impressão digital do conteúdo. */
export const ragSources = sqliteTable('rag_sources', {
  sourceKey: text('source_key').primaryKey(),
  fingerprint: text('fingerprint').notNull()
})

/** Configurações gerais (chave → JSON). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})
