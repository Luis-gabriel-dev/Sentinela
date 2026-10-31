import { useMemo, useState } from 'react'
import { CalendarPlus, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { WeekPlan } from '@shared/types'
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
import { Label } from '@renderer/components/ui/label'
import { ProposalView } from '@renderer/components/proposal-view'
import {
  emptySelection,
  selectedCount,
  toSkip,
  type ProposalSelection
} from '@renderer/lib/proposal'
import {
  useApplyPlan,
  usePlanWeek,
  useProjects,
  useSchedule,
  useTopics,
  useWeekAvailability
} from '@renderer/lib/queries'
import { buildTopicTree, flattenTree } from '@renderer/lib/topics'
import { toMinutes } from '@renderer/lib/week'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** A IA monta a semana nos horários livres; o estudante revisa e cria. */
export function PlanWeekDialog({ open, onOpenChange }: Props): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {open && <PlanForm onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function PlanForm({ onDone }: { onDone: () => void }): React.JSX.Element {
  const { data: topics = [] } = useTopics()
  const { data: projects = [] } = useProjects()
  const { data: blocks = [] } = useSchedule()
  const { data: availability } = useWeekAvailability()
  const plan = usePlanWeek()
  const applyPlan = useApplyPlan()
  const windows = availability?.windows ?? []

  const options = useMemo(
    () => flattenTree(buildTopicTree(topics)).filter((t) => t.depth <= 1),
    [topics]
  )
  const activeProjects = projects.filter((p) => !p.archived)
  const [topicIds, setTopicIds] = useState<Set<number>>(
    () => new Set(topics.filter((t) => t.trackProgress && t.parentId === null).map((t) => t.id))
  )
  const [projectIds, setProjectIds] = useState<Set<number>>(
    () => new Set(activeProjects.map((p) => p.id))
  )
  const [splitTopics, setSplitTopics] = useState(true)
  // Blocos semanais que já ocupam os horários livres (o plano pode ficar no lugar deles).
  const inWindows = blocks.filter(
    (b) =>
      b.recurrence === 'weekly' &&
      windows.some(
        (w) =>
          w.weekday === b.weekday &&
          toMinutes(b.startTime) < toMinutes(w.endTime) &&
          toMinutes(b.endTime) > toMinutes(w.startTime)
      )
  )
  const [replace, setReplace] = useState(true)
  const [result, setResult] = useState<WeekPlan | null>(null)
  const [selection, setSelection] = useState<ProposalSelection>(emptySelection)

  const toggle = (set: Set<number>, id: number, on: boolean): Set<number> => {
    const next = new Set(set)
    if (on) next.add(id)
    else next.delete(id)
    return next
  }

  if (result) {
    const count = selectedCount(result.proposal, selection)
    return (
      <div className="grid gap-4">
        <DialogHeader>
          <DialogTitle>Semana planejada</DialogTitle>
          <DialogDescription>
            Os blocos se repetem toda semana; cada um mostra o próximo assunto pendente do tema.
            Desmarque o que não quiser.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] overflow-y-auto pr-1">
          <ProposalView proposal={result.proposal} selection={selection} onChange={setSelection} />
        </div>
        {result.notes.length > 0 && (
          <ul className="list-disc pl-5 text-xs text-muted-foreground">
            {result.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" disabled={applyPlan.isPending} onClick={() => setResult(null)}>
            Ajustar pedido
          </Button>
          <Button
            disabled={count === 0 || applyPlan.isPending}
            onClick={() =>
              applyPlan.mutate([result.proposal, toSkip(selection)], {
                onSuccess: (r) => {
                  toast.success(
                    [r.topics && `${r.topics} subtópico(s)`, r.blocks && `${r.blocks} bloco(s)`]
                      .filter(Boolean)
                      .join(' e ') + ' criados'
                  )
                  onDone()
                }
              })
            }
          >
            {applyPlan.isPending ? <Loader2 className="animate-spin" /> : <CalendarPlus />}
            Criar {count} {count === 1 ? 'item' : 'itens'}
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
        plan.mutate(
          [{ topicIds: [...topicIds], projectIds: [...projectIds], splitTopics, replace }],
          {
            onSuccess: (r) => {
              setResult(r)
              setSelection(emptySelection())
            }
          }
        )
      }}
    >
      <DialogHeader>
        <DialogTitle>Planejar a semana com IA</DialogTitle>
        <DialogDescription>
          A IA distribui os temas nos seus horários de estudos e os projetos nos de projetos, dando
          mais tempo a quem tem mais coisa pendente.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label>Temas</Label>
          <div className="grid max-h-56 gap-0.5 overflow-y-auto rounded-lg border p-1.5">
            {options.map((t) => (
              <label
                key={t.id}
                className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent/50"
              >
                <Checkbox
                  checked={topicIds.has(t.id)}
                  onCheckedChange={(c) => setTopicIds((s) => toggle(s, t.id, c === true))}
                />
                <span className="size-2 shrink-0 rounded-full" style={{ background: t.color }} />
                <span className="truncate" style={{ paddingLeft: t.depth * 8 }}>
                  {t.name}
                </span>
              </label>
            ))}
            {options.length === 0 && (
              <p className="p-2 text-sm text-muted-foreground">Nenhum tema ainda.</p>
            )}
          </div>
        </div>
        <div className="grid content-start gap-2">
          <Label>Projetos</Label>
          <div className="grid max-h-56 gap-0.5 overflow-y-auto rounded-lg border p-1.5">
            {activeProjects.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent/50"
              >
                <Checkbox
                  checked={projectIds.has(p.id)}
                  onCheckedChange={(c) => setProjectIds((s) => toggle(s, p.id, c === true))}
                />
                <span className="truncate">{p.repo.split('/').pop()}</span>
              </label>
            ))}
            {activeProjects.length === 0 && (
              <p className="p-2 text-sm text-muted-foreground">
                Nenhum projeto acompanhado. Adicione em Projetos.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-2 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox checked={splitTopics} onCheckedChange={(c) => setSplitTopics(c === true)} />
          Dividir em subtópicos os temas que ainda não têm
        </label>
        {inWindows.length > 0 && (
          <label className="flex items-center gap-2">
            <Checkbox checked={replace} onCheckedChange={(c) => setReplace(c === true)} />
            Substituir os {inWindows.length} bloco(s) que já estão nesses horários
          </label>
        )}
      </div>

      <DialogFooter>
        <Button
          type="submit"
          disabled={topicIds.size + projectIds.size === 0 || !windows.length || plan.isPending}
        >
          {plan.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {plan.isPending ? 'Planejando...' : 'Planejar'}
        </Button>
      </DialogFooter>
    </form>
  )
}
