import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC_CHANNEL } from '@shared/api'

const bridge = {
  invoke: (path: string, args: unknown[]): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNEL, path, args),
  /** Caminho no disco de um arquivo arrastado para a janela. */
  pathForFile: (file: File): string => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('sentinela', bridge)
