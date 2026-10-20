import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { PRIORITIES, type Priority } from '@shared/schemas'
import type { Task } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Textarea } from '@renderer/components/ui/textarea'
import { ConfirmDelete } from '@renderer/components/confirm-delete'
import { TopicSelect } from '@renderer/components/topic-select'
import { PRIORITY_META } from '@renderer/lib/format'
import { useCreateTask, useRemoveTask, useUpdateTask } from '@renderer/lib/queries'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Tarefa a editar; sem ela o diálogo cria uma nova. */
  task?: Task
  defaultTopicId?: number | null
}

export function TaskDialog(props: Props): React.JSX.Element {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* key recria o formulário com os valores certos a cada abertura */}
        {props.open && <TaskForm key={props.task?.id ?? 'new'} {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function TaskForm({ task, defaultTopicId = null, onOpenChange }: Props): React.JSX.Element {
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [topicId, setTopicId] = useState<number | null>(task?.topicId ?? defaultTopicId)
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'normal')
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '')

  const create = useCreateTask()
  const update = useUpdateTask()
  const remove = useRemoveTask()

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const input = {
      title,
      description: description.trim() || null,
      topicId,
      priority,
      dueDate: dueDate || null
    }
    const close = { onSuccess: () => onOpenChange(false) }
    if (task) update.mutate([task.id, input], close)
    else create.mutate([input], close)
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{task ? 'Editar tarefa' : 'Nova tarefa'}</DialogTitle>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor="task-title">Título</Label>
        <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="task-desc">Descrição</Label>
        <Textarea
          id="task-desc"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label>Tema</Label>
        <TopicSelect value={topicId} onChange={setTopicId} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>Prioridade</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.toReversed().map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORITY_META[p].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="task-due">Prazo</Label>
          <Input
            id="task-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
      </div>

      <DialogFooter className="sm:justify-between">
        {task ? (
          <ConfirmDelete
            title="Excluir tarefa?"
            description={`"${task.title}" será excluída permanentemente.`}
            onConfirm={() => remove.mutate([task.id], { onSuccess: () => onOpenChange(false) })}
          >
            <Button type="button" variant="ghost" className="text-destructive">
              <Trash2 /> Excluir
            </Button>
          </ConfirmDelete>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={!title.trim() || create.isPending || update.isPending}>
          Salvar
        </Button>
      </DialogFooter>
    </form>
  )
}
