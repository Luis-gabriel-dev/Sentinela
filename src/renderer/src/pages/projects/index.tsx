import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import type { Project } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { GithubConnect } from '@renderer/components/github-connect'
import { ProjectsIcon } from '@renderer/components/icons'
import { EmptyState, PageHeader } from '@renderer/components/page-header'
import { projectHealth } from '@renderer/lib/projects'
import { useGithubStatus, useProjects, useSyncProjects, useTopics } from '@renderer/lib/queries'
import { AddProjectDialog } from './add-project-dialog'
import { ProjectCard } from './project-card'
import { ProjectDialog } from './project-dialog'

const AUTO_SYNC_AFTER_MS = 30 * 60_000

/** Parados primeiro (os que mais precisam de atenção), depois por último commit. */
const byAttention = (a: Project, b: Project): number => {
  const rank = (p: Project): number => {
    const h = projectHealth(p)
    return h.kind === 'stale' ? 0 : h.kind === 'active' ? 1 : 2
  }
  return rank(a) - rank(b) || (b.lastCommitAt?.getTime() ?? 0) - (a.lastCommitAt?.getTime() ?? 0)
}

export function ProjectsPage(): React.JSX.Element {
  const { data: projects = [], isLoading } = useProjects()
  const { data: topics = [] } = useTopics()
  const { data: status } = useGithubStatus()
  const sync = useSyncProjects()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const autoSynced = useRef(false)

  // O que está sendo atualizado sai da própria mutação: [] = todos, [id] = um.
  const syncingId: number | 'all' | null = sync.isPending ? (sync.variables?.[0] ?? 'all') : null

  const topicsById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics])
  const sorted = useMemo(() => projects.toSorted(byAttention), [projects])
  const staleCount = projects.filter((p) => projectHealth(p).kind === 'stale').length

  const runSync = (id?: number): void => sync.mutate(id === undefined ? [] : [id])

  // Ao abrir a página, atualiza se os dados tiverem mais de 30 minutos.
  const { mutate } = sync
  useEffect(() => {
    if (autoSynced.current || isLoading || projects.length === 0) return
    autoSynced.current = true
    const oldest = Math.min(...projects.map((p) => p.syncedAt?.getTime() ?? 0))
    if (Date.now() - oldest > AUTO_SYNC_AFTER_MS) mutate([])
  }, [isLoading, projects, mutate])

  return (
    <>
      <PageHeader
        title="Projetos"
        description={
          staleCount > 0
            ? `${staleCount} ${staleCount === 1 ? 'projeto parado' : 'projetos parados'} pedindo um commit.`
            : 'Seus repositórios do GitHub e o ritmo de cada um.'
        }
        actions={
          <>
            {projects.length > 0 && (
              <Button variant="outline" onClick={() => runSync()} disabled={syncingId !== null}>
                <RefreshCw className={syncingId === 'all' ? 'animate-spin' : undefined} /> Atualizar
              </Button>
            )}
            <Button onClick={() => setAdding(true)}>
              <Plus /> Adicionar projeto
            </Button>
          </>
        }
      />

      {status && !status.connected && (
        <section className="mb-6 rounded-xl border bg-card p-5">
          <h2 className="mb-3 font-medium">Conectar o GitHub</h2>
          <GithubConnect />
        </section>
      )}

      {!isLoading && projects.length === 0 ? (
        <EmptyState icon={<ProjectsIcon />} title="Nenhum projeto acompanhado ainda">
          Adicione seus repositórios para ver o último commit, a atividade das últimas semanas e
          receber um aviso quando um projeto ficar parado.
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sorted.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              topic={project.topicId !== null ? topicsById.get(project.topicId) : undefined}
              syncing={syncingId === 'all' || syncingId === project.id}
              onSync={() => runSync(project.id)}
              onEdit={() => setEditing(project)}
            />
          ))}
        </div>
      )}

      <AddProjectDialog open={adding} onOpenChange={setAdding} projects={projects} />
      <ProjectDialog
        project={editing && (projects.find((p) => p.id === editing.id) ?? null)}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </>
  )
}
