import { useState } from 'react'
import { ArchiveRestore, FolderOpen, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import type { BackupInfo } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import { api } from '@renderer/lib/api'
import { useAppInfo, useBackupStatus, useCreateBackup, usePickBackup } from '@renderer/lib/queries'

const dateTime = (d: Date): string =>
  d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

/** Onde estão os dados, backup manual, restauração e cópia automática semanal. */
export function BackupSettings(): React.JSX.Element {
  const { data: info } = useAppInfo()
  const { data: status } = useBackupStatus()
  const create = useCreateBackup()
  const pick = usePickBackup()
  const [chosen, setChosen] = useState<BackupInfo | null>(null)
  const [restoring, setRestoring] = useState(false)

  const restore = async (): Promise<void> => {
    if (!chosen) return
    setRestoring(true)
    try {
      await api.backup.restore(chosen.path)
      toast.success('Backup restaurado. O Sentinela está reiniciando...')
    } catch (error) {
      toast.error((error as Error).message)
      setRestoring(false)
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-2">
        <p className="text-muted-foreground">Tudo fica salvo localmente neste arquivo SQLite:</p>
        <code className="block rounded-md bg-muted px-3 py-2 font-mono text-xs break-all select-all">
          {info?.dbPath ?? '...'}
        </code>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={create.isPending}
          onClick={() =>
            create.mutate([], {
              onSuccess: (path) =>
                path &&
                toast.success('Backup salvo', {
                  description: path,
                  action: { label: 'Mostrar', onClick: () => void api.desktop.showInFolder(path) }
                })
            })
          }
        >
          {create.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          Fazer backup agora
        </Button>
        <Button
          variant="outline"
          disabled={pick.isPending}
          onClick={() => pick.mutate([], { onSuccess: (backup) => backup && setChosen(backup) })}
        >
          <ArchiveRestore /> Restaurar backup...
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        O backup é uma pasta com o banco, as imagens das anotações e as capas. Os arquivos dos
        livros não entram: ficam onde você os guardou.
      </p>

      {status && (
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          Cópia automática semanal do banco:{' '}
          {status.lastAuto ? `última em ${dateTime(status.lastAuto)}` : 'ainda nenhuma'} (guarda as
          4 mais recentes).
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => void api.backup.openAutoFolder()}
          >
            <FolderOpen className="size-3.5" /> Abrir pasta
          </Button>
        </p>
      )}

      <AlertDialog open={!!chosen} onOpenChange={(open) => !open && !restoring && setChosen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar este backup?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {chosen && (
                  <p>
                    Backup de {dateTime(chosen.createdAt)}: {chosen.counts.topics} temas,{' '}
                    {chosen.counts.notes} anotações, {chosen.counts.tasks} tarefas,{' '}
                    {chosen.counts.books} livros e {chosen.counts.conversations} conversas com a
                    mentora.
                  </p>
                )}
                <p>
                  Os dados atuais serão trocados por estes e o Sentinela vai reiniciar. Antes, uma
                  cópia dos dados atuais fica guardada na pasta das cópias automáticas.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={restoring}
              onClick={(e) => {
                e.preventDefault()
                void restore()
              }}
            >
              {restoring && <Loader2 className="animate-spin" />}
              Restaurar e reiniciar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
