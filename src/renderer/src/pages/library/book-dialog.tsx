import { useState } from 'react'
import { FileSearch, FolderOpen, TriangleAlert, Trash2 } from 'lucide-react'
import type { Book } from '@shared/types'
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
import { ConfirmDelete } from '@renderer/components/confirm-delete'
import { TopicSelect } from '@renderer/components/topic-select'
import { api } from '@renderer/lib/api'
import { FORMAT_LABEL } from '@renderer/lib/books'
import { formatBytes } from '@renderer/lib/format'
import { useRelocateBook, useRemoveBook, useUpdateBook } from '@renderer/lib/queries'
import { FolderSelect } from './folder-select'

interface Props {
  book: Book | null
  onOpenChange: (open: boolean) => void
}

export function BookDialog({ book, onOpenChange }: Props): React.JSX.Element {
  return (
    <Dialog open={book !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {book && <BookForm key={book.id} book={book} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  )
}

function BookForm({
  book,
  onOpenChange
}: { book: Book } & Pick<Props, 'onOpenChange'>): React.JSX.Element {
  const [title, setTitle] = useState(book.title)
  const [author, setAuthor] = useState(book.author ?? '')
  const [folderId, setFolderId] = useState(book.folderId)
  const [topicId, setTopicId] = useState(book.topicId)
  const update = useUpdateBook()
  const relocate = useRelocateBook()
  const remove = useRemoveBook()

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    update.mutate([book.id, { title, author: author.trim() || null, folderId, topicId }], {
      onSuccess: () => onOpenChange(false)
    })
  }

  const locate = async (): Promise<void> => {
    const [path] = await api.desktop.pickBookFiles(false)
    if (path) relocate.mutate([book.id, path])
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Detalhes do livro</DialogTitle>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor="book-title">Título</Label>
        <Input id="book-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="book-author">Autor</Label>
        <Input id="book-author" value={author} onChange={(e) => setAuthor(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>Pasta</Label>
          <FolderSelect value={folderId} onChange={setFolderId} />
        </div>
        <div className="grid gap-2">
          <Label>Tema de estudo</Label>
          <TopicSelect value={topicId} onChange={setTopicId} />
        </div>
      </div>

      <div className="space-y-2 rounded-lg border p-3 text-sm">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {FORMAT_LABEL[book.format]} · {formatBytes(book.fileSize)}
            {book.pageCount ? ` · ${book.pageCount} páginas` : ''}
          </span>
        </div>
        <code className="block font-mono text-xs break-all text-muted-foreground">
          {book.filePath}
        </code>
        {!book.fileExists && (
          <p className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
            <TriangleAlert className="size-3.5" /> O arquivo não está mais neste caminho.
          </p>
        )}
        <div className="flex gap-2 pt-1">
          {book.fileExists && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => api.desktop.showInFolder(book.filePath)}
            >
              <FolderOpen /> Mostrar na pasta
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={locate}>
            <FileSearch /> {book.fileExists ? 'Trocar arquivo' : 'Localizar arquivo'}
          </Button>
        </div>
      </div>

      <DialogFooter className="sm:justify-between">
        <ConfirmDelete
          title="Remover da biblioteca?"
          description={`"${book.title}" sai da biblioteca junto com o progresso e os destaques. O arquivo no seu computador não é apagado.`}
          onConfirm={() => remove.mutate([book.id], { onSuccess: () => onOpenChange(false) })}
        >
          <Button type="button" variant="ghost" className="text-destructive">
            <Trash2 /> Remover
          </Button>
        </ConfirmDelete>
        <Button type="submit" disabled={!title.trim() || update.isPending}>
          Salvar
        </Button>
      </DialogFooter>
    </form>
  )
}
