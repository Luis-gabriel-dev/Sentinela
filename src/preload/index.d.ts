declare global {
  interface Window {
    sentinela: {
      invoke(path: string, args: unknown[]): Promise<unknown>
      /** Caminho no disco de um arquivo arrastado para a janela ('' se não houver). */
      pathForFile(file: File): string
    }
  }
}

export {}
