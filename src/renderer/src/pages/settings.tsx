import { Monitor, Moon, Sun } from 'lucide-react'
import { AiSettingsForm } from '@renderer/components/ai-settings'
import { GithubConnect } from '@renderer/components/github-connect'
import { PageHeader } from '@renderer/components/page-header'
import { RagSettings } from '@renderer/components/rag-settings'
import { useAppInfo } from '@renderer/lib/queries'
import { useTheme, type Theme } from '@renderer/lib/theme'
import { cn } from '@renderer/lib/utils'

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'system', label: 'Seguir o sistema', icon: Monitor }
]

export function SettingsPage(): React.JSX.Element {
  const { theme, setTheme } = useTheme()
  const { data: info } = useAppInfo()

  return (
    <>
      <PageHeader title="Configurações" />

      <section className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="font-medium">Aparência</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition hover:bg-accent',
                theme === value && 'border-primary ring-1 ring-primary'
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6 space-y-3 rounded-xl border bg-card p-5">
        <h2 className="font-medium">Inteligência artificial</h2>
        <AiSettingsForm />
      </section>

      <section className="mt-6 space-y-3 rounded-xl border bg-card p-5">
        <h2 className="font-medium">Busca inteligente</h2>
        <RagSettings />
      </section>

      <section className="mt-6 space-y-3 rounded-xl border bg-card p-5">
        <h2 className="font-medium">GitHub</h2>
        <GithubConnect />
      </section>

      <section className="mt-6 space-y-2 rounded-xl border bg-card p-5 text-sm">
        <h2 className="font-medium">Dados</h2>
        <p className="text-muted-foreground">
          Tudo fica salvo localmente neste arquivo SQLite. Para backup, copie-o com o app fechado.
        </p>
        <code className="block rounded-md bg-muted px-3 py-2 font-mono text-xs break-all select-all">
          {info?.dbPath ?? '...'}
        </code>
        <p className="pt-2 text-xs text-muted-foreground">Sentinela v{info?.version}</p>
      </section>
    </>
  )
}
