import type {
  DateRange,
  ScheduleBlockCreate,
  ScheduleBlockUpdate,
  TaskCreate,
  TaskFilter,
  TaskUpdate,
  TopicCreate,
  TopicUpdate
} from './schemas'
import type { AppInfo, BlockCheckin, ScheduleBlock, Task, Topic } from './types'

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
}

export const IPC_CHANNEL = 'sentinela:api'
