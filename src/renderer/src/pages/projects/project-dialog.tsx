import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { Project } from '@shared/types'
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
import { Label } from '@renderer/components/ui/label'
import { Textarea } from '@renderer/components/ui/textarea'
import { ConfirmDelete } from '@renderer/components/confirm-delete'
import { TopicSelect } from '@renderer/components/topic-select'
import { useRemoveProject, useUpdateProject } from '@renderer/lib/queries'

interface Props {
  project: Project | null
  onOpenChange: (open: boolean) => void
}

export function ProjectDialog({ project, onOpenChange }: Props): React.JSX.Element {
  return (
    <Dialog open={project !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {project && <ProjectForm key={project.id} project={project} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  )
}

function ProjectForm({
  project,
  onOpenChange
}: {
  project: Project
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const [topicId, setTopicId] = useState(project.topicId)
  const [staleDays, setStaleDays] = useState(String(project.staleDays))
  const [notes, setNotes] = useState(project.notes ?? '')
  const update = useUpdateProject()
  const remove = useRemoveProject()
  const days = Number(staleDays)
  const validDays = Number.isInteger(days) && days >= 1 && days <= 365

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    update.mutate([project.id, { topicId, staleDays: days, notes: notes.trim() || null }], {
      onSuccess: () => onOpenChange(false)
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{project.repo}</DialogTitle>
        <DialogDescription>Como o Sentinela acompanha este projeto.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label>Tema de estudo</Label>
        <TopicSelect value={topicId} onChange={setTopicId} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="stale-days">Lembrar quando ficar parado</Label>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">depois de</span>
          <Input
            id="stale-days"
            type="number"
            min={1}
            max={365}
            value={staleDays}
            onChange={(e) => setStaleDays(e.target.value)}
            className="h-8 w-20"
            aria-invalid={!validDays}
          />
          <span className="text-muted-foreground">dias sem commit</span>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="project-notes">Notas</Label>
        <Textarea
          id="project-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Próximos passos, ideias..."
        />
      </div>

      <DialogFooter className="sm:justify-between">
        <ConfirmDelete
          title="Parar de acompanhar?"
          description={`${project.repo} sai da sua lista de projetos. Nada muda no GitHub.`}
          onConfirm={() => remove.mutate([project.id], { onSuccess: () => onOpenChange(false) })}
        >
          <Button type="button" variant="ghost" className="text-destructive">
            <Trash2 /> Remover
          </Button>
        </ConfirmDelete>
        <Button type="submit" disabled={!validDays || update.isPending}>
          Salvar
        </Button>
      </DialogFooter>
    </form>
  )
}
