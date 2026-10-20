import { NavLink, Outlet, useLocation } from 'react-router'
import {
  CalendarDays,
  FolderGit2,
  Layers,
  Library,
  ListChecks,
  Monitor,
  Moon,
  NotebookPen,
  Settings,
  ShieldHalf,
  Sparkles,
  Sun,
  type LucideIcon
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { ErrorBoundary } from '@renderer/components/error-boundary'
import { useTheme, type Theme } from '@renderer/lib/theme'
import { cn } from '@renderer/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  soon?: boolean
}

const NAV: NavItem[][] = [
  [
    { to: '/', label: 'Hoje', icon: Sun },
    { to: '/agenda', label: 'Agenda', icon: CalendarDays },
    { to: '/tarefas', label: 'Tarefas', icon: ListChecks },
    { to: '/temas', label: 'Temas e progresso', icon: Layers }
  ],
  [
    { to: '/anotacoes', label: 'Anotações', icon: NotebookPen },
    { to: '/biblioteca', label: 'Biblioteca', icon: Library },
    { to: '/projetos', label: 'Projetos', icon: FolderGit2, soon: true },
    { to: '/mentora', label: 'IA mentora', icon: Sparkles, soon: true }
  ]
]

const THEMES: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor }
]

function SidebarLink({ item }: { item: NavItem }): React.JSX.Element {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground'
        )
      }
    >
      <item.icon className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
      {item.soon && (
        <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          em breve
        </span>
      )}
    </NavLink>
  )
}

function ThemeSwitcher(): React.JSX.Element {
  const { theme, setTheme } = useTheme()
  return (
    <div className="flex rounded-lg bg-muted/60 p-1">
      {THEMES.map(({ value, label, icon: Icon }) => (
        <Tooltip key={value}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={label}
              onClick={() => setTheme(value)}
              className={cn(
                'flex flex-1 items-center justify-center rounded-md py-1.5 text-muted-foreground transition hover:text-foreground',
                theme === value && 'bg-background text-foreground shadow-sm'
              )}
            >
              <Icon className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

/** Páginas com layout próprio de tela cheia (painéis), sem o container centralizado. */
const FULL_BLEED = [/^\/anotacoes/, /^\/biblioteca\/\d+/]

export function AppShell(): React.JSX.Element {
  const { pathname } = useLocation()
  const fullBleed = FULL_BLEED.some((p) => p.test(pathname))

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/20">
            <ShieldHalf className="size-4.5" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">Sentinela</span>
        </div>

        <nav className="flex flex-1 flex-col gap-6">
          {NAV.map((group, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              {group.map((item) => (
                <SidebarLink key={item.to} item={item} />
              ))}
            </div>
          ))}
        </nav>

        <div className="flex flex-col gap-3">
          <SidebarLink item={{ to: '/configuracoes', label: 'Configurações', icon: Settings }} />
          <ThemeSwitcher />
        </div>
      </aside>

      {fullBleed ? (
        <main className="min-w-0 flex-1">
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      ) : (
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-8 py-8">
            <ErrorBoundary resetKey={pathname}>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      )}
    </div>
  )
}
