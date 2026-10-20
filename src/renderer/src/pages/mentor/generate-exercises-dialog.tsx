import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import type { Difficulty, ExerciseKind } from '@shared/schemas'
import { DIFFICULTY_LABEL } from '@renderer/lib/format'
import type { ExerciseSet } from '@shared/types'
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
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Textarea } from '@renderer/components/ui/textarea'
import { TopicSelect } from '@renderer/components/topic-select'
import { useGenerateExercises } from '@renderer/lib/queries'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (set: ExerciseSet) => void
}

export function GenerateExercisesDialog(props: Props): React.JSX.Element {
  return (
    <Dialog open={props.open} onOpenChange={(open) => props.onOpenChange(open)}>
      <DialogContent className="sm:max-w-lg">
        {props.open && <GenerateForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function GenerateForm({ onOpenChange, onCreated }: Props): React.JSX.Element {
  const [topicId, setTopicId] = useState<number | null>(null)
  const [count, setCount] = useState('6')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [kinds, setKinds] = useState<ExerciseKind[]>(['multiple_choice', 'open'])
  const [focus, setFocus] = useState('')
  const generate = useGenerateExercises()
  const n = Number(count)
  const valid = topicId !== null && Number.isInteger(n) && n >= 1 && n <= 20 && kinds.length > 0

  const toggleKind = (kind: ExerciseKind, on: boolean): void =>
    setKinds((prev) => (on ? [...new Set([...prev, kind])] : prev.filter((k) => k !== kind)))

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!valid) return
    generate.mutate(
      [{ topicId: topicId!, count: n, difficulty, kinds, focus: focus.trim() || null }],
      {
        onSuccess: (set) => {
          onOpenChange(false)
          onCreated(set)
        }
      }
    )
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Gerar exercícios</DialogTitle>
        <DialogDescription>
          A IA usa suas anotações e destaques dos livros do tema, e reforça o que você errou antes.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label>Tema</Label>
        <TopicSelect value={topicId} onChange={setTopicId} noneLabel="Escolha um tema" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="ex-count">Quantidade</Label>
          <Input
            id="ex-count"
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label>Dificuldade</Label>
          <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => (
                <SelectItem key={d} value={d}>
                  {DIFFICULTY_LABEL[d]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-6 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox
            checked={kinds.includes('multiple_choice')}
            onCheckedChange={(c) => toggleKind('multiple_choice', c === true)}
          />
          Múltipla escolha
        </label>
        <label className="flex items-center gap-2">
          <Checkbox
            checked={kinds.includes('open')}
            onCheckedChange={(c) => toggleKind('open', c === true)}
          />
          Dissertativas
        </label>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="ex-focus">Foco (opcional)</Label>
        <Textarea
          id="ex-focus"
          rows={2}
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="Ex.: mais questões práticas sobre o handshake do TCP"
        />
      </div>

      <DialogFooter className="items-center sm:justify-between">
        <span className="text-xs text-muted-foreground">
          {generate.isPending ? 'Isso pode levar até um minuto.' : ''}
        </span>
        <Button type="submit" disabled={!valid || generate.isPending}>
          {generate.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {generate.isPending ? 'Gerando...' : 'Gerar'}
        </Button>
      </DialogFooter>
    </form>
  )
}
