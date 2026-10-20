import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { FILE_PROTOCOL } from '@shared/api'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
// O pdf_viewer.mjs procura a biblioteca em globalThis.pdfjsLib.
;(globalThis as { pdfjsLib?: typeof pdfjsLib }).pdfjsLib = pdfjsLib

const assets = `${FILE_PROTOCOL}://pdfjs`

export function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  return pdfjsLib.getDocument({
    data,
    cMapUrl: `${assets}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assets}/standard_fonts/`,
    wasmUrl: `${assets}/wasm/`,
    iccUrl: `${assets}/iccs/`
  }).promise
}

/** Componentes do visualizador (carregados depois de pdfjsLib estar no globalThis). */
export const loadPdfViewer = (): Promise<typeof import('pdfjs-dist/web/pdf_viewer.mjs')> =>
  import('pdfjs-dist/web/pdf_viewer.mjs')

export type { PDFDocumentProxy }
