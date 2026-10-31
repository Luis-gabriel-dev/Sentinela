import type { ReactNode, SVGProps } from 'react'
import { cn } from '@renderer/lib/utils'

/*
 * Ícones próprios do Sentinela: grid de 24 px, traço de 1,75 e preenchimento "duotone"
 * (camada .icon-duo, mais forte no item ativo via CSS). Os ícones pequenos de ação
 * (botões, menus) continuam vindo do lucide-react.
 */

export type IconProps = SVGProps<SVGSVGElement>

function Icon({
  className,
  children,
  ...props
}: IconProps & { children: ReactNode }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('sentinela-icon size-5 shrink-0', className)}
      {...props}
    >
      {children}
    </svg>
  )
}

/** Camada de preenchimento suave. */
function Duo(props: SVGProps<SVGPathElement>): React.JSX.Element {
  return <path className="icon-duo" fill="currentColor" stroke="none" {...props} />
}

/** Marca do Sentinela: escudo com livro aberto. */
export function LogoIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <Duo d="M12 2.6 19.3 5.4v6.1c0 4.6-3.1 8.1-7.3 9.6-4.2-1.5-7.3-5-7.3-9.6V5.4Z" />
      <path d="M12 2.6 19.3 5.4v6.1c0 4.6-3.1 8.1-7.3 9.6-4.2-1.5-7.3-5-7.3-9.6V5.4Z" />
      <path d="M12 10.2c-1.2-.8-2.5-1-3.9-.7v5.3c1.4-.3 2.7-.1 3.9.7 1.2-.8 2.5-1 3.9-.7V9.5c-1.4-.3-2.7-.1-3.9.7Z" />
      <path d="M12 10.2v5.3" />
    </Icon>
  )
}

export function TodayIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <Duo d="M6.5 16.5a5.5 5.5 0 0 1 11 0Z" />
      <path d="M6.5 16.5a5.5 5.5 0 0 1 11 0" />
      <path d="M3 16.5h18M8 20h8M12 4.5v2.2M5.3 8.3l1.5 1.5M18.7 8.3l-1.5 1.5" />
    </Icon>
  )
}

export function AgendaIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
      <path d="M3.5 9.5h17M8 3v3M16 3v3" />
      <Duo d="M7.5 12h5a1 1 0 0 1 1 1v1.5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V13a1 1 0 0 1 1-1Z" />
      <rect x="6.5" y="12" width="7" height="3.5" rx="1" />
      <path d="M16.5 17.5h1" />
    </Icon>
  )
}

/** Semana: calendário com a lista de blocos do dia, um já marcado. */
export function WeekIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <Duo d="M6.5 4.5h11a3 3 0 0 1 3 3v2h-17v-2a3 3 0 0 1 3-3Z" />
      <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
      <path d="M3.5 9.5h17M8 3v3M16 3v3" />
      <path d="m7 13.2 1 1 1.6-1.8M7 17.5h2.5M12 13.5h5M12 17.5h5" />
    </Icon>
  )
}

export function TasksIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <Duo d="M5.5 4.5h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z" />
      <rect x="4.5" y="4.5" width="5" height="5" rx="1" />
      <path d="m5.9 7 1 1 1.7-1.9" />
      <rect x="4.5" y="14.5" width="5" height="5" rx="1" />
      <path d="M12.5 6h7M12.5 8.5h4M12.5 16h7M12.5 18.5h4" />
    </Icon>
  )
}

export function TopicsIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <Duo d="M12 3.5 20.5 8 12 12.5 3.5 8Z" />
      <path d="M12 3.5 20.5 8 12 12.5 3.5 8Z" />
      <path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5" />
    </Icon>
  )
}

export function NotesIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <Duo d="M6.5 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M16.5 8.5V5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1.5" />
      <path d="M8 3v18M10.5 7.5h3M10.5 10.5h2" />
      <path d="m20.3 9.2-6.1 6.1-2.4.6.6-2.4 6.1-6.1a1.3 1.3 0 0 1 1.8 1.8Z" />
    </Icon>
  )
}

export function LibraryIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <Duo d="M5 4h2.5a1 1 0 0 1 1 1v14.5H4V5a1 1 0 0 1 1-1Z" />
      <rect x="4" y="4" width="4.5" height="15.5" rx="1" />
      <rect x="10" y="6.5" width="4" height="13" rx="1" />
      <path d="m15.3 7.7 3.4-.9 3 11.6-3.4.9Z" />
      <path d="M3 20.5h18M6.25 8v2" />
    </Icon>
  )
}

export function ProjectsIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <Duo d="M3.5 7.5a2 2 0 0 1 2-2h3.8l2 2h7.2a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
      <path d="M3.5 7.5a2 2 0 0 1 2-2h3.8l2 2h7.2a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
      <path d="m10 11.5-2 2 2 2M14 11.5l2 2-2 2" />
    </Icon>
  )
}

export function MentorIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <Duo d="m11 3.5 1.9 5.1L18 10.5l-5.1 1.9L11 17.5l-1.9-5.1L4 10.5l5.1-1.9Z" />
      <path d="m11 3.5 1.9 5.1L18 10.5l-5.1 1.9L11 17.5l-1.9-5.1L4 10.5l5.1-1.9Z" />
      <path d="m18.5 15 .7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7Z" />
      <path d="M18.5 3.5v2.5M17.25 4.75h2.5" />
    </Icon>
  )
}

export function SettingsIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M4 7.5h8M18 7.5h2M4 16.5h2M12 16.5h8" />
      <Duo d="M15 5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM9 14a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z" />
      <circle cx="15" cy="7.5" r="2.5" />
      <circle cx="9" cy="16.5" r="2.5" />
    </Icon>
  )
}

export function ReaderIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <Duo d="M12 6.5c-2-1.5-4.6-2-8-1.5v13c3.4-.5 6 0 8 1.5Z" />
      <path d="M12 6.5c-2-1.5-4.6-2-8-1.5v13c3.4-.5 6 0 8 1.5 2-1.5 4.6-2 8-1.5V5c-3.4-.5-6 0-8 1.5Z" />
      <path d="M12 6.5v13" />
    </Icon>
  )
}

export function HighlightIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <Duo d="m14.5 4.5 5 5-7.5 7.5H7v-5Z" />
      <path d="m14.5 4.5 5 5-7.5 7.5H7v-5Z" />
      <path d="M7 17 4.5 19.5h5M12.6 6.4l5 5" />
    </Icon>
  )
}

export function ScanTextIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <Duo d="M7.5 8.5h9v7h-9Z" />
      <path d="M8 10h8M8 14h5" />
    </Icon>
  )
}

export function SearchTextIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <Duo d="M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Z" />
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5M8 9h5M8 12h3" />
    </Icon>
  )
}

export function UploadBookIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <Duo d="M6 3h9l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7Z" />
      <path d="M15 3v4h4M11.5 17v-6M9 13.5l2.5-2.5 2.5 2.5" />
    </Icon>
  )
}
