import { eq } from 'drizzle-orm'
import type { AiProvider } from '@shared/schemas'
import type { RagSettings } from '@shared/types'
import type { Db } from '../db/client'
import { settings } from '../db/schema'
import { DEFAULT_MODELS } from './providers'

export const AI_CONFIG_KEY = 'ai.config'
export const RAG_CONFIG_KEY = 'rag.config'

export interface AiConfig {
  provider: AiProvider
  models: Record<AiProvider, string>
  ollamaUrl: string
}

const DEFAULT_AI_CONFIG: AiConfig = {
  provider: 'anthropic',
  models: DEFAULT_MODELS,
  ollamaUrl: 'http://localhost:11434'
}

const DEFAULT_RAG_SETTINGS: RagSettings = { enabled: true, embedModel: null }

export const getSetting = (db: Db, key: string): string | null =>
  db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null

export function setSetting(db: Db, key: string, value: string): void {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run()
}

function readJson<T>(db: Db, key: string): Partial<T> {
  const stored = getSetting(db, key)
  return stored ? (JSON.parse(stored) as Partial<T>) : {}
}

export function readAiConfig(db: Db): AiConfig {
  const parsed = readJson<AiConfig>(db, AI_CONFIG_KEY)
  return {
    ...DEFAULT_AI_CONFIG,
    ...parsed,
    models: { ...DEFAULT_AI_CONFIG.models, ...parsed.models }
  }
}

export const readRagSettings = (db: Db): RagSettings => ({
  ...DEFAULT_RAG_SETTINGS,
  ...readJson<RagSettings>(db, RAG_CONFIG_KEY)
})
