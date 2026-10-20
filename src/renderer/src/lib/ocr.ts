import type { OcrPage } from '@shared/types'
import type { PDFDocumentProxy } from './pdfjs'

/** Resolução usada para o OCR: ~200 DPI, limitada para páginas muito grandes. */
const OCR_DPI = 200
const MAX_SIDE = 3500

/** Texto para comparação: minúsculas e sem acentos ("Análise" ≈ "analise"). */
export const normalizeText = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Renderiza uma página do PDF como PNG para o OCR. */
export async function renderPageForOcr(
  pdf: PDFDocumentProxy,
  pageNumber: number
): Promise<{ image: Uint8Array<ArrayBuffer>; width: number; height: number }> {
  const page = await pdf.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(OCR_DPI / 72, MAX_SIDE / Math.max(base.width, base.height))
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  await page.render({ canvas, viewport }).promise
  page.cleanup()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Não foi possível gerar a imagem da página')
  return {
    image: new Uint8Array(await blob.arrayBuffer()),
    width: canvas.width,
    height: canvas.height
  }
}

/** A página tem texto próprio do PDF (não precisa de OCR)? */
export async function pdfHasText(pdf: PDFDocumentProxy, samplePages = 3): Promise<boolean> {
  let chars = 0
  for (let n = 1; n <= Math.min(samplePages, pdf.numPages); n++) {
    const content = await (await pdf.getPage(n)).getTextContent()
    for (const item of content.items) chars += 'str' in item ? item.str.trim().length : 0
  }
  return chars > 20
}

/**
 * Coloca o texto reconhecido na camada de texto do pdf.js, em spans invisíveis posicionados
 * sobre a imagem. Assim seleção, cópia e destaques funcionam como num PDF com texto.
 */
export function injectOcrText(textLayer: HTMLElement, page: OcrPage): void {
  textLayer.querySelectorAll('.ocr-line').forEach((el) => el.remove())
  const width = textLayer.clientWidth
  const height = textLayer.clientHeight
  if (!width || !height) return

  const spans = page.lines.map((line, index) => {
    const [x, y, w, h] = line.box
    const span = document.createElement('span')
    span.className = 'ocr-line'
    span.dataset.line = String(index)
    span.textContent = line.text
    Object.assign(span.style, {
      left: `${x * 100}%`,
      top: `${y * 100}%`,
      fontSize: `${h * height * 0.85}px`,
      lineHeight: '1.15'
    })
    textLayer.append(span)
    return { span, target: w * width }
  })
  // Estica cada linha até a largura reconhecida (a fonte da tela não é a do livro).
  for (const { span, target } of spans) {
    const natural = span.offsetWidth
    if (natural > 0) span.style.transform = `scaleX(${target / natural})`
  }
}

/** A camada de texto do pdf.js tem texto nativo (além do que o OCR colocou)? */
export const textLayerHasNativeText = (textLayer: HTMLElement): boolean =>
  [...textLayer.querySelectorAll('span:not(.ocr-line)')].some((s) => s.textContent?.trim())

export interface OcrMatch {
  page: number
  line: number
  y: number
}

export function searchOcr(pages: OcrPage[], query: string): OcrMatch[] {
  const q = normalizeText(query.trim())
  if (!q) return []
  return pages.flatMap((p) =>
    p.lines.flatMap((line, i) =>
      normalizeText(line.text).includes(q) ? [{ page: p.page, line: i, y: line.box[1] }] : []
    )
  )
}
