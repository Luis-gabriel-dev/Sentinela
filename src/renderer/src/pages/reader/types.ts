import type { HighlightColor } from '@shared/schemas'
import type { Book, BookHighlight } from '@shared/types'

/** Onde o leitor está: progresso 0–1, posição para retomar e um rótulo ("Página 3 de 120"). */
export interface ReaderPosition {
  progress: number
  location: string
  label: string
}

/** Texto selecionado pronto para virar destaque. */
export interface PendingSelection {
  text: string
  location: string
  sortKey: number
  /** Onde mostrar a barra de ações (coordenadas da janela). */
  anchor: { x: number; y: number }
}

export interface ReaderProps {
  book: Book
  highlights: BookHighlight[]
  onPosition: (position: ReaderPosition) => void
  onSelection: (selection: PendingSelection | null) => void
  /** O leitor registra aqui como navegar até um destaque. */
  navigationRef: { current: ((highlight: BookHighlight) => void) | null }
}

export type { HighlightColor }
