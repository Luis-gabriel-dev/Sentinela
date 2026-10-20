import type {
  AttachmentInput,
  BookUpdate,
  DateRange,
  FolderCreate,
  FolderUpdate,
  HighlightCreate,
  HighlightUpdate,
  NoteCreate,
  NoteUpdate,
  OcrPageInput,
  ProjectUpdate,
  ScheduleBlockCreate,
  ScheduleBlockUpdate,
  TaskCreate,
  TaskFilter,
  TaskUpdate,
  TopicCreate,
  TopicUpdate
} from './schemas'
import type {
  AddBooksResult,
  AppInfo,
  BlockCheckin,
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
} from './types'

/**
 * Contrato entre a interface e o processo principal.
 * Cada método é chamado como "namespace.metodo" pelo canal IPC_CHANNEL.
 */
export interface Api {
  app: {
    info(): Promise<AppInfo>
  }
  topics: {
    list(): Promise<Topic[]>
    create(input: TopicCreate): Promise<Topic>
    update(id: number, input: TopicUpdate): Promise<Topic>
    remove(id: number): Promise<void>
  }
  tasks: {
    list(filter?: TaskFilter): Promise<Task[]>
    create(input: TaskCreate): Promise<Task>
    update(id: number, input: TaskUpdate): Promise<Task>
    remove(id: number): Promise<void>
  }
  schedule: {
    list(): Promise<ScheduleBlock[]>
    create(input: ScheduleBlockCreate): Promise<ScheduleBlock>
    update(id: number, input: ScheduleBlockUpdate): Promise<ScheduleBlock>
    remove(id: number): Promise<void>
    checkins(range: DateRange): Promise<BlockCheckin[]>
    /** Marca/desmarca o bloco como concluído no dia. Retorna o novo estado. */
    toggleCheckin(blockId: number, date: string): Promise<boolean>
  }
  notes: {
    list(): Promise<NoteSummary[]>
    get(id: number): Promise<Note>
    create(input: NoteCreate): Promise<NoteSummary>
    update(id: number, input: NoteUpdate): Promise<NoteSummary>
    remove(id: number): Promise<void>
    /** Busca de texto completo em títulos e conteúdo. */
    search(query: string): Promise<NoteSearchResult[]>
  }
  attachments: {
    /** Salva a imagem na pasta de dados e devolve a URL (sentinela://attachments/...). */
    save(input: AttachmentInput): Promise<string>
  }
  folders: {
    list(): Promise<LibraryFolder[]>
    create(input: FolderCreate): Promise<LibraryFolder>
    update(id: number, input: FolderUpdate): Promise<LibraryFolder>
    remove(id: number): Promise<void>
  }
  books: {
    list(): Promise<Book[]>
    get(id: number): Promise<Book>
    /** Registra arquivos na biblioteca (sem copiar). */
    add(paths: string[], folderId?: number | null): Promise<AddBooksResult>
    update(id: number, input: BookUpdate): Promise<Book>
    /** Aponta o livro para outro caminho (arquivo movido). */
    relocate(id: number, path: string): Promise<Book>
    /** Tira da biblioteca. O arquivo no disco não é apagado. */
    remove(id: number): Promise<void>
    /** Salva a capa (JPEG) gerada pela interface. */
    setCover(id: number, data: Uint8Array): Promise<void>
    markOpened(id: number): Promise<void>
  }
  highlights: {
    list(bookId: number): Promise<BookHighlight[]>
    create(input: HighlightCreate): Promise<BookHighlight>
    update(id: number, input: HighlightUpdate): Promise<BookHighlight>
    remove(id: number): Promise<void>
  }
  ocr: {
    /** Páginas do livro que já passaram por OCR. */
    pages(bookId: number): Promise<OcrPage[]>
    /** Reconhece o texto de uma página (imagem PNG) e guarda o resultado. */
    recognizePage(input: OcrPageInput): Promise<OcrPage>
    /** Apaga o texto reconhecido do livro (para refazer). */
    clear(bookId: number): Promise<void>
  }
  github: {
    status(): Promise<GithubStatus>
    /** Valida o token no GitHub e guarda criptografado. */
    connect(token: string): Promise<GithubStatus>
    disconnect(): Promise<GithubStatus>
    /** Repositórios da conta conectada (mais recentes primeiro). */
    listRepos(): Promise<GithubRepo[]>
  }
  projects: {
    list(): Promise<Project[]>
    /** Adiciona por "dono/repositorio" ou URL e já sincroniza. */
    add(repo: string): Promise<Project>
    update(id: number, input: ProjectUpdate): Promise<Project>
    remove(id: number): Promise<void>
    /** Atualiza os dados do GitHub: um projeto ou todos. */
    sync(id?: number): Promise<Project[]>
  }
  desktop: {
    /** Abre o seletor de arquivos do sistema para livros. Devolve os caminhos escolhidos. */
    pickBookFiles(multiple: boolean): Promise<string[]>
    showInFolder(path: string): Promise<void>
    /** Abre o leitor do livro numa janela própria. */
    openReaderWindow(bookId: number): Promise<void>
  }
}

export const IPC_CHANNEL = 'sentinela:api'

/** Protocolo próprio para servir arquivos locais (anexos, capas, livros) à interface. */
export const FILE_PROTOCOL = 'sentinela'

export const bookFileUrl = (id: number): string => `${FILE_PROTOCOL}://books/${id}`
export const coverUrl = (book: { id: number; coverVersion: number }): string =>
  `${FILE_PROTOCOL}://covers/${book.id}.jpg?v=${book.coverVersion}`
