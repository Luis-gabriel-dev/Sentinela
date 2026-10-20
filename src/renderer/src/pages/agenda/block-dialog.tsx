import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { Recurrence } from '@shared/schemas'
import type { ScheduleBlock } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
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
import { ColorPicker } from '@renderer/components/color-picker'
import { ConfirmDelete } from '@renderer/components/confirm-delete'
import { TopicSelect } from '@renderer/components/topic-select'
import { formatDate, parseIsoDate, WEEKDAYS } from '@renderer/lib/format'
import {
  useCreateBlock,
  useRemoveBlock,
  useToggleCheckin,
  useTopics,
  useUpdateBlock
} from '@renderer/lib/queries'
import { cn } from '@renderer/lib/utils'

export interface BlockDraft {
  recurrence: Recurrence
  date: string
  startTime: string
  endTime: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Bloco existente + a data da ocorrência clicada (para marcar como concluído). */
  block?: ScheduleBlock
  occurrenceDate?: string
  occurrenceDone?: boolean
  /** Valores iniciais ao criar um bloco a partir de uma seleção na agenda. */
  draft?: BlockDraft
}

export function BlockDialog(props: Props): React.JSX.Element {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {props.open && (
          <BlockForm key={`${props.block?.id ?? 'new'}-${props.occurrenceDate}`} {...props} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function BlockForm({
  block,
  draft,
  occurrenceDate,
  occurrenceDone = false,
  onOpenChange
}: Props): React.JSX.Element {
  const { data: topics = [] } = useTopics()
  const [title, setTitle] = useState(block?.title ?? '')
  const [topicId, setTopicId] = useState<number | null>(block?.topicId ?? null)
  const [color, setColor] = useState<string | null>(block?.color ?? null)
  const [recurrence, setRecurrence] = useState<Recurrence>(
    block?.recurrence ?? draft?.recurrence ?? 'weekly'
  )
  const [weekday, setWeekday] = useState(
    block?.weekday ?? (draft ? parseIsoDate(draft.date).getDay() : 1)
  )
  const [date, setDate] = useState(block?.date ?? draft?.date ?? '')
  const [startTime, setStartTime] = useState(block?.startTime ?? draft?.startTime ?? '08:00')
  const [endTime, setEndTime] = useState(block?.endTime ?? draft?.endTime ?? '09:00')
  const [notes, setNotes] = useState(block?.notes ?? '')
  const [done, setDone] = useState(occurrenceDone)

  const create = useCreateBlock()
  const update = useUpdateBlock()
  const remove = useRemoveBlock()
  const toggleCheckin = useToggleCheckin()

  const topicColor = topics.find((t) => t.id === topicId)?.color

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const input = {
      title,
      topicId,
      color,
      recurrence,
      weekday: recurrence === 'weekly' ? weekday : null,
      date: recurrence === 'once' ? date || null : null,
      startTime,
      endTime,
      notes: notes.trim() || null
    }
    const close = { onSuccess: () => onOpenChange(false) }
    if (block) {
      update.mutate([block.id, input], close)
      if (occurrenceDate && done !== occurrenceDone) {
        toggleCheckin.mutate([block.id, occurrenceDate])
      }
    } else {
      create.mutate([input], close)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{block ? 'Editar bloco' : 'Novo bloco na agenda'}</DialogTitle>
      </DialogHeader>

      {block && occurrenceDate && (
        <label
          className={cn(
            'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition',
            done && 'border-emerald-500/40 bg-emerald-500/10'
          )}
        >
          <Checkbox checked={done} onCheckedChange={(c) => setDone(c === true)} />
          Concluído em {formatDate(occurrenceDate)}
        </label>
      )}

      <div className="grid gap-2">
        <Label htmlFor="block-title">O que fazer</Label>
        <Input
          id="block-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex.: Estudar camada de transporte"
          autoFocus={!block}
        />
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-4">
        <div className="grid gap-2">
          <Label>Tema</Label>
          <TopicSelect value={topicId} onChange={setTopicId} />
        </div>
        <div className="grid gap-2">
          <Label>Cor</Label>
          <ColorPicker
            value={color}
            onChange={setColor}
            noneLabel="Cor do tema"
            fallback={topicColor}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>Repetição</Label>
          <Select value={recurrence} onValueChange={(v) => setRecurrence(v as Recurrence)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Toda semana</SelectItem>
              <SelectItem value="once">Só uma vez</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {recurrence === 'weekly' ? (
          <div className="grid gap-2">
            <Label>Dia da semana</Label>
            <Select value={String(weekday)} onValueChange={(v) => setWeekday(Number(v))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* começa na segunda */}
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {WEEKDAYS[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor="block-date">Data</Label>
            <Input
              id="block-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="block-start">Início</Label>
          <Input
            id="block-start"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="block-end">Fim</Label>
          <Input
            id="block-end"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="block-notes">Notas</Label>
        <Textarea
          id="block-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <DialogFooter className="sm:justify-between">
        {block ? (
          <ConfirmDelete
            title="Excluir bloco?"
            description={
              block.recurrence === 'weekly'
                ? `"${block.title}" será removido de todas as semanas.`
                : `"${block.title}" será removido da agenda.`
            }
            onConfirm={() => remove.mutate([block.id], { onSuccess: () => onOpenChange(false) })}
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
