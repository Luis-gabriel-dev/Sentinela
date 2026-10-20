declare global {
  interface Window {
    sentinela: {
      invoke(path: string, args: unknown[]): Promise<unknown>
      /** Caminho no disco de um arquivo arrastado para a janela ('' se não houver). */
      pathForFile(file: File): string
      /** Escuta um canal de eventos do processo principal. Devolve a função que para de escutar. */
      on(channel: string, callback: (payload: unknown) => void): () => void
    }
  }
}

export {}
