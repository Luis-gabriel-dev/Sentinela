import { useState } from 'react'
import { Check, ExternalLink, KeyRound, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import type { AiProvider } from '@shared/schemas'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { ConfirmDelete } from '@renderer/components/confirm-delete'
import {
  useAiModels,
  useAiSettings,
  useClearAiKey,
  useSetAiKey,
  useUpdateAiSettings
} from '@renderer/lib/queries'
import { cn } from '@renderer/lib/utils'

const PROVIDERS: { value: AiProvider; label: string; hint: string }[] = [
  { value: 'anthropic', label: 'Claude (Anthropic)', hint: 'Chave de API da Anthropic' },
  { value: 'openai', label: 'OpenAI', hint: 'Chave de API da OpenAI' },
  { value: 'ollama', label: 'Ollama (local)', hint: 'Roda no seu computador, sem internet' }
]

const KEY_URLS = {
  anthropic: 'https://platform.claude.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys'
} as const

/** Escolha do provedor de IA, chave de API, modelo e endereço do Ollama. */
export function AiSettingsForm(): React.JSX.Element | null {
  const { data: settings } = useAiSettings()
  const update = useUpdateAiSettings()
  const setKey = useSetAiKey()
  const clearKey = useClearAiKey()
  const [keyInput, setKeyInput] = useState('')
  const [ollamaUrl, setOllamaUrl] = useState<string | null>(null)
  const [modelInput, setModelInput] = useState<string | null>(null)
  const ready = !!settings && (settings.provider === 'ollama' || settings.keys[settings.provider])
  const models = useAiModels(false)

  if (!settings) return null
  const provider = settings.provider
  const model = modelInput ?? settings.models[provider]

  const saveModel = (): void => {
    const value = model.trim()
    if (value && value !== settings.models[provider]) update.mutate([{ model: value }])
    setModelInput(null)
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-3">
        {PROVIDERS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => {
              setModelInput(null)
              update.mutate([{ provider: p.value }])
            }}
            className={cn(
              'rounded-lg border px-4 py-3 text-left transition hover:bg-accent',
              provider === p.value && 'border-primary ring-1 ring-primary'
            )}
          >
            <span className="block text-sm font-medium">{p.label}</span>
            <span className="text-xs text-muted-foreground">{p.hint}</span>
          </button>
        ))}
      </div>

      {provider !== 'ollama' ? (
        <div className="grid gap-2">
          <Label>Chave de API</Label>
          {settings.keys[provider] ? (
            <div className="flex items-center gap-3 text-sm">
              <Check className="size-4 text-emerald-500" />
              <span className="flex-1">Chave salva e criptografada neste computador.</span>
              <ConfirmDelete
                title="Remover a chave?"
                description="A chave é apagada deste computador. A IA para de funcionar até você colar outra."
                onConfirm={() => clearKey.mutate([provider])}
              >
                <Button variant="outline" size="sm">
                  <Trash2 /> Remover
                </Button>
              </ConfirmDelete>
            </div>
          ) : (
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                setKey.mutate([{ provider, key: keyInput }], { onSuccess: () => setKeyInput('') })
              }}
            >
              <div className="relative min-w-64 flex-1">
                <KeyRound className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                  className="pl-8 font-mono text-sm"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <Button type="submit" disabled={!keyInput.trim() || setKey.isPending}>
                {setKey.isPending ? <Loader2 className="animate-spin" /> : null}
                {setKey.isPending ? 'Verificando...' : 'Salvar chave'}
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <a href={KEY_URLS[provider]} target="_blank" rel="noreferrer">
                  Criar chave <ExternalLink />
                </a>
              </Button>
            </form>
          )}
          {!settings.encryptionAvailable && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Este sistema não oferece armazenamento seguro; a chave não pode ser salva.
            </p>
          )}
        </div>
      ) : (
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (ollamaUrl) update.mutate([{ ollamaUrl }], { onSuccess: () => setOllamaUrl(null) })
          }}
        >
          <Label htmlFor="ollama-url">Endereço do Ollama</Label>
          <div className="flex gap-2">
            <Input
              id="ollama-url"
              value={ollamaUrl ?? settings.ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              className="font-mono text-sm"
            />
            <Button type="submit" variant="outline" disabled={!ollamaUrl || update.isPending}>
              Salvar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Instale o Ollama e baixe um modelo (por exemplo: <code>ollama pull llama3.2</code>).
            Tudo roda no seu computador.
          </p>
        </form>
      )}

      <div className="grid gap-2">
        <Label htmlFor="ai-model">Modelo</Label>
        <div className="flex gap-2">
          <Input
            id="ai-model"
            list="ai-model-options"
            value={model}
            onChange={(e) => setModelInput(e.target.value)}
            onBlur={saveModel}
            onKeyDown={(e) => e.key === 'Enter' && saveModel()}
            className="font-mono text-sm"
          />
          <datalist id="ai-model-options">
            {(models.data ?? []).map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <Button
            type="button"
            variant="outline"
            disabled={!ready || models.isFetching}
            onClick={() => void models.refetch()}
          >
            <RefreshCw className={models.isFetching ? 'animate-spin' : undefined} />
            {models.data ? `${models.data.length} disponíveis` : 'Ver modelos'}
          </Button>
        </div>
        {models.error && <p className="text-xs text-destructive">{models.error.message}</p>}
        {provider === 'anthropic' && (
          <p className="text-xs text-muted-foreground">
            Padrão: <code>claude-opus-5-5</code>. Se o modelo recusar um pedido por política, a
            Anthropic tenta de novo automaticamente em outro modelo.
          </p>
        )}
      </div>
    </div>
  )
}
