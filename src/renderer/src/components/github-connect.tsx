import { useState } from 'react'
import { ExternalLink, KeyRound, LogOut, ShieldCheck } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { ConfirmDelete } from '@renderer/components/confirm-delete'
import { useConnectGithub, useDisconnectGithub, useGithubStatus } from '@renderer/lib/queries'

const NEW_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new'

/** Conectar/desconectar a conta do GitHub com um token pessoal só de leitura. */
export function GithubConnect({ compact = false }: { compact?: boolean }): React.JSX.Element {
  const { data: status } = useGithubStatus()
  const connect = useConnectGithub()
  const disconnect = useDisconnectGithub()
  const [token, setToken] = useState('')

  if (status?.connected) {
    return (
      <div className="flex items-center gap-3">
        {status.avatarUrl ? (
          <img src={status.avatarUrl} alt="" className="size-8 rounded-full border" />
        ) : (
          <ShieldCheck className="size-5 text-emerald-500" />
        )}
        <div className="min-w-0 flex-1 text-sm">
          <p>
            Conectado como <span className="font-medium">@{status.login}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            O token fica criptografado neste computador.
          </p>
        </div>
        <ConfirmDelete
          title="Desconectar o GitHub?"
          description="O token é apagado deste computador. Os projetos continuam na lista; repositórios privados deixam de ser atualizados."
          onConfirm={() => disconnect.mutate([])}
        >
          <Button variant="outline" size="sm">
            <LogOut /> Desconectar
          </Button>
        </ConfirmDelete>
      </div>
    )
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        connect.mutate([token], { onSuccess: () => setToken('') })
      }}
    >
      {!compact && (
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            Sem token dá para acompanhar repositórios públicos. Com um token você vê também os
            privados, lista seus repositórios e tem um limite de consultas bem maior.
          </p>
          <p>
            Crie um <span className="font-medium text-foreground">fine-grained token</span> com
            acesso aos repositórios que quiser e as permissões{' '}
            <span className="text-foreground">Contents, Issues e Pull requests</span> em modo
            somente leitura.
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <KeyRound className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="github_pat_..."
            className="pl-8 font-mono text-sm"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <Button type="submit" disabled={!token.trim() || connect.isPending}>
          {connect.isPending ? 'Verificando...' : 'Conectar'}
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <a href={NEW_TOKEN_URL} target="_blank" rel="noreferrer">
            Criar token <ExternalLink />
          </a>
        </Button>
      </div>
      {status && !status.encryptionAvailable && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Este sistema não oferece armazenamento seguro; o token não pode ser salvo.
        </p>
      )}
    </form>
  )
}
