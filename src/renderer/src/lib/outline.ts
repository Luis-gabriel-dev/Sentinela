import type { OutlineLine } from '@shared/types'
import {
  buildTree,
  guessTitle,
  parseOutlineText,
  parseRows,
  type FlatItem,
  type OutlineNode
} from './outline-parse'

/*
 * Leitura de sumários de arquivos para importar como temas. O livro em PDF usa os marcadores
 * (com a página de cada item, para os temas abrirem o livro ali); EPUB/MOBI/AZW3 usam o sumário
 * do livro; o resto vai para a análise de texto de outline-parse.ts.
 */

export type OutlineSource = 'marcadores' | 'sumário do livro' | 'texto' | 'planilha' | 'IA'

export interface OutlineResult {
  nodes: OutlineNode[]
  source: OutlineSource
  /** Nome sugerido para o tema novo (título do livro ou do documento). */
  suggestedName: string | null
  /** Texto lido do arquivo, para a IA organizar se a estrutura não for reconhecida. */
  text: string | null
  /** Os itens têm a posição no livro (marcadores do PDF, sumário do EPUB). */
  linked: boolean
}

export const OUTLINE_EXTENSIONS = [
  'pdf',
  'epub',
  'mobi',
  'azw3',
  'azw',
  'md',
  'markdown',
  'txt',
  'csv',
  'tsv',
  'xlsx'
]

/** Páginas lidas de um PDF sem marcadores: o sumário fica no começo do livro. */
const PDF_TEXT_PAGES = 40

/**
 * Título gravado dentro do PDF, se servir de nome: muitos PDFs trazem o nome do arquivo de
 * origem ("capitulo.html", "Microsoft Word - livro.docx") ou "Untitled".
 */
function usableTitle(title: string | undefined): string | null {
  const t = title?.trim()
  if (
    !t ||
    /\.(html?|pdf|docx?|odt|tex|txt|md)$/i.test(t) ||
    /^(untitled|sem t[íi]tulo)$/i.test(t)
  ) {
    return null
  }
  return t.replace(/^Microsoft (Word|PowerPoint) - /, '')
}

/** "3.1 Introdução" vira prefixo "3.1" e título "Introdução". */
function splitNumber(title: string): { prefix: string | null; title: string } {
  const m = title.trim().match(/^(\d{1,3}(?:\.\d{1,3})*)\.?\s+(\S.*)$/)
  return m ? { prefix: m[1], title: m[2] } : { prefix: null, title: title.trim() }
}

export function fromText(text: string, source: OutlineSource = 'texto'): OutlineResult {
  return {
    nodes: buildTree(parseOutlineText(text)),
    source,
    suggestedName: guessTitle(text),
    text,
    linked: false
  }
}

/** Lista organizada pela IA (título + nível) virando árvore. */
export const fromLines = (lines: OutlineLine[]): OutlineNode[] =>
  buildTree(lines.map((l) => ({ level: l.level, ...splitNumber(l.title) })))

interface PdfOutlineItem {
  title: string
  dest: string | unknown[] | null
  items: PdfOutlineItem[]
}

async function fromPdf(file: File): Promise<OutlineResult> {
  const { openPdf } = await import('./pdfjs')
  const pdf = await openPdf(await file.arrayBuffer())
  try {
    const { info } = (await pdf.getMetadata().catch(() => ({ info: {} }))) as {
      info: { Title?: string }
    }
    const outline = ((await pdf.getOutline()) ?? []) as PdfOutlineItem[]
    if (outline.length >= 2) {
      // Página de cada marcador: o tema abre o livro ali.
      const pageOf = async (dest: PdfOutlineItem['dest']): Promise<number | null> => {
        try {
          const explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest
          const ref = explicit?.[0]
          if (typeof ref === 'number') return ref + 1
          if (ref && typeof ref === 'object') {
            return (await pdf.getPageIndex(ref as Parameters<typeof pdf.getPageIndex>[0])) + 1
          }
        } catch {
          // Destino quebrado: o tema fica sem página.
        }
        return null
      }
      const items: FlatItem[] = []
      const walk = async (list: PdfOutlineItem[], level: number): Promise<void> => {
        for (const item of list) {
          const page = await pageOf(item.dest)
          items.push({
            level,
            ...splitNumber(item.title),
            bookLocation: page ? `pagina=${page}` : null
          })
          await walk(item.items ?? [], level + 1)
        }
      }
      await walk(outline, 1)
      return {
        nodes: buildTree(items.filter((i) => i.title)),
        source: 'marcadores',
        suggestedName: usableTitle(info?.Title),
        text: null,
        linked: true
      }
    }
    // Sem marcadores: lê o texto das primeiras páginas (onde fica o sumário).
    let text = ''
    for (let n = 1; n <= Math.min(pdf.numPages, PDF_TEXT_PAGES); n++) {
      const page = await pdf.getPage(n)
      const content = await page.getTextContent()
      text +=
        content.items
          .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : ''))
          .join('') + '\n'
      page.cleanup()
    }
    const result = fromText(text)
    return { ...result, suggestedName: usableTitle(info?.Title) ?? result.suggestedName }
  } finally {
    void pdf.loadingTask.destroy()
  }
}

async function fromEbook(file: File): Promise<OutlineResult> {
  const { makeBook } = await import('foliate-js/view.js')
  const book = await makeBook(file)
  const items: FlatItem[] = []
  const walk = (list: NonNullable<typeof book.toc>, level: number): void => {
    for (const item of list) {
      items.push({
        level,
        ...splitNumber(item.label ?? ''),
        bookLocation: item.href ? `href=${encodeURIComponent(item.href)}` : null
      })
      walk(item.subitems ?? [], level + 1)
    }
  }
  walk(book.toc ?? [], 1)
  const title = book.metadata?.title
  return {
    nodes: buildTree(items.filter((i) => i.title)),
    source: 'sumário do livro',
    suggestedName: typeof title === 'string' ? title : (Object.values(title ?? {})[0] ?? null),
    text: null,
    linked: true
  }
}

/** CSV/TSV: separador mais frequente na primeira linha, com suporte a aspas. */
function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = ['\t', ';', ','].reduce((best, d) =>
    first.split(d).length > first.split(best).length ? d : best
  )
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) rows.push([...row, cell])
  return rows
}

function fromRows(rows: string[][], name: string): OutlineResult {
  return {
    nodes: buildTree(parseRows(rows)),
    source: 'planilha',
    suggestedName: name,
    text: rows.map((r) => r.filter(Boolean).join(' — ')).join('\n'),
    linked: false
  }
}

const baseName = (file: File): string => file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ')

/** Lê o sumário de um arquivo. Sem estrutura reconhecida, `nodes` vem vazio (e `text` para a IA). */
export async function readOutline(file: File): Promise<OutlineResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!OUTLINE_EXTENSIONS.includes(ext)) {
    throw new Error('Formato não suportado. Use PDF, EPUB, MOBI, AZW3, Markdown, TXT, CSV ou XLSX.')
  }
  let result: OutlineResult
  if (ext === 'pdf') result = await fromPdf(file)
  else if (['epub', 'mobi', 'azw3', 'azw'].includes(ext)) result = await fromEbook(file)
  else if (ext === 'xlsx') {
    const { readSheet } = await import('read-excel-file/browser')
    const rows = (await readSheet(file)).map((r) => r.map((c) => (c == null ? '' : String(c))))
    result = fromRows(rows, baseName(file))
  } else if (ext === 'csv' || ext === 'tsv')
    result = fromRows(parseCsv(await file.text()), baseName(file))
  else result = fromText(await file.text())
  return { ...result, suggestedName: result.suggestedName || baseName(file) }
}
