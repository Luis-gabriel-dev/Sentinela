import { Construction } from 'lucide-react'
import { EmptyState, PageHeader } from '@renderer/components/page-header'

export function ComingSoonPage({
  title,
  text,
  step
}: {
  title: string
  text: string
  step: number
}): React.JSX.Element {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={<Construction />} title={`Etapa ${step} do roadmap`}>
        {text}
      </EmptyState>
    </>
  )
}
