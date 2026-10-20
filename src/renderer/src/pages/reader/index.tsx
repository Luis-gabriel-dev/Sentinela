import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { AppWindow, ArrowLeft, FileQuestion } from 'lucide-react'
import { HighlightIcon } from '@renderer/components/icons'
import type { HighlightColor } from '@shared/schemas'
import type { BookHighlight } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { EmptyState } from '@renderer/components/page-header'
import { api } from '@renderer/lib/api'
import { useBook, useCreateHighlight, useHighlights } from '@renderer/lib/queries'
import { cn } from '@renderer/lib/utils'
import { EbookReader } from './ebook-reader'
import { HighlightsPanel } from './highlights-panel'
import { PdfReader } from './pdf-reader'
import { SelectionToolbar } from './selection-toolbar'
import type { PendingSelection, ReaderPosition } from './types'
import { useReadingProgress } from './use-reading-progress'
import './reader.css'

const PANEL_KEY = 'sentinela:highlights-panel'

const readPanelOpen = (): boolean => {
  try {
    return localStorage.getItem(PANEL_KEY) === '1'
  } catch {
    return false
  }
}

/** Leitor de livros. `standalone` = janela própria, sem o menu lateral do app. */
export function ReaderPage({ standalone = false }: { standalone?: boolean }): React.JSX.Element {
  const id = Number(useParams().bookId)
  const { data: book, isError } = useBook(id)
  const { data: highlights = [] } = useHighlights(id)
  const createHighlight = useCreateHighlight()
  const savePosition = useReadingProgress(id)
  const [label, setLabel] = useState('')
  const [selection, setSelection] = useState<PendingSelection | null>(null)
  const [panelOpen, setPanelOpen] = useState(readPanelOpen)
  const navigationRef = useRef<((h: BookHighlight) => void) | null>(null)

  useEffect(() => {
    if (!standalone || !book) return
    document.title = `${book.title} · Sentinela`
  }, [standalone, book])

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_KEY, panelOpen ? '1' : '0')
    } catch {
      // ignora
    }
  }, [panelOpen])

  const onPosition = useCallback(
    (position: ReaderPosition) => {
      setLabel(position.label)
      savePosition(position)
    },
    [savePosition]
  )

  const highlight = (color: HighlightColor): void => {
    if (!selection) return
    createHighlight.mutate([
      {
        bookId: id,
        location: selection.location,
        sortKey: selection.sortKey,
        text: selection.text,
        color
      }
    ])
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }

  if (isError || (book && !book.fileExists)) {
    return (
      <div className="p-8">
        <EmptyState icon={<FileQuestion />} title="Não foi possível abrir este livro">
          {book
            ? 'O arquivo não está mais no caminho salvo. Use "Localizar arquivo" nos detalhes do livro.'
            : 'Ele pode ter sido removido da biblioteca.'}
          {!standalone && (
            <Link to="/biblioteca" className="mt-3 block text-primary underline">
              Voltar para a biblioteca
            </Link>
          )}
        </EmptyState>
      </div>
    )
  }
  if (!book) return <div className="h-full" />

  const Reader = book.format === 'pdf' ? PdfReader : EbookReader

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        {!standalone && (
          <Button variant="ghost" size="icon-sm" asChild aria-label="Voltar para a biblioteca">
            <Link to="/biblioteca">
              <ArrowLeft />
            </Link>
          </Button>
        )}
        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate text-sm font-semibold">{book.title}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {[book.author, label].filter(Boolean).join(' · ')}
          </p>
        </div>

        <Button
          variant={panelOpen ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setPanelOpen((open) => !open)}
        >
          <HighlightIcon className="size-4" /> Destaques
          {highlights.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">{highlights.length}</span>
          )}
        </Button>
        {!standalone && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Abrir em janela separada"
                onClick={() => api.desktop.openReaderWindow(book.id)}
              >
                <AppWindow />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Abrir em janela separada</TooltipContent>
          </Tooltip>
        )}
      </header>

      <div className={cn('flex min-h-0 flex-1')}>
        <Reader
          key={book.id}
          book={book}
          highlights={highlights}
          onPosition={onPosition}
          onSelection={setSelection}
          navigationRef={navigationRef}
        />
        {panelOpen && (
          <HighlightsPanel
            book={book}
            highlights={highlights}
            onGoTo={(h) => navigationRef.current?.(h)}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </div>

      {selection && <SelectionToolbar selection={selection} onHighlight={highlight} />}
    </div>
  )
}
