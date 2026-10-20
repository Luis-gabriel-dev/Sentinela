import { useState } from 'react'
import { ArrowLeft, Check, CircleCheck, CircleX, Eye, Trash2 } from 'lucide-react'
import type { ExerciseResult } from '@shared/schemas'
import type { Exercise } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/progress'
import { Textarea } from '@renderer/components/ui/textarea'
import { ConfirmDelete } from '@renderer/components/confirm-delete'
import { Markdown } from '@renderer/components/markdown'
import {
  keys,
  useAnswerExercise,
  useExerciseSet,
  useRemoveExerciseSet,
  useTopics
} from '@renderer/lib/queries'
import { topicPath } from '@renderer/lib/topics'
import { cn } from '@renderer/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import { DIFFICULTY_LABEL } from '@renderer/lib/format'

const RESULT_STYLE: Record<ExerciseResult, { label: string; className: string }> = {
  correct: { label: 'Acertei', className: 'text-emerald-600 dark:text-emerald-400' },
  partial: { label: 'Parcial', className: 'text-amber-600 dark:text-amber-400' },
  wrong: { label: 'Errei', className: 'text-red-600 dark:text-red-400' }
}

/** Resolver uma lista: múltipla escolha corrigida na hora, dissertativa com autoavaliação. */
export function ExercisePractice({
  setId,
  onBack
}: {
  setId: number
  onBack: () => void
}): React.JSX.Element | null {
  const { data: set } = useExerciseSet(setId)
  const { data: topics = [] } = useTopics()
  const remove = useRemoveExerciseSet()
  if (!set) return null
  const percent = set.total ? Math.round((set.answered / set.total) * 100) : 0

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 mb-3">
        <ArrowLeft /> Listas
      </Button>
      <header className="mb-6 flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight">{set.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {[topicPath(topics, set.topicId), DIFFICULTY_LABEL[set.difficulty], set.generatedBy]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <div className="mt-3 flex items-center gap-3 text-sm">
            <Progress value={percent} className="h-1.5 max-w-56" />
            <span className="text-muted-foreground tabular-nums">
              {set.answered}/{set.total} respondidas · {set.correct} certas
            </span>
          </div>
        </div>
        <ConfirmDelete
          title="Apagar esta lista?"
          description="As questões e suas respostas serão apagadas."
          onConfirm={() => remove.mutate([set.id], { onSuccess: onBack })}
        >
          <Button variant="ghost" size="icon-sm" aria-label="Apagar lista">
            <Trash2 />
          </Button>
        </ConfirmDelete>
      </header>

      <ol className="flex flex-col gap-4">
        {set.exercises.map((exercise, i) => (
          <ExerciseCard key={exercise.id} exercise={exercise} number={i + 1} />
        ))}
      </ol>
    </div>
  )
}

function ExerciseCard({
  exercise,
  number
}: {
  exercise: Exercise
  number: number
}): React.JSX.Element {
  const client = useQueryClient()
  const answer = useAnswerExercise()
  const [choice, setChoice] = useState<number | null>(exercise.userChoice)
  const [text, setText] = useState(exercise.userAnswer ?? '')
  const [revealed, setRevealed] = useState(exercise.result !== null || exercise.userAnswer !== null)
  const answered = exercise.kind === 'multiple_choice' ? exercise.result !== null : revealed

  const save = (input: Parameters<typeof answer.mutate>[0][1]): void =>
    answer.mutate([exercise.id, input], {
      onSuccess: () => void client.invalidateQueries({ queryKey: keys.exerciseSet(exercise.setId) })
    })

  return (
    <li className="rounded-xl border bg-card p-5">
      <p className="mb-1 text-xs font-medium text-muted-foreground">
        Questão {number} ·{' '}
        {exercise.kind === 'multiple_choice' ? 'múltipla escolha' : 'dissertativa'}
      </p>
      <Markdown className="mb-4 text-[15px]">{exercise.question}</Markdown>

      {exercise.kind === 'multiple_choice' && exercise.options ? (
        <div className="grid gap-2">
          {exercise.options.map((option, i) => {
            const isCorrect = i === exercise.correctOption
            const isChosen = i === (answered ? exercise.userChoice : choice)
            return (
              <button
                key={i}
                type="button"
                disabled={answered}
                onClick={() => setChoice(i)}
                className={cn(
                  'flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition',
                  !answered && 'hover:bg-accent',
                  !answered && isChosen && 'border-primary bg-primary/5',
                  answered && isCorrect && 'border-emerald-500/50 bg-emerald-500/10',
                  answered && isChosen && !isCorrect && 'border-red-500/50 bg-red-500/10'
                )}
              >
                <span className="grid size-5 shrink-0 place-items-center rounded-full border text-xs font-medium">
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="flex-1">{option}</span>
                {answered && isCorrect && <CircleCheck className="size-4 text-emerald-500" />}
                {answered && isChosen && !isCorrect && <CircleX className="size-4 text-red-500" />}
              </button>
            )
          })}
          {!answered && (
            <Button
              className="mt-1 justify-self-start"
              disabled={choice === null || answer.isPending}
              onClick={() => choice !== null && save({ choice })}
            >
              <Check /> Responder
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-2">
          <Textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={revealed}
            placeholder="Escreva sua resposta antes de ver o gabarito"
          />
          {!revealed && (
            <Button
              variant="outline"
              className="justify-self-start"
              onClick={() => {
                setRevealed(true)
                save({ text })
              }}
            >
              <Eye /> Ver gabarito
            </Button>
          )}
        </div>
      )}

      {answered && (
        <div className="mt-4 space-y-3 rounded-lg bg-muted/50 p-4">
          {exercise.kind === 'open' && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Gabarito</p>
              <Markdown>{exercise.answer}</Markdown>
            </div>
          )}
          {exercise.explanation && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Explicação</p>
              <Markdown>{exercise.explanation}</Markdown>
            </div>
          )}
          {exercise.kind === 'open' && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground">Como foi?</span>
              {(Object.keys(RESULT_STYLE) as ExerciseResult[]).map((r) => (
                <Button
                  key={r}
                  size="sm"
                  variant={exercise.result === r ? 'secondary' : 'outline'}
                  onClick={() => save({ result: r })}
                  className={cn(exercise.result === r && RESULT_STYLE[r].className)}
                >
                  {RESULT_STYLE[r].label}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  )
}
