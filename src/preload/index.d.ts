declare global {
  interface Window {
    sentinela: {
      invoke(path: string, args: unknown[]): Promise<unknown>
    }
  }
}

export {}
