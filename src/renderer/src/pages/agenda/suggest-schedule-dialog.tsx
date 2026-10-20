import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { ScheduleSuggestion } from '@shared/types'
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
import { api } from '@renderer/lib/api'
import { WEEKDAYS } from '@renderer/lib/format'
import { keys, useSuggestSchedule, useTopics } from '@renderer/lib/queries'
import { buildTopicTree, flattenTree } from '@renderer/lib/topics'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** A IA monta blocos semanais a partir da disponibilidade; o estudante revisa e adiciona. */
export function SuggestScheduleDialog({ open, onOpenChange }: Props): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {open && <ScheduleForm onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  )
}

function ScheduleForm({ onOpenChange }: Pick<Props, 'onOpenChange'>): React.JSX.Element {
  const client = useQueryClient()
  const { data: topics = [] } = useTopics()
  const suggest = useSuggestSchedule()
  const options = useMemo(
    () => flattenTree(buildTopicTree(topics)).filter((t) => t.depth <= 1),
    [topics]
  )
  const [topicIds, setTopicIds] = useState<Set<number>>(
    () => new Set(topics.filter((t) => t.trackProgress).map((t) => t.id))
  )
  const [hours, setHours] = useState('8')
  const [availability, setAvailability] = useState('')
  const [blocks, setBlocks] = useState<ScheduleSuggestion[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const topicName = new Map(topics.map((t) => [t.id, t.name]))

  const run = (): void =>
    suggest.mutate([{ topicIds: [...topicIds], hoursPerWeek: Number(hours), availability }], {
      onSuccess: (result) => {
        setBlocks(result)
        setSelected(new Set(result.map((_, i) => i)))
      }
    })

  const apply = async (): Promise<void> => {
    if (!blocks) return
    setSaving(true)
    try {
      for (const [i, b] of blocks.entries()) {
        if (!selected.has(i)) continue
        await api.schedule.create({
          title: b.title,
          topicId: b.topicId,
          recurrence: 'weekly',
          weekday: b.weekday,
          startTime: b.startTime,
          endTime: b.endTime,
          notes: b.reason || null
        })
      }
      await client.invalidateQueries({ queryKey: keys.schedule })
      toast.success(`${selected.size} blocos adicionados à agenda`)
      onOpenChange(false)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (blocks !== null) {
    const ordered = blocks
      .map((b, i) => ({ b, i }))
      .toSorted(
        (x, y) =>
          ((x.b.weekday + 6) % 7) - ((y.b.weekday + 6) % 7) ||
          x.b.startTime.localeCompare(y.b.startTime)
      )
    return (
      <div className="grid gap-4">
        <DialogHeader>
          <DialogTitle>Agenda sugerida</DialogTitle>
          <DialogDescription>
            Blocos semanais. Os que batem com horários já ocupados foram descartados.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto rounded-lg border">
          {ordered.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhum bloco coube na disponibilidade informada. Tente ampliar os horários.
            </p>
          )}
          {ordered.map(({ b, i }) => (
            <label
              key={i}
              className="flex cursor-pointer items-start gap-3 border-b px-3 py-2.5 last:border-b-0 hover:bg-accent/50"
            >
              <Checkbox
                className="mt-0.5"
                checked={selected.has(i)}
                onCheckedChange={(c) =>
                  setSelected((prev) => {
                    const next = new Set(prev)
                    if (c === true) next.add(i)
                    else next.delete(i)
                    return next
                  })
                }
              />
              <span className="w-24 shrink-0 text-sm tabular-nums">
                <span className="block font-medium">{WEEKDAYS[b.weekday]}</span>
                <span className="text-xs text-muted-foreground">
                  {b.startTime}–{b.endTime}
                </span>
              </span>
              <span className="min-w-0">
                <span className="block text-sm">{b.title}</span>
                <span className="text-xs text-muted-foreground">
                  {[b.topicId ? topicName.get(b.topicId) : null, b.reason]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </label>
          ))}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => setBlocks(null)} disabled={saving}>
            Ajustar pedido
          </Button>
          <Button onClick={() => void apply()} disabled={selected.size === 0 || saving}>
            {saving ? <Loader2 className="animate-spin" /> : <CalendarPlus />}
            Adicionar {selected.size} à agenda
          </Button>
        </DialogFooter>
      </div>
    )
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        run()
      }}
    >
      <DialogHeader>
        <DialogTitle>Montar agenda com IA</DialogTitle>
        <DialogDescription>
          A IA distribui os temas na sua semana considerando o que falta estudar e o que já está na
          agenda.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label>Temas</Label>
        <div className="grid max-h-44 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
          {options.map((t) => (
            <label
              key={t.id}
              className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent/50"
            >
              <Checkbox
                checked={topicIds.has(t.id)}
                onCheckedChange={(c) =>
                  setTopicIds((prev) => {
                    const next = new Set(prev)
                    if (c === true) next.add(t.id)
                    else next.delete(t.id)
                    return next
                  })
                }
              />
              <span className="size-2 shrink-0 rounded-full" style={{ background: t.color }} />
              <span className="truncate" style={{ paddingLeft: t.depth * 8 }}>
                {t.name}
              </span>
            </label>
          ))}
          {options.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">
              Crie temas primeiro em Temas e progresso.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="availability">Quando você pode estudar?</Label>
        <Textarea
          id="availability"
          rows={2}
          value={availability}
          onChange={(e) => setAvailability(e.target.value)}
          placeholder="Ex.: segunda a sexta das 19h às 22h; sábado de manhã; domingo livre"
        />
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Label htmlFor="hours" className="font-normal">
          Cerca de
        </Label>
        <Input
          id="hours"
          type="number"
          min={1}
          max={80}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="h-8 w-20"
        />
        <span className="text-muted-foreground">horas por semana</span>
      </div>

      <DialogFooter>
        <Button
          type="submit"
          disabled={
            topicIds.size === 0 ||
            availability.trim().length < 3 ||
            !Number(hours) ||
            suggest.isPending
          }
        >
          {suggest.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {suggest.isPending ? 'Montando...' : 'Sugerir agenda'}
        </Button>
      </DialogFooter>
    </form>
  )
}
