import { and, desc, eq, isNotNull, isNull, type SQL } from 'drizzle-orm'
import type { Api } from '@shared/api'
import { taskCreateSchema, taskFilterSchema, taskUpdateSchema } from '@shared/schemas'
import type { Db } from '../db/client'
import { tasks } from '../db/schema'

export function createTasksService(db: Db): Api['tasks'] {
  return {
    async list(filter) {
      const { topicId, status = 'all' } = taskFilterSchema.parse(filter) ?? {}
      const conditions: SQL[] = []
      if (topicId !== undefined) conditions.push(eq(tasks.topicId, topicId))
      if (status === 'open') conditions.push(isNull(tasks.completedAt))
      if (status === 'done') conditions.push(isNotNull(tasks.completedAt))
      return db
        .select()
        .from(tasks)
        .where(and(...conditions))
        .orderBy(desc(tasks.createdAt))
        .all()
    },

    async create(input) {
      return db.insert(tasks).values(taskCreateSchema.parse(input)).returning().get()
    },

    async update(id, input) {
      const { completed, ...data } = taskUpdateSchema.parse(input)
      const row = db
        .update(tasks)
        .set({
          ...data,
          ...(completed !== undefined && { completedAt: completed ? new Date() : null })
        })
        .where(eq(tasks.id, id))
        .returning()
        .get()
      if (!row) throw new Error('Tarefa não encontrada')
      return row
    },

    async remove(id) {
      db.delete(tasks).where(eq(tasks.id, id)).run()
    }
  }
}
