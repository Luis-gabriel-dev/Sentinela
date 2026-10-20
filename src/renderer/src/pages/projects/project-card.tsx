import {
  Archive,
  CircleAlert,
  CircleCheck,
  CircleDot,
  ExternalLink,
  GitCommitHorizontal,
  GitPullRequest,
  Lock,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Star,
  TriangleAlert
} from 'lucide-react'
import type { Project, Topic } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { LANGUAGE_COLORS, projectHealth, timeAgo } from '@renderer/lib/projects'
import { cn } from '@renderer/lib/utils'
import { ActivityBars } from './activity-bars'

/** Situação do projeto: ícone + texto (nunca só a cor). */
function HealthBadge({ project }: { project: Project }): React.JSX.Element {
  const health = projectHealth(project)
  const base = 'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium'
  switch (health.kind) {
    case 'active':
      return (
        <span
          className={cn(
            base,
            'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          )}
        >
          <CircleCheck className="size-3" /> Ativo
        </span>
      )
    case 'stale':
      return (
        <span
          className={cn(
            base,
            'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
          )}
        >
          <TriangleAlert className="size-3" /> Parado há {health.days} dias
        </span>
      )
    case 'archived':
      return (
        <span className={cn(base, 'text-muted-foreground')}>
          <Archive className="size-3" /> Arquivado
        </span>
      )
    case 'empty':
      return (
        <span className={cn(base, 'text-muted-foreground')}>
          <CircleDot className="size-3" /> Sem commits
        </span>
      )
  }
}

interface Props {
  project: Project
  topic?: Topic
  syncing: boolean
  onEdit: () => void
  onSync: () => void
}

export function ProjectCard({ project, topic, syncing, onEdit, onSync }: Props): React.JSX.Element {
  const [owner, name] = project.repo.split('/')
  const health = projectHealth(project)

  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-card p-4 transition',
        health.kind === 'stale' && 'border-amber-500/30'
      )}
    >
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <a
            href={project.htmlUrl ?? `https://github.com/${project.repo}`}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex max-w-full items-center gap-1.5 hover:underline"
          >
            <span className="truncate text-sm text-muted-foreground">{owner}/</span>
            <span className="truncate font-semibold">{name}</span>
            {project.isPrivate && <Lock className="size-3.5 shrink-0 text-muted-foreground" />}
          </a>
          {project.description && (
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
              {project.description}
            </p>
          )}
        </div>
        <HealthBadge project={project} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label="Opções do projeto">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onSync} disabled={syncing}>
              <RefreshCw /> Atualizar agora
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a
                href={project.htmlUrl ?? `https://github.com/${project.repo}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink /> Abrir no GitHub
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Configurar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {project.lastCommitAt && project.lastCommitMessage && (
        <a
          href={project.lastCommitUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm hover:bg-muted"
        >
          <GitCommitHorizontal className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{project.lastCommitMessage}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {timeAgo(project.lastCommitAt)}
          </span>
        </a>
      )}

      <ActivityBars weeks={project.weeklyCommits} />

      <footer className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {project.language && (
          <span className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ background: LANGUAGE_COLORS[project.language] ?? '#8b8b8b' }}
            />
            {project.language}
          </span>
        )}
        <span className="flex items-center gap-1" title="Estrelas">
          <Star className="size-3.5" /> {project.stars}
        </span>
        <span className="flex items-center gap-1" title="Issues abertas">
          <CircleDot className="size-3.5" /> {project.openIssues}
        </span>
        <span className="flex items-center gap-1" title="Pull requests abertos">
          <GitPullRequest className="size-3.5" /> {project.openPrs}
        </span>
        {topic && (
          <span className="flex items-center gap-1.5 rounded-full border px-2 py-0.5">
            <span className="size-2 rounded-full" style={{ background: topic.color }} />
            {topic.name}
          </span>
        )}
        <span className="ml-auto">
          {syncing
            ? 'Atualizando…'
            : project.syncedAt
              ? `Atualizado ${timeAgo(project.syncedAt)}`
              : ''}
        </span>
      </footer>

      {project.syncError && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <CircleAlert className="size-3.5 shrink-0" /> {project.syncError}
        </p>
      )}
    </article>
  )
}
