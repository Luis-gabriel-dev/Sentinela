import { net, protocol } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { FILE_PROTOCOL } from '@shared/api'
import { ATTACHMENT_NAME } from './services/attachments'

/** Precisa rodar antes de app.whenReady(). */
export function registerFileScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: FILE_PROTOCOL, privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ])
}

/**
 * Serve sentinela://attachments/<arquivo> a partir da pasta de anexos.
 * Só aceita nomes no formato gerado pelo app, então não há como sair da pasta.
 */
export function handleFileProtocol(attachmentsDir: string): void {
  protocol.handle(FILE_PROTOCOL, (request) => {
    const url = new URL(request.url)
    const name = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (url.host !== 'attachments' || !ATTACHMENT_NAME.test(name)) {
      return new Response('Não encontrado', { status: 404 })
    }
    return net.fetch(pathToFileURL(join(attachmentsDir, name)).toString())
  })
}
