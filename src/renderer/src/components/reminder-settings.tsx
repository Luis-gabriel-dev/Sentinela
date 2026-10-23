import { useId } from 'react'
import { AlertTriangle, BellRing } from 'lucide-react'
import type { RemindersUpdate } from '@shared/schemas'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { useReminders, useTestReminder, useUpdateReminders } from '@renderer/lib/queries'

const ADVANCE = [0, 5, 10, 15, 30, 60]

/** Quais lembretes mandar, com quanta antecedência, e o comportamento da bandeja. */
export function ReminderSettings(): React.JSX.Element | null {
  const { data: status } = useReminders()
  const update = useUpdateReminders()
  const test = useTestReminder()
  if (!status) return null
  const save = (input: RemindersUpdate): void => update.mutate([input])

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Notificações do sistema para não perder os horários de estudo, as tarefas importantes e os
        projetos parados. Elas só aparecem com o Sentinela aberto ou na bandeja.
      </p>
      {!status.supported && (
        <p className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-4" /> Este sistema não mostra notificações.
        </p>
      )}

      <Option
        checked={status.enabled}
        onChange={(enabled) => save({ enabled })}
        label="Mandar lembretes"
      />

      {status.enabled && (
        <div className="space-y-3 border-l pl-4">
          <div className="flex flex-wrap items-center gap-3">
            <Option
              checked={status.blocks}
              onChange={(blocks) => save({ blocks })}
              label="Blocos da agenda"
            />
            {status.blocks && (
              <Select
                value={String(status.blockMinutes)}
                onValueChange={(v) => save({ blockMinutes: Number(v) })}
              >
                <SelectTrigger size="sm" className="w-44" aria-label="Antecedência">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADVANCE.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m === 0 ? 'Na hora de começar' : `${m} min antes`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <Option
            checked={status.tasks}
            onChange={(tasks) => save({ tasks })}
            label="Tarefas importantes"
            hint="Urgentes e de prioridade alta atrasadas, de hoje ou de amanhã."
          />
          <Option
            checked={status.projects}
            onChange={(projects) => save({ projects })}
            label="Projetos parados no GitHub"
          />
          {(status.tasks || status.projects) && (
            <div className="flex items-center gap-2 text-sm">
              <Label htmlFor="digest-time" className="font-normal">
                Resumo do dia às
              </Label>
              <Input
                id="digest-time"
                type="time"
                defaultValue={status.digestTime}
                key={status.digestTime}
                onBlur={(e) =>
                  e.target.value &&
                  e.target.value !== status.digestTime &&
                  save({ digestTime: e.target.value })
                }
                className="h-8 w-28"
              />
              <span className="text-xs text-muted-foreground">
                (se o app abrir depois, o resumo vem ao abrir)
              </span>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!status.supported || test.isPending}
            onClick={() => test.mutate([])}
          >
            <BellRing /> Testar notificação
          </Button>
        </div>
      )}

      <div className="space-y-3 border-t pt-4">
        <Option
          checked={status.closeToTray}
          onChange={(closeToTray) => save({ closeToTray })}
          label="Ao fechar a janela, continuar na bandeja"
          hint='Para sair de vez, use "Sair" no ícone da bandeja.'
        />
        <Option
          checked={status.openAtLogin}
          disabled={!status.canOpenAtLogin}
          onChange={(openAtLogin) => save({ openAtLogin })}
          label="Abrir junto com o Windows (direto na bandeja)"
          hint={status.canOpenAtLogin ? undefined : 'Disponível no app instalado.'}
        />
      </div>
    </div>
  )
}

function Option({
  checked,
  onChange,
  label,
  hint,
  disabled = false
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}): React.JSX.Element {
  const id = useId()
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChange(value === true)}
        className="mt-0.5"
      />
      <div>
        <Label htmlFor={id} className={disabled ? 'opacity-60' : undefined}>
          {label}
        </Label>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}
