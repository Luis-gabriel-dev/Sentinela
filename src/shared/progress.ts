/** O que o cálculo de progresso precisa de um tema da árvore. */
export interface ProgressNode<T> {
  completedAt: Date | null
  children: T[]
}

export interface SubtreeProgress<T> {
  done: number
  total: number
  percent: number
  doneThisWeek: number
  /** Tópicos ainda não concluídos, na ordem da árvore. */
  pending: T[]
}

/**
 * Progresso de um tema pelo nível mais fundo: conta os tópicos sem subtópicos de toda a
 * subárvore (num livro importado, as subseções). Marcar um tema intermediário (um capítulo)
 * conta todos os tópicos dentro dele como concluídos, na data em que foi marcado.
 */
export function subtreeProgress<T extends ProgressNode<T>>(
  node: T,
  weekStart: Date
): SubtreeProgress<T> {
  let done = 0
  let total = 0
  let doneThisWeek = 0
  const pending: T[] = []
  const walk = (parent: T, inherited: Date | null): void => {
    for (const child of parent.children) {
      const doneAt = child.completedAt ?? inherited
      if (child.children.length) {
        walk(child, doneAt)
        continue
      }
      total++
      if (!doneAt) pending.push(child)
      else {
        done++
        if (doneAt >= weekStart) doneThisWeek++
      }
    }
  }
  walk(node, null)
  return {
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
    doneThisWeek,
    pending
  }
}
