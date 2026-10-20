import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowUp, Loader2, MessageSquarePlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { AI_STREAM_CHANNEL } from '@shared/api'
import type { AiStreamEvent } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import { ConfirmDelete } from '@renderer/components/confirm-delete'
import { MentorIcon } from '@renderer/components/icons'
import { Markdown } from '@renderer/components/markdown'
import { api } from '@renderer/lib/api'
import { timeAgo } from '@renderer/lib/projects'
import { keys, useConversations, useDeleteConversation, useMessages } from '@renderer/lib/queries'
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
          reply: event.type === 'done' ? event.text : current.reply + event.text
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
    const start: Pending = { text: content, conversationId: activeId, reply: '' }
    pendingRef.current = start
    setPending(start)
    setInput('')
    try {
      const { conversation } = await api.mentor.send({ conversationId: activeId, text: content })
      await Promise.all([
        client.invalidateQueries({ queryKey: keys.messages(conversation.id) }),
        client.invalidateQueries({ queryKey: keys.conversations })
      ])
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
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-6">
            {empty && (
              <div className="py-10 text-center">
                <MentorIcon className="icon-strong mx-auto size-10 text-primary" />
                <h2 className="mt-3 text-lg font-semibold">Sua mentora de estudos</h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Ela conhece seus temas, progresso, agenda, tarefas, exercícios e projetos.
                  Pergunte se está no rumo certo ou peça um plano.
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

            {messages.map((m) =>
              m.role === 'user' ? (
                <UserBubble key={m.id} text={m.content} />
              ) : (
                <AssistantBubble key={m.id} text={m.content} />
              )
            )}
            {pending && (
              <>
                <UserBubble text={pending.text} />
                {pending.reply ? (
                  <AssistantBubble text={pending.reply} />
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Pensando nos seus dados...
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

function UserBubble({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground">
      {text}
    </div>
  )
}

function AssistantBubble({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
        <MentorIcon className="icon-strong size-4" />
      </div>
      <Markdown className="min-w-0 flex-1">{text}</Markdown>
    </div>
  )
}
