import { createHash } from 'node:crypto'
import { and, count, eq, inArray, isNull, like, ne, or, sql, type SQL } from 'drizzle-orm'
import type { Api } from '@shared/api'
import { ragSearchSchema, ragSettingsUpdateSchema, type RagKind } from '@shared/schemas'
import type { RagHit, RagStatus } from '@shared/types'
import type { Db } from '../db/client'
import { bookHighlights, bookOcrPages, books, notes, ragChunks, ragSources } from '../db/schema'
import { RAG_CONFIG_KEY, readAiConfig, readRagSettings, setSetting } from './config'
import { ollamaEmbed, ollamaModels } from './providers'

/*
 * Busca inteligente (RAG). Anotações, destaques e páginas de OCR são cortados em trechos; cada
 * trecho ganha um vetor calculado por um modelo de embedding do Ollama (sempre local, mesmo quando
 * a conversa usa Claude ou OpenAI). A busca junta duas listas: a dos vetores mais parecidos com a
 * pergunta (significado) e a da FTS5 (palavras exatas), com Reciprocal Rank Fusion. Sem Ollama, ou
 * enquanto os vetores não ficam prontos, a busca continua funcionando só por palavras.
 *
 * Os vetores são comparados em memória (produto escalar de vetores normalizados): para o volume de
 * um estudante (dezenas de milhares de trechos) isso leva milissegundos, sem extensão nativa.
 */

const CHUNK_CHARS = 1200
const CHUNK_OVERLAP = 200
const EMBED_BATCH = 16
/**
 * Similaridade mínima para o trecho contar como achado pelo significado. Medido no bge-m3 com
 * anotações em português: trechos sem relação ficam entre 0,27 e 0,47; os relacionados, acima de 0,5.
 */
const MIN_SIMILARITY = 0.5
const CANDIDATES = 30
/** Constante padrão do Reciprocal Rank Fusion. */
const RRF_K = 60
/** Ordem de preferência entre os modelos de embedding instalados; o bge-m3 entende bem português. */
const PREFERRED_MODELS = [/bge-m3/, /multilingual|e5/, /nomic-embed/, /mxbai/, /./]

const STOPWORDS = new Set(
  (
    'que para por com uma uns umas dos das nos nas pelo pela como qual quais quando onde porque ' +
    'sobre entre isso esse essa este esta isto aquele aquela meu minha meus minhas seu sua seus ' +
    'suas ser estar tem ter mais menos muito pouco tudo nada voce você ele ela eles elas nao não ' +
    'sim the and for with what how why from this that are you'
  ).split(' ')
)

interface SourceDoc {
  key: string
  kind: RagKind
  sourceId: number
  highlightId: number | null
  page: number | null
  topicId: number | null
  title: string
  fingerprint: string
  /** Texto completo, lido só se a origem mudou (o OCR de um livro inteiro pode ser grande). */
  text: () => string
}

export interface RagSearchOptions {
  limit?: number
  /** Só trechos ligados a estes temas (anotações do tema ou livros do tema). */
  topicIds?: number[]
  /** Máximo de trechos da mesma origem (evita que uma anotação longa ocupe tudo). */
  perSource?: number
}

/** Trecho achado, com o texto inteiro (para mandar à IA). */
export interface RagMatch extends RagHit {
  text: string
}

export interface RagIndex {
  search(query: string, options?: RagSearchOptions): Promise<RagMatch[]>
  /** Atualiza o índice daqui a pouco (várias mudanças seguidas viram uma atualização só). */
  scheduleSync(delayMs?: number): void
}

const hash = (...parts: unknown[]): string =>
  createHash('sha1').update(parts.map(String).join('\u0000')).digest('hex')

/** Corta o texto em trechos de ~CHUNK_CHARS, de preferência em fim de parágrafo ou de frase. */
export function chunkText(text: string): string[] {
  const clean = text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (clean.length <= CHUNK_CHARS) return clean ? [clean] : []
  const chunks: string[] = []
  let start = 0
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_CHARS, clean.length)
    if (end < clean.length) {
      const from = start + CHUNK_CHARS / 2
      const window = clean.slice(from, end)
      const cut = [
        window.lastIndexOf('\n'),
        window.lastIndexOf('. '),
        window.lastIndexOf(' ')
      ].find((i) => i >= 0)
      if (cut !== undefined) end = from + cut + 1
    }
    chunks.push(clean.slice(start, end).trim())
    if (end >= clean.length) break
    // Repete o fim do trecho anterior para não perder o contexto no corte, começando numa palavra.
    start = end - CHUNK_OVERLAP
    const space = clean.indexOf(' ', start)
    if (space >= 0 && space < end) start = space + 1
  }
  return chunks.filter(Boolean)
}

/**
 * Termos da pergunta para a FTS5: palavras com 3+ letras, fora as muito comuns, como prefixo.
 * `all`: o trecho precisa ter todos os termos; senão, basta um.
 */
function ftsQuery(query: string, all: boolean): string {
  const terms = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
  return [...new Set(terms)].map((t) => `"${t}"*`).join(all ? ' ' : ' OR ')
}

/** Tudo o que pode ir para o índice, com uma impressão digital barata de calcular. */
function collectSources(db: Db): SourceDoc[] {
  const docs: SourceDoc[] = []

  for (const n of db.select().from(notes).all()) {
    const title = n.title.trim() || 'Sem título'
    if (!n.contentText.trim()) continue
    docs.push({
      key: `note:${n.id}`,
      kind: 'note',
      sourceId: n.id,
      highlightId: null,
      page: null,
      topicId: n.topicId,
      title,
      fingerprint: hash(title, n.topicId, n.contentText),
      text: () => n.contentText
    })
  }

  const highlightRows = db
    .select({
      id: bookHighlights.id,
      bookId: bookHighlights.bookId,
      text: bookHighlights.text,
      note: bookHighlights.note,
      sortKey: bookHighlights.sortKey,
      title: books.title,
      topicId: books.topicId,
      format: books.format
    })
    .from(bookHighlights)
    .innerJoin(books, eq(bookHighlights.bookId, books.id))
    .all()
  for (const h of highlightRows) {
    const text = `"${h.text.trim()}"` + (h.note ? `\nNota do estudante: ${h.note.trim()}` : '')
    docs.push({
      key: `highlight:${h.id}`,
      kind: 'highlight',
      sourceId: h.bookId,
      highlightId: h.id,
      // No PDF, sortKey é a página; no EPUB é a fração lida (não vira página).
      page: h.format === 'pdf' ? Math.floor(h.sortKey) : null,
      topicId: h.topicId,
      title: h.title,
      fingerprint: hash(text, h.title, h.topicId),
      text: () => text
    })
  }

  const ocrRows = db
    .select({
      bookId: bookOcrPages.bookId,
      page: bookOcrPages.page,
      createdAt: bookOcrPages.createdAt,
      title: books.title,
      topicId: books.topicId
    })
    .from(bookOcrPages)
    .innerJoin(books, eq(bookOcrPages.bookId, books.id))
    .all()
  for (const p of ocrRows) {
    docs.push({
      key: `ocr:${p.bookId}:${p.page}`,
      kind: 'ocr',
      sourceId: p.bookId,
      highlightId: null,
      page: p.page,
      topicId: p.topicId,
      title: p.title,
      fingerprint: hash(p.createdAt.getTime(), p.title, p.topicId),
      text: () =>
        db
          .select({ text: bookOcrPages.text })
          .from(bookOcrPages)
          .where(and(eq(bookOcrPages.bookId, p.bookId), eq(bookOcrPages.page, p.page)))
          .get()?.text ?? ''
    })
  }
  return docs
}

interface VectorCache {
  model: string
  ids: number[]
  topicIds: (number | null)[]
  dim: number
  data: Float32Array
}

export function createRagService(db: Db): { api: Api['rag']; index: RagIndex } {
  let running: Promise<void> | null = null
  let again = false
  let timer: NodeJS.Timeout | null = null
  let problem: string | null = null
  let vectors: VectorCache | null = null

  const ollamaUrl = (): string => readAiConfig(db).ollamaUrl

  /** Modelo de embedding a usar agora; null (com `problem` explicando) quando não há nenhum. */
  const resolveModel = async (): Promise<string | null> => {
    const settings = readRagSettings(db)
    if (!settings.enabled) return null
    let installed: string[]
    try {
      installed = (await ollamaModels(ollamaUrl()))
        .filter((m) => m.kind === 'embedding')
        .map((m) => m.name)
    } catch {
      problem = 'O Ollama não está respondendo; por enquanto a busca é só por palavras.'
      return null
    }
    const wanted = settings.embedModel
    if (wanted) {
      const found = installed.find((m) => m === wanted || m === `${wanted}:latest`)
      if (!found) problem = `O modelo "${wanted}" não está instalado no Ollama.`
      return found ?? null
    }
    for (const pattern of PREFERRED_MODELS) {
      const found = installed.find((m) => pattern.test(m))
      if (found) return found
    }
    problem =
      'Nenhum modelo de embedding no Ollama (instale com: ollama pull bge-m3). Por enquanto a ' +
      'busca é só por palavras.'
    return null
  }

  /** Põe o índice de texto em dia com anotações, destaques e OCR. Rápido: só mexe no que mudou. */
  const syncChunks = (): void => {
    const docs = collectSources(db)
    const indexed = new Map(
      db
        .select()
        .from(ragSources)
        .all()
        .map((r) => [r.sourceKey, r])
    )
    const current = new Set(docs.map((d) => d.key))
    let changed = false
    db.transaction((tx) => {
      for (const key of indexed.keys()) {
        if (current.has(key)) continue
        tx.delete(ragChunks).where(eq(ragChunks.sourceKey, key)).run()
        tx.delete(ragSources).where(eq(ragSources.sourceKey, key)).run()
        changed = true
      }
      for (const doc of docs) {
        if (indexed.get(doc.key)?.fingerprint === doc.fingerprint) continue
        tx.delete(ragChunks).where(eq(ragChunks.sourceKey, doc.key)).run()
        const pieces = chunkText(doc.text())
        if (pieces.length) {
          tx.insert(ragChunks)
            .values(
              pieces.map((text, position) => ({
                sourceKey: doc.key,
                kind: doc.kind,
                sourceId: doc.sourceId,
                highlightId: doc.highlightId,
                page: doc.page,
                topicId: doc.topicId,
                title: doc.title,
                position,
                text
              }))
            )
            .run()
        }
        tx.insert(ragSources)
          .values({ sourceKey: doc.key, fingerprint: doc.fingerprint })
          .onConflictDoUpdate({
            target: ragSources.sourceKey,
            set: { fingerprint: doc.fingerprint }
          })
          .run()
        changed = true
      }
    })
    if (changed) vectors = null
  }

  /** Calcula os vetores que faltam (trechos novos ou de outro modelo), em lotes. */
  const embedPending = async (model: string): Promise<void> => {
    for (;;) {
      const rows = db
        .select({ id: ragChunks.id, title: ragChunks.title, text: ragChunks.text })
        .from(ragChunks)
        .where(or(isNull(ragChunks.embedModel), ne(ragChunks.embedModel, model)))
        .limit(EMBED_BATCH)
        .all()
      if (!rows.length) return
      const embedded = await ollamaEmbed(
        ollamaUrl(),
        model,
        rows.map((r) => `${r.title}\n\n${r.text}`)
      )
      db.transaction((tx) => {
        rows.forEach((row, i) => {
          const v = embedded[i]
          tx.update(ragChunks)
            .set({
              embedding: Buffer.from(v.buffer, v.byteOffset, v.byteLength),
              embedModel: model
            })
            .where(eq(ragChunks.id, row.id))
            .run()
        })
      })
      vectors = null
    }
  }

  const sync = (): Promise<void> => {
    if (running) {
      again = true
      return running
    }
    running = (async () => {
      try {
        do {
          again = false
          syncChunks()
          problem = null
          const model = await resolveModel()
          if (model) await embedPending(model)
        } while (again)
      } catch (error) {
        problem = `Falha ao atualizar a busca inteligente: ${(error as Error).message}`
      } finally {
        running = null
      }
    })()
    return running
  }

  const scheduleSync = (delayMs = 4000): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void sync()
    }, delayMs)
  }

  const loadVectors = (model: string): VectorCache => {
    if (vectors?.model === model) return vectors
    const rows = db
      .select({ id: ragChunks.id, topicId: ragChunks.topicId, embedding: ragChunks.embedding })
      .from(ragChunks)
      .where(eq(ragChunks.embedModel, model))
      .all()
      .filter((r) => r.embedding?.byteLength)
    const dim = rows.length ? rows[0].embedding!.byteLength / 4 : 0
    const data = new Float32Array(rows.length * dim)
    rows.forEach((r, i) => {
      // Copia byte a byte: o Buffer do SQLite pode não estar alinhado para Float32Array.
      new Uint8Array(data.buffer, i * dim * 4, dim * 4).set(r.embedding!)
    })
    vectors = { model, ids: rows.map((r) => r.id), topicIds: rows.map((r) => r.topicId), dim, data }
    return vectors
  }

  /**
   * Ids por similaridade com a pergunta (já filtrados por tema e similaridade mínima), ou null
   * quando não há vetores para comparar.
   */
  const vectorRanking = async (
    query: string,
    topicIds: Set<number> | null
  ): Promise<number[] | null> => {
    const model = await resolveModel()
    if (!model) return null
    const cache = loadVectors(model)
    if (!cache.ids.length) return null
    const [q] = await ollamaEmbed(ollamaUrl(), model, [query])
    if (q.length !== cache.dim) return null
    const scored: { id: number; similarity: number }[] = []
    for (let i = 0; i < cache.ids.length; i++) {
      const topic = cache.topicIds[i]
      if (topicIds && (topic === null || !topicIds.has(topic))) continue
      let dot = 0
      const offset = i * cache.dim
      for (let d = 0; d < cache.dim; d++) dot += cache.data[offset + d] * q[d]
      if (dot >= MIN_SIMILARITY) scored.push({ id: cache.ids[i], similarity: dot })
    }
    return scored
      .toSorted((a, b) => b.similarity - a.similarity)
      .slice(0, CANDIDATES)
      .map((s) => s.id)
  }

  const wordRanking = (query: string, topicIds: number[] | null, all: boolean): number[] => {
    const match = ftsQuery(query, all)
    if (!match) return []
    const topicFilter = topicIds
      ? sql`AND rowid IN (SELECT id FROM rag_chunks WHERE topic_id IN ${topicIds})`
      : sql``
    return db
      .all<{ id: number }>(
        sql`SELECT rowid AS id FROM rag_chunks_fts
            WHERE rag_chunks_fts MATCH ${match} ${topicFilter}
            ORDER BY bm25(rag_chunks_fts, 2.0, 1.0)
            LIMIT ${CANDIDATES}`
      )
      .map((r) => r.id)
  }

  const search = async (query: string, options: RagSearchOptions = {}): Promise<RagMatch[]> => {
    const { limit = 6, topicIds, perSource = 2 } = options
    if (!readRagSettings(db).enabled) return []
    if (topicIds && !topicIds.length) return []
    // Garante que o que acabou de ser escrito já pode ser achado (ao menos por palavras).
    syncChunks()

    let byMeaning: number[] | null = null
    try {
      byMeaning = await vectorRanking(query, topicIds ? new Set(topicIds) : null)
    } catch (error) {
      problem = `Busca por significado indisponível: ${(error as Error).message}`
    }
    // Por palavras, o trecho precisa ter todos os termos (um termo solto, como "arquivo", traz
    // muita coisa sem relação). Só sem vetores, quando é a única busca, basta um termo.
    let byWords = wordRanking(query, topicIds ?? null, true)
    if (!byWords.length && byMeaning === null) byWords = wordRanking(query, topicIds ?? null, false)

    const scores = new Map<number, number>()
    for (const ranking of [byMeaning ?? [], byWords]) {
      ranking.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank + 1)))
    }
    if (!scores.size) return []
    const rows = new Map(
      db
        .select()
        .from(ragChunks)
        .where(inArray(ragChunks.id, [...scores.keys()]))
        .all()
        .map((r) => [r.id, r])
    )

    const perKey = new Map<string, number>()
    const out: RagMatch[] = []
    for (const [id, score] of [...scores].toSorted((a, b) => b[1] - a[1])) {
      const row = rows.get(id)
      if (!row) continue
      const used = perKey.get(row.sourceKey) ?? 0
      if (used >= perSource) continue
      perKey.set(row.sourceKey, used + 1)
      out.push({
        kind: row.kind,
        sourceId: row.sourceId,
        highlightId: row.highlightId,
        page: row.page,
        title: row.title,
        excerpt: row.text.length > 280 ? `${row.text.slice(0, 280).trimEnd()}…` : row.text,
        text: row.text,
        score
      })
      if (out.length >= limit) break
    }
    return out
  }

  const status = async (): Promise<RagStatus> => {
    const settings = readRagSettings(db)
    const activeModel = settings.enabled ? await resolveModel() : null
    const countWhere = (where?: SQL): number =>
      db.select({ n: count() }).from(ragChunks).where(where).get()?.n ?? 0
    const sourcesLike = (prefix: string): number =>
      db
        .select({ n: count() })
        .from(ragSources)
        .where(like(ragSources.sourceKey, `${prefix}:%`))
        .get()?.n ?? 0
    return {
      ...settings,
      activeModel,
      chunks: countWhere(),
      embedded: activeModel ? countWhere(eq(ragChunks.embedModel, activeModel)) : 0,
      sources: {
        notes: sourcesLike('note'),
        highlights: sourcesLike('highlight'),
        ocrPages: sourcesLike('ocr')
      },
      running: running !== null,
      problem: settings.enabled ? problem : null
    }
  }

  // Primeira atualização logo depois de abrir o app.
  scheduleSync(5000)

  return {
    index: { search, scheduleSync },
    api: {
      status,

      async updateSettings(input) {
        const data = ragSettingsUpdateSchema.parse(input)
        setSetting(db, RAG_CONFIG_KEY, JSON.stringify({ ...readRagSettings(db), ...data }))
        vectors = null
        scheduleSync(0)
        return status()
      },

      async reindex() {
        db.transaction((tx) => {
          tx.delete(ragChunks).run()
          tx.delete(ragSources).run()
        })
        vectors = null
        void sync()
        return status()
      },

      search: (query) => search(ragSearchSchema.parse(query), { limit: 12 })
    }
  }
}
