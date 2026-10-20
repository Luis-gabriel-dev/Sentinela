import { useMemo, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import multiMonthPlugin from '@fullcalendar/multimonth'
import interactionPlugin, { type EventResizeDoneArg } from '@fullcalendar/interaction'
import ptBrLocale from '@fullcalendar/core/locales/pt-br'
import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput
} from '@fullcalendar/core'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import type { DateRange } from '@shared/schemas'
import type { ScheduleBlock } from '@shared/types'
import { PageHeader } from '@renderer/components/page-header'
import { toIsoDate, toTime } from '@renderer/lib/format'
import { useCheckins, useSchedule, useTopics, useUpdateBlock } from '@renderer/lib/queries'
import { cn } from '@renderer/lib/utils'
import { BlockDialog, type BlockDraft } from './block-dialog'
import './calendar.css'

const DEFAULT_COLOR = '#6366f1'

type DialogState =
  | { open: false }
  | { open: true; block: ScheduleBlock; occurrenceDate: string; occurrenceDone: boolean }
  | { open: true; draft: BlockDraft }

export function AgendaPage(): React.JSX.Element {
  const { data: blocks = [] } = useSchedule()
  const { data: topics = [] } = useTopics()
  const [range, setRange] = useState<DateRange | null>(null)
  const { data: checkins = [] } = useCheckins(range)
  const update = useUpdateBlock()
  const [dialog, setDialog] = useState<DialogState>({ open: false })

  const doneSet = useMemo(() => new Set(checkins.map((c) => `${c.blockId}:${c.date}`)), [checkins])

  const events = useMemo<EventInput[]>(() => {
    const topicColor = new Map(topics.map((t) => [t.id, t.color]))
    return blocks.map((b) => {
      const color =
        b.color ?? (b.topicId !== null ? topicColor.get(b.topicId) : undefined) ?? DEFAULT_COLOR
      const base = {
        id: String(b.id),
        title: b.title,
        backgroundColor: color,
        borderColor: color,
        extendedProps: { block: b }
      }
      return b.recurrence === 'weekly'
        ? { ...base, daysOfWeek: [b.weekday!], startTime: b.startTime, endTime: b.endTime }
        : { ...base, start: `${b.date}T${b.startTime}`, end: `${b.date}T${b.endTime}` }
    })
  }, [blocks, topics])

  const onDatesSet = (arg: DatesSetArg): void => {
    const last = new Date(arg.end)
    last.setDate(last.getDate() - 1)
    const next = { from: toIsoDate(arg.start), to: toIsoDate(last) }
    setRange((prev) => (prev?.from === next.from && prev.to === next.to ? prev : next))
  }

  const onSelect = (arg: DateSelectArg): void => {
    arg.view.calendar.unselect()
    setDialog({
      open: true,
      draft: {
        recurrence: 'weekly',
        date: toIsoDate(arg.start),
        startTime: arg.allDay ? '08:00' : toTime(arg.start),
        endTime: arg.allDay ? '09:00' : toTime(arg.end)
      }
    })
  }

  const onEventClick = (arg: EventClickArg): void => {
    const block = arg.event.extendedProps.block as ScheduleBlock
    const occurrenceDate = toIsoDate(arg.event.start!)
    setDialog({
      open: true,
      block,
      occurrenceDate,
      occurrenceDone: doneSet.has(`${block.id}:${occurrenceDate}`)
    })
  }

  /** Arrastar ou redimensionar: blocos semanais mudam a série inteira. */
  const onEventMove = (arg: EventDropArg | EventResizeDoneArg): void => {
    const block = arg.event.extendedProps.block as ScheduleBlock
    const start = arg.event.start!
    const end = arg.event.end
    if (end && toIsoDate(end) !== toIsoDate(start)) {
      arg.revert()
      toast.error('Um bloco precisa começar e terminar no mesmo dia')
      return
    }
    const times = { startTime: toTime(start), endTime: end ? toTime(end) : block.endTime }
    update.mutate(
      [
        block.id,
        block.recurrence === 'weekly'
          ? { ...times, weekday: start.getDay() }
          : { ...times, date: toIsoDate(start) }
      ],
      { onError: () => arg.revert() }
    )
  }

  const renderEvent = (arg: EventContentArg): React.JSX.Element => {
    const block = arg.event.extendedProps.block as ScheduleBlock
    const done = arg.event.start ? doneSet.has(`${block.id}:${toIsoDate(arg.event.start)}`) : false
    return (
      <div
        className={cn(
          'flex h-full min-w-0 flex-col overflow-hidden px-1 py-0.5',
          done && 'opacity-60'
        )}
      >
        <div className="flex items-center gap-1">
          {done && <Check className="size-3 shrink-0" strokeWidth={3} />}
          <span className={cn('truncate font-medium', done && 'line-through')}>
            {arg.event.title}
          </span>
        </div>
        {arg.view.type.startsWith('timeGrid') && (
          <span className="truncate text-[11px] opacity-85">{arg.timeText}</span>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <PageHeader
        title="Agenda"
        description="Clique e arraste num horário vazio para criar um bloco. Arraste os blocos para mudar o horário."
      />
      <div className="min-h-0 flex-1 rounded-xl border bg-card p-4">
        <FullCalendar
          plugins={[timeGridPlugin, dayGridPlugin, multiMonthPlugin, interactionPlugin]}
          locale={ptBrLocale}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'timeGridDay,timeGridWeek,dayGridMonth,multiMonthYear'
          }}
          height="100%"
          firstDay={1}
          allDaySlot={false}
          nowIndicator
          slotMinTime="05:00:00"
          slotMaxTime="24:00:00"
          scrollTime="07:00:00"
          slotLabelFormat={{ hour: '2-digit', minute: '2-digit' }}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit' }}
          views={{
            timeGridWeek: { dayHeaderFormat: { weekday: 'short', day: 'numeric' } },
            dayGridMonth: { dayHeaderFormat: { weekday: 'short' } },
            multiMonthYear: { dayHeaderFormat: { weekday: 'narrow' }, dayMaxEvents: 1 }
          }}
          selectable
          selectMirror
          editable
          events={events}
          datesSet={onDatesSet}
          select={onSelect}
          eventClick={onEventClick}
          eventDrop={onEventMove}
          eventResize={onEventMove}
          eventContent={renderEvent}
        />
      </div>

      <BlockDialog
        open={dialog.open}
        onOpenChange={(open) => !open && setDialog({ open: false })}
        {...(dialog.open && 'block' in dialog
          ? {
              block: dialog.block,
              occurrenceDate: dialog.occurrenceDate,
              occurrenceDone: dialog.occurrenceDone
            }
          : {})}
        draft={dialog.open && 'draft' in dialog ? dialog.draft : undefined}
      />
    </div>
  )
}
