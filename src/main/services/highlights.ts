import { asc, eq } from 'drizzle-orm'
import type { Api } from '@shared/api'
import { highlightCreateSchema, highlightUpdateSchema } from '@shared/schemas'
import type { Db } from '../db/client'
import { bookHighlights } from '../db/schema'

export function createHighlightsService(db: Db): Api['highlights'] {
  return {
    async list(bookId) {
      return db
        .select()
        .from(bookHighlights)
        .where(eq(bookHighlights.bookId, bookId))
        .orderBy(asc(bookHighlights.sortKey), asc(bookHighlights.createdAt))
        .all()
    },

    async create(input) {
      return db.insert(bookHighlights).values(highlightCreateSchema.parse(input)).returning().get()
    },

    async update(id, input) {
      const row = db
        .update(bookHighlights)
        .set(highlightUpdateSchema.parse(input))
        .where(eq(bookHighlights.id, id))
        .returning()
        .get()
      if (!row) throw new Error('Destaque não encontrado')
      return row
    },

    async remove(id) {
      db.delete(bookHighlights).where(eq(bookHighlights.id, id)).run()
    }
  }
}
