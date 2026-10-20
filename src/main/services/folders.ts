import { asc, eq, sql } from 'drizzle-orm'
import type { Api } from '@shared/api'
import { folderCreateSchema, folderUpdateSchema } from '@shared/schemas'
import type { Db } from '../db/client'
import { libraryFolders } from '../db/schema'

export function createFoldersService(db: Db): Api['folders'] {
  return {
    async list() {
      return db
        .select()
        .from(libraryFolders)
        .orderBy(asc(libraryFolders.position), asc(libraryFolders.name))
        .all()
    },

    async create(input) {
      const data = folderCreateSchema.parse(input)
      const { max } = db
        .select({ max: sql<number>`coalesce(max(${libraryFolders.position}), -1)` })
        .from(libraryFolders)
        .get()!
      return db
        .insert(libraryFolders)
        .values({ ...data, position: max + 1 })
        .returning()
        .get()
    },

    async update(id, input) {
      const row = db
        .update(libraryFolders)
        .set(folderUpdateSchema.parse(input))
        .where(eq(libraryFolders.id, id))
        .returning()
        .get()
      if (!row) throw new Error('Pasta não encontrada')
      return row
    },

    async remove(id) {
      // Os livros da pasta ficam sem pasta (ON DELETE SET NULL).
      db.delete(libraryFolders).where(eq(libraryFolders.id, id)).run()
    }
  }
}
