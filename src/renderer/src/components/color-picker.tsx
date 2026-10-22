import { Check, Pipette } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { COLOR_PRESETS, DEFAULT_COLOR } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'

interface Props {
  value: string | null
  onChange: (color: string | null) => void
  /** Texto da opção "sem cor própria" (ex.: herdar a cor do tema). Omitir para exigir uma cor. */
  noneLabel?: string
  fallback?: string
}

export function ColorPicker({
  value,
  onChange,
  noneLabel,
  fallback = DEFAULT_COLOR
}: Props): React.JSX.Element {
  const shown = value ?? fallback

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-start gap-2 font-normal">
          <span
            className="size-4 rounded-full ring-1 ring-black/10"
            style={{ background: shown }}
          />
          {value === null && noneLabel ? noneLabel : shown.toUpperCase()}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="start">
        <div className="grid grid-cols-6 gap-2">
          {COLOR_PRESETS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              onClick={() => onChange(color)}
              className="grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-popover transition hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              style={{ background: color }}
            >
              {value?.toLowerCase() === color && (
                <Check className="size-4 text-white drop-shadow" />
              )}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
          <Pipette className="size-4 text-muted-foreground" />
          Cor personalizada
          <input
            type="color"
            value={shown}
            onChange={(e) => onChange(e.target.value)}
            className="ml-auto h-6 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
          />
        </label>
        {noneLabel && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className={cn(
              'w-full rounded-md px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent',
              value === null && 'bg-accent text-accent-foreground'
            )}
          >
            {noneLabel}
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}
