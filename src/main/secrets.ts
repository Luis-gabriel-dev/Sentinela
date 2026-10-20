/**
 * Criptografia de segredos (tokens, chaves de API) guardados no banco.
 * No app é o safeStorage do Electron (DPAPI no Windows); os serviços recebem esta interface
 * para não depender do Electron.
 */
export interface Secrets {
  available(): boolean
  encrypt(plain: string): string
  decrypt(encoded: string): string
}
