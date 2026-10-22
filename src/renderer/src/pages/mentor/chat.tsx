import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowUp, FoldVertical, Loader2, MessageSquarePlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { AI_STREAM_CHANNEL } from '@shared/api'
import type { AiStreamEvent, Conversation, RagSource } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Textarea } from '@renderer/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { ConfirmDelete } from '@renderer/components/confirm-delete'
import { MentorIcon } from '@renderer/components/icons'
import { Markdown } from '@renderer/components/markdown'
import { SourceLink } from '@renderer/components/source-link'
import { api } from '@renderer/lib/api'
import { timeAgo } from '@renderer/lib/projects'
import {
  useCompactConversation,
  useContextUsage,
  useConversations,
  useDeleteConversation,
  useMessages
} from '@renderer/lib/queries'
import { cn } from '@renderer/lib/utils'

const STARTERS = [
  'Estou no rumo certo esta semana?',
  'O que devo estudar hoje?',
  'Quais pontos fracos meus exercícios mostram?',
  'Monte um plano para eu avançar no tema em que estou mais atrasado.'
]

interface Pending {
  text: string
  /** Conversa que vai receber a resposta (null até a primeira parte chegar numa conversa nova). */
  conversationId: number | null
  reply: string
  /** Etapa antes da resposta (ex.: compactando a conversa). */
  status: string | null
}

export function MentorChat(): React.JSX.Element {
  const client = useQueryClient()
  const { data: conversations = [] } = useConversations()
  const [activeId, setActiveId] = useState<number | null>(null)
  const { data: messages = [] } = useMessages(activeId)
  const deleteConversation = useDeleteConversation()
  const [input, setInput] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const active = conversations.find((c) => c.id === activeId) ?? null

  // Recebe a resposta em pedaços enquanto o modelo escreve.
  useEffect(
    () =>
      window.sentinela.on(AI_STREAM_CHANNEL, (payload) => {
        const event = payload as AiStreamEvent
        const current = pendingRef.current
        if (!current) return
        if (current.conversationId !== null && current.conversationId !== event.conversationId) {
          return
        }
        const next: Pending = {
          ...current,
          conversationId: event.conversationId,
          status: event.type === 'status' ? event.text : null,
          reply:
            event.type === 'done'
              ? event.text
              : event.type === 'delta'
                ? current.reply + event.text
                : current.reply
        }
        pendingRef.current = next
        setPending(next)
      }),
    []
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, pending?.reply, pending?.text])

  const send = async (text: string): Promise<void> => {
    const content = text.trim()
    if (!content || pending) return
    const start: Pending = { text: content, conversationId: activeId, reply: '', status: null }
    pendingRef.current = start
    setPending(start)
    setInput('')
    try {
      const { conversation } = await api.mentor.send({ conversationId: activeId, text: content })
      // ['mentor'] cobre conversas, mensagens e o uso do contexto.
      await client.invalidateQueries({ queryKey: ['mentor'] })
      setActiveId(conversation.id)
    } catch (error) {
      toast.error((error as Error).message)
      setInput(content)
    } finally {
      pendingRef.current = null
      setPending(null)
    }
  }

  const empty = messages.length === 0 && !pending

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar/40">
        <div className="p-3">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => setActiveId(null)}
            disabled={!!pending}
          >
            <MessageSquarePlus /> Nova conversa
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={cn(
                'group flex items-center rounded-md hover:bg-accent/60',
                c.id === activeId && 'bg-accent'
              )}
            >
              <button
                type="button"
                disabled={!!pending}
                onClick={() => setActiveId(c.id)}
                className="min-w-0 flex-1 px-2.5 py-2 text-left"
              >
                <span className="block truncate text-sm">{c.title}</span>
                <span className="text-xs text-muted-foreground">{timeAgo(c.updatedAt)}</span>
              </button>
              <ConfirmDelete
                title="Apagar conversa?"
                description={`"${c.title}" será apagada.`}
                onConfirm={() =>
                  deleteConversation.mutate([c.id], {
                    onSuccess: () => activeId === c.id && setActiveId(null)
                  })
                }
              >
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Apagar conversa"
                  className="mr-1 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 />
                </Button>
              </ConfirmDelete>
            </div>
          ))}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {active && <ConversationBar conversation={active} busy={!!pending} />}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-6">
            {empty && (
              <div className="py-10 text-center">
                <MentorIcon className="icon-strong mx-auto size-10 text-primary" />
                <h2 className="mt-3 text-lg font-semibold">Sua mentora de estudos</h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Ela conhece seus temas, progresso, agenda, tarefas, exercícios e projetos, e
                  procura nas suas anotações e livros o que tiver a ver com a pergunta.
                </p>
                <div className="mx-auto mt-6 grid max-w-xl gap-2 sm:grid-cols-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      className="rounded-lg border bg-card px-3 py-2.5 text-left text-sm hover:border-primary/50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className="contents">
                {m.role === 'user' ? (
                  <UserBubble text={m.content} />
                ) : (
                  <AssistantBubble text={m.content} sources={m.sources} />
                )}
                {active?.summary && m.id === active.summaryUntil && (
                  <SummaryDivider conversation={active} />
                )}
              </div>
            ))}
            {pending && (
              <>
                <UserBubble text={pending.text} />
                {pending.reply ? (
                  <AssistantBubble text={pending.reply} sources={null} />
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    {pending.status ?? 'Pensando nos seus dados...'}
                  </p>
                )}
              </>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <form
          className="border-t p-4"
          onSubmit={(e) => {
            e.preventDefault()
            void send(input)
          }}
        >
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border bg-card p-2 focus-within:ring-2 focus-within:ring-ring/40">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send(input)
                }
              }}
              rows={1}
              placeholder="Pergunte à mentora (Enter envia, Shift+Enter quebra linha)"
              className="max-h-40 min-h-9 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || !!pending}
              aria-label="Enviar"
            >
              {pending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}

/** Título da conversa, quanto do contexto ela ocupa e o botão de compactar. */
function ConversationBar({
  conversation,
  busy
}: {
  conversation: Conversation
  busy: boolean
}): React.JSX.Element {
  const { data: usage } = useContextUsage(conversation.id)
  const compact = useCompactConversation()
  const [open, setOpen] = useState(false)
  const [instructions, setInstructions] = useState('')
  const percent = usage ? Math.min(100, Math.round((usage.used / usage.max) * 100)) : 0
  const canCompact = !!usage && usage.liveMessages >= 2 && !busy

  return (
    <div className="flex items-center gap-3 border-b px-6 py-2">
      <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{conversation.title}</h2>
      {usage && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full bg-primary transition-[width]',
                    percent >= 75 && 'bg-amber-500'
                  )}
                  style={{ width: `${Math.max(percent, 2)}%` }}
                />
              </div>
              {percent}% do contexto
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-72">
            A conversa ocupa cerca de {percent}% do que o modelo consegue ler de uma vez. Quando
            enche, as mensagens mais antigas são resumidas sozinhas; dá para compactar antes, no
            momento que você escolher.
          </TooltipContent>
        </Tooltip>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" disabled={!canCompact || compact.isPending}>
            {compact.isPending ? <Loader2 className="animate-spin" /> : <FoldVertical />}
            {compact.isPending ? 'Compactando...' : 'Compactar'}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 space-y-3">
          <div>
            <p className="text-sm font-medium">Compactar a conversa</p>
            <p className="mt-1 text-xs text-muted-foreground">
              A mentora resume tudo até aqui e passa a receber só o resumo. As mensagens continuam
              aparecendo para você.
            </p>
          </div>
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
            placeholder="O que o resumo deve manter com cuidado (opcional). Ex.: o plano de estudos que combinamos."
            className="text-sm"
          />
          <Button
            className="w-full"
            onClick={() => {
              setOpen(false)
              compact.mutate(
                [{ conversationId: conversation.id, instructions: instructions.trim() || null }],
                {
                  onSuccess: () => {
                    setInstructions('')
                    toast.success('Conversa compactada')
                  }
                }
              )
            }}
          >
            <FoldVertical /> Compactar agora
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** Marca até onde a conversa foi resumida, com o resumo que a mentora recebe. */
function SummaryDivider({ conversation }: { conversation: Conversation }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 hover:text-foreground"
        >
          <FoldVertical className="size-3.5" />
          Conversa compactada
          {conversation.compactedAt && ` ${timeAgo(conversation.compactedAt)}`} ·{' '}
          {open ? 'esconder resumo' : 'ver resumo'}
        </button>
        <div className="h-px flex-1 bg-border" />
      </div>
      {open && (
        <div className="mt-3 rounded-lg border bg-muted/30 p-4">
          <Markdown className="text-sm">{conversation.summary ?? ''}</Markdown>
          <p className="mt-3 text-xs text-muted-foreground">
            A mentora recebe este resumo no lugar das mensagens acima.
          </p>
        </div>
      )}
    </div>
  )
}

function UserBubble({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground">
      {text}
    </div>
  )
}

function AssistantBubble({
  text,
  sources
}: {
  text: string
  sources: RagSource[] | null
}): React.JSX.Element {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
        <MentorIcon className="icon-strong size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <Markdown>{text}</Markdown>
        {sources?.length ? <Sources text={text} sources={sources} /> : null}
      </div>
    </div>
  )
}

/** Trechos citados na resposta ([n]) e, recolhidos, os outros que a busca entregou. */
function Sources({ text, sources }: { text: string; sources: RagSource[] }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const cited = new Set([...text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])))
  const used = sources.filter((s) => cited.has(s.n))
  const others = sources.filter((s) => !cited.has(s.n))

  return (
    <div className="mt-3 space-y-2">
      {used.length > 0 && (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {used.map((s) => (
            <SourceLink key={s.n} source={s} />
          ))}
        </div>
      )}
      {others.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {open
              ? 'Esconder os outros trechos consultados'
              : `${used.length ? 'Outros ' : ''}${others.length} ${others.length === 1 ? 'trecho consultado' : 'trechos consultados'} nas suas anotações e livros`}
          </button>
          {open && (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {others.map((s) => (
                <SourceLink key={s.n} source={s} dimmed />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
