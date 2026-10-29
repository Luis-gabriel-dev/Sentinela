import { subtreeProgress, type SubtreeProgress } from '@shared/progress'
import type { Topic } from '@shared/types'
import { startOfWeek } from './format'

export interface TopicNode extends Topic {
  children: TopicNode[]
  depth: number
}

export function buildTopicTree(topics: Topic[]): TopicNode[] {
  const nodes = new Map<number, TopicNode>(
    topics.map((t) => [t.id, { ...t, children: [], depth: 0 }])
  )
  const roots: TopicNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId !== null ? nodes.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const setDepth = (list: TopicNode[], depth: number): void =>
    list.forEach((n) => {
      n.depth = depth
      setDepth(n.children, depth + 1)
    })
  setDepth(roots, 0)
  return roots
}

/** Lista achatada em ordem de árvore, útil para selects ("Cyber / Redes"). */
export function flattenTree(roots: TopicNode[]): TopicNode[] {
  return roots.flatMap((n) => [n, ...flattenTree(n.children)])
}

export function topicPath(topics: Topic[], id: number | null): string {
  const byId = new Map(topics.map((t) => [t.id, t]))
  const parts: string[] = []
  let current = id !== null ? byId.get(id) : undefined
  while (current) {
    parts.unshift(current.name)
    current = current.parentId !== null ? byId.get(current.parentId) : undefined
  }
  return parts.join(' / ')
}

export type TopicProgress = SubtreeProgress<TopicNode>

/** Progresso de um assunto pelos tópicos do nível mais fundo (veja subtreeProgress). */
export const topicProgress = (node: TopicNode): TopicProgress =>
  subtreeProgress(node, startOfWeek())
