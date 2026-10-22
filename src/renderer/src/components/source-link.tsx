import { Link } from 'react-router'
import type { RagSource } from '@shared/types'
import { HighlightIcon, NotesIcon, ScanTextIcon } from '@renderer/components/icons'
import { cn } from '@renderer/lib/utils'

type Source = Omit<RagSource, 'n'> & { n?: number }

const KIND = {
  note: { icon: NotesIcon, label: 'Anotação' },
  highlight: { icon: HighlightIcon, label: 'Destaque' },
  ocr: { icon: ScanTextIcon, label: 'Livro (OCR)' }
} as const

/** Onde abrir a origem: a anotação, ou o livro no destaque ou na página. */
function sourceHref(source: Source): string {
  if (source.kind === 'note') return `/anotacoes/${source.sourceId}`
  if (source.highlightId) return `/biblioteca/${source.sourceId}?destaque=${source.highlightId}`
  return source.page
    ? `/biblioteca/${source.sourceId}?pagina=${source.page}`
    : `/biblioteca/${source.sourceId}`
}

/** Um trecho achado pela busca inteligente, com link para a origem. */
export function SourceLink({
  source,
  dimmed = false
}: {
  source: Source
  /** Trecho consultado que a resposta não citou. */
  dimmed?: boolean
}): React.JSX.Element {
  const { icon: Icon, label } = KIND[source.kind]
  return (
    <Link
      to={sourceHref(source)}
      className={cn(
        'block rounded-lg border bg-card px-3 py-2 text-left transition hover:border-primary/50',
        dimmed && 'opacity-60 hover:opacity-100'
      )}
    >
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {source.n !== undefined && (
          <span className="rounded bg-muted px-1.5 font-mono text-[11px] text-foreground">
            {source.n}
          </span>
        )}
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">
          {label} · <span className="font-medium text-foreground">{source.title}</span>
          {source.page ? ` · p. ${source.page}` : ''}
        </span>
      </span>
      <span className="mt-1 line-clamp-2 text-xs text-muted-foreground">{source.excerpt}</span>
    </Link>
  )
}
