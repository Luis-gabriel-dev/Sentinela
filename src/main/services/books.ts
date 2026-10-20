import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { eq, sql } from 'drizzle-orm'
import type { Api } from '@shared/api'
import {
  BOOK_EXTENSIONS,
  bookPathsSchema,
  bookUpdateSchema,
  coverSchema,
  type BookFormat
} from '@shared/schemas'
import type { Book } from '@shared/types'
import type { Db } from '../db/client'
import { books } from '../db/schema'

type BookRow = typeof books.$inferSelect

const withFileStatus = (row: BookRow): Book => ({ ...row, fileExists: existsSync(row.filePath) })

/** Formato pela extensão, ou null se não for um livro suportado. */
export function bookFormat(path: string): BookFormat | null {
  return BOOK_EXTENSIONS[extname(path).slice(1).toLowerCase()] ?? null
}

/** Título provisório até a interface ler os metadados do arquivo. */
const titleFromPath = (path: string): string =>
  basename(path, extname(path)).replace(/[_]+/g, ' ').trim() || 'Sem título'

function checkedFile(path: string): { path: string; format: BookFormat; size: number } {
  const full = resolve(path)
  const format = bookFormat(full)
  if (!format) throw new Error('Formato não suportado')
  const stat = statSync(full, { throwIfNoEntry: false })
  if (!stat?.isFile()) throw new Error('Arquivo não encontrado')
  return { path: full, format, size: stat.size }
}

export type BooksService = Api['books'] & {
  /** Caminho do arquivo para o protocolo sentinela://books/<id>. */
  filePath(id: number): string | null
}

export function createBooksService(db: Db, coversDir: string): BooksService {
  mkdirSync(coversDir, { recursive: true })
  const coverFile = (id: number): string => join(coversDir, `${id}.jpg`)

  const getRow = (id: number): BookRow => {
    const row = db.select().from(books).where(eq(books.id, id)).get()
    if (!row) throw new Error('Livro não encontrado')
    return row
  }

  return {
    filePath(id) {
      return (
        db.select({ path: books.filePath }).from(books).where(eq(books.id, id)).get()?.path ?? null
      )
    },

    async list() {
      return db.select().from(books).all().map(withFileStatus)
    },

    async get(id) {
      return withFileStatus(getRow(id))
    },

    async add(paths, folderId = null) {
      const added: Book[] = []
      const skipped: string[] = []
      for (const path of bookPathsSchema.parse(paths)) {
        try {
          const file = checkedFile(path)
          const exists = db
            .select({ id: books.id })
            .from(books)
            .where(eq(books.filePath, file.path))
            .get()
          if (exists) throw new Error('já está na biblioteca')
          const row = db
            .insert(books)
            .values({
              title: titleFromPath(file.path),
              format: file.format,
              filePath: file.path,
              fileSize: file.size,
              folderId
            })
            .returning()
            .get()
          added.push(withFileStatus(row))
        } catch {
          skipped.push(path)
        }
      }
      return { added, skipped }
    },

    async update(id, input) {
      const data = bookUpdateSchema.parse(input)
      getRow(id)
      const row = db.update(books).set(data).where(eq(books.id, id)).returning().get()!
      return withFileStatus(row)
    },

    async relocate(id, path) {
      const current = getRow(id)
      const file = checkedFile(path)
      if (file.format !== current.format) {
        throw new Error(`O arquivo precisa ser ${current.format.toUpperCase()}`)
      }
      const row = db
        .update(books)
        .set({ filePath: file.path, fileSize: file.size })
        .where(eq(books.id, id))
        .returning()
        .get()!
      return withFileStatus(row)
    },

    async remove(id) {
      db.delete(books).where(eq(books.id, id)).run()
      rmSync(coverFile(id), { force: true })
    },

    async setCover(id, data) {
      getRow(id)
      writeFileSync(coverFile(id), coverSchema.parse(data))
      db.update(books)
        .set({ coverVersion: sql`${books.coverVersion} + 1` })
        .where(eq(books.id, id))
        .run()
    },

    async markOpened(id) {
      getRow(id)
      db.update(books).set({ lastOpenedAt: new Date() }).where(eq(books.id, id)).run()
    }
  }
}
