import { useEffect, useRef, useState } from 'react'
import 'pdfjs-dist/web/pdf_viewer.css'
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Minus,
  Moon,
  Plus,
  RotateCcw,
  Search,
  Sparkles
} from 'lucide-react'
import type { BookHighlight, OcrPage } from '@shared/types'
import { ScanTextIcon } from '@renderer/components/icons'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { fetchBookFile, HIGHLIGHT_STYLES } from '@renderer/lib/books'
import { useTheme } from '@renderer/lib/theme'
import { cn } from '@renderer/lib/utils'
import { loadPdfViewer, openPdf, type PDFDocumentProxy } from '@renderer/lib/pdfjs'
import {
  injectOcrText,
  pdfHasText,
  searchOcr,
  textLayerHasNativeText,
  type OcrMatch
} from '@renderer/lib/ocr'
import { OcrBar } from './ocr-bar'
import type { ReaderProps } from './types'
import { useOcr } from './use-ocr'

type Viewer = InstanceType<Awaited<ReturnType<typeof loadPdfViewer>>['PDFViewer']>
type EventBus = InstanceType<Awaited<ReturnType<typeof loadPdfViewer>>['EventBus']>

/** Posição salva: página, deslocamento (em pontos do PDF) e zoom. */
interface PdfLocation {
  page: number
  top?: number
  left?: number
  scale?: string
}

/** Destaque no PDF: retângulos normalizados (0–1) por página. */
interface PdfHighlightLocation {
  pages: { page: number; rects: [number, number, number, number][] }[]
}

const INVERT_KEY = 'sentinela:pdf-invert'

const ZOOM_PRESETS: Record<string, string> = {
  'page-width': 'Largura da página',
  'page-fit': 'Página inteira',
  auto: 'Automático'
}

/** O PDFViewer é controlado por setters (página, zoom); fica fora do componente de propósito. */
function setViewerState(
  viewer: Viewer,
  state: Partial<Pick<Viewer, 'currentPageNumber' | 'currentScale' | 'currentScaleValue'>>
): void {
  Object.assign(viewer, state)
}

function parseLocation<T>(value: string | null): T | null {
  try {
    return value ? (JSON.parse(value) as T) : null
  } catch {
    return null
  }
}

/** Junta retângulos vizinhos da mesma linha (o pdf.js gera um por trecho de texto). */
function mergeLineRects(rects: DOMRect[]): DOMRect[] {
  const sorted = rects
    .filter((r) => r.width > 1 && r.height > 1)
    .toSorted((a, b) => a.top - b.top || a.left - b.left)
  const merged: DOMRect[] = []
  for (const r of sorted) {
    const last = merged.at(-1)
    if (
      last &&
      Math.abs(last.top - r.top) < 3 &&
      Math.abs(last.height - r.height) < 4 &&
      r.left <= last.right + 4
    ) {
      merged[merged.length - 1] = new DOMRect(
        last.left,
        Math.min(last.top, r.top),
        Math.max(last.right, r.right) - last.left,
        Math.max(last.height, r.height)
      )
    } else if (!last || r.top !== last.top || r.left !== last.left) {
      merged.push(r)
    }
  }
  return merged
}

export function PdfReader({
  book,
  startLocation,
  highlights,
  onPosition,
  onSelection,
  navigationRef
}: ReaderProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<{ viewer: Viewer; eventBus: EventBus; pdf: PDFDocumentProxy } | null>(
    null
  )
  const highlightsRef = useRef(highlights)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState('page-width')
  const [findQuery, setFindQuery] = useState('')
  const [matches, setMatches] = useState<{ current: number; total: number } | null>(null)
  const [scanned, setScanned] = useState(false)
  const ocr = useOcr(book.id, () => viewerRef.current?.pdf ?? null)
  const ocrPagesRef = useRef(new Map<number, OcrPage>())
  const ocrFindRef = useRef<{ query: string; list: OcrMatch[]; index: number } | null>(null)
  const { resolved } = useTheme()
  const [invertPages, setInvertPages] = useState(() => {
    try {
      return localStorage.getItem(INVERT_KEY) !== '0'
    } catch {
      return true
    }
  })

  const toggleInvert = (): void => {
    setInvertPages((value) => {
      try {
        localStorage.setItem(INVERT_KEY, value ? '0' : '1')
      } catch {
        // ignora
      }
      return !value
    })
  }

  // Callbacks mais recentes, sem recriar o visualizador a cada render.
  const callbacks = useRef({ onPosition, onSelection })
  useEffect(() => {
    callbacks.current = { onPosition, onSelection }
  }, [onPosition, onSelection])

  /** Desenha os destaques de uma página por baixo da camada de texto. */
  const drawPage = (pageNumber: number): void => {
    const view = viewerRef.current?.viewer.getPageView(pageNumber - 1)
    const div = view?.div as HTMLDivElement | undefined
    if (!div) return
    div.querySelector('.sentinela-hl-layer')?.remove()
    const layer = document.createElement('div')
    layer.className = 'sentinela-hl-layer'
    for (const h of highlightsRef.current) {
      const loc = parseLocation<PdfHighlightLocation>(h.location)
      for (const p of loc?.pages ?? []) {
        if (p.page !== pageNumber) continue
        for (const [x, y, w, height] of p.rects) {
          const rect = document.createElement('div')
          Object.assign(rect.style, {
            left: `${x * 100}%`,
            top: `${y * 100}%`,
            width: `${w * 100}%`,
            height: `${height * 100}%`,
            background: HIGHLIGHT_STYLES[h.color].fill
          })
          layer.append(rect)
        }
      }
    }
    const textLayer = div.querySelector('.textLayer')
    if (textLayer) div.insertBefore(layer, textLayer)
    else div.append(layer)
  }

  const drawAll = (): void => {
    const viewer = viewerRef.current?.viewer
    if (!viewer) return
    for (let i = 1; i <= viewer.pagesCount; i++) drawPage(i)
  }

  /** Põe o texto do OCR na camada de texto da página (só em páginas sem texto próprio). */
  const injectOcr = (pageNumber: number): void => {
    const ocrPage = ocrPagesRef.current.get(pageNumber)
    const div = viewerRef.current?.viewer.getPageView(pageNumber - 1)?.div as
      HTMLDivElement | undefined
    const textLayer = div?.querySelector<HTMLElement>('.textLayer')
    if (ocrPage && textLayer && !textLayerHasNativeText(textLayer)) {
      injectOcrText(textLayer, ocrPage)
    }
  }

  useEffect(() => {
    highlightsRef.current = highlights
    drawAll()
    // drawAll lê tudo por refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlights])

  useEffect(() => {
    ocrPagesRef.current = new Map(ocr.pages.map((p) => [p.page, p]))
    ocrFindRef.current = null
    const viewer = viewerRef.current?.viewer
    if (viewer) for (const p of ocr.pages) injectOcr(p.page)
  }, [ocr.pages])

  // Carrega o PDF e monta o visualizador do pdf.js.
  useEffect(() => {
    let cancelled = false
    let pdf: PDFDocumentProxy | null = null
    const container = containerRef.current!

    void (async () => {
      try {
        const file = await fetchBookFile(book)
        pdf = await openPdf(await file.arrayBuffer())
        const { EventBus, PDFLinkService, PDFViewer, PDFFindController } = await loadPdfViewer()
        if (cancelled) return void pdf.loadingTask.destroy()

        const eventBus = new EventBus()
        const linkService = new PDFLinkService({ eventBus, externalLinkTarget: 2 })
        const findController = new PDFFindController({ eventBus, linkService })
        const viewer = new PDFViewer({
          container,
          viewer: container.firstElementChild as HTMLDivElement,
          eventBus,
          linkService,
          findController
        })
        linkService.setViewer(viewer)
        viewer.setDocument(pdf)
        linkService.setDocument(pdf)
        viewerRef.current = { viewer, eventBus, pdf }
        setNumPages(pdf.numPages)
        void pdfHasText(pdf).then((hasText) => !cancelled && setScanned(!hasText))

        const saved = parseLocation<PdfLocation>(startLocation ?? book.location)
        eventBus.on('pagesinit', () => {
          viewer.currentScaleValue = saved?.scale ?? 'page-width'
          if (saved) {
            viewer.scrollPageIntoView({
              pageNumber: saved.page,
              destArray: [null, { name: 'XYZ' }, saved.left ?? null, saved.top ?? null, null],
              allowNegativeOffset: true
            })
          }
          setReady(true)
        })
        eventBus.on('pagechanging', ({ pageNumber }: { pageNumber: number }) => {
          setPage(pageNumber)
          setPageInput(String(pageNumber))
        })
        eventBus.on(
          'scalechanging',
          ({ presetValue, scale }: { presetValue?: string; scale: number }) =>
            setScale(presetValue ?? String(scale))
        )
        eventBus.on(
          'updateviewarea',
          ({ location }: { location: { pageNumber: number; top: number; left: number } }) => {
            const total = viewer.pagesCount
            callbacks.current.onPosition({
              progress: total ? location.pageNumber / total : 0,
              location: JSON.stringify({
                page: location.pageNumber,
                top: location.top,
                left: location.left,
                scale: viewer.currentScaleValue
              } satisfies PdfLocation),
              label: `Página ${location.pageNumber} de ${total}`
            })
          }
        )
        eventBus.on('textlayerrendered', ({ pageNumber }: { pageNumber: number }) => {
          injectOcr(pageNumber)
          drawPage(pageNumber)
        })
        eventBus.on(
          'updatefindmatchescount',
          ({ matchesCount }: { matchesCount: { current: number; total: number } }) =>
            setMatches(matchesCount)
        )
        eventBus.on(
          'updatefindcontrolstate',
          ({ matchesCount }: { matchesCount?: { current: number; total: number } }) =>
            matchesCount && setMatches(matchesCount)
        )
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    })()

    return () => {
      cancelled = true
      viewerRef.current = null
      void pdf?.loadingTask.destroy()
    }
    // book.id: o leitor é recriado só ao trocar de livro
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id])

  // Zoom "largura da página"/"página inteira" acompanha o tamanho da área (painel, janela).
  useEffect(() => {
    const container = containerRef.current!
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const viewer = viewerRef.current?.viewer
        const value = viewer?.currentScaleValue
        if (viewer && value && value in ZOOM_PRESETS) {
          setViewerState(viewer, { currentScaleValue: value })
        }
      })
    })
    observer.observe(container)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  // Navegação até um destaque (usada pelo painel).
  useEffect(() => {
    navigationRef.current = (h: BookHighlight) => {
      const first = parseLocation<PdfHighlightLocation>(h.location)?.pages[0]
      const viewer = viewerRef.current?.viewer
      if (!first || !viewer) return
      const div = viewer.getPageView(first.page - 1)?.div as HTMLDivElement | undefined
      if (!div) return
      const y = first.rects[0]?.[1] ?? 0
      containerRef.current!.scrollTop = div.offsetTop + y * div.clientHeight - 120
    }
    return () => {
      navigationRef.current = null
    }
  }, [navigationRef])

  // Seleção de texto → barra de destaque.
  const onMouseUp = (): void => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      callbacks.current.onSelection(null)
      return
    }
    const range = selection.getRangeAt(0)
    const textLayers = [...containerRef.current!.querySelectorAll<HTMLElement>('.page')]
      .map((pageDiv) => ({
        page: Number(pageDiv.dataset.pageNumber),
        box: pageDiv.querySelector('.textLayer')?.getBoundingClientRect()
      }))
      .filter((p): p is { page: number; box: DOMRect } => !!p.box)

    const byPage = new Map<number, [number, number, number, number][]>()
    for (const r of mergeLineRects([...range.getClientRects()])) {
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const target = textLayers.find(
        ({ box }) => cx >= box.left && cx <= box.right && cy >= box.top && cy <= box.bottom
      )
      if (!target) continue
      const { box } = target
      const list = byPage.get(target.page) ?? []
      list.push([
        (r.left - box.left) / box.width,
        (r.top - box.top) / box.height,
        r.width / box.width,
        r.height / box.height
      ])
      byPage.set(target.page, list)
    }
    if (byPage.size === 0) return

    const pages = [...byPage.entries()]
      .toSorted(([a], [b]) => a - b)
      .map(([page, rects]) => ({ page, rects }))
    const end = range.getBoundingClientRect()
    callbacks.current.onSelection({
      text: selection.toString().replace(/\s+/g, ' ').trim(),
      location: JSON.stringify({ pages } satisfies PdfHighlightLocation),
      sortKey: pages[0].page + (pages[0].rects[0]?.[1] ?? 0),
      anchor: { x: end.left + end.width / 2, y: end.bottom }
    })
  }

  const goToPage = (value: string): void => {
    const n = Number(value)
    const viewer = viewerRef.current?.viewer
    if (viewer && Number.isInteger(n) && n >= 1 && n <= viewer.pagesCount) {
      setViewerState(viewer, { currentPageNumber: n })
    } else {
      setPageInput(String(page))
    }
  }

  const zoom = (factor: number): void => {
    const viewer = viewerRef.current?.viewer
    if (viewer) {
      setViewerState(viewer, {
        currentScale: Math.min(5, Math.max(0.25, viewer.currentScale * factor))
      })
    }
  }

  const setZoom = (value: string): void => {
    const viewer = viewerRef.current?.viewer
    if (viewer) setViewerState(viewer, { currentScaleValue: value })
  }

  /** Busca no texto do OCR (PDFs escaneados não têm texto para o pdf.js procurar). */
  const findInOcr = (query: string, previous: boolean, restart: boolean): void => {
    const state = ocrFindRef.current
    const list = !restart && state?.query === query ? state.list : searchOcr(ocr.pages, query)
    if (list.length === 0) {
      ocrFindRef.current = null
      setMatches({ current: 0, total: 0 })
      return
    }
    const index =
      restart || !state || state.query !== query
        ? 0
        : (state.index + (previous ? -1 : 1) + list.length) % list.length
    ocrFindRef.current = { query, list, index }
    setMatches({ current: index + 1, total: list.length })

    const match = list[index]
    const div = viewerRef.current?.viewer.getPageView(match.page - 1)?.div as
      HTMLDivElement | undefined
    if (!div) return
    containerRef.current!.scrollTop = div.offsetTop + match.y * div.clientHeight - 140
    // a página pode ainda estar sendo desenhada depois da rolagem
    window.setTimeout(() => {
      containerRef.current
        ?.querySelectorAll('.ocr-hit')
        .forEach((el) => el.classList.remove('ocr-hit'))
      div.querySelector(`.ocr-line[data-line="${match.line}"]`)?.classList.add('ocr-hit')
    }, 350)
  }

  const find = (findPrevious = false, again = true): void => {
    const query = findQuery.trim()
    if (!query) {
      setMatches(null)
      return
    }
    if (scanned) {
      findInOcr(query, findPrevious, !again)
      return
    }
    viewerRef.current?.eventBus.dispatch('find', {
      source: null,
      type: again ? 'again' : '',
      query,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious,
      matchDiacritics: false
    })
  }

  const zoomLabel = ZOOM_PRESETS[scale] ?? `${Math.round(Number(scale) * 100)}%`
  const ocrComplete = numPages > 0 && ocr.pages.length >= numPages

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b bg-card/50 px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-sm">
          <Input
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && goToPage(pageInput)}
            onBlur={() => goToPage(pageInput)}
            className="h-7 w-14 text-center tabular-nums"
            aria-label="Página"
          />
          <span className="whitespace-nowrap text-muted-foreground tabular-nums">
            de {numPages || '…'}
          </span>
        </div>

        <div className="mx-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => zoom(1 / 1.15)}
            aria-label="Diminuir zoom"
          >
            <Minus />
          </Button>
          <Select value={scale in ZOOM_PRESETS ? scale : 'custom'} onValueChange={setZoom}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue>{zoomLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ZOOM_PRESETS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
              {['1', '1.5', '2'].map((value) => (
                <SelectItem key={value} value={value}>
                  {Number(value) * 100}%
                </SelectItem>
              ))}
              {!(scale in ZOOM_PRESETS) && !['1', '1.5', '2'].includes(scale) && (
                <SelectItem value="custom" disabled>
                  {zoomLabel}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => zoom(1.15)}
            aria-label="Aumentar zoom"
          >
            <Plus />
          </Button>
          {resolved === 'dark' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={invertPages ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  onClick={toggleInvert}
                  aria-label="Páginas escuras"
                >
                  <Moon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {invertPages ? 'Mostrar páginas com as cores originais' : 'Escurecer as páginas'}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="flex items-center gap-1">
          {scanned && ocrComplete && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  <ScanTextIcon className="size-4" /> OCR
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="font-normal">
                  <p className="text-sm font-medium">Texto reconhecido por OCR</p>
                  <p className="text-xs text-muted-foreground">
                    Confiança média: {ocr.averageConfidence ?? 0}%
                  </p>
                  {ocr.lowConfidencePages.length > 0 && (
                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                      Baixa confiança nas páginas {ocr.lowConfidencePages.slice(0, 12).join(', ')}
                      {ocr.lowConfidencePages.length > 12 ? '…' : ''}
                    </p>
                  )}
                  {ocr.refinedCount > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ocr.refinedCount}{' '}
                      {ocr.refinedCount === 1 ? 'página relida' : 'páginas relidas'} por IA (vale
                      para a busca e a mentora)
                    </p>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ocr.lowConfidencePages.length > 0 &&
                  (ocr.visionModel ? (
                    <DropdownMenuItem onSelect={ocr.refine} disabled={!!ocr.refining}>
                      <Sparkles /> Melhorar {ocr.lowConfidencePages.length}{' '}
                      {ocr.lowConfidencePages.length === 1 ? 'página' : 'páginas'} com IA
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {ocr.visionModel}
                      </span>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                      Para melhorar essas páginas com IA, deixe o Ollama aberto com um modelo de
                      visão (ex.: <code>ollama pull qwen2.5vl:7b</code>).
                    </DropdownMenuLabel>
                  ))}
                <DropdownMenuItem onSelect={ocr.redo}>
                  <RotateCcw /> Refazer OCR
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') find(e.shiftKey, false)
                if (e.key === 'Escape') {
                  setFindQuery('')
                  setMatches(null)
                }
              }}
              placeholder="Buscar no PDF"
              className="h-7 w-32 pl-7 text-sm xl:w-48"
            />
          </div>
          {matches && (
            <span className="w-14 text-center text-xs text-muted-foreground tabular-nums">
              {matches.total ? `${matches.current}/${matches.total}` : '0'}
            </span>
          )}
          <Button variant="ghost" size="icon-sm" onClick={() => find(true)} aria-label="Anterior">
            <ChevronUp />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => find(false)} aria-label="Próximo">
            <ChevronDown />
          </Button>
        </div>
      </div>

      {scanned && ready && (ocr.progress || ocr.refining || !ocrComplete) && (
        <OcrBar ocr={ocr} numPages={numPages} />
      )}

      <div className="relative min-h-0 flex-1 bg-muted/40">
        <div
          ref={containerRef}
          onMouseUp={onMouseUp}
          onScroll={() => callbacks.current.onSelection(null)}
          className={cn(
            'sentinela-pdf absolute inset-0 overflow-auto',
            invertPages && 'invert-pages'
          )}
        >
          <div className="pdfViewer" />
        </div>
        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center p-8 text-center text-sm text-muted-foreground">
            Não foi possível abrir o PDF: {error}
          </div>
        )}
      </div>
    </div>
  )
}
