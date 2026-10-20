import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { TasksIcon } from '@renderer/components/icons'
import type { Task } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { EmptyState, PageHeader } from '@renderer/components/page-header'
import { TopicSelect } from '@renderer/components/topic-select'
import { compareTasks } from '@renderer/lib/format'
import { useCreateTask, useTasks, useTopics } from '@renderer/lib/queries'
import { cn } from '@renderer/lib/utils'
import { TaskDialog } from './task-dialog'
import { TaskRow } from './task-row'

type Status = 'open' | 'done' | 'all'

const STATUS_TABS: { value: Status; label: string }[] = [
  { value: 'open', label: 'Abertas' },
  { value: 'done', label: 'Concluídas' },
  { value: 'all', label: 'Todas' }
]

export function TasksPage(): React.JSX.Element {
  const [status, setStatus] = useState<Status>('open')
  const [topicId, setTopicId] = useState<number | null>(null)
  const [quickTitle, setQuickTitle] = useState('')
  const [editing, setEditing] = useState<Task | undefined>()
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: tasks = [], isLoading } = useTasks({ status, topicId: topicId ?? undefined })
  const { data: topics = [] } = useTopics()
  const create = useCreateTask()

  const topicsById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics])
  const sorted = useMemo(() => tasks.toSorted(compareTasks), [tasks])

  const quickAdd = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!quickTitle.trim()) return
    create.mutate([{ title: quickTitle, topicId }], { onSuccess: () => setQuickTitle('') })
  }

  const openDialog = (task?: Task): void => {
    setEditing(task)
    setDialogOpen(true)
  }

  return (
    <>
      <PageHeader
        title="Tarefas"
        description="O que precisa ser feito, por tema e prioridade."
        actions={
          <Button onClick={() => openDialog()}>
            <Plus /> Nova tarefa
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg bg-muted p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatus(tab.value)}
              className={cn(
                'rounded-md px-3 py-1 text-sm text-muted-foreground transition',
                status === tab.value && 'bg-background text-foreground shadow-sm'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <TopicSelect
          value={topicId}
          onChange={setTopicId}
          noneLabel="Todos os temas"
          className="w-56"
        />
      </div>

      <form onSubmit={quickAdd} className="mb-4">
        <Input
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          placeholder="Adicionar tarefa rápida e apertar Enter..."
          className="h-11 bg-card"
        />
      </form>

      {!isLoading && sorted.length === 0 ? (
        <EmptyState icon={<TasksIcon />} title="Nenhuma tarefa aqui">
          Use o campo acima para criar uma tarefa rapidamente.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              topic={task.topicId !== null ? topicsById.get(task.topicId) : undefined}
              onOpen={() => openDialog(task)}
            />
          ))}
        </div>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editing}
        defaultTopicId={topicId}
      />
    </>
  )
}
