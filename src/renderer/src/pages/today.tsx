import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowRight, TriangleAlert } from 'lucide-react'
import { AgendaIcon, ProjectsIcon, TasksIcon, TopicsIcon } from '@renderer/components/icons'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Progress } from '@renderer/components/ui/progress'
import { compareTasks, formatDate, PRIORITY_META, todayIso } from '@renderer/lib/format'
import { projectHealth } from '@renderer/lib/projects'
import {
  useCheckins,
  useProjects,
  useSchedule,
  useTasks,
  useToggleCheckin,
  useTopics,
  useUpdateTask
} from '@renderer/lib/queries'
import { buildTopicTree, flattenTree, topicProgress } from '@renderer/lib/topics'
import { cn } from '@renderer/lib/utils'

function Card({
  title,
  icon,
  link,
  children
}: {
  title: string
  icon: ReactNode
  link: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <section className="flex flex-col rounded-xl border bg-card">
      <header className="flex items-center gap-2 border-b px-5 py-3.5">
        <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
        <h2 className="text-sm font-medium">{title}</h2>
        <Link
          to={link}
          className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Ver tudo <ArrowRight className="size-3" />
        </Link>
      </header>
      <div className="flex-1 p-2">{children}</div>
    </section>
  )
}

const Empty = ({ children }: { children: ReactNode }): React.JSX.Element => (
  <p className="px-3 py-8 text-center text-sm text-muted-foreground">{children}</p>
)

export function TodayPage(): React.JSX.Element {
  const today = todayIso()
  const weekday = new Date().getDay()

  const { data: blocks = [] } = useSchedule()
  const { data: topics = [] } = useTopics()
  const { data: openTasks = [] } = useTasks({ status: 'open' })
  const { data: checkins = [] } = useCheckins({ from: today, to: today })
  const { data: projects = [] } = useProjects()
  const toggleCheckin = useToggleCheckin()
  const updateTask = useUpdateTask()

  const topicsById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics])
  const doneIds = useMemo(() => new Set(checkins.map((c) => c.blockId)), [checkins])

  const todayBlocks = blocks
    .filter((b) => (b.recurrence === 'weekly' ? b.weekday === weekday : b.date === today))
    .toSorted((a, b) => a.startTime.localeCompare(b.startTime))

  const focusTasks = openTasks
    .filter(
      (t) => t.priority === 'urgent' || t.priority === 'high' || (t.dueDate && t.dueDate <= today)
    )
    .toSorted(compareTasks)
    .slice(0, 8)

  const tracked = useMemo(
    () => flattenTree(buildTopicTree(topics)).filter((t) => t.trackProgress),
    [topics]
  )

  const dateLabel = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  })
  const blocksDone = todayBlocks.filter((b) => doneIds.has(b.id)).length

  const staleProjects = projects
    .map((project) => ({ project, health: projectHealth(project) }))
    .flatMap(({ project, health }) =>
      health.kind === 'stale' ? [{ project, days: health.days }] : []
    )
    .toSorted((a, b) => b.days - a.days)

  return (
    <>
      <header className="pb-8">
        <p className="text-sm text-muted-foreground first-letter:uppercase">{dateLabel}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {todayBlocks.length > 0
            ? `${blocksDone} de ${todayBlocks.length} blocos concluídos hoje`
            : 'Seu dia'}
        </h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Agenda de hoje" icon={<AgendaIcon />} link="/agenda">
          {todayBlocks.length === 0 ? (
            <Empty>Nada na agenda para hoje.</Empty>
          ) : (
            todayBlocks.map((b) => {
              const done = doneIds.has(b.id)
              const color =
                b.color ??
                (b.topicId !== null ? topicsById.get(b.topicId)?.color : null) ??
                '#6366f1'
              return (
                <label
                  key={b.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/50"
                >
                  <Checkbox
                    checked={done}
                    onCheckedChange={() => toggleCheckin.mutate([b.id, today])}
                    className="size-5 rounded-full"
                  />
                  <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: color }} />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-sm',
                        done && 'text-muted-foreground line-through'
                      )}
                    >
                      {b.title}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {b.startTime} – {b.endTime}
                    </span>
                  </span>
                </label>
              )
            })
          )}
        </Card>

        <Card title="Foco em tarefas" icon={<TasksIcon />} link="/tarefas">
          {focusTasks.length === 0 ? (
            <Empty>Nenhuma tarefa urgente, de alta prioridade ou vencendo.</Empty>
          ) : (
            focusTasks.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/50"
              >
                <Checkbox
                  checked={false}
                  onCheckedChange={() => updateTask.mutate([t.id, { completed: true }])}
                  className="size-5 rounded-full"
                />
                <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                {t.dueDate && (
                  <span
                    className={cn(
                      'text-xs text-muted-foreground',
                      t.dueDate < today && 'font-medium text-red-500'
                    )}
                  >
                    {t.dueDate === today ? 'hoje' : formatDate(t.dueDate)}
                  </span>
                )}
                <span
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-xs font-medium',
                    PRIORITY_META[t.priority].className
                  )}
                >
                  {PRIORITY_META[t.priority].label}
                </span>
              </label>
            ))
          )}
        </Card>

        <div className="lg:col-span-2">
          <Card title="Progresso dos estudos" icon={<TopicsIcon />} link="/temas">
            {tracked.length === 0 ? (
              <Empty>Ative “Acompanhar progresso” em um assunto para vê-lo aqui.</Empty>
            ) : (
              <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
                {tracked.map((node) => {
                  const p = topicProgress(node)
                  return (
                    <div key={node.id} className="rounded-lg px-3 py-2.5">
                      <div className="mb-2 flex items-center gap-2 text-sm">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ background: node.color }}
                        />
                        <span className="truncate font-medium">{node.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                          {p.done}/{p.total}
                          {node.weeklyGoal !== null &&
                            ` · semana ${p.doneThisWeek}/${node.weeklyGoal}`}
                        </span>
                      </div>
                      <Progress
                        value={p.percent}
                        className="h-1.5"
                        style={{ ['--progress-color' as string]: node.color }}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>

        {staleProjects.length > 0 && (
          <div className="lg:col-span-2">
            <Card title="Projetos parados" icon={<ProjectsIcon />} link="/projetos">
              <div className="grid gap-x-8 md:grid-cols-2">
                {staleProjects.map(({ project, days }) => (
                  <a
                    key={project.id}
                    href={project.htmlUrl ?? `https://github.com/${project.repo}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/50"
                  >
                    <TriangleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="min-w-0 flex-1 truncate text-sm">{project.repo}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      sem commit há {days} dias
                    </span>
                  </a>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  )
}
