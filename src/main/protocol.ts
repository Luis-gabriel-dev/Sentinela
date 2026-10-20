import { net, protocol } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { FILE_PROTOCOL } from '@shared/api'
import { ATTACHMENT_NAME } from './services/attachments'

/** Precisa rodar antes de app.whenReady(). */
export function registerFileScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: FILE_PROTOCOL,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
    }
  ])
}

interface Sources {
  attachmentsDir: string
  coversDir: string
  /** Pasta com cmaps/, standard_fonts/, wasm/ e iccs/ do pdfjs-dist. */
  pdfjsAssetsDir: string
  /** Caminho do arquivo de um livro cadastrado, ou null. */
  bookPath: (id: number) => string | null
}

/**
 * Serve arquivos locais para a interface:
 *   sentinela://attachments/<uuid>.png  imagens das anotações
 *   sentinela://covers/<id>.jpg         capas dos livros
 *   sentinela://books/<id>              arquivo do livro cadastrado com esse id
 *   sentinela://pdfjs/<pasta>/<arquivo> fontes, cmaps e wasm do pdf.js
 * Os nomes são validados, e livros só saem pelo id do banco: não há como pedir um caminho
 * arbitrário do disco.
 */
export function handleFileProtocol({
  attachmentsDir,
  coversDir,
  pdfjsAssetsDir,
  bookPath
}: Sources): void {
  const resolveFile = (host: string, name: string): string | null => {
    if (host === 'attachments' && ATTACHMENT_NAME.test(name)) return join(attachmentsDir, name)
    if (host === 'covers' && /^\d+\.jpg$/.test(name)) return join(coversDir, name)
    if (host === 'books' && /^\d+$/.test(name)) return bookPath(Number(name))
    if (host === 'pdfjs' && /^(cmaps|standard_fonts|wasm|iccs)\/[\w.-]+$/.test(name)) {
      return join(pdfjsAssetsDir, name)
    }
    return null
  }

  protocol.handle(FILE_PROTOCOL, async (request) => {
    const url = new URL(request.url)
    const file = resolveFile(url.host, decodeURIComponent(url.pathname.replace(/^\//, '')))
    if (!file) return new Response('Não encontrado', { status: 404 })
    try {
      const response = await net.fetch(pathToFileURL(file).toString())
      const headers = new Headers(response.headers)
      // A interface roda em outra origem (localhost no dev, file:// no app empacotado).
      headers.set('Access-Control-Allow-Origin', '*')
      return new Response(response.body, { status: response.status, headers })
    } catch {
      return new Response('Não encontrado', { status: 404 })
    }
  })
}
