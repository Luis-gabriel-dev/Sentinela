import { useState } from 'react'
import { useNavigate } from 'react-router'
import { AppWindow, FolderOpen, MoreHorizontal, Pencil, TriangleAlert } from 'lucide-react'
import { coverUrl } from '@shared/api'
import type { Book, LibraryFolder } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { api } from '@renderer/lib/api'
import { FORMAT_LABEL } from '@renderer/lib/books'
import { DEFAULT_COLOR } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'

/** Capa do livro, ou uma capa gerada com título e cor quando o arquivo não tem. */
export function BookCover({
  book,
  folder,
  className
}: {
  book: Book
  folder?: LibraryFolder
  className?: string
}): React.JSX.Element {
  const [broken, setBroken] = useState(false)
  if (book.coverVersion > 0 && !broken) {
    return (
      <img
        src={coverUrl(book)}
        alt=""
        onError={() => setBroken(true)}
        className={cn('size-full object-cover', className)}
      />
    )
  }
  const color = folder?.color ?? DEFAULT_COLOR
  return (
    <div
      className={cn('flex size-full flex-col justify-between p-3 text-white', className)}
      style={{
        background: `linear-gradient(150deg, ${color}, color-mix(in oklch, ${color} 45%, black))`
      }}
    >
      <span className="line-clamp-5 text-sm leading-snug font-semibold">{book.title}</span>
      <span className="text-[10px] font-medium tracking-wider opacity-80">
        {FORMAT_LABEL[book.format]}
      </span>
    </div>
  )
}

interface Props {
  book: Book
  folder?: LibraryFolder
  onEdit: () => void
}

export function BookCard({ book, folder, onEdit }: Props): React.JSX.Element {
  const navigate = useNavigate()
  const percent = Math.round(book.progress * 100)
  const open = (): void => {
    if (book.fileExists) navigate(`/biblioteca/${book.id}`)
    else onEdit()
  }

  return (
    <div className="group relative flex flex-col gap-2">
      <button
        type="button"
        onClick={open}
        className="relative aspect-[2/3] overflow-hidden rounded-lg border bg-muted shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <BookCover book={book} folder={folder} className={cn(!book.fileExists && 'opacity-40')} />
        {!book.fileExists && (
          <span className="absolute inset-x-2 bottom-2 flex items-center gap-1.5 rounded-md bg-background/90 px-2 py-1 text-xs text-amber-600 dark:text-amber-400">
            <TriangleAlert className="size-3.5 shrink-0" /> Arquivo não encontrado
          </span>
        )}
        {book.progress > 0 && book.fileExists && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-black/30">
            <span
              className="block h-full bg-primary"
              style={{ width: `${Math.max(2, percent)}%` }}
            />
          </span>
        )}
      </button>

      <div className="flex items-start gap-1">
        <button type="button" onClick={open} className="min-w-0 flex-1 text-left">
          <p className="line-clamp-2 text-sm leading-snug font-medium">{book.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {book.author ?? FORMAT_LABEL[book.format]}
            {percent > 0 && ` · ${percent}%`}
          </p>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Opções do livro"
              className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={!book.fileExists}
              onSelect={() => api.desktop.openReaderWindow(book.id)}
            >
              <AppWindow /> Abrir em janela separada
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!book.fileExists}
              onSelect={() => api.desktop.showInFolder(book.filePath)}
            >
              <FolderOpen /> Mostrar na pasta
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Detalhes e pasta
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
