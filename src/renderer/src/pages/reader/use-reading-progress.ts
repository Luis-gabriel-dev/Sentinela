import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/lib/api'
import { keys } from '@renderer/lib/queries'
import type { ReaderPosition } from './types'

const DELAY_MS = 1500

/** Salva a posição de leitura com atraso (rolagem gera muitos eventos) e ao fechar o livro. */
export function useReadingProgress(bookId: number): (position: ReaderPosition) => void {
  const client = useQueryClient()
  const pending = useRef<ReaderPosition | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current)
    const position = pending.current
    if (!position) return
    pending.current = null
    await api.books
      .update(bookId, { progress: position.progress, location: position.location })
      .catch(() => undefined)
  }, [bookId])

  useEffect(() => {
    void api.books.markOpened(bookId).catch(() => undefined)
    const onUnload = (): void => void flush()
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      // recarrega a biblioteca só depois de a posição estar gravada
      void flush().then(() => client.invalidateQueries({ queryKey: keys.books }))
    }
  }, [bookId, flush, client])

  return useCallback(
    (position: ReaderPosition) => {
      pending.current = position
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void flush(), DELAY_MS)
    },
    [flush]
  )
}
