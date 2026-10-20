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
import type { DateRange, TaskFilter } from '@shared/schemas'
import type {
  AppInfo,
  BlockCheckin,
  Book,
  BookHighlight,
  LibraryFolder,
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
  ocr: (bookId: number): QueryKey => ['ocr', bookId]
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

export const useCreateHighlight = mutationFor('highlights', 'create', [['highlights']])
export const useUpdateHighlight = mutationFor('highlights', 'update', [['highlights']])
export const useRemoveHighlight = mutationFor('highlights', 'remove', [['highlights']])
