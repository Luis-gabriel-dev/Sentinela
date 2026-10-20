import { useMemo, useState } from 'react'
import { Check, Loader2, Lock, Plus, Search } from 'lucide-react'
import type { Project } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { timeAgo } from '@renderer/lib/projects'
import { useAddProject, useGithubRepos, useGithubStatus } from '@renderer/lib/queries'
import { cn } from '@renderer/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: Project[]
}

export function AddProjectDialog({ open, onOpenChange, projects }: Props): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {open && <AddProjectForm projects={projects} />}
      </DialogContent>
    </Dialog>
  )
}

function AddProjectForm({ projects }: { projects: Project[] }): React.JSX.Element {
  const { data: status } = useGithubStatus()
  const connected = status?.connected === true
  const { data: repos = [], isLoading, error } = useGithubRepos(connected)
  const add = useAddProject()
  const [address, setAddress] = useState('')
  const [filter, setFilter] = useState('')
  const [adding, setAdding] = useState<string | null>(null)

  const tracked = useMemo(() => new Set(projects.map((p) => p.repo.toLowerCase())), [projects])
  const visible = repos.filter((r) =>
    r.fullName.toLowerCase().includes(filter.trim().toLowerCase())
  )

  const addRepo = (repo: string, after?: () => void): void => {
    setAdding(repo)
    add.mutate([repo], {
      onSuccess: () => after?.(),
      onSettled: () => setAdding(null)
    })
  }

  return (
    <div className="grid gap-5">
      <DialogHeader>
        <DialogTitle>Adicionar projeto</DialogTitle>
        <DialogDescription>
          Acompanhe commits e atividade dos seus repositórios do GitHub.
        </DialogDescription>
      </DialogHeader>

      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          addRepo(address, () => setAddress(''))
        }}
      >
        <Label htmlFor="repo-address">Por endereço</Label>
        <div className="flex gap-2">
          <Input
            id="repo-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="dono/repositorio ou https://github.com/dono/repositorio"
          />
          <Button type="submit" disabled={!address.trim() || adding !== null}>
            {adding === address ? <Loader2 className="animate-spin" /> : <Plus />} Adicionar
          </Button>
        </div>
      </form>

      {connected ? (
        <div className="grid gap-2">
          <Label>Seus repositórios</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrar"
              className="h-8 pl-8"
            />
          </div>
          <div className="max-h-80 overflow-y-auto rounded-lg border">
            {isLoading && (
              <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Carregando repositórios...
              </p>
            )}
            {error && <p className="p-4 text-sm text-destructive">{error.message}</p>}
            {!isLoading && !error && visible.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">Nenhum repositório encontrado.</p>
            )}
            {visible.map((repo) => {
              const isTracked = tracked.has(repo.fullName.toLowerCase())
              return (
                <div
                  key={repo.fullName}
                  className="flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {repo.fullName}
                      {repo.isPrivate && <Lock className="size-3 text-muted-foreground" />}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[repo.language, repo.pushedAt && `push ${timeAgo(repo.pushedAt)}`]
                        .filter(Boolean)
                        .join(' · ') || repo.description}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={isTracked ? 'ghost' : 'outline'}
                    disabled={isTracked || adding !== null}
                    onClick={() => addRepo(repo.fullName)}
                    className={cn(isTracked && 'text-emerald-600 dark:text-emerald-400')}
                  >
                    {isTracked ? (
                      <>
                        <Check /> Acompanhando
                      </>
                    ) : adding === repo.fullName ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <>
                        <Plus /> Acompanhar
                      </>
                    )}
                  </Button>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">
          Conecte um token do GitHub (na página Projetos ou em Configurações) para escolher entre os
          seus repositórios, inclusive os privados.
        </p>
      )}
    </div>
  )
}
