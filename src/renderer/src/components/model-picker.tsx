import { useState } from 'react'
import { Eye, RefreshCw } from 'lucide-react'
import type { ModelInfo } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { formatBytes } from '@renderer/lib/format'
import { aiReady, useAiModels, useAiSettings, useUpdateAiSettings } from '@renderer/lib/queries'
import { cn } from '@renderer/lib/utils'

const CUSTOM = '__custom__'

/** "7.6B · Q4_K_M · 4,7 GB" */
const details = (m: ModelInfo): string =>
  [m.parameterSize, m.quantization, m.size ? formatBytes(m.size) : null].filter(Boolean).join(' · ')

/**
 * Escolha do modelo do provedor ativo entre os disponíveis (no Ollama, os já baixados; modelos de
 * embedding ficam de fora). "Outro modelo..." permite digitar um nome que não está na lista.
 * `compact` é a versão pequena, para o topo da mentora.
 */
export function ModelPicker({ compact = false }: { compact?: boolean }): React.JSX.Element | null {
  const { data: settings } = useAiSettings()
  const update = useUpdateAiSettings()
  const models = useAiModels(aiReady(settings))
  const [typing, setTyping] = useState<string | null>(null)

  if (!settings) return null
  const current = settings.models[settings.provider]
  const chat = (models.data ?? []).filter((m) => m.kind === 'chat')
  const missing = models.isSuccess && !chat.some((m) => m.name === current)

  const save = (value: string): void => {
    const model = value.trim()
    if (model && model !== current) update.mutate([{ model }])
    setTyping(null)
  }

  if (typing !== null || (models.isError && !compact)) {
    const value = typing ?? current
    return (
      <div className="grid gap-1.5">
        <Input
          autoFocus={typing !== null}
          value={value}
          onChange={(e) => setTyping(e.target.value)}
          onBlur={() => save(value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save(value)
            if (e.key === 'Escape') setTyping(null)
          }}
          placeholder="Nome do modelo"
          className="font-mono text-sm"
        />
        {models.isError && (
          <p className="text-xs text-destructive">
            Não deu para listar os modelos: {models.error.message}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-2', compact && 'min-w-0')}>
      <Select value={current} onValueChange={(v) => (v === CUSTOM ? setTyping(current) : save(v))}>
        <SelectTrigger
          size={compact ? 'sm' : 'default'}
          className={cn(
            'font-mono',
            compact ? 'max-w-64 border-transparent text-xs shadow-none' : 'w-full text-sm'
          )}
          aria-label="Modelo de IA"
        >
          <SelectValue>{current}</SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-80">
          {chat.map((m) => (
            <SelectItem key={m.name} value={m.name}>
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1.5 font-mono text-sm">
                  {m.name}
                  {m.vision && <Eye className="size-3.5" aria-label="Entende imagens" />}
                </span>
                {details(m) && <span className="text-xs text-muted-foreground">{details(m)}</span>}
              </span>
            </SelectItem>
          ))}
          {(missing || !models.isSuccess) && (
            <SelectItem value={current}>
              <span className="flex flex-col">
                <span className="font-mono text-sm">{current}</span>
                <span className="text-xs text-muted-foreground">
                  {models.isFetching
                    ? 'Carregando a lista...'
                    : missing && settings.provider === 'ollama'
                      ? 'Não está baixado no Ollama'
                      : 'Modelo atual'}
                </span>
              </span>
            </SelectItem>
          )}
          <SelectSeparator />
          <SelectItem value={CUSTOM}>Outro modelo...</SelectItem>
        </SelectContent>
      </Select>
      {!compact && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Atualizar a lista de modelos"
          disabled={models.isFetching}
          onClick={() => void models.refetch()}
        >
          <RefreshCw className={models.isFetching ? 'animate-spin' : undefined} />
        </Button>
      )}
    </div>
  )
}
