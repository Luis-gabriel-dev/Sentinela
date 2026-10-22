import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Search } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Progress } from '@renderer/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { SourceLink } from '@renderer/components/source-link'
import { useDebounced } from '@renderer/lib/use-debounced'
import {
  useAiModels,
  useRagSearch,
  useRagStatus,
  useReindexRag,
  useUpdateRagSettings
} from '@renderer/lib/queries'

const AUTO = '__auto__'

/** Liga/desliga a busca inteligente, escolhe o modelo de embedding e mostra o estado do índice. */
export function RagSettings(): React.JSX.Element | null {
  const { data: status } = useRagStatus()
  const update = useUpdateRagSettings()
  const reindex = useReindexRag()
  const models = useAiModels(true, 'ollama')
  const embedding = (models.data ?? []).filter((m) => m.kind === 'embedding')

  if (!status) return null
  const { sources } = status
  const progress = status.chunks ? Math.round((status.embedded / status.chunks) * 100) : 100

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A mentora procura nas suas anotações, nos destaques dos livros e nas páginas com OCR os
        trechos ligados a cada pergunta, e cita de onde tirou. Os vetores são calculados pelo
        Ollama, neste computador, mesmo quando a conversa usa Claude ou OpenAI.
      </p>

      <div className="flex items-center gap-2">
        <Checkbox
          id="rag-enabled"
          checked={status.enabled}
          onCheckedChange={(checked) => update.mutate([{ enabled: checked === true }])}
        />
        <Label htmlFor="rag-enabled">Usar a busca inteligente nas respostas da mentora</Label>
      </div>

      {status.enabled && (
        <>
          <div className="grid gap-2">
            <Label>Modelo de embedding (Ollama)</Label>
            <div className="flex gap-2">
              <Select
                value={status.embedModel ?? AUTO}
                onValueChange={(v) => update.mutate([{ embedModel: v === AUTO ? null : v }])}
              >
                <SelectTrigger className="w-full font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={AUTO}>
                    Automático
                    {status.activeModel && !status.embedModel && ` (${status.activeModel})`}
                  </SelectItem>
                  {embedding.map((m) => (
                    <SelectItem key={m.name} value={m.name}>
                      {m.name}
                      {m.parameterSize && (
                        <span className="text-xs text-muted-foreground">{m.parameterSize}</span>
                      )}
                    </SelectItem>
                  ))}
                  {status.embedModel && !embedding.some((m) => m.name === status.embedModel) && (
                    <SelectItem value={status.embedModel}>{status.embedModel}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                disabled={status.running || reindex.isPending}
                onClick={() => reindex.mutate([])}
              >
                <RefreshCw /> Recalcular
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              O <code>bge-m3</code> entende bem português e é o escolhido no automático. Para
              instalar: <code>ollama pull bge-m3</code>.
            </p>
          </div>

          <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
            {status.problem ? (
              <p className="flex items-start gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {status.problem}
              </p>
            ) : status.running || progress < 100 ? (
              <p className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin text-primary" />
                Calculando vetores: {status.embedded} de {status.chunks} trechos
              </p>
            ) : (
              <p className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-500" />
                Índice em dia com {status.chunks} trechos ({status.activeModel})
              </p>
            )}
            {(status.running || progress < 100) && !status.problem && (
              <Progress value={progress} className="h-1.5" />
            )}
            <p className="text-xs text-muted-foreground">
              {sources.notes} anotações · {sources.highlights} destaques · {sources.ocrPages}{' '}
              páginas com OCR
            </p>
          </div>

          <SearchTester />
        </>
      )}
    </div>
  )
}

/** Mostra o que a mentora acharia para uma pergunta. */
function SearchTester(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const debounced = useDebounced(query.trim(), 400)
  const { data: hits = [], isFetching } = useRagSearch(debounced)

  return (
    <div className="grid gap-2">
      <Label htmlFor="rag-test">Testar a busca</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="rag-test"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ex.: como funciona o handshake do TCP?"
          className="pl-8"
        />
        {isFetching && (
          <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {debounced.length > 2 && !isFetching && !hits.length && (
        <p className="text-sm text-muted-foreground">Nenhum trecho encontrado.</p>
      )}
      <div className="grid gap-1.5">
        {hits.map((hit) => (
          <SourceLink
            key={`${hit.kind}:${hit.sourceId}:${hit.highlightId}:${hit.page}:${hit.excerpt.slice(0, 20)}`}
            source={hit}
          />
        ))}
      </div>
    </div>
  )
}
