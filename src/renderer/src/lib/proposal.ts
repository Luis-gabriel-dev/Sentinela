import type { Proposal, ProposalSkip, ProposedTopic } from '@shared/schemas'

/** O que o estudante desmarcou: temas pela chave "grupo.item.subitem", blocos pelo índice. */
export interface ProposalSelection {
  topics: Set<string>
  blocks: Set<number>
}

export const emptySelection = (): ProposalSelection => ({ topics: new Set(), blocks: new Set() })

/** Quantos itens serão criados (desmarcar um tema tira os subtópicos dele). */
export function selectedCount(proposal: Proposal, skip: ProposalSelection): number {
  const count = (items: ProposedTopic[], key: string): number =>
    items.reduce(
      (sum, t, i) =>
        skip.topics.has(`${key}.${i}`) ? sum : sum + 1 + count(t.children, `${key}.${i}`),
      0
    )
  const topics = proposal.topics.reduce((sum, g, i) => sum + count(g.items, String(i)), 0)
  return topics + proposal.blocks.filter((_, i) => !skip.blocks.has(i)).length
}

/** Para mandar à Api. */
export const toSkip = (s: ProposalSelection): ProposalSkip => ({
  topics: [...s.topics],
  blocks: [...s.blocks]
})
