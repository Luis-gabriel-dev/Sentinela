import { asc, eq, isNull, sql } from 'drizzle-orm'
import type { Api } from '@shared/api'
import { topicCreateSchema, topicUpdateSchema } from '@shared/schemas'
import type { Db } from '../db/client'
import { topics } from '../db/schema'

export function createTopicsService(db: Db): Api['topics'] {
  const get = (id: number): typeof topics.$inferSelect => {
    const row = db.select().from(topics).where(eq(topics.id, id)).get()
    if (!row) throw new Error('Tema não encontrado')
    return row
  }

  /** Impede mover um tema para dentro dele mesmo ou de um descendente. */
  const assertNoCycle = (id: number, newParentId: number): void => {
    let current: number | null = newParentId
    while (current !== null) {
      if (current === id) throw new Error('Um tema não pode ficar dentro dele mesmo')
      current = get(current).parentId
    }
  }

  const nextPosition = (parentId: number | null): number => {
    const row = db
      .select({ max: sql<number>`coalesce(max(${topics.position}), -1)` })
      .from(topics)
      .where(parentId === null ? isNull(topics.parentId) : eq(topics.parentId, parentId))
      .get()
    return (row?.max ?? -1) + 1
  }

  return {
    async list() {
      return db.select().from(topics).orderBy(asc(topics.position), asc(topics.name)).all()
    },

    async create(input) {
      const data = topicCreateSchema.parse(input)
      const parentId = data.parentId ?? null
      if (parentId !== null) get(parentId)
      return db
        .insert(topics)
        .values({ ...data, parentId, position: nextPosition(parentId) })
        .returning()
        .get()
    },

    async update(id, input) {
      const { completed, ...data } = topicUpdateSchema.parse(input)
      get(id)
      if (data.parentId != null) assertNoCycle(id, data.parentId)
      return db
        .update(topics)
        .set({
          ...data,
          ...(completed !== undefined && { completedAt: completed ? new Date() : null })
        })
        .where(eq(topics.id, id))
        .returning()
        .get()
    },

    async remove(id) {
      db.delete(topics).where(eq(topics.id, id)).run()
    }
  }
}
