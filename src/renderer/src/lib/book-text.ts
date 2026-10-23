import { useSyncExternalStore } from 'react'
import type { Book } from '@shared/types'
import { api } from './api'
import { fetchBookFile } from './books'

/*
 * Leitura do texto dos livros para a busca inteligente. Roda aqui na interface porque o pdf.js e o
 * foliate-js já estão aqui (o OCR faz o mesmo caminho). Um livro de cada vez, em segundo plano;
 * cada livro é lido uma vez só (o processo principal marca `textReadAt`).
 */

interface Page {
  page: number
  text: string
}

export interface BookTextProgress {
  title: string
  /** Páginas (PDF) ou seções (EPUB) lidas do livro atual. */
  done: number
  total: number
  /** Livros que ainda faltam, contando o atual. */
  remaining: number
}

let progress: BookTextProgress | null = null
const listeners = new Set<() => void>()
const setProgress = (next: BookTextProgress | null): void => {
  progress = next
  for (const listener of listeners) listener()
}

/** Livro sendo lido agora (null = nenhum). */
export const useBookTextProgress = (): BookTextProgress | null =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => progress
  )

/** Junta palavras quebradas por hífen no fim da linha e limpa espaços. */
const clean = (text: string): string =>
  text
    .replace(/(\p{L})-\n(\p{L})/gu, '$1$2')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

/** Página com menos que isso é capa, sumário vazio ou página escaneada (sem texto). */
const MIN_CHARS = 20

/** Devolve a vez para a interface de tempos em tempos. */
const breathe = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

async function pdfPages(
  file: File,
  onPage: (done: number, total: number) => void
): Promise<Page[]> {
  const { openPdf } = await import('./pdfjs')
  const pdf = await openPdf(await file.arrayBuffer())
  try {
    const pages: Page[] = []
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n)
      const content = await page.getTextContent()
      const text = clean(
        content.items
          .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : ''))
          .join('')
      )
      page.cleanup()
      if (text.length >= MIN_CHARS) pages.push({ page: n, text })
      onPage(n, pdf.numPages)
      if (n % 10 === 0) await breathe()
    }
    return pages
  } finally {
    void pdf.loadingTask.destroy()
  }
}

async function ebookPages(
  file: File,
  onPage: (done: number, total: number) => void
): Promise<Page[]> {
  const { makeBook } = await import('foliate-js/view.js')
  const book = await makeBook(file)
  const sections = book.sections ?? []
  const pages: Page[] = []
  for (let i = 0; i < sections.length; i++) {
    try {
      const doc = await sections[i].createDocument?.()
      if (doc?.body) {
        // Sem layout não há innerText: marca o fim de cada bloco para manter os parágrafos.
        for (const el of doc.body.querySelectorAll(
          'p, div, li, br, tr, pre, blockquote, h1, h2, h3, h4, h5, h6'
        )) {
          el.append('\n')
        }
        const text = clean(doc.body.textContent ?? '')
        if (text.length >= MIN_CHARS) pages.push({ page: i + 1, text })
      }
    } catch {
      // Seção que não abre (imagem solta, arquivo quebrado): segue para a próxima.
    }
    onPage(i + 1, sections.length)
    await breathe()
  }
  return pages
}

let running = false

/**
 * Lê o texto dos livros que ainda não foram lidos. `onBookDone` roda depois de cada livro (para
 * recarregar a lista e o estado da busca).
 */
export async function readPendingBooks(books: Book[], onBookDone: () => void): Promise<void> {
  if (running) return
  const pending = books.filter((b) => b.fileExists && b.metadataReady && !b.textReadAt)
  if (!pending.length) return
  running = true
  try {
    for (const [i, book] of pending.entries()) {
      const remaining = pending.length - i
      setProgress({ title: book.title, done: 0, total: 0, remaining })
      const onPage = (done: number, total: number): void =>
        setProgress({ title: book.title, done, total, remaining })
      let pages: Page[] = []
      try {
        const file = await fetchBookFile(book)
        pages =
          book.format === 'pdf' ? await pdfPages(file, onPage) : await ebookPages(file, onPage)
      } catch (error) {
        // DRM, arquivo corrompido: fica marcado como lido (sem texto) para não tentar sempre.
        console.warn(`Texto de "${book.title}" não lido:`, error)
      }
      await api.books.saveText({ bookId: book.id, pages }).catch(() => undefined)
      onBookDone()
    }
  } finally {
    running = false
    setProgress(null)
  }
}
