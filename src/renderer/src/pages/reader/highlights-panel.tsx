import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { HighlightIcon } from '@renderer/components/icons'
import { HIGHLIGHT_COLORS } from '@shared/schemas'
import type { Book, BookHighlight } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import { HIGHLIGHT_STYLES } from '@renderer/lib/books'
import { useRemoveHighlight, useUpdateHighlight } from '@renderer/lib/queries'
import { cn } from '@renderer/lib/utils'

interface Props {
  book: Book
  highlights: BookHighlight[]
  onGoTo: (highlight: BookHighlight) => void
  onClose: () => void
}

const whereLabel = (book: Book, h: BookHighlight): string =>
  book.format === 'pdf' ? `Página ${Math.floor(h.sortKey)}` : `${Math.round(h.sortKey * 100)}%`

export function HighlightsPanel({ book, highlights, onGoTo, onClose }: Props): React.JSX.Element {
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l bg-card">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <HighlightIcon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Destaques</h2>
        <span className="text-xs text-muted-foreground">{highlights.length}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          onClick={onClose}
          aria-label="Fechar"
        >
          <X />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {highlights.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">
            Selecione um trecho do livro e escolha uma cor para destacar.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {highlights.map((h) => (
              <HighlightItem
                key={h.id}
                highlight={h}
                where={whereLabel(book, h)}
                onGoTo={() => onGoTo(h)}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

function HighlightItem({
  highlight,
  where,
  onGoTo
}: {
  highlight: BookHighlight
  where: string
  onGoTo: () => void
}): React.JSX.Element {
  const update = useUpdateHighlight()
  const remove = useRemoveHighlight()
  const [note, setNote] = useState(highlight.note ?? '')
  const [editing, setEditing] = useState(false)

  const saveNote = (): void => {
    setEditing(false)
    const value = note.trim() || null
    if (value !== highlight.note) update.mutate([highlight.id, { note: value }])
  }

  return (
    <div className="group rounded-lg border bg-background p-3">
      <button type="button" onClick={onGoTo} className="block w-full text-left">
        <p
          className="line-clamp-5 border-l-[3px] pl-2.5 text-sm leading-relaxed"
          style={{ borderColor: HIGHLIGHT_STYLES[highlight.color].solid }}
        >
          {highlight.text}
        </p>
      </button>

      {editing ? (
        <Textarea
          autoFocus
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          placeholder="Sua nota sobre o trecho..."
          className="mt-2 text-sm"
        />
      ) : highlight.note ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-2 block w-full rounded-md bg-muted px-2.5 py-1.5 text-left text-xs text-muted-foreground"
        >
          {highlight.note}
        </button>
      ) : null}

      <div className="mt-2 flex items-center gap-1">
        <span className="text-xs text-muted-foreground">{where}</span>
        <div className="ml-auto flex items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          {HIGHLIGHT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={HIGHLIGHT_STYLES[color].label}
              onClick={() => update.mutate([highlight.id, { color }])}
              className={cn(
                'size-3.5 rounded-full',
                color === highlight.color && 'ring-2 ring-ring ring-offset-1 ring-offset-background'
              )}
              style={{ background: HIGHLIGHT_STYLES[color].solid }}
            />
          ))}
          {!editing && !highlight.note && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="ml-1 rounded px-1.5 text-xs text-muted-foreground hover:bg-accent"
            >
              Nota
            </button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Excluir destaque"
            className="hover:text-destructive"
            onClick={() => remove.mutate([highlight.id])}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </div>
  )
}
