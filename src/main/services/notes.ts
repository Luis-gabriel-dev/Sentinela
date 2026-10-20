import { eq, sql } from 'drizzle-orm'
import type { Api } from '@shared/api'
import { noteCreateSchema, noteSearchSchema, noteUpdateSchema } from '@shared/schemas'
import { SNIPPET_MARK, type NoteSearchResult } from '@shared/types'
import type { Db } from '../db/client'
import { notes } from '../db/schema'

const MAX_CONTENT_CHARS = 5_000_000

const summaryColumns = {
  id: notes.id,
  topicId: notes.topicId,
  title: notes.title,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt
}

/** Junta os campos `text` do conteúdo inline (inclui links e células de tabela). */
function inlineText(node: unknown): string {
  if (Array.isArray(node)) return node.map(inlineText).join('')
  if (!node || typeof node !== 'object') return ''
  const obj = node as Record<string, unknown>
  if (typeof obj.text === 'string') return obj.text
  if (Array.isArray(obj.rows)) {
    return obj.rows
      .map((row) =>
        Array.isArray((row as { cells?: unknown }).cells)
          ? (row as { cells: unknown[] }).cells.map(inlineText).join(' ')
          : ''
      )
      .join('\n')
  }
  return inlineText(obj.content)
}

/** Texto puro dos blocos do BlockNote, um bloco por linha, para o índice de busca. */
export function blocksToText(blocks: unknown[]): string {
  return blocks
    .flatMap((block) => {
      if (!block || typeof block !== 'object') return []
      const { content, children } = block as { content?: unknown; children?: unknown }
      const own = inlineText(content).trim()
      const nested = Array.isArray(children) ? blocksToText(children) : ''
      return [own, nested].filter(Boolean)
    })
    .join('\n')
}

/** "camada transp" → "camada"* "transp"* (cada termo como prefixo, aspas escapadas). */
function toFtsQuery(query: string): string {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replaceAll('"', '""')}"*`)
    .join(' ')
}

export function createNotesService(db: Db): Api['notes'] {
  const assertExists = (id: number): void => {
    const row = db.select({ id: notes.id }).from(notes).where(eq(notes.id, id)).get()
    if (!row) throw new Error('Anotação não encontrada')
  }

  return {
    async list() {
      return db.select(summaryColumns).from(notes).all()
    },

    async get(id) {
      // contentText fica de fora: só serve ao índice de busca.
      const row = db
        .select({ ...summaryColumns, content: notes.content })
        .from(notes)
        .where(eq(notes.id, id))
        .get()
      if (!row) throw new Error('Anotação não encontrada')
      return { ...row, content: JSON.parse(row.content) as unknown[] }
    },

    async create(input) {
      const data = noteCreateSchema.parse(input)
      return db
        .insert(notes)
        .values({ title: data.title ?? '', topicId: data.topicId ?? null })
        .returning(summaryColumns)
        .get()
    },

    async update(id, input) {
      const { content, ...data } = noteUpdateSchema.parse(input)
      assertExists(id)
      let contentFields = {}
      if (content !== undefined) {
        const json = JSON.stringify(content)
        if (json.length > MAX_CONTENT_CHARS) throw new Error('Anotação grande demais')
        contentFields = { content: json, contentText: blocksToText(content) }
      }
      return db
        .update(notes)
        .set({ ...data, ...contentFields })
        .where(eq(notes.id, id))
        .returning(summaryColumns)
        .get()!
    },

    async remove(id) {
      db.delete(notes).where(eq(notes.id, id)).run()
    },

    async search(query) {
      const match = toFtsQuery(noteSearchSchema.parse(query))
      if (!match) return []
      // bm25 com peso 5 no título: achar no título vale mais que no corpo.
      return db.all<NoteSearchResult>(sql`
        SELECT n.id AS id, n.topic_id AS topicId, n.title AS title,
               snippet(notes_fts, 1, ${SNIPPET_MARK.start}, ${SNIPPET_MARK.end}, '…', 14) AS snippet
        FROM notes_fts
        JOIN notes n ON n.id = notes_fts.rowid
        WHERE notes_fts MATCH ${match}
        ORDER BY bm25(notes_fts, 5.0, 1.0)
        LIMIT 50
      `)
    }
  }
}
