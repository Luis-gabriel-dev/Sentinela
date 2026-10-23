// Tipos mínimos do foliate-js (o pacote não traz tipos), só do que o Sentinela usa.

declare module 'foliate-js/view.js' {
  export interface TocItem {
    label: string
    href: string
    subitems?: TocItem[]
  }

  export interface FoliateBook {
    metadata?: {
      title?: string | Record<string, string>
      author?: unknown
      language?: string | string[]
    }
    toc?: TocItem[] | null
    dir?: string
    getCover?: () => Promise<Blob | null> | Blob | null
    /** Seções (capítulos/arquivos) na ordem de leitura. */
    sections?: { createDocument?: () => Promise<Document> }[]
  }

  export interface RelocateDetail {
    fraction: number
    cfi: string
    tocItem?: { label?: string; href?: string }
    pageItem?: { label?: string }
    location?: { current: number; total: number }
  }

  export interface FoliateRenderer extends HTMLElement {
    setStyles?: (css: string) => void
    next: () => Promise<void>
    prev: () => Promise<void>
    getContents: () => { doc: Document; index: number }[]
  }

  export class View extends HTMLElement {
    book: FoliateBook
    renderer: FoliateRenderer
    lastLocation: RelocateDetail | null
    open(file: File | Blob): Promise<void>
    close(): void
    init(options: { lastLocation?: string | number | null; showTextStart?: boolean }): Promise<void>
    goTo(target: string | number): Promise<unknown>
    goToFraction(fraction: number): Promise<void>
    goLeft(): Promise<void>
    goRight(): Promise<void>
    prev(): Promise<void>
    next(): Promise<void>
    getCFI(index: number, range: Range): string
    addAnnotation(annotation: { value: string; color?: string }, remove?: boolean): Promise<unknown>
    deleteAnnotation(annotation: { value: string }): Promise<unknown>
    showAnnotation(annotation: { value: string }): Promise<void>
  }

  export function makeBook(file: File | Blob): Promise<FoliateBook>
}

declare module 'foliate-js/overlayer.js' {
  export class Overlayer {
    static highlight: unknown
    static underline: unknown
  }
}
