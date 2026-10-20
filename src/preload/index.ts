import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { EVENT_CHANNELS, IPC_CHANNEL } from '@shared/api'

const bridge = {
  invoke: (path: string, args: unknown[]): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNEL, path, args),
  /** Caminho no disco de um arquivo arrastado para a janela. */
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  /** Escuta eventos do processo principal (só os canais permitidos). Devolve o "desligar". */
  on: (channel: string, callback: (payload: unknown) => void): (() => void) => {
    if (!(EVENT_CHANNELS as readonly string[]).includes(channel)) {
      throw new Error(`Canal não permitido: ${channel}`)
    }
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown): void =>
      callback(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('sentinela', bridge)
