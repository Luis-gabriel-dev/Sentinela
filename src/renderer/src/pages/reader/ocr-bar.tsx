import { X } from 'lucide-react'
import { ScanTextIcon } from '@renderer/components/icons'
import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/progress'
import type { OcrState } from './use-ocr'

/** Aviso de PDF escaneado, com o botão de OCR e o progresso enquanto ele roda. */
export function OcrBar({ ocr, numPages }: { ocr: OcrState; numPages: number }): React.JSX.Element {
  if (ocr.progress) {
    const { done, total } = ocr.progress
    const percent = total ? Math.round((done / total) * 100) : 0
    return (
      <div className="flex items-center gap-3 border-b bg-primary/5 px-4 py-2 text-sm">
        <ScanTextIcon className="size-4 shrink-0 text-primary" />
        <span className="whitespace-nowrap">
          Reconhecendo texto… página {Math.min(done + 1, total)} de {total}
        </span>
        <Progress value={percent} className="h-1.5 max-w-72 flex-1" />
        <span className="w-10 text-xs text-muted-foreground tabular-nums">{percent}%</span>
        <Button variant="ghost" size="sm" onClick={ocr.cancel} className="ml-auto">
          <X /> Pausar
        </Button>
      </div>
    )
  }

  const partial = ocr.pages.length > 0
  return (
    <div className="flex items-center gap-3 border-b bg-amber-500/10 px-4 py-2 text-sm">
      <ScanTextIcon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="min-w-0 flex-1">
        {partial
          ? `Texto reconhecido em ${ocr.pages.length} de ${numPages} páginas.`
          : 'Este PDF é escaneado: o texto ainda não pode ser selecionado, copiado nem pesquisado.'}
      </span>
      <Button size="sm" onClick={ocr.start}>
        <ScanTextIcon className="size-4" /> {partial ? 'Continuar OCR' : 'Reconhecer texto (OCR)'}
      </Button>
    </div>
  )
}
