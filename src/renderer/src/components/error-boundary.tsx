import { Component, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'

interface Props {
  children: ReactNode
  /** Muda quando a tela muda: limpa o erro ao navegar. */
  resetKey?: string
}

/** Mostra uma mensagem em vez de deixar a tela em branco quando um componente quebra. */
export class ErrorBoundary extends Component<Props, { error: Error | null; key?: string }> {
  state = { error: null as Error | null, key: this.props.resetKey }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  static getDerivedStateFromProps(
    props: Props,
    state: { error: Error | null; key?: string }
  ): { error: null; key?: string } | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
  }

  componentDidCatch(error: Error): void {
    console.error(error)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid h-full place-items-center p-8">
        <div className="max-w-md text-center">
          <TriangleAlert className="mx-auto mb-3 size-8 text-amber-500" />
          <p className="font-medium">Algo deu errado nesta tela.</p>
          <p className="mt-1 text-sm break-words text-muted-foreground">
            {this.state.error.message}
          </p>
          <Button className="mt-4" variant="outline" onClick={() => this.setState({ error: null })}>
            Tentar de novo
          </Button>
        </div>
      </div>
    )
  }
}
