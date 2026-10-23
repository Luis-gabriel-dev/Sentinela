import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { nativeImage } from 'electron'
import { and, asc, eq } from 'drizzle-orm'
import { createWorker, OEM, PSM, type Line, type Worker } from 'tesseract.js'
import type { Api } from '@shared/api'
import { ocrPageInputSchema } from '@shared/schemas'
import type { OcrLine, OcrPage } from '@shared/types'
import { readAiConfig } from '../ai/config'
import { ollamaModels, ollamaVision } from '../ai/providers'
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

const toPage = (row: Pick<Row, 'page' | 'lines' | 'confidence' | 'refinedBy'>): OcrPage => ({
  page: row.page,
  lines: JSON.parse(row.lines) as OcrLine[],
  confidence: row.confidence,
  refinedBy: row.refinedBy
})

/** Preferência entre os modelos de visão instalados no Ollama. */
const VISION_MODELS = [/qwen2\.5vl:7b/, /qwen3-vl/, /qwen2\.5vl/, /minicpm-v/, /llava/, /./]
/** Lado maior da imagem enviada ao modelo de visão (mais que isso só gasta contexto e tempo). */
const VISION_MAX_SIDE = 1600

const VISION_PROMPT =
  'Transcreva todo o texto desta página escaneada, exatamente como está escrito, na ordem de ' +
  'leitura. Mantenha os parágrafos e as quebras de seção. Não traduza, não resuma, não corrija ' +
  'e não comente. Responda só com o texto da página.'

export type OcrService = Api['ocr'] & { dispose(): Promise<void> }

export function createOcrService(db: Db, languageDir: string): OcrService {
  let worker: Promise<Worker> | null = null

  /**
   * Modelo de visão instalado no Ollama, pela ordem de preferência (null = nenhum). Com o Ollama
   * fora do ar, lança o erro dele ("O Ollama não respondeu...").
   */
  const pickVisionModel = async (): Promise<string | null> => {
    const vision = (await ollamaModels(readAiConfig(db).ollamaUrl))
      .filter((m) => m.vision)
      .map((m) => m.name)
    for (const pattern of VISION_MODELS) {
      const found = vision.find((m) => pattern.test(m))
      if (found) return found
    }
    return null
  }

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
        confidence: lines.length ? Math.round(data.confidence) : 0,
        refinedBy: null
      }
      db.insert(bookOcrPages)
        .values(row)
        .onConflictDoUpdate({
          target: [bookOcrPages.bookId, bookOcrPages.page],
          set: {
            text: row.text,
            lines: row.lines,
            confidence: row.confidence,
            refinedBy: null,
            createdAt: new Date()
          }
        })
        .run()
      return toPage(row)
    },

    async clear(bookId) {
      db.delete(bookOcrPages).where(eq(bookOcrPages.bookId, bookId)).run()
    },

    async visionModel() {
      return pickVisionModel().catch(() => null)
    },

    async refinePage(input) {
      const { bookId, page, image } = ocrPageInputSchema.parse(input)
      const row = db
        .select()
        .from(bookOcrPages)
        .where(and(eq(bookOcrPages.bookId, bookId), eq(bookOcrPages.page, page)))
        .get()
      if (!row) throw new Error(`A página ${page} ainda não passou pelo OCR`)
      const model = await pickVisionModel()
      if (!model) {
        throw new Error(
          'Nenhum modelo de visão no Ollama (instale um, por exemplo: ollama pull qwen2.5vl:7b)'
        )
      }
      let picture = nativeImage.createFromBuffer(Buffer.from(image))
      const { width, height } = picture.getSize()
      if (Math.max(width, height) > VISION_MAX_SIDE) {
        picture = picture.resize(
          width >= height ? { width: VISION_MAX_SIDE } : { height: VISION_MAX_SIDE }
        )
      }
      const text = await ollamaVision(
        readAiConfig(db).ollamaUrl,
        model,
        picture.toPNG(),
        VISION_PROMPT
      )
      if (!text) throw new Error(`O modelo não devolveu texto para a página ${page}`)
      // createdAt novo: a busca inteligente vê a mudança e reindexa a página.
      const updated = db
        .update(bookOcrPages)
        .set({ text, refinedBy: model, createdAt: new Date() })
        .where(and(eq(bookOcrPages.bookId, bookId), eq(bookOcrPages.page, page)))
        .returning()
        .get()!
      return toPage(updated)
    },

    async dispose() {
      const current = worker
      worker = null
      await (await current?.catch(() => null))?.terminate()
    }
  }
}
