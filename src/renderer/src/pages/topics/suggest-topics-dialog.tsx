import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { Topic, TopicSuggestion } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Textarea } from '@renderer/components/ui/textarea'
import { api } from '@renderer/lib/api'
import { keys, useSuggestTopics } from '@renderer/lib/queries'

interface Props {
  topic: Topic | null
  onOpenChange: (open: boolean) => void
}

/** A IA propõe subtópicos; o estudante escolhe quais criar. */
export function SuggestTopicsDialog({ topic, onOpenChange }: Props): React.JSX.Element {
  return (
    <Dialog open={topic !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {topic && <SuggestForm key={topic.id} topic={topic} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  )
}

function SuggestForm({
  topic,
  onOpenChange
}: {
  topic: Topic
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const client = useQueryClient()
  const suggest = useSuggestTopics()
  const [instructions, setInstructions] = useState('')
  const [suggestions, setSuggestions] = useState<TopicSuggestion[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [trackProgress, setTrackProgress] = useState(!topic.trackProgress)
  const [saving, setSaving] = useState(false)

  const run = (): void =>
    suggest.mutate([{ topicId: topic.id, instructions: instructions.trim() || null }], {
      onSuccess: (result) => {
        setSuggestions(result)
        setSelected(new Set(result.map((_, i) => i)))
      }
    })

  const create = async (): Promise<void> => {
    if (!suggestions) return
    setSaving(true)
    try {
      for (const [i, s] of suggestions.entries()) {
        if (!selected.has(i)) continue
        await api.topics.create({
          name: s.name,
          description: s.description || null,
          parentId: topic.id,
          color: topic.color
        })
      }
      if (trackProgress && !topic.trackProgress) {
        await api.topics.update(topic.id, { trackProgress: true })
      }
      await client.invalidateQueries({ queryKey: keys.topics })
      toast.success(`${selected.size} tópicos adicionados em ${topic.name}`)
      onOpenChange(false)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Dividir “{topic.name}” em tópicos</DialogTitle>
        <DialogDescription>
          A IA propõe tópicos na ordem de estudo. Você escolhe quais entram.
        </DialogDescription>
      </DialogHeader>

      {suggestions === null ? (
        <>
          <Textarea
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Opcional: “foco em segurança de redes”, “nível iniciante”, “seguir o livro do Kurose”..."
          />
          <DialogFooter>
            <Button onClick={run} disabled={suggest.isPending}>
              {suggest.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {suggest.isPending ? 'Pensando...' : 'Sugerir tópicos'}
            </Button>
          </DialogFooter>
        </>
      ) : (
        <>
          <div className="max-h-80 overflow-y-auto rounded-lg border">
            {suggestions.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                A IA não sugeriu tópicos novos (os que existem já cobrem o tema).
              </p>
            )}
            {suggestions.map((s, i) => (
              <label
                key={i}
                className="flex cursor-pointer items-start gap-3 border-b px-3 py-2.5 last:border-b-0 hover:bg-accent/50"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={selected.has(i)}
                  onCheckedChange={(c) =>
                    setSelected((prev) => {
                      const next = new Set(prev)
                      if (c === true) next.add(i)
                      else next.delete(i)
                      return next
                    })
                  }
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {i + 1}. {s.name}
                  </span>
                  <span className="text-xs text-muted-foreground">{s.description}</span>
                </span>
              </label>
            ))}
          </div>
          {!topic.trackProgress && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={trackProgress}
                onCheckedChange={(c) => setTrackProgress(c === true)}
              />
              Acompanhar o progresso de “{topic.name}” por esses tópicos
            </label>
          )}
          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" onClick={run} disabled={suggest.isPending || saving}>
              {suggest.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />} Sugerir de
              novo
            </Button>
            <Button onClick={() => void create()} disabled={selected.size === 0 || saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Plus />}
              Adicionar {selected.size} {selected.size === 1 ? 'tópico' : 'tópicos'}
            </Button>
          </DialogFooter>
        </>
      )}
    </div>
  )
}
