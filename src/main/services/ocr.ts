import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { asc, eq } from 'drizzle-orm'
import { createWorker, OEM, PSM, type Line, type Worker } from 'tesseract.js'
import type { Api } from '@shared/api'
import { ocrPageInputSchema } from '@shared/schemas'
import type { OcrLine, OcrPage } from '@shared/types'
import type { Db } from '../db/client'
import { bookOcrPages } from '../db/schema'

const LANGUAGES = ['por', 'eng'] as const

/**
 * Copia os dados de idioma "best_int" (os mais precisos) dos pacotes @tesseract.js-data para
 * uma pasta só, de onde o Tesseract lê por `langPath`. (Passar os dados em memória, como
 * `{ code, data }`, não funciona no tesseract.js 7: ele usa `data` como nome do idioma.)
 */
function prepareLanguageDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
  for (const code of LANGUAGES) {
    const pkg = dirname(require.resolve(`@tesseract.js-data/${code}/package.json`))
    const source = join(pkg, '4.0.0_best_int', `${code}.traineddata.gz`)
    const target = join(dir, `${code}.traineddata.gz`)
    if (statSync(target, { throwIfNoEntry: false })?.size !== statSync(source).size) {
      writeFileSync(target, readFileSync(source))
    }
  }
}

/** Falhas internas do Tesseract às vezes não rejeitam a promessa; o limite evita esperar para sempre. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms)
    })
  ]).finally(() => clearTimeout(timer))
}

type Row = typeof bookOcrPages.$inferSelect

const toPage = (row: Pick<Row, 'page' | 'lines' | 'confidence'>): OcrPage => ({
  page: row.page,
  lines: JSON.parse(row.lines) as OcrLine[],
  confidence: row.confidence
})

export type OcrService = Api['ocr'] & { dispose(): Promise<void> }

export function createOcrService(db: Db, languageDir: string): OcrService {
  let worker: Promise<Worker> | null = null

  // Um worker só, criado na primeira página e reaproveitado (carregar os idiomas leva segundos).
  const getWorker = (): Promise<Worker> =>
    (worker ??= (async () => {
      prepareLanguageDir(languageDir)
      const w = await withTimeout(
        createWorker([...LANGUAGES], OEM.LSTM_ONLY, {
          langPath: languageDir,
          gzip: true,
          cacheMethod: 'none'
        }),
        60_000,
        'O mecanismo de OCR não iniciou'
      )
      await w.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: '1'
      })
      return w
    })().catch((error) => {
      worker = null
      throw error
    }))

  return {
    async pages(bookId) {
      return db
        .select()
        .from(bookOcrPages)
        .where(eq(bookOcrPages.bookId, bookId))
        .orderBy(asc(bookOcrPages.page))
        .all()
        .map(toPage)
    },

    async recognizePage(input) {
      const { bookId, page, width, height, image } = ocrPageInputSchema.parse(input)
      const w = await getWorker()
      const { data } = await withTimeout(
        w.recognize(Buffer.from(image), {}, { text: true, blocks: true }),
        180_000,
        `A página ${page} demorou demais para ser reconhecida`
      )

      const lines: OcrLine[] = (data.blocks ?? [])
        .flatMap((block) => block.paragraphs.flatMap((p) => p.lines))
        .filter((line: Line) => line.text.trim())
        .map((line: Line) => ({
          text: line.text.trim(),
          box: [
            line.bbox.x0 / width,
            line.bbox.y0 / height,
            (line.bbox.x1 - line.bbox.x0) / width,
            (line.bbox.y1 - line.bbox.y0) / height
          ],
          confidence: Math.round(line.confidence)
        }))

      const row = {
        bookId,
        page,
        text: data.text ?? '',
        lines: JSON.stringify(lines),
        confidence: lines.length ? Math.round(data.confidence) : 0
      }
      db.insert(bookOcrPages)
        .values(row)
        .onConflictDoUpdate({
          target: [bookOcrPages.bookId, bookOcrPages.page],
          set: {
            text: row.text,
            lines: row.lines,
            confidence: row.confidence,
            createdAt: new Date()
          }
        })
        .run()
      return toPage(row)
    },

    async clear(bookId) {
      db.delete(bookOcrPages).where(eq(bookOcrPages.bookId, bookId)).run()
    },

    async dispose() {
      const current = worker
      worker = null
      await (await current?.catch(() => null))?.terminate()
    }
  }
}
