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
      <SelectTrigger className={className ?? 'w-full'}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{noneLabel}</SelectItem>
        {options.map((t) => (
          <SelectItem key={t.id} value={String(t.id)}>
            <span style={{ paddingLeft: t.depth * 12 }} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
              {t.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
