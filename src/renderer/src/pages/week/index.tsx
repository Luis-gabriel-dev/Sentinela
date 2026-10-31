import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ChevronLeft, ChevronRight, Clock, Sparkles } from 'lucide-react'
import type { WeekWindow } from '@shared/schemas'
import type { Project, ScheduleBlock } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { PageHeader } from '@renderer/components/page-header'
import { WEEKDAYS, formatDate, todayIso } from '@renderer/lib/format'
import { timeAgo } from '@renderer/lib/projects'
import {
  aiReady,
  useAiSettings,
  useCheckins,
  useProjects,
  useSchedule,
  useToggleCheckin,
  useTopics,
  useUpdateTopic,
  useWeekAvailability
} from '@renderer/lib/queries'
import { buildTopicTree, flattenTree, topicProgress, type TopicNode } from '@renderer/lib/topics'
import { cn } from '@renderer/lib/utils'
import {
  areaOf,
  blocksOn,
  formatDuration,
  freeSegments,
  KIND_LABEL,
  toMinutes,
  WEEK_ORDER,
  weekDates,
  type Area
} from '@renderer/lib/week'
import { AvailabilityDialog } from './availability-dialog'
import { PlanWeekDialog } from './plan-week-dialog'

/**
 * A semana como rotina: horários livres, horas por área e, dia a dia, os blocos com o próximo
 * assunto pendente de cada tema para marcar como estudado.
 */
export function WeekPage(): React.JSX.Element {
  const { data: blocks = [] } = useSchedule()
  const { data: topics = [] } = useTopics()
  const { data: projects = [] } = useProjects()
  const { data: availability } = useWeekAvailability()
  const { data: settings } = useAiSettings()
  const windows = useMemo(() => availability?.windows ?? [], [availability])

  const [offset, setOffset] = useState(0)
  const dates = useMemo(() => weekDates(offset), [offset])
  const today = todayIso()
  const [day, setDay] = useState(() => new Date().getDay())
  const range = { from: dates.get(1)!, to: dates.get(0)! }
  const { data: checkins = [] } = useCheckins(range)
  const toggleCheckin = useToggleCheckin()
  const [editing, setEditing] = useState(false)
  const [planning, setPlanning] = useState(false)

  const topicsById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics])
  const nodesById = useMemo(
    () => new Map(flattenTree(buildTopicTree(topics)).map((n) => [n.id, n])),
    [topics]
  )
  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const done = useMemo(() => new Set(checkins.map((c) => `${c.blockId}:${c.date}`)), [checkins])

  // Horas por área nos blocos da semana (semanais e avulsos destas datas).
  const weekBlocks = WEEK_ORDER.flatMap((weekday) => blocksOn(blocks, weekday, dates.get(weekday)!))
  const areas = useMemo(() => {
    const byKey = new Map<string, Area & { minutes: number }>()
    for (const b of weekBlocks) {
      const area = areaOf(b, topicsById, projectsById)
      const minutes = toMinutes(b.endTime) - toMinutes(b.startTime)
      const current = byKey.get(area.key)
      byKey.set(area.key, { ...area, minutes: (current?.minutes ?? 0) + minutes })
    }
    return [...byKey.values()].toSorted((a, b) => b.minutes - a.minutes)
  }, [weekBlocks, topicsById, projectsById])
  const freeMinutes = WEEK_ORDER.flatMap((weekday) =>
    freeSegments(windows, blocksOn(blocks, weekday, dates.get(weekday)!), weekday)
  ).reduce((sum, w) => sum + toMinutes(w.endTime) - toMinutes(w.startTime), 0)
  const maxMinutes = Math.max(1, ...areas.map((a) => a.minutes), freeMinutes)

  const date = dates.get(day)!
  const dayBlocks = blocksOn(blocks, day, date)
  const free = freeSegments(windows, dayBlocks, day)
  const rows = [
    ...dayBlocks.map((b) => ({ start: b.startTime, block: b, free: null })),
    ...free.map((w) => ({ start: w.startTime, block: null, free: w }))
  ].toSorted((a, b) => a.start.localeCompare(b.start))
  const dayDone = dayBlocks.filter((b) => done.has(`${b.id}:${date}`)).length
  // Dois blocos do mesmo tema no dia: o segundo fica com o assunto seguinte.
  const turns = new Map<number, number>()
  const perTopic = new Map<number, number>()
  for (const b of dayBlocks) {
    if (b.topicId === null) continue
    const turn = perTopic.get(b.topicId) ?? 0
    turns.set(b.id, turn)
    perTopic.set(b.topicId, turn + 1)
  }

  const canPlan = aiReady(settings) && windows.length > 0
  const empty = windows.length === 0 && weekBlocks.length === 0

  return (
    <>
      <PageHeader
        title="Semana"
        description="Seus horários livres e o que fazer em cada um. Marque os blocos e os assuntos conforme for estudando."
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Clock /> Horários livres
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button disabled={!canPlan} onClick={() => setPlanning(true)}>
                    <Sparkles /> Planejar com IA
                  </Button>
                </span>
              </TooltipTrigger>
              {!canPlan && (
                <TooltipContent>
                  {windows.length
                    ? 'Configure a IA em Configurações'
                    : 'Informe seus horários livres primeiro'}
                </TooltipContent>
              )}
            </Tooltip>
          </>
        }
      />

      {empty ? (
        <div className="grid place-items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
          <Clock className="size-8 text-primary" />
          <p className="max-w-md text-sm text-muted-foreground">
            Diga quando você está livre (por exemplo, de segunda a sexta das 8h às 12h para projetos
            e das 19h às 22h para estudos). Depois a IA monta a semana com seus temas e projetos.
          </p>
          <Button onClick={() => setEditing(true)}>Informar horários livres</Button>
        </div>
      ) : (
        <div className="grid gap-8">
          <section className="grid gap-3">
            <h2 className="text-lg font-semibold">Horas por semana</h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
              {areas.map((a) => (
                <HoursCard
                  key={a.key}
                  label={a.label}
                  color={a.color}
                  minutes={a.minutes}
                  max={maxMinutes}
                />
              ))}
              {freeMinutes > 0 && (
                <HoursCard
                  label="Livre, sem bloco"
                  color="#64748b"
                  minutes={freeMinutes}
                  max={maxMinutes}
                  muted
                />
              )}
            </div>
          </section>

          <section className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {WEEK_ORDER.map((weekday) => {
                  const isToday = dates.get(weekday) === today
                  return (
                    <button
                      key={weekday}
                      type="button"
                      onClick={() => setDay(weekday)}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-sm font-medium transition hover:bg-accent',
                        day === weekday &&
                          'border-foreground bg-foreground text-background hover:bg-foreground'
                      )}
                    >
                      {WEEKDAYS[weekday]}
                      {isToday && (
                        <span className="ml-1.5 text-[10px] font-normal opacity-70">hoje</span>
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Semana anterior"
                  onClick={() => setOffset((o) => o - 1)}
                >
                  <ChevronLeft />
                </Button>
                <button
                  type="button"
                  className="tabular-nums hover:text-foreground"
                  onClick={() => setOffset(0)}
                  title="Voltar para esta semana"
                >
                  {formatDate(range.from)} – {formatDate(range.to)}
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Próxima semana"
                  onClick={() => setOffset((o) => o + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>

            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-semibold">{WEEKDAYS[day]}</h2>
              {dayBlocks.length > 0 && (
                <span className="font-mono text-xs text-muted-foreground">
                  {dayDone} de {dayBlocks.length} blocos feitos
                </span>
              )}
            </div>

            <div className="grid gap-2">
              {rows.length === 0 && (
                <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  Nenhum horário livre nem bloco neste dia.
                </p>
              )}
              {rows.map((row) =>
                row.block ? (
                  <BlockRow
                    key={`b${row.block.id}`}
                    block={row.block}
                    area={areaOf(row.block, topicsById, projectsById)}
                    node={row.block.topicId !== null ? nodesById.get(row.block.topicId) : undefined}
                    turn={turns.get(row.block.id) ?? 0}
                    project={
                      row.block.projectId !== null
                        ? projectsById.get(row.block.projectId)
                        : undefined
                    }
                    done={done.has(`${row.block.id}:${date}`)}
                    onToggle={() => toggleCheckin.mutate([row.block!.id, date])}
                  />
                ) : (
                  <FreeRow key={`f${row.free!.startTime}`} window={row.free!} />
                )
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Para mudar horários ou criar blocos avulsos, use a{' '}
              <Link to="/agenda" className="text-primary hover:underline">
                Agenda
              </Link>
              .
            </p>
          </section>
        </div>
      )}

      <AvailabilityDialog open={editing} onOpenChange={setEditing} windows={windows} />
      <PlanWeekDialog open={planning} onOpenChange={setPlanning} />
    </>
  )
}

function HoursCard({
  label,
  color,
  minutes,
  max,
  muted = false
}: {
  label: string
  color: string
  minutes: number
  max: number
  muted?: boolean
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'grid min-w-0 gap-2 rounded-xl border bg-card p-3',
        muted && 'border-dashed bg-transparent'
      )}
    >
      <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="min-w-0 truncate" title={label}>
          {label}
        </span>
      </span>
      <span className="font-mono text-xl font-semibold">
        {formatDuration(minutes)}
        <span className="ml-1 text-xs font-normal text-muted-foreground">/semana</span>
      </span>
      <span className="h-1 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full"
          style={{ width: `${(minutes / max) * 100}%`, background: color }}
        />
      </span>
    </div>
  )
}

function BlockRow({
  block,
  area,
  node,
  turn,
  project,
  done,
  onToggle
}: {
  block: ScheduleBlock
  area: Area
  node: TopicNode | undefined
  /** Quantos blocos do mesmo tema vêm antes deste no dia. */
  turn: number
  project: Project | undefined
  done: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'grid grid-cols-[7rem_minmax(0,1fr)_auto] items-start gap-3 rounded-xl border border-l-4 bg-card px-4 py-3',
        done && 'opacity-60'
      )}
      style={{ borderLeftColor: block.color ?? area.color }}
    >
      <span className="pt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
        {block.startTime}–{block.endTime}
      </span>
      <div className="grid min-w-0 gap-1">
        <span
          className="truncate font-mono text-[11px] font-medium tracking-wide uppercase"
          style={{ color: area.color }}
        >
          {project ? 'Projeto' : area.label}
        </span>
        <span className={cn('font-medium', done && 'line-through')}>{block.title}</span>
        {node && <NextTopic node={node} turn={turn} />}
        {project && (
          <span className="text-sm text-muted-foreground">
            {project.repo}
            {project.lastCommitAt && ` · último commit ${timeAgo(project.lastCommitAt)}`}
          </span>
        )}
        {block.notes && <span className="text-sm text-muted-foreground">{block.notes}</span>}
      </div>
      <Checkbox
        checked={done}
        onCheckedChange={onToggle}
        aria-label="Bloco feito"
        title="Bloco feito"
        className="mt-0.5 size-5"
      />
    </div>
  )
}

/** Próximo assunto pendente do tema do bloco, para marcar como estudado ali mesmo. */
function NextTopic({ node, turn }: { node: TopicNode; turn: number }): React.JSX.Element | null {
  const update = useUpdateTopic()
  const progress = topicProgress(node)
  const leaf = node.children.length === 0
  const next = leaf ? (node.completedAt || turn ? null : node) : progress.pending[turn]
  if (!next) {
    return (
      <span className="text-sm text-muted-foreground">
        {(leaf ? !node.completedAt : progress.pending.length)
          ? 'Revisão do que você estudou.'
          : leaf
            ? 'Tema concluído.'
            : 'Todos os assuntos deste tema foram estudados.'}
      </span>
    )
  }
  return (
    <label className="flex w-fit max-w-full cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
      <Checkbox
        checked={false}
        disabled={update.isPending}
        onCheckedChange={() => update.mutate([next.id, { completed: true }])}
        aria-label={`Marcar "${next.name}" como estudado`}
      />
      <span className="min-w-0 truncate">
        {leaf ? (
          'Marcar como estudado'
        ) : (
          <>
            Próximo: <span className="text-foreground">{next.name}</span>
          </>
        )}
      </span>
      {!leaf && (
        <span className="shrink-0 font-mono text-xs tabular-nums">
          {progress.done}/{progress.total}
        </span>
      )}
    </label>
  )
}

function FreeRow({ window }: { window: WeekWindow }): React.JSX.Element {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 rounded-xl border border-dashed px-4 py-2.5 text-sm text-muted-foreground">
      <span className="font-mono text-xs tabular-nums">
        {window.startTime}–{window.endTime}
      </span>
      <span>Livre · {KIND_LABEL[window.kind].toLowerCase()}</span>
    </div>
  )
}
