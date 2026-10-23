import { useEffect, useRef, useState } from 'react'
import type { RelocateDetail, TocItem, View } from 'foliate-js/view.js'
import {
  AArrowDown,
  AArrowUp,
  ChevronLeft,
  ChevronRight,
  Columns2,
  List,
  Loader2,
  ScrollText
} from 'lucide-react'
import type { BookHighlight } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { fetchBookFile, HIGHLIGHT_STYLES } from '@renderer/lib/books'
import { useTheme } from '@renderer/lib/theme'
import type { ReaderProps } from './types'

type Flow = 'paginated' | 'scrolled'

const PREFS_KEY = 'sentinela:ebook-prefs'

function readPrefs(): { fontSize: number; flow: Flow } {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}')
    return { fontSize: saved.fontSize ?? 100, flow: saved.flow ?? 'paginated' }
  } catch {
    return { fontSize: 100, flow: 'paginated' }
  }
}

/** CSS injetado no livro: cores do tema do app e tamanho da fonte. */
const bookCss = (dark: boolean, fontSize: number): string => `
  html { color-scheme: ${dark ? 'dark' : 'light'}; font-size: ${fontSize}% !important; }
  body { color: ${dark ? '#e4e4e7' : '#1f1f23'} !important; background: transparent !important; }
  p, li, blockquote, dd { line-height: 1.6; text-align: start; hyphens: auto; }
  a:link, a:visited { color: ${dark ? '#fdba74' : '#c2410c'}; }
  pre { white-space: pre-wrap !important; }
  img, svg { max-width: 100%; height: auto; }
  ${dark ? 'img { filter: brightness(.9); }' : ''}
`

/** Setas e Page Up/Down viram a página (dentro e fora do iframe do livro). */
function turnPage(view: View | null, e: KeyboardEvent): void {
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') void view?.goLeft()
  if (e.key === 'ArrowRight' || e.key === 'PageDown') void view?.goRight()
}

function flattenToc(items?: TocItem[] | null, depth = 0): (TocItem & { depth: number })[] {
  return (items ?? []).flatMap((item) => [
    { ...item, depth },
    ...flattenToc(item.subitems, depth + 1)
  ])
}

export function EbookReader({
  book,
  startLocation,
  highlights,
  onPosition,
  onSelection,
  navigationRef
}: ReaderProps): React.JSX.Element {
  const { resolved } = useTheme()
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<View | null>(null)
  const drawn = useRef(new Map<string, string>())
  const highlightsRef = useRef(highlights)
  const [prefs, setPrefs] = useState(readPrefs)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toc, setToc] = useState<(TocItem & { depth: number })[]>([])
  const [position, setPosition] = useState<RelocateDetail | null>(null)
  const callbacks = useRef({ onPosition, onSelection })

  useEffect(() => {
    callbacks.current = { onPosition, onSelection }
  }, [onPosition, onSelection])

  // Abre o livro.
  useEffect(() => {
    let cancelled = false
    const host = hostRef.current!
    let view: View | null = null

    void (async () => {
      try {
        const file = await fetchBookFile(book)
        const { Overlayer } = await import('foliate-js/overlayer.js')
        await import('foliate-js/view.js')
        if (cancelled) return
        view = document.createElement('foliate-view') as View
        view.style.cssText = 'display:block;width:100%;height:100%'
        host.append(view)
        await view.open(file)
        if (cancelled) return
        viewRef.current = view
        setToc(flattenToc(view.book.toc))

        view.addEventListener('relocate', ((e: CustomEvent<RelocateDetail>) => {
          const detail = e.detail
          setPosition(detail)
          callbacks.current.onSelection(null)
          callbacks.current.onPosition({
            progress: detail.fraction ?? 0,
            location: detail.cfi,
            label: detail.tocItem?.label?.trim() || `${Math.round((detail.fraction ?? 0) * 100)}%`
          })
        }) as EventListener)

        // Destaques: o foliate pede para desenhar cada um quando a seção é renderizada.
        view.addEventListener('create-overlay', () => {
          for (const h of highlightsRef.current) {
            void view!.addAnnotation({ value: h.location, color: h.color })
          }
        })
        view.addEventListener('draw-annotation', ((
          e: CustomEvent<{ draw: (f: unknown, o: unknown) => void; annotation: { color: string } }>
        ) => {
          const color = HIGHLIGHT_STYLES[e.detail.annotation.color as BookHighlight['color']]
          e.detail.draw(Overlayer.highlight, { color: color?.solid ?? '#facc15' })
        }) as EventListener)

        // Seleção de texto dentro do iframe do livro.
        view.addEventListener('load', ((e: CustomEvent<{ doc: Document; index: number }>) => {
          const { doc, index } = e.detail
          doc.addEventListener('pointerup', () => {
            const selection = doc.getSelection()
            if (!selection || selection.isCollapsed || !selection.toString().trim()) {
              callbacks.current.onSelection(null)
              return
            }
            const range = selection.getRangeAt(0)
            const frame = doc.defaultView?.frameElement?.getBoundingClientRect()
            const rect = range.getBoundingClientRect()
            callbacks.current.onSelection({
              text: selection.toString().replace(/\s+/g, ' ').trim(),
              location: view!.getCFI(index, range),
              sortKey: view!.lastLocation?.fraction ?? 0,
              anchor: {
                x: (frame?.left ?? 0) + rect.left + rect.width / 2,
                y: (frame?.top ?? 0) + rect.bottom
              }
            })
          })
          doc.addEventListener('keydown', (ev) => turnPage(viewRef.current, ev))
        }) as EventListener)

        view.renderer.setAttribute('flow', prefs.flow)
        view.renderer.setAttribute('max-inline-size', '720px')
        view.renderer.setAttribute('gap', '6%')
        view.renderer.setStyles?.(bookCss(resolved === 'dark', prefs.fontSize))
        // "section:<índice>" vira o número da seção, que o foliate aceita como destino.
        const location = startLocation?.startsWith('section:')
          ? Number(startLocation.slice('section:'.length))
          : (startLocation ?? book.location)
        await view.init({ lastLocation: location, showTextStart: location === null })
        if (!cancelled) setReady(true)
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'formato não suportado ou protegido')
      }
    })()

    return () => {
      cancelled = true
      viewRef.current = null
      drawn.current.clear()
      try {
        view?.close()
      } catch {
        // Fechado enquanto ainda abria: o paginador do foliate não terminou de montar.
      }
      view?.remove()
    }
    // book.id: o leitor é recriado só ao trocar de livro
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id])

  // Tema e fonte mudam sem reabrir o livro.
  useEffect(() => {
    viewRef.current?.renderer.setStyles?.(bookCss(resolved === 'dark', prefs.fontSize))
    viewRef.current?.renderer.setAttribute('flow', prefs.flow)
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      // ignora
    }
  }, [resolved, prefs])

  // Sincroniza destaques novos, removidos ou com cor trocada.
  useEffect(() => {
    highlightsRef.current = highlights
    const view = viewRef.current
    if (!view || !ready) return
    const current = new Map(highlights.map((h) => [h.location, h.color]))
    for (const [value] of drawn.current) {
      if (!current.has(value)) void view.deleteAnnotation({ value })
    }
    for (const [value, color] of current) {
      if (drawn.current.get(value) !== color) void view.addAnnotation({ value, color })
    }
    drawn.current = current
  }, [highlights, ready])

  useEffect(() => {
    navigationRef.current = (h: BookHighlight) => void viewRef.current?.goTo(h.location)
    return () => {
      navigationRef.current = null
    }
  }, [navigationRef])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea')) return
      turnPage(viewRef.current, e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const percent = Math.round((position?.fraction ?? 0) * 100)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b bg-card/50 px-3 py-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={toc.length === 0}>
              <List /> Sumário
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[60vh] w-80 overflow-y-auto">
            {toc.map((item, i) => (
              <DropdownMenuItem
                key={`${item.href}-${i}`}
                onSelect={() => void viewRef.current?.goTo(item.href)}
                style={{ paddingLeft: 8 + item.depth * 14 }}
                className={
                  position?.tocItem?.href === item.href ? 'font-medium text-primary' : undefined
                }
              >
                <span className="truncate">{item.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="mx-auto truncate px-4 text-xs text-muted-foreground">
          {position?.tocItem?.label?.trim() ?? ''}
        </span>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Modo de leitura"
              onClick={() =>
                setPrefs((p) => ({ ...p, flow: p.flow === 'paginated' ? 'scrolled' : 'paginated' }))
              }
            >
              {prefs.flow === 'paginated' ? <ScrollText /> : <Columns2 />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {prefs.flow === 'paginated' ? 'Ler rolando' : 'Ler em páginas'}
          </TooltipContent>
        </Tooltip>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Diminuir fonte"
          onClick={() => setPrefs((p) => ({ ...p, fontSize: Math.max(70, p.fontSize - 10) }))}
        >
          <AArrowDown />
        </Button>
        <span className="w-10 text-center text-xs text-muted-foreground tabular-nums">
          {prefs.fontSize}%
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Aumentar fonte"
          onClick={() => setPrefs((p) => ({ ...p, fontSize: Math.min(200, p.fontSize + 10) }))}
        >
          <AArrowUp />
        </Button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-stretch">
        <button
          type="button"
          aria-label="Anterior"
          onClick={() => void viewRef.current?.goLeft()}
          className="grid w-12 shrink-0 place-items-center text-muted-foreground hover:bg-accent/40 hover:text-foreground"
        >
          <ChevronLeft className="size-5" />
        </button>
        <div ref={hostRef} className="min-w-0 flex-1" />
        <button
          type="button"
          aria-label="Próxima"
          onClick={() => void viewRef.current?.goRight()}
          className="grid w-12 shrink-0 place-items-center text-muted-foreground hover:bg-accent/40 hover:text-foreground"
        >
          <ChevronRight className="size-5" />
        </button>

        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center bg-background p-8 text-center text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground">Não foi possível abrir este livro.</p>
              <p className="mt-1">
                {error}. Livros comprados com DRM (Kindle, por exemplo) não podem ser abertos.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-t px-4 py-1.5">
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={position?.fraction ?? 0}
          onChange={(e) => void viewRef.current?.goToFraction(Number(e.target.value))}
          className="flex-1 accent-primary"
          aria-label="Posição no livro"
        />
        <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
          {percent}%
        </span>
      </div>
    </div>
  )
}
