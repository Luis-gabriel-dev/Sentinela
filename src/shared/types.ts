import type {
  AiProvider,
  BookFormat,
  Difficulty,
  ExerciseKind,
  ExerciseResult,
  HighlightColor,
  Priority,
  RagKind,
  Recurrence
} from './schemas'

export interface Topic {
  id: number
  parentId: number | null
  name: string
  color: string
  description: string | null
  position: number
  trackProgress: boolean
  weeklyGoal: number | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface Task {
  id: number
  title: string
  description: string | null
  topicId: number | null
  priority: Priority
  dueDate: string | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface ScheduleBlock {
  id: number
  title: string
  topicId: number | null
  color: string | null
  recurrence: Recurrence
  /** 0 = domingo ... 6 = sábado (só quando recurrence = 'weekly') */
  weekday: number | null
  /** AAAA-MM-DD (só quando recurrence = 'once') */
  date: string | null
  startTime: string
  endTime: string
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

export interface BlockCheckin {
  blockId: number
  date: string
}

/** Anotação sem o conteúdo (para listas e árvore). */
export interface NoteSummary {
  id: number
  topicId: number | null
  title: string
  createdAt: Date
  updatedAt: Date
}

export interface Note extends NoteSummary {
  /** Blocos do BlockNote. */
  content: unknown[]
}

export interface NoteSearchResult {
  id: number
  topicId: number | null
  title: string
  /** Trecho do texto; os termos encontrados ficam entre SNIPPET_MARK.start e SNIPPET_MARK.end. */
  snippet: string
}

export const SNIPPET_MARK = { start: '\u0001', end: '\u0002' } as const

export interface LibraryFolder {
  id: number
  name: string
  color: string
  position: number
  createdAt: Date
  updatedAt: Date
}

export interface Book {
  id: number
  folderId: number | null
  topicId: number | null
  title: string
  author: string | null
  format: BookFormat
  filePath: string
  fileSize: number
  pageCount: number | null
  /** 0 = sem capa */
  coverVersion: number
  metadataReady: boolean
  /** 0 a 1 */
  progress: number
  location: string | null
  lastOpenedAt: Date | null
  createdAt: Date
  updatedAt: Date
  /** O arquivo ainda está no caminho salvo. */
  fileExists: boolean
}

export interface BookHighlight {
  id: number
  bookId: number
  location: string
  sortKey: number
  text: string
  color: HighlightColor
  note: string | null
  createdAt: Date
  updatedAt: Date
}

export interface OcrLine {
  text: string
  /** [x, y, largura, altura], normalizados (0–1) em relação à página */
  box: [number, number, number, number]
  /** 0–100 */
  confidence: number
}

export interface OcrPage {
  page: number
  lines: OcrLine[]
  /** Confiança média da página, 0–100 */
  confidence: number
}

export interface AddBooksResult {
  added: Book[]
  /** Arquivos já presentes na biblioteca ou com extensão não suportada. */
  skipped: string[]
}

export interface Project {
  id: number
  /** "dono/repositorio" */
  repo: string
  topicId: number | null
  staleDays: number
  notes: string | null
  description: string | null
  htmlUrl: string | null
  defaultBranch: string | null
  language: string | null
  stars: number
  openIssues: number
  openPrs: number
  isPrivate: boolean
  archived: boolean
  lastCommitAt: Date | null
  lastCommitMessage: string | null
  lastCommitUrl: string | null
  /** Commits por semana, 12 semanas (mais antiga → atual). */
  weeklyCommits: number[]
  syncedAt: Date | null
  syncError: string | null
  createdAt: Date
  updatedAt: Date
}

export interface GithubStatus {
  connected: boolean
  login: string | null
  avatarUrl: string | null
  /** O sistema consegue criptografar o token (Electron safeStorage). */
  encryptionAvailable: boolean
}

export interface GithubRepo {
  fullName: string
  description: string | null
  isPrivate: boolean
  language: string | null
  stars: number
  pushedAt: Date | null
}

export interface AiSettings {
  provider: AiProvider
  /** Modelo escolhido para cada provedor. */
  models: Record<AiProvider, string>
  ollamaUrl: string
  /** Há chave salva (o valor nunca volta para a interface). */
  keys: { anthropic: boolean; openai: boolean }
  encryptionAvailable: boolean
}

export interface TopicSuggestion {
  name: string
  description: string
}

export interface ScheduleSuggestion {
  title: string
  topicId: number | null
  /** 0 = domingo ... 6 = sábado */
  weekday: number
  startTime: string
  endTime: string
  reason: string
}

export interface Exercise {
  id: number
  setId: number
  position: number
  kind: ExerciseKind
  question: string
  options: string[] | null
  correctOption: number | null
  answer: string
  explanation: string | null
  userChoice: number | null
  userAnswer: string | null
  result: ExerciseResult | null
  answeredAt: Date | null
}

export interface ExerciseSetSummary {
  id: number
  topicId: number | null
  title: string
  difficulty: Difficulty
  generatedBy: string
  createdAt: Date
  total: number
  answered: number
  correct: number
}

export interface ExerciseSet extends ExerciseSetSummary {
  exercises: Exercise[]
}

/** Um modelo disponível no provedor. Os campos opcionais só vêm do Ollama. */
export interface ModelInfo {
  name: string
  /** chat = conversa e geração de texto; embedding = só para a busca inteligente. */
  kind: 'chat' | 'embedding'
  /** "7.6B" */
  parameterSize?: string
  quantization?: string
  /** Tamanho em bytes. */
  size?: number
  contextLength?: number
  vision?: boolean
}

export interface Conversation {
  id: number
  title: string
  /** Resumo das mensagens até `summaryUntil` (a conversa foi compactada). */
  summary: string | null
  summaryUntil: number | null
  compactedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/** Trecho que a busca inteligente achou e entregou à IA. `n` é o número citado como [n]. */
export interface RagSource {
  n: number
  kind: RagKind
  /** Id da anotação (note) ou do livro (highlight, ocr). */
  sourceId: number
  highlightId: number | null
  page: number | null
  title: string
  excerpt: string
}

export interface ChatMessage {
  id: number
  conversationId: number
  role: 'user' | 'assistant'
  content: string
  sources: RagSource[] | null
  createdAt: Date
}

/** Quanto do contexto do modelo a conversa já ocupa (aproximado, em caracteres). */
export interface ContextUsage {
  used: number
  max: number
  /** Mensagens que ainda vão inteiras (as anteriores estão no resumo). */
  liveMessages: number
}

/** Evento de streaming da resposta da mentora (canal AI_STREAM_CHANNEL). */
export type AiStreamEvent =
  | { conversationId: number; type: 'delta'; text: string }
  /** Texto final consolidado (substitui o que foi recebido aos pedaços). */
  | { conversationId: number; type: 'done'; text: string }
  /** Etapa antes da resposta (ex.: compactando a conversa). */
  | { conversationId: number; type: 'status'; text: string }

export interface RagSettings {
  enabled: boolean
  /** Escolhido pelo estudante; null = automático. */
  embedModel: string | null
}

export interface RagStatus extends RagSettings {
  /** Modelo em uso de fato (null = nenhum modelo de embedding disponível). */
  activeModel: string | null
  chunks: number
  embedded: number
  sources: { notes: number; highlights: number; ocrPages: number }
  running: boolean
  /** Por que a busca está só por palavras (Ollama fora do ar, sem modelo de embedding...). */
  problem: string | null
}

/** Resultado da busca inteligente mostrado na interface. */
export interface RagHit extends Omit<RagSource, 'n'> {
  score: number
}

export interface AppInfo {
  version: string
  dbPath: string
}
