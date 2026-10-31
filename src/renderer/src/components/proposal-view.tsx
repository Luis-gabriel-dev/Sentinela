import type { Proposal, ProposedBlock, ProposedTopic, WeekWindow } from '@shared/schemas'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { WEEKDAYS } from '@renderer/lib/format'
import type { ProposalSelection } from '@renderer/lib/proposal'
import { useProjects, useTopics, useWeekAvailability } from '@renderer/lib/queries'
import { topicPath } from '@renderer/lib/topics'
import { cn } from '@renderer/lib/utils'
import { toMinutes } from '@renderer/lib/week'

const insideWindows = (b: ProposedBlock, windows: WeekWindow[]): boolean =>
  windows.some(
    (w) =>
      w.weekday === b.weekday &&
      toMinutes(b.startTime) >= toMinutes(w.startTime) &&
      toMinutes(b.endTime) <= toMinutes(w.endTime)
  )

const shortDay = (weekday: number): string => WEEKDAYS[weekday].slice(0, 3)

/** Prévia de uma proposta (temas novos e blocos semanais) com caixas para desmarcar. */
export function ProposalView({
  proposal,
  selection,
  onChange,
  readOnly = false
}: {
  proposal: Proposal
  selection: ProposalSelection
  onChange: (next: ProposalSelection) => void
  readOnly?: boolean
}): React.JSX.Element {
  const { data: topics = [] } = useTopics()
  const { data: projects = [] } = useProjects()
  const { data: availability } = useWeekAvailability()
  const windows = availability?.windows ?? []
  const topicName = new Map(topics.map((t) => [t.id, t.name]))
  const projectName = new Map(projects.map((p) => [p.id, p.repo.split('/').pop()]))

  const toggleTopic = (key: string, checked: boolean): void => {
    const next = new Set(selection.topics)
    if (checked) next.delete(key)
    else next.add(key)
    onChange({ ...selection, topics: next })
  }
  const toggleBlock = (index: number, checked: boolean): void => {
    const next = new Set(selection.blocks)
    if (checked) next.delete(index)
    else next.add(index)
    onChange({ ...selection, blocks: next })
  }

  const renderTopics = (
    items: ProposedTopic[],
    key: string,
    depth: number,
    parentOff: boolean
  ): React.JSX.Element[] =>
    items.map((item, i) => {
      const itemKey = `${key}.${i}`
      const off = parentOff || selection.topics.has(itemKey)
      return (
        <div key={itemKey}>
          <label
            className={cn(
              'flex cursor-pointer items-center gap-2 py-1 pr-2 text-sm hover:bg-accent/40',
              depth === 0 && 'font-medium',
              off && 'text-muted-foreground'
            )}
            style={{ paddingLeft: 8 + depth * 20 }}
          >
            <Checkbox
              checked={!off}
              disabled={readOnly || parentOff}
              onCheckedChange={(c) => toggleTopic(itemKey, c === true)}
            />
            <span className={cn('min-w-0 truncate', off && 'line-through')}>{item.name}</span>
          </label>
          {renderTopics(item.children, itemKey, depth + 1, off)}
        </div>
      )
    })

  const blocks = proposal.blocks
    .map((b, i) => ({ b, i }))
    .toSorted(
      (x, y) =>
        ((x.b.weekday + 6) % 7) - ((y.b.weekday + 6) % 7) ||
        x.b.startTime.localeCompare(y.b.startTime)
    )

  return (
    <div className="grid gap-3">
      {proposal.topics.map((group, g) => (
        <section key={g} className="grid gap-1">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">
            {group.parentId !== null
              ? `Temas novos dentro de ${topicPath(topics, group.parentId) || 'um tema'}`
              : 'Temas novos'}
          </h4>
          <div className="rounded-lg border py-1">
            {renderTopics(group.items, String(g), 0, false)}
          </div>
        </section>
      ))}

      {blocks.length > 0 && (
        <section className="grid gap-1">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">
            Na agenda, toda semana
          </h4>
          <div className="rounded-lg border">
            {blocks.map(({ b, i }) => {
              const off = selection.blocks.has(i)
              const about =
                (b.topicId !== null && topicName.get(b.topicId)) ||
                (b.topicName && `${b.topicName} (novo)`) ||
                (b.projectId !== null && projectName.get(b.projectId)) ||
                null
              return (
                <label
                  key={i}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 border-b px-2 py-1.5 text-sm last:border-b-0 hover:bg-accent/40',
                    off && 'text-muted-foreground'
                  )}
                >
                  <Checkbox
                    checked={!off}
                    disabled={readOnly}
                    onCheckedChange={(c) => toggleBlock(i, c === true)}
                  />
                  <span className="w-28 shrink-0 tabular-nums">
                    <span className="font-medium">{shortDay(b.weekday)}</span>{' '}
                    <span className="text-xs text-muted-foreground">
                      {b.startTime}–{b.endTime}
                    </span>
                  </span>
                  <span className={cn('min-w-0 flex-1 truncate', off && 'line-through')}>
                    {b.title}
                    {about && <span className="text-xs text-muted-foreground"> · {about}</span>}
                  </span>
                  {windows.length > 0 && !insideWindows(b, windows) && (
                    <span
                      className="shrink-0 text-xs text-amber-500"
                      title="Fora dos horários livres informados na Semana"
                    >
                      fora dos horários livres
                    </span>
                  )}
                </label>
              )
            })}
          </div>
          {proposal.replaceBlockIds.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Substitui {proposal.replaceBlockIds.length} bloco(s) semanais que estão nesses
              horários.
            </p>
          )}
        </section>
      )}
    </div>
  )
}
