import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FILE_PROTOCOL, type Api } from '@shared/api'
import { ATTACHMENT_MIME_TYPES, attachmentSchema } from '@shared/schemas'

/** Nomes gerados pelo próprio app: uuid + extensão de imagem conhecida. */
export const ATTACHMENT_NAME = /^[0-9a-f-]{36}\.(png|jpg|gif|webp)$/

export function createAttachmentsService(dir: string): Api['attachments'] {
  mkdirSync(dir, { recursive: true })

  return {
    async save(input) {
      const { mimeType, data } = attachmentSchema.parse(input)
      const name = `${randomUUID()}.${ATTACHMENT_MIME_TYPES[mimeType]}`
      writeFileSync(join(dir, name), data)
      return `${FILE_PROTOCOL}://attachments/${name}`
    }
  }
}
