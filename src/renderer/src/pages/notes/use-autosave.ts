import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { NoteUpdate } from '@shared/schemas'
import { api } from '@renderer/lib/api'
import { keys } from '@renderer/lib/queries'

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error'

const DELAY_MS = 700

/**
 * Junta as mudanças de uma anotação e salva depois de uma pausa na digitação.
 * Ao sair da anotação (desmontar), salva o que estiver pendente na hora.
 */
export function useAutosave(noteId: number): {
  status: SaveStatus
  schedule: (patch: NoteUpdate) => void
} {
  const client = useQueryClient()
  const pending = useRef<NoteUpdate>({})
  const timer = useRef<number | undefined>(undefined)
  const [status, setStatus] = useState<SaveStatus>('saved')

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current)
    const patch = pending.current
    if (Object.keys(patch).length === 0) return
    pending.current = {}
    setStatus('saving')
    try {
      await api.notes.update(noteId, patch)
      setStatus(Object.keys(pending.current).length > 0 ? 'pending' : 'saved')
      void client.invalidateQueries({ queryKey: keys.notes })
    } catch (error) {
      // devolve o patch para a próxima tentativa, sem sobrescrever mudanças mais novas
      pending.current = { ...patch, ...pending.current }
      setStatus('error')
      toast.error(`Não foi possível salvar: ${(error as Error).message}`)
    }
  }, [noteId, client])

  const schedule = useCallback(
    (patch: NoteUpdate) => {
      pending.current = { ...pending.current, ...patch }
      setStatus('pending')
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void flush(), DELAY_MS)
    },
    [flush]
  )

  useEffect(() => {
    const onUnload = (): void => void flush()
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      void flush()
    }
  }, [flush])

  return { status, schedule }
}
