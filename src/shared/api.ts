import type {
  AiKeyInput,
  AiProvider,
  AiSettingsUpdate,
  AttachmentInput,
  BookTextInput,
  ExerciseAnswerInput,
  GenerateExercisesInput,
  ImportOutlineInput,
  MentorCompactInput,
  MentorSendInput,
  RagSettingsUpdate,
  RemindersUpdate,
  SuggestScheduleInput,
  SuggestTopicsInput,
  BookUpdate,
  DateRange,
  FolderCreate,
  FolderUpdate,
  HighlightCreate,
  HighlightUpdate,
  NoteCreate,
  NoteUpdate,
  OcrPageInput,
  PlanWeekInput,
  ProjectUpdate,
  Proposal,
  ProposalSkip,
  WeekAvailability,
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
  AiSettings,
  BackupInfo,
  BackupStatus,
  ChatMessage,
  ContextUsage,
  Conversation,
  Exercise,
  ModelInfo,
  OutlineLine,
  ProposalResult,
  WeekPlan,
  RagHit,
  RagStatus,
  ReminderStatus,
  ExerciseSet,
  ExerciseSetSummary,
  ScheduleSuggestion,
  TopicSuggestion,
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
    /** Cria de uma vez a árvore de um sumário importado. Devolve quantos temas foram criados. */
    importOutline(input: ImportOutlineInput): Promise<{ rootId: number | null; created: number }>
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
  week: {
    /** Horários livres do estudante na semana (para estudos e para projetos). */
    availability(): Promise<WeekAvailability>
    saveAvailability(input: WeekAvailability): Promise<WeekAvailability>
    /** Cria o que o estudante deixou marcado no plano da semana (mentor.planWeek). */
    applyPlan(proposal: Proposal, skip: ProposalSkip): Promise<ProposalResult>
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
    /** Guarda o texto do livro (lido pela interface) para a busca inteligente. */
    saveText(input: BookTextInput): Promise<void>
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
    /** Modelo de visão do Ollama que vai melhorar as páginas (null = nenhum instalado). */
    visionModel(): Promise<string | null>
    /**
     * Relê com o modelo de visão uma página já reconhecida (imagem PNG) e troca o texto dela.
     * As posições das linhas continuam as do Tesseract.
     */
    refinePage(input: OcrPageInput): Promise<OcrPage>
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
  ai: {
    settings(): Promise<AiSettings>
    updateSettings(input: AiSettingsUpdate): Promise<AiSettings>
    /** Valida a chave no provedor e guarda criptografada. */
    setKey(input: AiKeyInput): Promise<AiSettings>
    clearKey(provider: 'anthropic' | 'openai'): Promise<AiSettings>
    /**
     * Modelos disponíveis no provedor ativo, ou no informado (também serve de teste de conexão).
     * No Ollama, só os já baixados.
     */
    listModels(provider?: AiProvider): Promise<ModelInfo[]>
  }
  backup: {
    status(): Promise<BackupStatus>
    /**
     * Escolhe uma pasta e grava nela um backup (banco + imagens das anotações + capas).
     * Devolve a pasta criada, ou null se a escolha foi cancelada.
     */
    create(): Promise<string | null>
    /** Escolhe um backup e diz o que há nele (null se cancelado). Não muda nada. */
    pick(): Promise<BackupInfo | null>
    /** Troca os dados atuais pelos do backup (guardando antes uma cópia) e reinicia o app. */
    restore(path: string): Promise<void>
    /** Abre a pasta das cópias automáticas no Explorer. */
    openAutoFolder(): Promise<void>
  }
  reminders: {
    status(): Promise<ReminderStatus>
    updateSettings(input: RemindersUpdate): Promise<ReminderStatus>
    /** Mostra uma notificação de exemplo. */
    test(): Promise<void>
  }
  rag: {
    status(): Promise<RagStatus>
    updateSettings(input: RagSettingsUpdate): Promise<RagStatus>
    /** Recalcula o índice inteiro (ex.: depois de trocar o modelo de embedding). */
    reindex(): Promise<RagStatus>
    /** Busca por significado em anotações, destaques e páginas de OCR. */
    search(query: string): Promise<RagHit[]>
  }
  mentor: {
    /** Propõe subtópicos para um tema (não salva: a interface mostra para revisão). */
    suggestTopics(input: SuggestTopicsInput): Promise<TopicSuggestion[]>
    /** Propõe blocos semanais de estudo (não salva). */
    suggestSchedule(input: SuggestScheduleInput): Promise<ScheduleSuggestion[]>
    generateExercises(input: GenerateExercisesInput): Promise<ExerciseSet>
    /**
     * Organiza em capítulos e subitens um texto sem estrutura clara (lista de aulas etc.). O
     * andamento chega pelo canal OUTLINE_PROGRESS_CHANNEL.
     */
    structureOutline(text: string): Promise<OutlineLine[]>
    conversations(): Promise<Conversation[]>
    messages(conversationId: number): Promise<ChatMessage[]>
    /**
     * Envia uma mensagem à mentora. A resposta chega em pedaços pelo canal AI_STREAM_CHANNEL
     * e a mensagem final é devolvida aqui.
     */
    send(input: MentorSendInput): Promise<{ conversation: Conversation; message: ChatMessage }>
    /** Cria o que o estudante deixou marcado na proposta de uma resposta da mentora. */
    applyProposal(messageId: number, skip: ProposalSkip): Promise<ChatMessage>
    discardProposal(messageId: number): Promise<ChatMessage>
    /**
     * Monta a semana nos horários livres: blocos para os temas e projetos escolhidos e, se pedido,
     * subtópicos para os temas que ainda não têm (não salva: a interface mostra para revisão).
     */
    planWeek(input: PlanWeekInput): Promise<WeekPlan>
    /** Resume a conversa até aqui; daí em diante a IA recebe o resumo no lugar das mensagens. */
    compact(input: MentorCompactInput): Promise<Conversation>
    contextUsage(conversationId: number): Promise<ContextUsage>
    deleteConversation(id: number): Promise<void>
  }
  exercises: {
    sets(): Promise<ExerciseSetSummary[]>
    get(setId: number): Promise<ExerciseSet>
    answer(exerciseId: number, input: ExerciseAnswerInput): Promise<Exercise>
    removeSet(setId: number): Promise<void>
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

/** Eventos do processo principal para a interface (main → renderer). */
export const AI_STREAM_CHANNEL = 'sentinela:ai-stream'
/** Pede à interface para ir a uma rota (ex.: clique numa notificação). Payload: a rota. */
export const NAVIGATE_CHANNEL = 'sentinela:navigate'
/** Andamento de mentor.structureOutline. Payload: quantos itens a IA já organizou (número). */
export const OUTLINE_PROGRESS_CHANNEL = 'sentinela:outline-progress'
export const EVENT_CHANNELS = [
  AI_STREAM_CHANNEL,
  NAVIGATE_CHANNEL,
  OUTLINE_PROGRESS_CHANNEL
] as const

/** Protocolo próprio para servir arquivos locais (anexos, capas, livros) à interface. */
export const FILE_PROTOCOL = 'sentinela'

export const bookFileUrl = (id: number): string => `${FILE_PROTOCOL}://books/${id}`
export const coverUrl = (book: { id: number; coverVersion: number }): string =>
  `${FILE_PROTOCOL}://covers/${book.id}.jpg?v=${book.coverVersion}`
