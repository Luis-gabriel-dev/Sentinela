import type { ReactNode } from 'react'

interface Props {
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: Props): React.JSX.Element {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}

export function EmptyState({
  icon,
  title,
  children
}: {
  icon: ReactNode
  title: string
  children?: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center">
      <div className="mb-3 text-muted-foreground [&_svg]:size-8">{icon}</div>
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</div>}
    </div>
  )
}
