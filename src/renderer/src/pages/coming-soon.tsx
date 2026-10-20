import type { ReactNode } from 'react'
import { EmptyState, PageHeader } from '@renderer/components/page-header'

export function ComingSoonPage({
  title,
  text,
  step,
  icon
}: {
  title: string
  text: string
  step: number
  icon: ReactNode
}): React.JSX.Element {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={icon} title={`Etapa ${step} do roadmap`}>
        {text}
      </EmptyState>
    </>
  )
}
