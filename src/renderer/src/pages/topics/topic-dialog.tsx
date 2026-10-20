import { useState } from 'react'
import type { Topic } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Textarea } from '@renderer/components/ui/textarea'
import { ColorPicker } from '@renderer/components/color-picker'
import { TopicSelect } from '@renderer/components/topic-select'
import { COLOR_PRESETS } from '@renderer/lib/format'
import { useCreateTopic, useTopics, useUpdateTopic } from '@renderer/lib/queries'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Tema a editar; sem ele o diálogo cria um novo dentro de parentId. */
  topic?: Topic
  parentId?: number | null
}

export function TopicDialog(props: Props): React.JSX.Element {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {props.open && <TopicForm key={props.topic?.id ?? `new-${props.parentId}`} {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function TopicForm({
  topic,
  parentId: initialParent = null,
  onOpenChange
}: Props): React.JSX.Element {
  const { data: topics = [] } = useTopics()
  const parent = topics.find((t) => t.id === initialParent)

  const [name, setName] = useState(topic?.name ?? '')
  const [parentId, setParentId] = useState<number | null>(topic?.parentId ?? initialParent)
  const [color, setColor] = useState<string>(
    topic?.color ?? parent?.color ?? COLOR_PRESETS[topics.length % COLOR_PRESETS.length]
  )
  const [description, setDescription] = useState(topic?.description ?? '')
  const [trackProgress, setTrackProgress] = useState(topic?.trackProgress ?? false)
  const [weeklyGoal, setWeeklyGoal] = useState(topic?.weeklyGoal?.toString() ?? '')

  const create = useCreateTopic()
  const update = useUpdateTopic()

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const input = {
      name,
      parentId,
      color,
      description: description.trim() || null,
      trackProgress,
      weeklyGoal: trackProgress && weeklyGoal ? Number(weeklyGoal) : null
    }
    const close = { onSuccess: () => onOpenChange(false) }
    if (topic) update.mutate([topic.id, input], close)
    else create.mutate([input], close)
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{topic ? 'Editar tema' : parent ? 'Novo subtema' : 'Novo tema'}</DialogTitle>
        {parent && !topic && <DialogDescription>Dentro de {parent.name}</DialogDescription>}
      </DialogHeader>

      <div className="grid grid-cols-[1fr_auto] gap-4">
        <div className="grid gap-2">
          <Label htmlFor="topic-name">Nome</Label>
          <Input
            id="topic-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Redes de computadores"
            autoFocus
          />
        </div>
        <div className="grid gap-2">
          <Label>Cor</Label>
          <ColorPicker value={color} onChange={(c) => c && setColor(c)} />
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Dentro de</Label>
        <TopicSelect
          value={parentId}
          onChange={setParentId}
          noneLabel="Nenhum (tema principal)"
          excludeId={topic?.id}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="topic-desc">Descrição</Label>
        <Textarea
          id="topic-desc"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <label className="flex cursor-pointer items-start gap-3">
          <Checkbox
            checked={trackProgress}
            onCheckedChange={(c) => setTrackProgress(c === true)}
            className="mt-0.5"
          />
          <span className="text-sm">
            <span className="font-medium">Acompanhar progresso</span>
            <span className="block text-muted-foreground">
              Os subtemas viram tópicos com checkbox e uma barra de progresso.
            </span>
          </span>
        </label>
        {trackProgress && (
          <div className="flex items-center gap-3 pl-7 text-sm">
            <Label htmlFor="topic-goal" className="font-normal">
              Meta semanal
            </Label>
            <Input
              id="topic-goal"
              type="number"
              min={1}
              max={100}
              value={weeklyGoal}
              onChange={(e) => setWeeklyGoal(e.target.value)}
              placeholder="3"
              className="h-8 w-20"
            />
            <span className="text-muted-foreground">tópicos por semana</span>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button type="submit" disabled={!name.trim() || create.isPending || update.isPending}>
          Salvar
        </Button>
      </DialogFooter>
    </form>
  )
}
