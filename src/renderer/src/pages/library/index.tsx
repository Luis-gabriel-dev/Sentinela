import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BookPlus, FolderPlus, Pencil, Search, Trash2 } from 'lucide-react'
import { LibraryIcon, UploadBookIcon } from '@renderer/components/icons'
import { toast } from 'sonner'
import type { Book, LibraryFolder } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { ConfirmDelete } from '@renderer/components/confirm-delete'
import { EmptyState, PageHeader } from '@renderer/components/page-header'
import { api } from '@renderer/lib/api'
import { extractBookMetadata } from '@renderer/lib/books'
import { keys, useAddBooks, useBooks, useFolders, useRemoveFolder } from '@renderer/lib/queries'
import { cn } from '@renderer/lib/utils'
import { BookCard, BookCover } from './book-card'
import { BookDialog } from './book-dialog'
import { FolderDialog } from './folder-dialog'

type FolderFilter = 'all' | 'none' | number
type Sort = 'recent' | 'title' | 'added'

const SORTS: Record<Sort, { label: string; compare: (a: Book, b: Book) => number }> = {
  recent: {
    label: 'Lidos recentemente',
    compare: (a, b) =>
      (b.lastOpenedAt?.getTime() ?? 0) - (a.lastOpenedAt?.getTime() ?? 0) ||
      a.title.localeCompare(b.title)
  },
  title: { label: 'Título', compare: (a, b) => a.title.localeCompare(b.title) },
  added: { label: 'Adicionados', compare: (a, b) => b.createdAt.getTime() - a.createdAt.getTime() }
}

/** Lê capa e metadados dos livros novos, um de cada vez, em segundo plano. */
function useMetadataQueue(books: Book[]): void {
  const client = useQueryClient()
  const running = useRef(false)
  const pending = books.filter((b) => !b.metadataReady && b.fileExists)

  useEffect(() => {
    if (running.current || pending.length === 0) return
    running.current = true
    void (async () => {
      for (const book of pending) {
        // extractBookMetadata já trata falhas de leitura; isto cobre o livro ter sido removido.
        await extractBookMetadata(book).catch(() => undefined)
        await client.invalidateQueries({ queryKey: keys.books })
      }
      running.current = false
    })()
  }, [pending, client])
}

export function LibraryPage(): React.JSX.Element {
  const { data: books = [], isLoading } = useBooks()
  const { data: folders = [] } = useFolders()
  const addBooks = useAddBooks()
  const removeFolder = useRemoveFolder()
  const [filter, setFilter] = useState<FolderFilter>('all')
  const [sort, setSort] = useState<Sort>('recent')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Book | null>(null)
  const [folderDialog, setFolderDialog] = useState<{ folder?: LibraryFolder } | null>(null)
  const [dragging, setDragging] = useState(false)

  useMetadataQueue(books)

  const foldersById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders])
  const activeFolder = typeof filter === 'number' ? foldersById.get(filter) : undefined

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase()
    return books
      .filter((b) =>
        filter === 'all' ? true : filter === 'none' ? b.folderId === null : b.folderId === filter
      )
      .filter(
        (b) =>
          !q ||
          b.title.toLocaleLowerCase().includes(q) ||
          (b.author ?? '').toLocaleLowerCase().includes(q)
      )
      .toSorted(SORTS[sort].compare)
  }, [books, filter, query, sort])

  const continueReading = useMemo(
    () =>
      books
        .filter((b) => b.lastOpenedAt && b.progress < 0.99 && b.fileExists)
        .toSorted(SORTS.recent.compare)
        .slice(0, 4),
    [books]
  )

  const folderForNew = typeof filter === 'number' ? filter : null

  const add = (paths: string[]): void => {
    if (paths.length === 0) return
    addBooks.mutate([paths, folderForNew], {
      onSuccess: ({ added, skipped }) => {
        if (added.length) toast.success(`${added.length} livro(s) adicionado(s)`)
        if (skipped.length) {
          toast.warning(
            `${skipped.length} arquivo(s) ignorado(s): já estão na biblioteca ou o formato não é suportado`
          )
        }
      }
    })
  }

  const pickFiles = async (): Promise<void> => add(await api.desktop.pickBookFiles(true))

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragging(false)
    add([...e.dataTransfer.files].map((f) => window.sentinela.pathForFile(f)).filter(Boolean))
  }

  const countIn = (id: FolderFilter): number =>
    id === 'all'
      ? books.length
      : books.filter((b) => (id === 'none' ? b.folderId === null : b.folderId === id)).length

  return (
    <div
      className="relative min-h-[calc(100vh-4rem)]"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <PageHeader
        title="Biblioteca"
        description="PDF, EPUB, MOBI e AZW3. Os arquivos continuam onde estão no seu computador."
        actions={
          <>
            <Button variant="outline" onClick={() => setFolderDialog({})}>
              <FolderPlus /> Nova pasta
            </Button>
            <Button onClick={pickFiles}>
              <BookPlus /> Adicionar livros
            </Button>
          </>
        }
      />

      {continueReading.length > 0 && filter === 'all' && !query && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Continuar lendo</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {continueReading.map((book) => (
              <ContinueCard key={book.id} book={book} folder={foldersById.get(book.folderId!)} />
            ))}
          </div>
        </section>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <FolderChip
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          label="Todos"
          count={countIn('all')}
        />
        {folders.map((f) => (
          <FolderChip
            key={f.id}
            active={filter === f.id}
            onClick={() => setFilter(f.id)}
            label={f.name}
            color={f.color}
            count={countIn(f.id)}
          />
        ))}
        {books.some((b) => b.folderId === null) && folders.length > 0 && (
          <FolderChip
            active={filter === 'none'}
            onClick={() => setFilter('none')}
            label="Sem pasta"
            count={countIn('none')}
          />
        )}

        <div className="ml-auto flex items-center gap-2">
          {activeFolder && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Editar pasta"
                onClick={() => setFolderDialog({ folder: activeFolder })}
              >
                <Pencil />
              </Button>
              <ConfirmDelete
                title={`Excluir a pasta "${activeFolder.name}"?`}
                description="Os livros dela continuam na biblioteca, só ficam sem pasta."
                onConfirm={() =>
                  removeFolder.mutate([activeFolder.id], { onSuccess: () => setFilter('all') })
                }
              >
                <Button variant="ghost" size="icon-sm" aria-label="Excluir pasta">
                  <Trash2 />
                </Button>
              </ConfirmDelete>
            </>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar título ou autor"
              className="h-8 w-56 pl-8"
            />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger size="sm" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SORTS).map(([value, { label }]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!isLoading && visible.length === 0 ? (
        <EmptyState
          icon={<LibraryIcon />}
          title={books.length === 0 ? 'Sua biblioteca está vazia' : 'Nenhum livro aqui'}
        >
          {books.length === 0
            ? 'Clique em "Adicionar livros" ou arraste arquivos PDF, EPUB ou MOBI para esta tela.'
            : 'Tente outra pasta ou busca.'}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-7">
          {visible.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              folder={book.folderId !== null ? foldersById.get(book.folderId) : undefined}
              onEdit={() => setEditing(book)}
            />
          ))}
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 left-60 z-40 grid place-items-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary px-16 py-12 text-primary">
            <UploadBookIcon className="size-10" />
            <p className="text-lg font-medium">
              Solte para adicionar{activeFolder ? ` em ${activeFolder.name}` : ''}
            </p>
          </div>
        </div>
      )}

      <BookDialog
        book={editing && (books.find((b) => b.id === editing.id) ?? null)}
        onOpenChange={(open) => !open && setEditing(null)}
      />
      <FolderDialog
        open={folderDialog !== null}
        onOpenChange={(open) => !open && setFolderDialog(null)}
        folder={folderDialog?.folder}
      />
    </div>
  )
}

function FolderChip({
  active,
  onClick,
  label,
  count,
  color
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  color?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition hover:bg-accent',
        active && 'border-primary bg-primary/10 text-foreground'
      )}
    >
      {color && <span className="size-2.5 rounded-sm" style={{ background: color }} />}
      {label}
      <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
    </button>
  )
}

function ContinueCard({ book, folder }: { book: Book; folder?: LibraryFolder }): React.JSX.Element {
  const percent = Math.round(book.progress * 100)
  return (
    <a
      href={`#/biblioteca/${book.id}`}
      className="flex gap-3 rounded-xl border bg-card p-3 transition hover:border-primary/50"
    >
      <div className="h-24 w-16 shrink-0 overflow-hidden rounded-md border">
        <BookCover book={book} folder={folder} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="line-clamp-2 text-sm font-medium">{book.title}</p>
        {book.author && <p className="truncate text-xs text-muted-foreground">{book.author}</p>}
        <div className="mt-auto flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full bg-primary" style={{ width: `${percent}%` }} />
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">{percent}%</span>
        </div>
      </div>
    </a>
  )
}
