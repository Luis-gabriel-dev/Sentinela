import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Api } from '@shared/api'
import type { AiProvider, DateRange, TaskFilter } from '@shared/schemas'
import type {
  AiSettings,
  AppInfo,
  BlockCheckin,
  ChatMessage,
  ContextUsage,
  Conversation,
  ModelInfo,
  RagHit,
  RagStatus,
  ExerciseSet,
  ExerciseSetSummary,
  Book,
  BookHighlight,
  GithubRepo,
  GithubStatus,
  LibraryFolder,
  Project,
  Note,
  NoteSearchResult,
  NoteSummary,
  OcrPage,
  ScheduleBlock,
  Task,
  Topic
} from '@shared/types'
import { api } from './api'

export const keys = {
  topics: ['topics'],
  tasks: (filter?: TaskFilter): QueryKey => ['tasks', filter ?? {}],
  schedule: ['schedule'],
  checkins: (range: DateRange): QueryKey => ['checkins', range],
  appInfo: ['app-info'],
  notes: ['notes'],
  note: (id: number): QueryKey => ['note', id],
  noteSearch: (query: string): QueryKey => ['notes', 'search', query],
  folders: ['folders'],
  books: ['books'],
  book: (id: number): QueryKey => ['books', id],
  highlights: (bookId: number): QueryKey => ['highlights', bookId],
  ocr: (bookId: number): QueryKey => ['ocr', bookId],
  ai: ['ai'],
  aiModels: (provider?: AiProvider): QueryKey => ['ai', 'models', provider ?? 'active'],
  rag: ['rag'],
  ragSearch: (query: string): QueryKey => ['rag', 'search', query],
  conversations: ['mentor', 'conversations'],
  messages: (conversationId: number): QueryKey => ['mentor', 'messages', conversationId],
  contextUsage: (conversationId: number): QueryKey => ['mentor', 'context', conversationId],
  exerciseSets: ['exercises'],
  exerciseSet: (id: number): QueryKey => ['exercises', id],
  github: ['github'],
  githubRepos: ['github', 'repos'],
  projects: ['projects']
} satisfies Record<string, QueryKey | ((...args: never[]) => QueryKey)>

export const useTopics = (): UseQueryResult<Topic[]> =>
  useQuery({ queryKey: keys.topics, queryFn: () => api.topics.list() })

export const useTasks = (filter?: TaskFilter): UseQueryResult<Task[]> =>
  useQuery({ queryKey: keys.tasks(filter), queryFn: () => api.tasks.list(filter) })

export const useSchedule = (): UseQueryResult<ScheduleBlock[]> =>
  useQuery({ queryKey: keys.schedule, queryFn: () => api.schedule.list() })

export const useCheckins = (range: DateRange | null): UseQueryResult<BlockCheckin[]> =>
  useQuery({
    queryKey: keys.checkins(range ?? { from: '', to: '' }),
    queryFn: () => api.schedule.checkins(range!),
    enabled: range !== null
  })

export const useAppInfo = (): UseQueryResult<AppInfo> =>
  useQuery({ queryKey: keys.appInfo, queryFn: () => api.app.info() })

export const useNotes = (): UseQueryResult<NoteSummary[]> =>
  useQuery({ queryKey: keys.notes, queryFn: () => api.notes.list() })

/** Conteúdo sempre buscado de novo ao abrir: o editor é a fonte da verdade enquanto aberto. */
export const useNote = (id: number): UseQueryResult<Note> =>
  useQuery({ queryKey: keys.note(id), queryFn: () => api.notes.get(id), gcTime: 0 })

export const useNoteSearch = (query: string): UseQueryResult<NoteSearchResult[]> =>
  useQuery({
    queryKey: keys.noteSearch(query),
    queryFn: () => api.notes.search(query),
    enabled: query.trim().length > 0,
    staleTime: 0,
    placeholderData: (previous) => previous
  })

export const useFolders = (): UseQueryResult<LibraryFolder[]> =>
  useQuery({ queryKey: keys.folders, queryFn: () => api.folders.list() })

/**
 * A lista diz se cada arquivo ainda existe e traz o progresso salvo por outras janelas,
 * então é reconsultada ao abrir a biblioteca e ao voltar para a janela.
 */
export const useBooks = (): UseQueryResult<Book[]> =>
  useQuery({
    queryKey: keys.books,
    queryFn: () => api.books.list(),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always'
  })

/** Sempre buscado de novo ao abrir o leitor: a posição salva precisa estar atualizada. */
export const useBook = (id: number): UseQueryResult<Book> =>
  useQuery({ queryKey: keys.book(id), queryFn: () => api.books.get(id), gcTime: 0 })

export const useHighlights = (bookId: number): UseQueryResult<BookHighlight[]> =>
  useQuery({ queryKey: keys.highlights(bookId), queryFn: () => api.highlights.list(bookId) })

export const useOcrPages = (bookId: number): UseQueryResult<OcrPage[]> =>
  useQuery({ queryKey: keys.ocr(bookId), queryFn: () => api.ocr.pages(bookId) })

export const useAiSettings = (): UseQueryResult<AiSettings> =>
  useQuery({ queryKey: keys.ai, queryFn: () => api.ai.settings() })

/** A IA está pronta para uso (Ollama não precisa de chave). */
export const aiReady = (settings: AiSettings | undefined): boolean =>
  !!settings && (settings.provider === 'ollama' || settings.keys[settings.provider])

/** Modelos do provedor ativo (ou do informado). No Ollama, os já baixados. */
export const useAiModels = (enabled: boolean, provider?: AiProvider): UseQueryResult<ModelInfo[]> =>
  useQuery({
    queryKey: keys.aiModels(provider),
    queryFn: () => api.ai.listModels(provider),
    enabled,
    staleTime: 30_000,
    retry: false
  })

/** Estado da busca inteligente; enquanto o índice está sendo calculado, é consultado a cada 1,5 s. */
export const useRagStatus = (): UseQueryResult<RagStatus> =>
  useQuery({
    queryKey: keys.rag,
    queryFn: () => api.rag.status(),
    staleTime: 0,
    refetchInterval: (query) => (query.state.data?.running ? 1500 : false)
  })

export const useRagSearch = (query: string): UseQueryResult<RagHit[]> =>
  useQuery({
    queryKey: keys.ragSearch(query),
    queryFn: () => api.rag.search(query),
    enabled: query.trim().length > 2,
    staleTime: 0,
    retry: false,
    placeholderData: (previous) => previous
  })

export const useContextUsage = (conversationId: number | null): UseQueryResult<ContextUsage> =>
  useQuery({
    queryKey: keys.contextUsage(conversationId ?? 0),
    queryFn: () => api.mentor.contextUsage(conversationId!),
    enabled: conversationId !== null,
    staleTime: 0
  })

export const useConversations = (): UseQueryResult<Conversation[]> =>
  useQuery({ queryKey: keys.conversations, queryFn: () => api.mentor.conversations() })

export const useMessages = (conversationId: number | null): UseQueryResult<ChatMessage[]> =>
  useQuery({
    queryKey: keys.messages(conversationId ?? 0),
    queryFn: () => api.mentor.messages(conversationId!),
    enabled: conversationId !== null
  })

export const useExerciseSets = (): UseQueryResult<ExerciseSetSummary[]> =>
  useQuery({ queryKey: keys.exerciseSets, queryFn: () => api.exercises.sets() })

export const useExerciseSet = (id: number | null): UseQueryResult<ExerciseSet> =>
  useQuery({
    queryKey: keys.exerciseSet(id ?? 0),
    queryFn: () => api.exercises.get(id!),
    enabled: id !== null
  })

export const useGithubStatus = (): UseQueryResult<GithubStatus> =>
  useQuery({ queryKey: keys.github, queryFn: () => api.github.status() })

export const useGithubRepos = (enabled: boolean): UseQueryResult<GithubRepo[]> =>
  useQuery({
    queryKey: keys.githubRepos,
    queryFn: () => api.github.listRepos(),
    enabled,
    staleTime: 5 * 60_000
  })

export const useProjects = (): UseQueryResult<Project[]> =>
  useQuery({ queryKey: keys.projects, queryFn: () => api.projects.list() })

/** Argumentos e retorno de um método da Api, ex.: Method<'tasks', 'update'>. */
type Method<K extends keyof Api, M extends keyof Api[K]> = Api[K][M] extends (
  ...args: infer A
) => Promise<infer R>
  ? { args: A; result: R }
  : never

type ApiMutation<K extends keyof Api, M extends keyof Api[K]> = UseMutationResult<
  Method<K, M>['result'],
  Error,
  Method<K, M>['args']
>

/**
 * Cria um hook de mutação para um método da Api. O erro vira um toast e as consultas
 * afetadas são recarregadas. Uso: update.mutate([id, { completed: true }]).
 */
function mutationFor<K extends keyof Api, M extends keyof Api[K]>(
  namespace: K,
  method: M,
  invalidate: QueryKey[]
): () => ApiMutation<K, M> {
  return function useApiMutation() {
    const client = useQueryClient()
    return useMutation({
      mutationFn: (args: Method<K, M>['args']) =>
        (api[namespace][method] as (...a: unknown[]) => Promise<Method<K, M>['result']>)(...args),
      onError: (error) => toast.error(error.message),
      onSettled: () =>
        Promise.all(invalidate.map((queryKey) => client.invalidateQueries({ queryKey })))
    })
  }
}

// Tarefas, agenda e anotações referenciam temas, então excluir um tema recarrega tudo.
const topicDeps = [keys.topics, ['tasks'], keys.schedule, keys.notes]

export const useCreateTopic = mutationFor('topics', 'create', [keys.topics])
export const useUpdateTopic = mutationFor('topics', 'update', [keys.topics])
export const useRemoveTopic = mutationFor('topics', 'remove', topicDeps)

export const useCreateTask = mutationFor('tasks', 'create', [['tasks']])
export const useUpdateTask = mutationFor('tasks', 'update', [['tasks']])
export const useRemoveTask = mutationFor('tasks', 'remove', [['tasks']])

export const useCreateBlock = mutationFor('schedule', 'create', [keys.schedule])
export const useUpdateBlock = mutationFor('schedule', 'update', [keys.schedule])
export const useRemoveBlock = mutationFor('schedule', 'remove', [keys.schedule, ['checkins']])
export const useToggleCheckin = mutationFor('schedule', 'toggleCheckin', [['checkins']])

export const useCreateNote = mutationFor('notes', 'create', [keys.notes])
export const useUpdateNote = mutationFor('notes', 'update', [keys.notes])
export const useRemoveNote = mutationFor('notes', 'remove', [keys.notes])

export const useCreateFolder = mutationFor('folders', 'create', [keys.folders])
export const useUpdateFolder = mutationFor('folders', 'update', [keys.folders])
export const useRemoveFolder = mutationFor('folders', 'remove', [keys.folders, keys.books])

// ['books'] cobre a lista e cada livro (['books', id]).
export const useAddBooks = mutationFor('books', 'add', [keys.books])
export const useUpdateBook = mutationFor('books', 'update', [keys.books])
export const useRelocateBook = mutationFor('books', 'relocate', [keys.books])
export const useRemoveBook = mutationFor('books', 'remove', [keys.books])

// ['ai'] cobre configurações e a lista de modelos.
export const useUpdateAiSettings = mutationFor('ai', 'updateSettings', [keys.ai])
export const useSetAiKey = mutationFor('ai', 'setKey', [keys.ai])
export const useClearAiKey = mutationFor('ai', 'clearKey', [keys.ai])

// Sugestões não gravam nada: a interface mostra para revisão.
export const useSuggestTopics = mutationFor('mentor', 'suggestTopics', [])
export const useSuggestSchedule = mutationFor('mentor', 'suggestSchedule', [])
export const useGenerateExercises = mutationFor('mentor', 'generateExercises', [keys.exerciseSets])
export const useDeleteConversation = mutationFor('mentor', 'deleteConversation', [
  keys.conversations
])
// ['mentor'] cobre a lista de conversas, as mensagens e o uso do contexto.
export const useCompactConversation = mutationFor('mentor', 'compact', [['mentor']])

export const useUpdateRagSettings = mutationFor('rag', 'updateSettings', [keys.rag])
export const useReindexRag = mutationFor('rag', 'reindex', [keys.rag])

export const useAnswerExercise = mutationFor('exercises', 'answer', [keys.exerciseSets])
export const useRemoveExerciseSet = mutationFor('exercises', 'removeSet', [keys.exerciseSets])

export const useConnectGithub = mutationFor('github', 'connect', [keys.github])
export const useDisconnectGithub = mutationFor('github', 'disconnect', [keys.github])

export const useAddProject = mutationFor('projects', 'add', [keys.projects])
export const useUpdateProject = mutationFor('projects', 'update', [keys.projects])
export const useRemoveProject = mutationFor('projects', 'remove', [keys.projects])
export const useSyncProjects = mutationFor('projects', 'sync', [keys.projects])

export const useCreateHighlight = mutationFor('highlights', 'create', [['highlights']])
export const useUpdateHighlight = mutationFor('highlights', 'update', [['highlights']])
export const useRemoveHighlight = mutationFor('highlights', 'remove', [['highlights']])
