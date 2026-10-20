import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { useFolders } from '@renderer/lib/queries'

const NONE = 'none'

export function FolderSelect({
  value,
  onChange
}: {
  value: number | null
  onChange: (id: number | null) => void
}): React.JSX.Element {
  const { data: folders = [] } = useFolders()
  return (
    <Select
      value={value === null ? NONE : String(value)}
      onValueChange={(v) => onChange(v === NONE ? null : Number(v))}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Sem pasta</SelectItem>
        {folders.map((f) => (
          <SelectItem key={f.id} value={String(f.id)}>
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-sm" style={{ background: f.color }} />
              {f.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
