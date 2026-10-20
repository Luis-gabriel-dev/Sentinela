import { CalendarClock } from 'lucide-react'
import type { Task, Topic } from '@shared/types'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { formatDate, PRIORITY_META, todayIso } from '@renderer/lib/format'
import { useUpdateTask } from '@renderer/lib/queries'
import { cn } from '@renderer/lib/utils'

interface Props {
  task: Task
  topic?: Topic
  onOpen: () => void
}

export function TaskRow({ task, topic, onOpen }: Props): React.JSX.Element {
  const update = useUpdateTask()
  const done = task.completedAt !== null
  const overdue = !done && task.dueDate !== null && task.dueDate < todayIso()
  const priority = PRIORITY_META[task.priority]

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition hover:border-primary/40',
        done && 'opacity-60'
      )}
    >
      <Checkbox
        checked={done}
        onCheckedChange={(checked) => update.mutate([task.id, { completed: checked === true }])}
        aria-label="Concluída"
        className="size-5 rounded-full"
      />

      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className={cn('truncate text-sm', done && 'line-through')}>{task.title}</span>

        <span className="ml-auto flex shrink-0 items-center gap-2 text-xs">
          {topic && (
            <span className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: topic.color }} />
              {topic.name}
            </span>
          )}
          {task.dueDate && (
            <span
              className={cn(
                'flex items-center gap-1 text-muted-foreground',
                overdue && 'font-medium text-red-500'
              )}
            >
              <CalendarClock className="size-3.5" />
              {formatDate(task.dueDate)}
            </span>
          )}
          {task.priority !== 'normal' && (
            <span className={cn('rounded-full border px-2 py-0.5 font-medium', priority.className)}>
              {priority.label}
            </span>
          )}
        </span>
      </button>
    </div>
  )
}
