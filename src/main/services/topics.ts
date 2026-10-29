import { asc, eq, isNull, sql } from 'drizzle-orm'
import type { Api } from '@shared/api'
import {
  importOutlineSchema,
  topicCreateSchema,
  topicUpdateSchema,
  type OutlineNodeInput
} from '@shared/schemas'
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
    },

    async importOutline(input) {
      const { parentId, root, bookId, trackProgress, items } = importOutlineSchema.parse(input)
      if (parentId !== null) get(parentId)
      if (!root && parentId === null) throw new Error('Escolha onde criar os temas')
      let created = 0
      // Tudo ou nada: um sumário de livro tem centenas de itens.
      const rootId = db.transaction((tx) => {
        const insert = (
          values: Omit<typeof topics.$inferInsert, 'position'>,
          position: number
        ): number => {
          created++
          return tx
            .insert(topics)
            .values({ ...values, position })
            .returning({ id: topics.id })
            .get().id
        }
        let containerId = parentId!
        let color = parentId === null ? root!.color : get(parentId).color
        if (root) {
          color = root.color
          containerId = insert(
            { name: root.name, color, parentId, trackProgress, bookId },
            nextPosition(parentId)
          )
        } else if (trackProgress) {
          tx.update(topics).set({ trackProgress: true }).where(eq(topics.id, containerId)).run()
        }
        const add = (nodes: OutlineNodeInput[], parent: number, start: number): void =>
          nodes.forEach((node, i) => {
            const id = insert(
              {
                name: node.title,
                color,
                parentId: parent,
                bookId,
                bookLocation: bookId ? (node.bookLocation ?? null) : null
              },
              start + i
            )
            add(node.children, id, 0)
          })
        add(items, containerId, root ? 0 : nextPosition(containerId))
        return root ? containerId : null
      })
      return { rootId, created }
    }
  }
}
