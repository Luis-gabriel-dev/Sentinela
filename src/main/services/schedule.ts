import { and, asc, between, eq } from 'drizzle-orm'
import type { Api } from '@shared/api'
import {
  dateRangeSchema,
  isoDateSchema,
  scheduleBlockCreateSchema,
  scheduleBlockSchema,
  scheduleBlockUpdateSchema
} from '@shared/schemas'
import type { Db } from '../db/client'
import { blockCheckins, scheduleBlocks } from '../db/schema'

export function createScheduleService(db: Db): Api['schedule'] {
  const get = (id: number): typeof scheduleBlocks.$inferSelect => {
    const row = db.select().from(scheduleBlocks).where(eq(scheduleBlocks.id, id)).get()
    if (!row) throw new Error('Bloco da agenda não encontrado')
    return row
  }

  return {
    async list() {
      return db.select().from(scheduleBlocks).orderBy(asc(scheduleBlocks.startTime)).all()
    },

    async create(input) {
      const data = scheduleBlockSchema.parse({
        topicId: null,
        color: null,
        weekday: null,
        date: null,
        notes: null,
        ...scheduleBlockCreateSchema.parse(input)
      })
      return db.insert(scheduleBlocks).values(data).returning().get()
    },

    async update(id, input) {
      // Valida o bloco resultante inteiro, já que as regras dependem de vários campos juntos.
      const data = scheduleBlockSchema.parse({
        ...get(id),
        ...scheduleBlockUpdateSchema.parse(input)
      })
      return db.update(scheduleBlocks).set(data).where(eq(scheduleBlocks.id, id)).returning().get()
    },

    async remove(id) {
      db.delete(scheduleBlocks).where(eq(scheduleBlocks.id, id)).run()
    },

    async checkins(range) {
      const { from, to } = dateRangeSchema.parse(range)
      return db
        .select()
        .from(blockCheckins)
        .where(between(blockCheckins.date, from, to))
        .all()
    },

    async toggleCheckin(blockId, date) {
      isoDateSchema.parse(date)
      get(blockId)
      const where = and(eq(blockCheckins.blockId, blockId), eq(blockCheckins.date, date))
      const exists = db.select().from(blockCheckins).where(where).get()
      if (exists) {
        db.delete(blockCheckins).where(where).run()
        return false
      }
      db.insert(blockCheckins).values({ blockId, date }).run()
      return true
    }
  }
}
