import { bookFileUrl } from '@shared/api'
import type { BookFormat, HighlightColor } from '@shared/schemas'
import type { Book } from '@shared/types'
import { api } from './api'

export const FORMAT_LABEL: Record<BookFormat, string> = {
  pdf: 'PDF',
  epub: 'EPUB',
  mobi: 'MOBI',
  azw3: 'AZW3',
  fb2: 'FB2',
  cbz: 'CBZ'
}

/** Cores dos destaques: fundo translúcido sobre o texto e a cor sólida para a interface. */
export const HIGHLIGHT_STYLES: Record<
  HighlightColor,
  { label: string; fill: string; solid: string }
> = {
  yellow: { label: 'Amarelo', fill: 'rgb(250 204 21 / 0.4)', solid: '#facc15' },
  green: { label: 'Verde', fill: 'rgb(74 222 128 / 0.4)', solid: '#4ade80' },
  blue: { label: 'Azul', fill: 'rgb(96 165 250 / 0.4)', solid: '#60a5fa' },
  pink: { label: 'Rosa', fill: 'rgb(244 114 182 / 0.4)', solid: '#f472b6' }
}

/** Baixa o arquivo do livro pelo protocolo sentinela://books/<id>. */
export async function fetchBookFile(book: Book): Promise<File> {
  const response = await fetch(bookFileUrl(book.id))
  if (!response.ok) throw new Error('Arquivo do livro não encontrado')
  const name = book.filePath.split(/[\\/]/).pop() ?? `livro.${book.format}`
  return new File([await response.blob()], name)
}

/** Redimensiona uma imagem (canvas ou blob) para uma capa JPEG de até 360px de largura. */
async function toCoverJpeg(source: HTMLCanvasElement | Blob): Promise<Uint8Array> {
  const image = source instanceof Blob ? await createImageBitmap(source) : source
  const width = Math.min(360, image.width)
  const height = Math.round((image.height / image.width) * width)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(image, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85)
  )
  if (!blob) throw new Error('Não foi possível gerar a capa')
  return new Uint8Array(await blob.arrayBuffer())
}

interface Metadata {
  title?: string
  author?: string
  pageCount?: number
  cover?: Uint8Array
}

const text = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value.trim() || undefined
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ') || undefined
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return text(obj.name ?? Object.values(obj)[0])
  }
  return undefined
}

async function pdfMetadata(file: File): Promise<Metadata> {
  const { openPdf } = await import('./pdfjs')
  const pdf = await openPdf(await file.arrayBuffer())
  try {
    const { info } = (await pdf.getMetadata()) as { info: Record<string, unknown> }
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: 1 })
    const scale = 480 / viewport.width
    const canvas = document.createElement('canvas')
    const scaled = page.getViewport({ scale })
    canvas.width = Math.floor(scaled.width)
    canvas.height = Math.floor(scaled.height)
    await page.render({ canvas, viewport: scaled }).promise
    return {
      title: text(info?.Title),
      author: text(info?.Author),
      pageCount: pdf.numPages,
      cover: await toCoverJpeg(canvas)
    }
  } finally {
    void pdf.loadingTask.destroy()
  }
}

async function ebookMetadata(file: File): Promise<Metadata> {
  const { makeBook } = await import('foliate-js/view.js')
  const book = await makeBook(file)
  const coverBlob = await book.getCover?.()
  return {
    title: text(book.metadata?.title),
    author: text(book.metadata?.author),
    cover: coverBlob ? await toCoverJpeg(coverBlob).catch(() => undefined) : undefined
  }
}

/**
 * Lê título, autor, páginas e capa do arquivo e salva no livro.
 * Roda uma vez por livro, logo depois de adicionado.
 */
export async function extractBookMetadata(book: Book): Promise<void> {
  try {
    const file = await fetchBookFile(book)
    const meta = book.format === 'pdf' ? await pdfMetadata(file) : await ebookMetadata(file)
    if (meta.cover) await api.books.setCover(book.id, meta.cover)
    await api.books.update(book.id, {
      ...(meta.title && { title: meta.title }),
      ...(meta.author && { author: meta.author }),
      ...(meta.pageCount && { pageCount: meta.pageCount }),
      metadataReady: true
    })
  } catch (error) {
    // Arquivo protegido por DRM, corrompido etc.: fica com o nome do arquivo, sem capa.
    console.warn(`Metadados de "${book.title}" não lidos:`, error)
    await api.books.update(book.id, { metadataReady: true })
  }
}
