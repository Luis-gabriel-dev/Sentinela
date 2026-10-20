import type { Api } from '@shared/api'

const REMOTE_ERROR_PREFIX = /^Error invoking remote method '[^']+': (?:Error: )?/

async function call(path: string, args: unknown[]): Promise<unknown> {
  try {
    return await window.sentinela.invoke(path, args)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(message.replace(REMOTE_ERROR_PREFIX, ''), { cause: error })
  }
}

/** Cliente tipado: api.tasks.create({...}) vira uma chamada IPC "tasks.create". */
export const api = new Proxy({} as Api, {
  get: (_, namespace) =>
    new Proxy(
      {},
      {
        get:
          (_, method) =>
          (...args: unknown[]) =>
            call(`${String(namespace)}.${String(method)}`, args)
      }
    )
})
