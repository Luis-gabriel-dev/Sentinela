import { useMemo, useState } from 'react'
import { ChevronRight, Pencil, Plus, Sparkles, Target, Trash2 } from 'lucide-react'
import { TopicsIcon } from '@renderer/components/icons'
import type { Topic } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Progress } from '@renderer/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { ConfirmDelete } from '@renderer/components/confirm-delete'
import { EmptyState, PageHeader } from '@renderer/components/page-header'
import { useRemoveTopic, useTopics, useUpdateTopic } from '@renderer/lib/queries'
import { buildTopicTree, topicProgress, type TopicNode } from '@renderer/lib/topics'
import { cn } from '@renderer/lib/utils'
import { SuggestTopicsDialog } from './suggest-topics-dialog'
import { TopicDialog } from './topic-dialog'

type DialogState = { open: false } | { open: true; topic?: Topic; parentId?: number | null }

export function TopicsPage(): React.JSX.Element {
  const { data: topics = [], isLoading } = useTopics()
  const tree = useMemo(() => buildTopicTree(topics), [topics])
  const [dialog, setDialog] = useState<DialogState>({ open: false })
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [suggesting, setSuggesting] = useState<Topic | null>(null)

  const toggle = (id: number): void =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const actions = {
    toggle,
    isCollapsed: (id: number) => collapsed.has(id),
    addChild: (parentId: number) => setDialog({ open: true, parentId }),
    edit: (topic: Topic) => setDialog({ open: true, topic }),
    suggest: (topic: Topic) => setSuggesting(topic)
  }

  return (
    <>
      <PageHeader
        title="Temas e progresso"
        description="Organize seus estudos em temas, assuntos e tópicos."
        actions={
          <Button onClick={() => setDialog({ open: true, parentId: null })}>
            <Plus /> Novo tema
          </Button>
        }
      />

      {!isLoading && tree.length === 0 ? (
        <EmptyState icon={<TopicsIcon />} title="Nenhum tema ainda">
          Crie temas grandes como Cybersegurança ou Programação e divida em assuntos e tópicos.
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          {tree.map((root) => (
            <section key={root.id} className="overflow-hidden rounded-xl border bg-card">
              <div className="h-1" style={{ background: root.color }} />
              <div className="p-2">
                <TopicItem node={root} parent={null} actions={actions} />
              </div>
            </section>
          ))}
        </div>
      )}

      <TopicDialog
        open={dialog.open}
        onOpenChange={(open) => !open && setDialog({ open: false })}
        topic={dialog.open ? dialog.topic : undefined}
        parentId={dialog.open ? dialog.parentId : null}
      />
      <SuggestTopicsDialog
        topic={suggesting}
        onOpenChange={(open) => !open && setSuggesting(null)}
      />
    </>
  )
}

interface ItemActions {
  toggle: (id: number) => void
  isCollapsed: (id: number) => boolean
  addChild: (parentId: number) => void
  edit: (topic: Topic) => void
  suggest: (topic: Topic) => void
}

function TopicItem({
  node,
  parent,
  actions
}: {
  node: TopicNode
  parent: TopicNode | null
  actions: ItemActions
}): React.JSX.Element {
  const update = useUpdateTopic()
  const remove = useRemoveTopic()
  const hasChildren = node.children.length > 0
  const collapsed = actions.isCollapsed(node.id)
  const isCheckable = parent?.trackProgress === true
  const done = node.completedAt !== null
  const progress = node.trackProgress ? topicProgress(node) : null
  const isRoot = parent === null

  return (
    <div>
      <div
        className="group flex items-center gap-2 rounded-lg py-1.5 pr-2 hover:bg-accent/50"
        style={{ paddingLeft: 8 + node.depth * 22 }}
      >
        <button
          type="button"
          onClick={() => actions.toggle(node.id)}
          className={cn(
            'grid size-5 place-items-center rounded text-muted-foreground hover:text-foreground',
            !hasChildren && 'invisible'
          )}
          aria-label={collapsed ? 'Expandir' : 'Recolher'}
        >
          <ChevronRight className={cn('size-4 transition-transform', !collapsed && 'rotate-90')} />
        </button>

        {isCheckable ? (
          <Checkbox
            checked={done}
            onCheckedChange={(c) => update.mutate([node.id, { completed: c === true }])}
            aria-label="Tópico dominado"
          />
        ) : (
          <span className="size-3 shrink-0 rounded-full" style={{ background: node.color }} />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'truncate',
                isRoot ? 'text-base font-semibold' : 'text-sm',
                done && 'text-muted-foreground line-through'
              )}
            >
              {node.name}
            </span>
          </div>
          {node.description && (
            <p className="truncate text-xs text-muted-foreground">{node.description}</p>
          )}
        </div>

        {progress && (
          <div className="flex shrink-0 items-center gap-3">
            {node.weeklyGoal !== null && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
                      progress.doneThisWeek >= node.weeklyGoal
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'text-muted-foreground'
                    )}
                  >
                    <Target className="size-3" />
                    {progress.doneThisWeek}/{node.weeklyGoal}
                  </span>
                </TooltipTrigger>
                <TooltipContent>Tópicos concluídos nesta semana / meta</TooltipContent>
              </Tooltip>
            )}
            <div className="w-36">
              <Progress
                value={progress.percent}
                className="h-1.5"
                style={{ ['--progress-color' as string]: node.color }}
              />
            </div>
            <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">
              {progress.done}/{progress.total} · {progress.percent}%
            </span>
          </div>
        )}

        <div className="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => actions.suggest(node)}
                aria-label="Dividir em tópicos com IA"
                className="text-primary"
              >
                <Sparkles />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Dividir em tópicos com IA</TooltipContent>
          </Tooltip>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => actions.addChild(node.id)}
            aria-label="Adicionar subtema"
          >
            <Plus />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => actions.edit(node)}
            aria-label="Editar"
          >
            <Pencil />
          </Button>
          <ConfirmDelete
            title={`Excluir "${node.name}"?`}
            description={
              hasChildren
                ? 'Todos os subtemas também serão excluídos. Tarefas, blocos da agenda e anotações ligados a eles ficam sem tema.'
                : 'Tarefas, blocos da agenda e anotações ligados a ele ficam sem tema.'
            }
            onConfirm={() => remove.mutate([node.id])}
          >
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Excluir"
              className="hover:text-destructive"
            >
              <Trash2 />
            </Button>
          </ConfirmDelete>
        </div>
      </div>

      {hasChildren && !collapsed && (
        <div>
          {node.children.map((child) => (
            <TopicItem key={child.id} node={child} parent={node} actions={actions} />
          ))}
        </div>
      )}
    </div>
  )
}
