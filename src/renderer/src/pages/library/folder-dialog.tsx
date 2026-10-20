import { useState } from 'react'
import type { LibraryFolder } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { ColorPicker } from '@renderer/components/color-picker'
import { COLOR_PRESETS } from '@renderer/lib/format'
import { useCreateFolder, useFolders, useUpdateFolder } from '@renderer/lib/queries'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  folder?: LibraryFolder
}

export function FolderDialog(props: Props): React.JSX.Element {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {props.open && <FolderForm key={props.folder?.id ?? 'new'} {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function FolderForm({ folder, onOpenChange }: Props): React.JSX.Element {
  const { data: folders = [] } = useFolders()
  const [name, setName] = useState(folder?.name ?? '')
  const [color, setColor] = useState(
    folder?.color ?? COLOR_PRESETS[folders.length % COLOR_PRESETS.length]
  )
  const create = useCreateFolder()
  const update = useUpdateFolder()

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const close = { onSuccess: () => onOpenChange(false) }
    if (folder) update.mutate([folder.id, { name, color }], close)
    else create.mutate([{ name, color }], close)
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{folder ? 'Editar pasta' : 'Nova pasta'}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-[1fr_auto] gap-4">
        <div className="grid gap-2">
          <Label htmlFor="folder-name">Nome</Label>
          <Input
            id="folder-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Cybersegurança"
            autoFocus
          />
        </div>
        <div className="grid gap-2">
          <Label>Cor</Label>
          <ColorPicker value={color} onChange={(c) => c && setColor(c)} />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={!name.trim() || create.isPending || update.isPending}>
          Salvar
        </Button>
      </DialogFooter>
    </form>
  )
}
