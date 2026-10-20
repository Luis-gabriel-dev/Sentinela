import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/progress'
import { TasksIcon } from '@renderer/components/icons'
import { EmptyState } from '@renderer/components/page-header'
import { timeAgo } from '@renderer/lib/projects'
import { useExerciseSets, useTopics } from '@renderer/lib/queries'
import { topicPath } from '@renderer/lib/topics'
import { ExercisePractice } from './exercise-practice'
import { DIFFICULTY_LABEL } from '@renderer/lib/format'
import { GenerateExercisesDialog } from './generate-exercises-dialog'

export function MentorExercises(): React.JSX.Element {
  const { data: sets = [], isLoading } = useExerciseSets()
  const { data: topics = [] } = useTopics()
  const [openSet, setOpenSet] = useState<number | null>(null)
  const [generating, setGenerating] = useState(false)

  if (openSet !== null) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ExercisePractice setId={openSet} onBack={() => setOpenSet(null)} />
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Listas geradas pela IA a partir dos seus temas, com gabarito comentado.
          </p>
          <Button onClick={() => setGenerating(true)}>
            <Sparkles /> Gerar exercícios
          </Button>
        </div>

        {!isLoading && sets.length === 0 ? (
          <EmptyState icon={<TasksIcon />} title="Nenhuma lista ainda">
            Gere uma lista de exercícios sobre um tema. Os resultados ajudam a mentora a saber onde
            você precisa reforçar.
          </EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {sets.map((set) => {
              const percent = set.total ? Math.round((set.answered / set.total) * 100) : 0
              const score = set.answered ? Math.round((set.correct / set.answered) * 100) : null
              return (
                <button
                  key={set.id}
                  type="button"
                  onClick={() => setOpenSet(set.id)}
                  className="rounded-xl border bg-card p-4 text-left transition hover:border-primary/50"
                >
                  <p className="font-medium">{set.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[
                      topicPath(topics, set.topicId),
                      DIFFICULTY_LABEL[set.difficulty],
                      timeAgo(set.createdAt)
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <div className="mt-3 flex items-center gap-3 text-xs">
                    <Progress value={percent} className="h-1.5 flex-1" />
                    <span className="text-muted-foreground tabular-nums">
                      {set.answered}/{set.total}
                      {score !== null && ` · ${score}% de acerto`}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <GenerateExercisesDialog
        open={generating}
        onOpenChange={setGenerating}
        onCreated={(set) => setOpenSet(set.id)}
      />
    </div>
  )
}
