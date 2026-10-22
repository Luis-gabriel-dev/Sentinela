import { useState } from 'react'
import { AiSettingsForm } from '@renderer/components/ai-settings'
import { MentorIcon } from '@renderer/components/icons'
import { ModelPicker } from '@renderer/components/model-picker'
import { aiReady, useAiSettings } from '@renderer/lib/queries'
import { cn } from '@renderer/lib/utils'
import { MentorChat } from './chat'
import { MentorExercises } from './exercises'

type Tab = 'chat' | 'exercises'

export function MentorPage(): React.JSX.Element {
  const { data: settings, isLoading } = useAiSettings()
  const [tab, setTab] = useState<Tab>('chat')

  if (!isLoading && !aiReady(settings)) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-8">
        <div className="mb-6 flex items-center gap-3">
          <MentorIcon className="icon-strong size-8 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">IA mentora</h1>
            <p className="text-sm text-muted-foreground">
              Escolha um provedor para começar. Dá para trocar depois em Configurações.
            </p>
          </div>
        </div>
        <section className="rounded-xl border bg-card p-5">
          <AiSettingsForm />
        </section>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b px-6 py-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <MentorIcon className="icon-strong size-5 text-primary" /> IA mentora
        </h1>
        <div className="flex rounded-lg bg-muted p-1">
          {(
            [
              ['chat', 'Conversa'],
              ['exercises', 'Exercícios']
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                'rounded-md px-3 py-1 text-sm text-muted-foreground transition',
                tab === value && 'bg-background text-foreground shadow-sm'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto min-w-0">
          <ModelPicker compact />
        </div>
      </header>
      {tab === 'chat' ? <MentorChat /> : <MentorExercises />}
    </div>
  )
}
