import { useState } from 'react'
import { Copy, Loader2, Plus, X } from 'lucide-react'
import { WINDOW_KINDS, type WeekWindow, type WindowKind } from '@shared/schemas'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { WEEKDAYS } from '@renderer/lib/format'
import { useSaveAvailability } from '@renderer/lib/queries'
import { KIND_LABEL, WEEK_ORDER } from '@renderer/lib/week'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  windows: WeekWindow[]
}

/** Horários livres de cada dia, para estudos ou para projetos. */
export function AvailabilityDialog({ open, onOpenChange, windows }: Props): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {open && <AvailabilityForm initial={windows} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function AvailabilityForm({
  initial,
  onDone
}: {
  initial: WeekWindow[]
  onDone: () => void
}): React.JSX.Element {
  const [windows, setWindows] = useState<WeekWindow[]>(initial)
  const save = useSaveAvailability()

  const update = (index: number, patch: Partial<WeekWindow>): void =>
    setWindows((prev) => prev.map((w, i) => (i === index ? { ...w, ...patch } : w)))

  /** Novo horário no dia: depois do último, ou de manhã para projetos e à noite para estudos. */
  const add = (weekday: number): void =>
    setWindows((prev) => {
      const last = prev.filter((w) => w.weekday === weekday).at(-1)
      const window: WeekWindow = last
        ? { weekday, startTime: last.endTime, endTime: last.endTime, kind: last.kind }
        : { weekday, startTime: '19:00', endTime: '22:00', kind: 'estudos' }
      return [...prev, window]
    })

  /** Repete os horários de segunda de terça a sexta. */
  const copyMonday = (): void =>
    setWindows((prev) => [
      ...prev.filter((w) => w.weekday === 0 || w.weekday === 1 || w.weekday === 6),
      ...[2, 3, 4, 5].flatMap((weekday) =>
        prev.filter((w) => w.weekday === 1).map((w) => ({ ...w, weekday }))
      )
    ])

  const invalid = windows.some((w) => w.endTime <= w.startTime)

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Seus horários livres</DialogTitle>
        <DialogDescription>
          Quando você pode estudar e quando pode trabalhar nos projetos. O plano com IA monta a
          semana dentro desses horários.
        </DialogDescription>
      </DialogHeader>

      <div className="grid max-h-[55vh] gap-1 overflow-y-auto pr-1">
        {WEEK_ORDER.map((weekday) => {
          const items = windows.map((w, i) => ({ w, i })).filter(({ w }) => w.weekday === weekday)
          return (
            <div
              key={weekday}
              className="grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-3 border-b py-2 last:border-b-0"
            >
              <span className="pt-1.5 text-sm font-medium">{WEEKDAYS[weekday]}</span>
              <div className="grid gap-2">
                {items.map(({ w, i }) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <Input
                      type="time"
                      aria-label="Início"
                      value={w.startTime}
                      onChange={(e) => update(i, { startTime: e.target.value })}
                      className="h-8 w-28"
                    />
                    <span className="text-muted-foreground">–</span>
                    <Input
                      type="time"
                      aria-label="Fim"
                      value={w.endTime}
                      onChange={(e) => update(i, { endTime: e.target.value })}
                      className="h-8 w-28"
                      aria-invalid={w.endTime <= w.startTime}
                    />
                    <Select
                      value={w.kind}
                      onValueChange={(v) => update(i, { kind: v as WindowKind })}
                    >
                      <SelectTrigger size="sm" className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WINDOW_KINDS.map((k) => (
                          <SelectItem key={k} value={k}>
                            {KIND_LABEL[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="Tirar horário"
                      onClick={() => setWindows((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X />
                    </Button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => add(weekday)}
                  className="flex w-fit items-center gap-1 rounded px-1 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Plus className="size-3.5" /> Horário
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <DialogFooter className="sm:justify-between">
        <Button
          variant="ghost"
          onClick={copyMonday}
          disabled={!windows.some((w) => w.weekday === 1)}
        >
          <Copy /> Repetir segunda de terça a sexta
        </Button>
        <Button
          disabled={invalid || save.isPending}
          onClick={() => save.mutate([{ windows }], { onSuccess: onDone })}
        >
          {save.isPending && <Loader2 className="animate-spin" />}
          Salvar
        </Button>
      </DialogFooter>
    </div>
  )
}
