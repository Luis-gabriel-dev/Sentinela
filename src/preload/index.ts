import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNEL } from '@shared/api'

const bridge = {
  invoke: (path: string, args: unknown[]): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNEL, path, args)
}

export type SentinelaBridge = typeof bridge

contextBridge.exposeInMainWorld('sentinela', bridge)
