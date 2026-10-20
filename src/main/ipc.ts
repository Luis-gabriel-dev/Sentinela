import { ipcMain } from 'electron'
import { ZodError } from 'zod'
import { IPC_CHANNEL, type Api } from '@shared/api'

type Handler = (...args: unknown[]) => Promise<unknown>

/** Registra um único canal IPC que despacha "namespace.metodo" para a implementação da Api. */
export function registerApi(api: Api): void {
  ipcMain.handle(IPC_CHANNEL, async (_event, path: unknown, args: unknown) => {
    if (typeof path !== 'string' || !Array.isArray(args)) throw new Error('Chamada inválida')

    const [namespace, method] = path.split('.')
    const group = Object.hasOwn(api, namespace) ? api[namespace as keyof Api] : undefined
    const fn =
      group && Object.hasOwn(group, method)
        ? (group as unknown as Record<string, Handler>)[method]
        : undefined
    if (typeof fn !== 'function') throw new Error(`Método desconhecido: ${path}`)

    try {
      return await fn(...args)
    } catch (error) {
      if (error instanceof ZodError) {
        throw new Error(error.issues.map((issue) => issue.message).join('\n'), { cause: error })
      }
      throw error
    }
  })
}
