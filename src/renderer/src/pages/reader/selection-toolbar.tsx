import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { HIGHLIGHT_COLORS, type HighlightColor } from '@shared/schemas'
import { HIGHLIGHT_STYLES } from '@renderer/lib/books'
import type { PendingSelection } from './types'

interface Props {
  selection: PendingSelection
  onHighlight: (color: HighlightColor) => void
}

/** Barra que aparece sobre o texto selecionado: cores de destaque e copiar. */
export function SelectionToolbar({ selection, onHighlight }: Props): React.JSX.Element {
  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(selection.text)
    toast.success('Texto copiado')
  }

  return (
    <div
      className="fixed z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-popover p-1 shadow-lg"
      style={{ left: selection.anchor.x, top: selection.anchor.y + 8 }}
      // não deixa o clique na barra desfazer a seleção do texto
      onMouseDown={(e) => e.preventDefault()}
    >
      {HIGHLIGHT_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          title={`Destacar em ${HIGHLIGHT_STYLES[color].label.toLowerCase()}`}
          onClick={() => onHighlight(color)}
          className="size-6 rounded-full ring-offset-2 ring-offset-popover transition hover:scale-110 hover:ring-2 hover:ring-ring"
          style={{ background: HIGHLIGHT_STYLES[color].solid }}
        />
      ))}
      <span className="mx-1 h-5 w-px bg-border" />
      <button
        type="button"
        onClick={copy}
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs hover:bg-accent"
      >
        <Copy className="size-3.5" /> Copiar
      </button>
    </div>
  )
}
