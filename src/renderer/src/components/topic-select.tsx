import { useMemo } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { useTopics } from '@renderer/lib/queries'
import { buildTopicTree, flattenTree } from '@renderer/lib/topics'
import { cn } from '@renderer/lib/utils'

const NONE = 'none'

interface Props {
  value: number | null
  onChange: (id: number | null) => void
  noneLabel?: string
  /** Esconde este tema e seus descendentes (ao escolher o "pai" de um tema). */
  excludeId?: number
  className?: string
}

export function TopicSelect({
  value,
  onChange,
  noneLabel = 'Sem tema',
  excludeId,
  className
}: Props): React.JSX.Element {
  const { data: topics = [] } = useTopics()

  const options = useMemo(() => {
    const roots = buildTopicTree(topics)
    const prune = (nodes: typeof roots): typeof roots =>
      nodes.filter((n) => n.id !== excludeId).map((n) => ({ ...n, children: prune(n.children) }))
    return flattenTree(prune(roots))
  }, [topics, excludeId])

  return (
    <Select
      value={value === null ? NONE : String(value)}
      onValueChange={(v) => onChange(v === NONE ? null : Number(v))}
    >
      {/* Nome longo é cortado com "..." em vez de alargar o campo (e o diálogo em volta). */}
      <SelectTrigger
        className={cn(
          'min-w-0 *:data-[slot=select-value]:w-0 *:data-[slot=select-value]:flex-1',
          className ?? 'w-full'
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{noneLabel}</SelectItem>
        {options.map((t) => (
          <SelectItem key={t.id} value={String(t.id)}>
            <span style={{ paddingLeft: t.depth * 12 }} className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
              <span className="truncate">{t.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
