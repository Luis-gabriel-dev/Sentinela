import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { OcrPage } from '@shared/types'
import { api } from '@renderer/lib/api'
import { renderPageForOcr } from '@renderer/lib/ocr'
import type { PDFDocumentProxy } from '@renderer/lib/pdfjs'
import { keys, useOcrPages } from '@renderer/lib/queries'

/** Abaixo disto, a página provavelmente tem erros de reconhecimento. */
export const LOW_CONFIDENCE = 60

export interface OcrState {
  pages: OcrPage[]
  /** Páginas feitas / total enquanto o OCR roda; null quando parado. */
  progress: { done: number; total: number } | null
  averageConfidence: number | null
  /** Páginas de baixa confiança que ainda não foram melhoradas pelo modelo de visão. */
  lowConfidencePages: number[]
  /** Páginas já relidas pelo modelo de visão. */
  refinedCount: number
  /** Modelo de visão do Ollama disponível (null = nenhum). */
  visionModel: string | null
  /** Progresso da melhoria com o modelo de visão; null quando parado. */
  refining: { done: number; total: number } | null
  start: () => void
  cancel: () => void
  redo: () => void
  /** Relê as páginas de baixa confiança com o modelo de visão. */
  refine: () => void
}

/**
 * Roda o OCR página por página: a interface renderiza a imagem com o pdf.js e o processo
 * principal reconhece o texto. Retoma de onde parou (páginas já feitas ficam salvas).
 */
export function useOcr(bookId: number, getPdf: () => PDFDocumentProxy | null): OcrState {
  const client = useQueryClient()
  const { data: pages = [] } = useOcrPages(bookId)
  const { data: visionModel = null } = useQuery({
    queryKey: ['ocr', 'vision-model'],
    queryFn: () => api.ocr.visionModel(),
    staleTime: 60_000
  })
  const [progress, setProgress] = useState<OcrState['progress']>(null)
  const [refining, setRefining] = useState<OcrState['refining']>(null)
  const cancelled = useRef(false)
  const running = useRef(false)

  useEffect(
    () => () => {
      cancelled.current = true
    },
    []
  )

  const run = async (alreadyDone: Set<number>): Promise<void> => {
    const pdf = getPdf()
    if (!pdf || running.current) return
    running.current = true
    cancelled.current = false
    const todo = Array.from({ length: pdf.numPages }, (_, i) => i + 1).filter(
      (n) => !alreadyDone.has(n)
    )
    setProgress({ done: alreadyDone.size, total: pdf.numPages })
    try {
      for (const n of todo) {
        if (cancelled.current) break
        const image = await renderPageForOcr(pdf, n)
        const page = await api.ocr.recognizePage({ bookId, page: n, ...image })
        client.setQueryData<OcrPage[]>(keys.ocr(bookId), (old = []) =>
          [...old.filter((p) => p.page !== n), page].toSorted((a, b) => a.page - b.page)
        )
        setProgress((p) => p && { ...p, done: p.done + 1 })
      }
      if (!cancelled.current) toast.success('Texto reconhecido em todas as páginas')
    } catch (error) {
      toast.error(`OCR interrompido: ${(error as Error).message}`)
    } finally {
      running.current = false
      setProgress(null)
    }
  }

  const confidences = pages.filter((p) => p.lines.length > 0).map((p) => p.confidence)
  const lowConfidencePages = pages
    .filter((p) => p.lines.length > 0 && p.confidence < LOW_CONFIDENCE && !p.refinedBy)
    .map((p) => p.page)

  const refine = async (): Promise<void> => {
    const pdf = getPdf()
    if (!pdf || running.current || !lowConfidencePages.length) return
    running.current = true
    cancelled.current = false
    const todo = [...lowConfidencePages]
    setRefining({ done: 0, total: todo.length })
    try {
      for (const n of todo) {
        if (cancelled.current) break
        const image = await renderPageForOcr(pdf, n)
        const page = await api.ocr.refinePage({ bookId, page: n, ...image })
        client.setQueryData<OcrPage[]>(keys.ocr(bookId), (old = []) =>
          old.map((p) => (p.page === n ? page : p))
        )
        setRefining((r) => r && { ...r, done: r.done + 1 })
      }
      if (!cancelled.current) toast.success(`Texto de ${todo.length} páginas melhorado com IA`)
    } catch (error) {
      toast.error(`Melhoria interrompida: ${(error as Error).message}`)
    } finally {
      running.current = false
      setRefining(null)
    }
  }

  return {
    pages,
    progress,
    averageConfidence: confidences.length
      ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
      : null,
    lowConfidencePages,
    refinedCount: pages.filter((p) => p.refinedBy).length,
    visionModel,
    refining,
    refine: () => void refine(),
    start: () => void run(new Set(pages.map((p) => p.page))),
    cancel: () => {
      cancelled.current = true
    },
    redo: () =>
      void (async () => {
        await api.ocr.clear(bookId)
        client.setQueryData<OcrPage[]>(keys.ocr(bookId), [])
        await run(new Set())
      })()
  }
}
