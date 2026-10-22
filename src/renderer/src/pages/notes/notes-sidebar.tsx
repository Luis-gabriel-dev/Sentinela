import { useEffect, useMemo, useState } from 'react'
import { NavLink, useNavigate } from 'react-router'
import {
  ChevronRight,
  FilePlus2,
  FileText,
  FolderPlus,
  Inbox,
  Search,
  Sparkles,
  X
} from 'lucide-react'
import { SNIPPET_MARK, type NoteSummary } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { noteTitle } from '@renderer/lib/format'
import {
  useCreateNote,
  useNotes,
  useNoteSearch,
  useRagSearch,
  useTopics
} from '@renderer/lib/queries'
import { useDebounced } from '@renderer/lib/use-debounced'
import { buildTopicTree, topicPath, type TopicNode } from '@renderer/lib/topics'
import { cn } from '@renderer/lib/utils'
import { TopicDialog } from '../topics/topic-dialog'

const EXPANDED_KEY = 'sentinela:notes-expanded'
const NO_TOPIC = 0

function readExpanded(): Set<number> {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '[]') as number[])
  } catch {
    return new Set()
  }
}

export function NotesSidebar({ activeId }: { activeId: number | null }): React.JSX.Element {
  const { data: topics = [] } = useTopics()
  const { data: notes = [] } = useNotes()
  const create = useCreateNote()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(readExpanded)
  const [folderDialog, setFolderDialog] = useState<{ parentId: number | null } | null>(null)

  const tree = useMemo(() => buildTopicTree(topics), [topics])
  const notesByTopic = useMemo(() => {
    const map = new Map<number, NoteSummary[]>()
    for (const note of notes.toSorted((a, b) =>
      noteTitle(a.title).localeCompare(noteTitle(b.title))
    )) {
      const key = note.topicId ?? NO_TOPIC
      map.set(key, [...(map.get(key) ?? []), note])
    }
    return map
  }, [notes])

  // Abre as pastas do caminho até a anotação ativa sempre que ela muda
  // (ajuste de estado durante o render, sem efeito: https://react.dev/learn/you-might-not-need-an-effect).
  const activeTopicId = notes.find((n) => n.id === activeId)?.topicId ?? null
  const revealKey = `${activeTopicId}:${topics.length}`
  const [revealed, setRevealed] = useState<string | null>(null)
  if (activeTopicId !== null && revealKey !== revealed) {
    setRevealed(revealKey)
    const byId = new Map(topics.map((t) => [t.id, t]))
    const next = new Set(expanded)
    for (let t = byId.get(activeTopicId); t; t = t.parentId ? byId.get(t.parentId) : undefined) {
      next.add(t.id)
    }
    if (next.size !== expanded.size) setExpanded(next)
  }

  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]))
    } catch {
      // ignora: só não lembra das pastas abertas
    }
  }, [expanded])

  const toggle = (id: number): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const createNote = (topicId: number | null): void => {
    if (topicId !== null) setExpanded((prev) => new Set(prev).add(topicId))
    create.mutate([{ topicId }], {
      onSuccess: (note) => navigate(`/anotacoes/${note.id}`, { state: { focusTitle: true } })
    })
  }

  const unsorted = notesByTopic.get(NO_TOPIC) ?? []

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r bg-sidebar/40">
      <div className="flex items-center gap-1 px-3 pt-4 pb-2">
        <h2 className="flex-1 px-1 text-sm font-semibold">Anotações</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setFolderDialog({ parentId: null })}
              aria-label="Nova pasta"
            >
              <FolderPlus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Nova pasta (tema)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => createNote(activeTopicId)}
              aria-label="Nova anotação"
            >
              <FilePlus2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Nova anotação</TooltipContent>
        </Tooltip>
      </div>

      <div className="relative px-3 pb-3">
        <Search className="pointer-events-none absolute top-1/2 left-5.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
          placeholder="Buscar nas anotações..."
          className="h-8 bg-background pr-8 pl-8"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Limpar busca"
            className="absolute top-1/2 right-5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {query.trim() ? (
          <SearchResults query={query} activeId={activeId} />
        ) : (
          <>
            {tree.map((node) => (
              <Folder
                key={node.id}
                node={node}
                notesByTopic={notesByTopic}
                expanded={expanded}
                activeId={activeId}
                onToggle={toggle}
                onCreateNote={createNote}
              />
            ))}
            {(unsorted.length > 0 || tree.length === 0) && (
              <div className="mt-2">
                <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <Inbox className="size-3.5" /> Sem tema
                </div>
                {unsorted.map((note) => (
                  <NoteLink key={note.id} note={note} depth={0} />
                ))}
                {notes.length === 0 && (
                  <p className="px-2 py-2 text-sm text-muted-foreground">
                    Nenhuma anotação ainda. Use o botão + acima.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <TopicDialog
        open={folderDialog !== null}
        onOpenChange={(open) => !open && setFolderDialog(null)}
        parentId={folderDialog?.parentId ?? null}
      />
    </aside>
  )
}

function countNotes(node: TopicNode, notesByTopic: Map<number, NoteSummary[]>): number {
  return (
    (notesByTopic.get(node.id)?.length ?? 0) +
    node.children.reduce((sum, c) => sum + countNotes(c, notesByTopic), 0)
  )
}

interface FolderProps {
  node: TopicNode
  notesByTopic: Map<number, NoteSummary[]>
  expanded: Set<number>
  activeId: number | null
  onToggle: (id: number) => void
  onCreateNote: (topicId: number) => void
}

function Folder(props: FolderProps): React.JSX.Element {
  const { node, notesByTopic, expanded, onToggle, onCreateNote } = props
  const open = expanded.has(node.id)
  const ownNotes = notesByTopic.get(node.id) ?? []
  const total = countNotes(node, notesByTopic)

  return (
    <div>
      <div
        className="group flex items-center rounded-md pr-1 hover:bg-accent/60"
        style={{ paddingLeft: node.depth * 14 }}
      >
        <button
          type="button"
          onClick={() => onToggle(node.id)}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-1 text-left text-sm"
        >
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90'
            )}
          />
          <span className="size-2 shrink-0 rounded-full" style={{ background: node.color }} />
          <span className={cn('truncate', total === 0 && 'text-muted-foreground')}>
            {node.name}
          </span>
          {total > 0 && (
            <span className="ml-auto pl-2 text-xs text-muted-foreground tabular-nums group-hover:hidden">
              {total}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onCreateNote(node.id)}
          aria-label={`Nova anotação em ${node.name}`}
          className="hidden size-6 shrink-0 place-items-center rounded text-muted-foreground group-hover:grid hover:bg-background hover:text-foreground"
        >
          <FilePlus2 className="size-3.5" />
        </button>
      </div>

      {open && (
        <div>
          {node.children.map((child) => (
            <Folder key={child.id} {...props} node={child} />
          ))}
          {ownNotes.map((note) => (
            <NoteLink key={note.id} note={note} depth={node.depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function NoteLink({ note, depth }: { note: NoteSummary; depth: number }): React.JSX.Element {
  return (
    <NavLink
      to={`/anotacoes/${note.id}`}
      style={{ paddingLeft: depth * 14 + 22 }}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-md py-1.5 pr-2 text-sm text-foreground/85 hover:bg-accent/60',
          isActive && 'bg-accent font-medium text-accent-foreground'
        )
      }
    >
      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
      <span className={cn('truncate', !note.title.trim() && 'text-muted-foreground italic')}>
        {noteTitle(note.title)}
      </span>
    </NavLink>
  )
}

/** Trecho com os termos encontrados destacados, sem injetar HTML. */
function Snippet({ text }: { text: string }): React.JSX.Element {
  const parts = text.split(SNIPPET_MARK.start)
  return (
    <>
      {parts[0]}
      {parts.slice(1).map((part, i) => {
        const [hit, rest] = part.split(SNIPPET_MARK.end)
        return (
          <span key={i}>
            <mark className="rounded-sm bg-primary/25 px-0.5 text-foreground">{hit}</mark>
            {rest}
          </span>
        )
      })}
    </>
  )
}

function SearchResults({
  query,
  activeId
}: {
  query: string
  activeId: number | null
}): React.JSX.Element {
  const { data: results = [], isFetching } = useNoteSearch(query)
  const { data: topics = [] } = useTopics()
  // Busca por significado (anotações que falam do assunto sem usar as mesmas palavras).
  const debounced = useDebounced(query.trim(), 400)
  const { data: hits = [], isFetching: searchingMeaning } = useRagSearch(debounced)
  const exact = new Set(results.map((r) => r.id))
  const related = hits
    .filter((h) => h.kind === 'note' && !exact.has(h.sourceId))
    .filter((h, i, all) => all.findIndex((o) => o.sourceId === h.sourceId) === i)

  if (results.length === 0 && related.length === 0) {
    return (
      <p className="px-2 py-3 text-sm text-muted-foreground">
        {isFetching || searchingMeaning ? 'Buscando...' : 'Nada encontrado.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {results.map((r) => (
        <NavLink
          key={r.id}
          to={`/anotacoes/${r.id}`}
          className={cn(
            'rounded-md px-2.5 py-2 hover:bg-accent/60',
            r.id === activeId && 'bg-accent'
          )}
        >
          <div className="truncate text-sm font-medium">{noteTitle(r.title)}</div>
          {r.topicId !== null && (
            <div className="truncate text-xs text-muted-foreground">
              {topicPath(topics, r.topicId)}
            </div>
          )}
          {r.snippet && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              <Snippet text={r.snippet} />
            </p>
          )}
        </NavLink>
      ))}
      {related.length > 0 && (
        <>
          <p className="mt-3 flex items-center gap-1.5 px-2.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5" /> Relacionadas por significado
          </p>
          {related.map((h) => (
            <NavLink
              key={h.sourceId}
              to={`/anotacoes/${h.sourceId}`}
              className={cn(
                'rounded-md px-2.5 py-2 hover:bg-accent/60',
                h.sourceId === activeId && 'bg-accent'
              )}
            >
              <div className="truncate text-sm font-medium">{noteTitle(h.title)}</div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{h.excerpt}</p>
            </NavLink>
          ))}
        </>
      )}
    </div>
  )
}
