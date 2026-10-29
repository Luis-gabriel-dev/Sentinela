import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, FileUp, Loader2, Plus, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { OutlineNodeInput } from '@shared/schemas'
import type { Book } from '@shared/types'
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
import { Textarea } from '@renderer/components/ui/textarea'
import { ColorPicker } from '@renderer/components/color-picker'
import { TopicSelect } from '@renderer/components/topic-select'
import { api } from '@renderer/lib/api'
import { fetchBookFile } from '@renderer/lib/books'
import { COLOR_PRESETS } from '@renderer/lib/format'
import {
  fromLines,
  fromText,
  OUTLINE_EXTENSIONS,
  readOutline,
  type OutlineResult
} from '@renderer/lib/outline'
import {
  buildTree,
  countNodes,
  flattenOutline,
  outlineDepth,
  shiftLevel,
  skippedByDefault,
  type OutlineNode
} from '@renderer/lib/outline-parse'
import { aiReady, keys, useAiSettings, useBooks } from '@renderer/lib/queries'
import { cn } from '@renderer/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Livro da biblioteca: lê o sumário dele e liga os temas às páginas. */
  book?: Book | null
}

const SOURCE_LABEL: Record<OutlineResult['source'], string> = {
  marcadores: 'Marcadores do PDF',
  'sumário do livro': 'Sumário do livro',
  texto: 'Numeração e títulos do texto',
  planilha: 'Colunas da planilha',
  IA: 'Organizado pela IA'
}

const DEPTH_LABEL = ['Só capítulos', 'Até seções', 'Até subseções']

/** Importa um sumário (livro, curso, ementa) como árvore de temas, com prévia para revisar. */
export function ImportOutlineDialog({ open, onOpenChange, book }: Props): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        {open && <ImportForm book={book ?? null} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

/** Nome do tema: "3.1 Título" ou "Capítulo 3 – Título" (com a numeração), ou só o título. */
const nameOf = (node: OutlineNode, keepNumbers: boolean): string =>
  (keepNumbers && node.prefix
    ? /^\d/.test(node.prefix)
      ? `${node.prefix} ${node.title}`
      : `${node.prefix} – ${node.title}`
    : node.title
  ).slice(0, 200)

/** Chaves dos itens que vêm desmarcados (Resumo, Referências, Índice...). */
const defaultExcluded = (nodes: OutlineNode[]): Set<string> => {
  const out = new Set<string>()
  const walk = (list: OutlineNode[]): void =>
    list.forEach((n) => {
      if (skippedByDefault(n.title)) out.add(n.key)
      walk(n.children)
    })
  walk(nodes)
  return out
}

function ImportForm({
  book,
  onDone
}: {
  book: Book | null
  onDone: () => void
}): React.JSX.Element {
  const client = useQueryClient()
  const { data: settings } = useAiSettings()
  const { data: books = [] } = useBooks()
  const fileInput = useRef<HTMLInputElement>(null)
  const [reading, setReading] = useState(false)
  const [structuring, setStructuring] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [pasted, setPasted] = useState('')
  const [result, setResult] = useState<OutlineResult | null>(null)
  const [linkedBook, setLinkedBook] = useState<Book | null>(book)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [depth, setDepth] = useState(3)
  const [keepNumbers, setKeepNumbers] = useState(true)
  const [trackProgress, setTrackProgress] = useState(true)
  const [createRoot, setCreateRoot] = useState(true)
  const [rootName, setRootName] = useState('')
  const [rootColor, setRootColor] = useState(COLOR_PRESETS[0])
  const [parentId, setParentId] = useState<number | null>(null)
  /** Leitura do livro da biblioteca (aberto pelo menu do livro) em andamento. */
  const [readingBook, setReadingBook] = useState(book !== null)

  const show = (next: OutlineResult): void => {
    setResult(next)
    setExcluded(defaultExcluded(next.nodes))
    setDepth(Math.max(1, outlineDepth(next.nodes)))
    setRootName((name) => name || next.suggestedName || '')
  }

  const read = async (file: File): Promise<void> => {
    setReading(true)
    try {
      // Arquivo que já está na biblioteca: os temas ficam ligados ao livro.
      const path = window.sentinela.pathForFile(file)
      const linked = books.find((b) => path && b.filePath === path) ?? null
      setLinkedBook(linked)
      const outline = await readOutline(file)
      show(linked ? { ...outline, suggestedName: linked.title } : outline)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setReading(false)
    }
  }

  // Aberto a partir de um livro da biblioteca: lê o sumário dele de imediato.
  useEffect(() => {
    if (!book) return
    let cancelled = false
    void (async () => {
      try {
        const outline = await readOutline(await fetchBookFile(book))
        if (!cancelled) show({ ...outline, suggestedName: book.title })
      } catch (error) {
        if (!cancelled) toast.error((error as Error).message)
      } finally {
        if (!cancelled) setReadingBook(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [book])

  const structure = async (): Promise<void> => {
    if (!result?.text) return
    setStructuring(true)
    try {
      const lines = await api.mentor.structureOutline(result.text)
      show({ ...result, nodes: fromLines(lines), source: 'IA', linked: false })
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setStructuring(false)
    }
  }

  /** Corrige o agrupamento: muda o nível do item (com os subitens). */
  const shift = (key: string, delta: -1 | 1): void => {
    if (!result) return
    const flat = flattenOutline(result.nodes)
    const next = shiftLevel(flat, Number(key), delta)
    if (next === flat) return
    const nodes = buildTree(next)
    // Com todos os níveis à mostra, o nível novo também aparece.
    if (depth >= outlineDepth(result.nodes)) setDepth(outlineDepth(nodes))
    setResult({ ...result, nodes })
  }

  const maxDepth = result ? outlineDepth(result.nodes) : 0
  const items = useMemo((): OutlineNodeInput[] => {
    if (!result) return []
    const convert = (nodes: OutlineNode[], level: number): OutlineNodeInput[] =>
      nodes
        .filter((n) => !excluded.has(n.key))
        .map((n) => ({
          title: nameOf(n, keepNumbers),
          bookLocation: n.bookLocation,
          children: level < depth ? convert(n.children, level + 1) : []
        }))
    return convert(result.nodes, 1)
  }, [result, excluded, depth, keepNumbers])
  const total = useMemo(() => {
    const count = (list: OutlineNodeInput[]): number =>
      list.reduce((sum, n) => sum + 1 + count(n.children), 0)
    return count(items)
  }, [items])

  const create = async (): Promise<void> => {
    setSaving(true)
    try {
      const { created } = await api.topics.importOutline({
        parentId,
        root: createRoot ? { name: rootName.trim(), color: rootColor } : null,
        bookId: linkedBook?.id ?? null,
        trackProgress,
        items
      })
      await client.invalidateQueries({ queryKey: keys.topics })
      toast.success(`${created} temas criados`)
      onDone()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const toggle = (key: string, checked: boolean): void =>
    setExcluded((prev) => {
      const next = new Set(prev)
      if (checked) next.delete(key)
      else next.add(key)
      return next
    })

  if (reading || readingBook) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-6 animate-spin text-primary" />
        Lendo o sumário{book ? ` de “${book.title}”` : ''}...
      </div>
    )
  }

  if (!result) {
    return (
      <div className="grid gap-4">
        <DialogHeader>
          <DialogTitle>Importar sumário</DialogTitle>
          <DialogDescription>
            Transforme o sumário de um livro, curso ou ementa em temas, capítulos e tópicos. Você
            revisa antes de criar.
          </DialogDescription>
        </DialogHeader>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const file = e.dataTransfer.files[0]
            if (file) void read(file)
          }}
          className={cn(
            'flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-sm text-muted-foreground transition hover:border-primary/60 hover:bg-accent/40',
            dragging && 'border-primary bg-primary/5'
          )}
        >
          <FileUp className="size-8 text-primary" />
          <span className="font-medium text-foreground">
            Arraste um arquivo ou clique para escolher
          </span>
          <span className="text-xs">
            PDF, EPUB, MOBI, AZW3, Markdown, TXT, CSV ou Excel (.xlsx)
          </span>
        </button>
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          accept={OUTLINE_EXTENSIONS.map((e) => `.${e}`).join(',')}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void read(file)
            e.target.value = ''
          }}
        />
        <div className="grid gap-2">
          <Label htmlFor="outline-text">Ou cole o texto</Label>
          <Textarea
            id="outline-text"
            rows={5}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={
              'Capítulo 1 – Redes de computadores e a Internet\n1.1 O que é a Internet?\n1.1.1 Uma descrição dos componentes da rede\n...'
            }
            className="font-mono text-xs"
          />
        </div>
        <DialogFooter>
          <Button disabled={!pasted.trim()} onClick={() => show(fromText(pasted))}>
            Ler o texto
          </Button>
        </DialogFooter>
      </div>
    )
  }

  const empty = result.nodes.length === 0
  const canStructure = !!result.text && aiReady(settings)

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Importar sumário</DialogTitle>
        <DialogDescription>
          {empty
            ? 'Não achei capítulos numerados nem títulos neste material.'
            : `${SOURCE_LABEL[result.source]}: ${countNodes(result.nodes)} itens.` +
              (result.linked && linkedBook ? ' Cada tema abre o livro no ponto certo.' : '')}
        </DialogDescription>
      </DialogHeader>

      {empty ? (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          {canStructure ? (
            <p>
              A IA pode organizar o texto em capítulos e tópicos (pode levar um ou dois minutos).
            </p>
          ) : (
            <p className="text-muted-foreground">
              {result.text
                ? 'Configure a IA em Configurações para organizar este texto.'
                : 'Tente com o sumário em PDF, Markdown ou texto.'}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={createRoot} onCheckedChange={(c) => setCreateRoot(c === true)} />
                Criar um tema novo para o material
              </label>
              {createRoot && (
                <div className="flex gap-2">
                  <Input
                    value={rootName}
                    onChange={(e) => setRootName(e.target.value)}
                    placeholder="Nome do tema"
                  />
                  <ColorPicker value={rootColor} onChange={(c) => c && setRootColor(c)} />
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <Label>{createRoot ? 'Dentro de' : 'Colocar os itens dentro de'}</Label>
              <TopicSelect
                value={parentId}
                onChange={setParentId}
                noneLabel={createRoot ? 'Nenhum (tema principal)' : 'Escolha um tema'}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {maxDepth > 1 && (
              <div className="flex rounded-lg bg-muted p-1">
                {Array.from({ length: maxDepth }, (_, i) => i + 1).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDepth(d)}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs text-muted-foreground transition',
                      depth === d && 'bg-background text-foreground shadow-sm'
                    )}
                  >
                    {d === maxDepth && d > 3 ? 'Tudo' : (DEPTH_LABEL[d - 1] ?? `Até nível ${d}`)}
                  </button>
                ))}
              </div>
            )}
            <label className="flex items-center gap-2">
              <Checkbox checked={keepNumbers} onCheckedChange={(c) => setKeepNumbers(c === true)} />
              Manter a numeração
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={trackProgress}
                onCheckedChange={(c) => setTrackProgress(c === true)}
              />
              Acompanhar o progresso
            </label>
          </div>

          <div className="max-h-[45vh] overflow-y-auto rounded-lg border py-1">
            <OutlineTree
              nodes={result.nodes}
              level={1}
              depth={depth}
              excluded={excluded}
              keepNumbers={keepNumbers}
              onToggle={toggle}
              onShift={shift}
              disabled={false}
            />
          </div>
        </>
      )}

      <DialogFooter className="sm:justify-between">
        {result.text ? (
          <Button
            variant={empty ? 'default' : 'ghost'}
            disabled={!canStructure || structuring || saving}
            onClick={() => void structure()}
          >
            {structuring ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {structuring ? 'Organizando com IA...' : 'Organizar com IA'}
          </Button>
        ) : (
          <span />
        )}
        {!empty && (
          <Button
            disabled={
              saving ||
              structuring ||
              total === 0 ||
              (createRoot ? !rootName.trim() : parentId === null)
            }
            onClick={() => void create()}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Plus />}
            Criar {total + (createRoot ? 1 : 0)} temas
          </Button>
        )}
      </DialogFooter>
    </div>
  )
}

/** Prévia em árvore: desmarcar um item tira ele e tudo o que está dentro. */
function OutlineTree({
  nodes,
  level,
  depth,
  excluded,
  keepNumbers,
  onToggle,
  onShift,
  disabled
}: {
  nodes: OutlineNode[]
  level: number
  depth: number
  excluded: Set<string>
  keepNumbers: boolean
  onToggle: (key: string, checked: boolean) => void
  onShift: (key: string, delta: -1 | 1) => void
  disabled: boolean
}): React.JSX.Element {
  return (
    <>
      {nodes.map((node) => {
        const off = disabled || excluded.has(node.key)
        const page = node.bookLocation?.match(/^pagina=(\d+)/)?.[1]
        return (
          <div key={node.key}>
            <label
              className={cn(
                'group flex cursor-pointer items-center gap-2 py-1 pr-3 text-sm hover:bg-accent/40',
                level === 1 && 'font-medium',
                off && 'text-muted-foreground'
              )}
              style={{ paddingLeft: 12 + (level - 1) * 20 }}
            >
              <Checkbox
                checked={!off}
                disabled={disabled}
                onCheckedChange={(c) => onToggle(node.key, c === true)}
              />
              <span className={cn('min-w-0 flex-1 truncate', off && 'line-through')}>
                {nameOf(node, keepNumbers)}
              </span>
              <span className="flex opacity-0 transition group-hover:opacity-100">
                {(
                  [
                    [-1, ChevronLeft, 'Subir um nível'],
                    [1, ChevronRight, 'Descer um nível']
                  ] as const
                ).map(([delta, Icon, label]) => (
                  <button
                    key={delta}
                    type="button"
                    aria-label={label}
                    title={label}
                    onClick={(e) => {
                      e.preventDefault()
                      onShift(node.key, delta)
                    }}
                    className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Icon className="size-3.5" />
                  </button>
                ))}
              </span>
              {page && (
                <span className="text-xs text-muted-foreground tabular-nums">p. {page}</span>
              )}
            </label>
            {level < depth && node.children.length > 0 && (
              <OutlineTree
                nodes={node.children}
                level={level + 1}
                depth={depth}
                excluded={excluded}
                keepNumbers={keepNumbers}
                onToggle={onToggle}
                onShift={onShift}
                disabled={off}
              />
            )}
          </div>
        )
      })}
    </>
  )
}
