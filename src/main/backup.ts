import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import Database from 'better-sqlite3'
import { app, BrowserWindow, dialog, shell } from 'electron'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Api } from '@shared/api'
import type { BackupInfo } from '@shared/types'
import type { Db } from './db/client'

const DB_FILE = 'sentinela.db'
const AUTO_PREFIX = 'auto '
const AUTO_EVERY_MS = 7 * 86_400_000
const AUTO_KEEP = 4

const pad = (n: number): string => String(n).padStart(2, '0')
/** "2026-10-22 2115" */
const stamp = (d = new Date()): string =>
  `${d.toLocaleDateString('sv-SE')} ${pad(d.getHours())}${pad(d.getMinutes())}`

export interface BackupOptions {
  db: Db
  dbPath: string
  dataDir: string
  /** Pastas de arquivos do app que vão junto (imagens das anotações, capas). */
  folders: string[]
  closeDb: () => void
}

/**
 * Backup = uma pasta com o banco e as pastas de arquivos do app. O banco é copiado com
 * `VACUUM INTO`, que gera uma cópia consistente mesmo com o app aberto (copiar o .db direto
 * pode pegar uma escrita pela metade). Os livros não entram: ficam onde o estudante guardou.
 */
export function createBackupService(options: BackupOptions): Api['backup'] {
  const { db, dbPath, dataDir, folders, closeDb } = options
  const autoDir = join(dataDir, 'backups')

  const write = (target: string, withFiles: boolean): void => {
    mkdirSync(target, { recursive: true })
    db.run(sql`VACUUM INTO ${join(target, DB_FILE)}`)
    if (!withFiles) return
    for (const folder of folders) {
      if (existsSync(folder)) cpSync(folder, join(target, basename(folder)), { recursive: true })
    }
  }

  /** Pasta nova (com " (2)", " (3)"... se já houver uma com o mesmo nome). */
  const freshFolder = (parent: string, name: string): string => {
    let target = join(parent, name)
    for (let i = 2; existsSync(target); i++) target = join(parent, `${name} (${i})`)
    return target
  }

  /** Confere que a pasta tem um banco do Sentinela e conta o que há nele. */
  const inspect = (folder: string): BackupInfo => {
    const file = join(folder, DB_FILE)
    if (!existsSync(file)) {
      throw new Error(`Esta pasta não tem um backup do Sentinela (falta o ${DB_FILE})`)
    }
    let backup: Database.Database
    try {
      backup = new Database(file, { readonly: true, fileMustExist: true })
    } catch {
      throw new Error('O arquivo do backup não pôde ser aberto')
    }
    try {
      const tables = new Set(
        backup
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all()
          .map((r) => (r as { name: string }).name)
      )
      if (!tables.has('topics') || !tables.has('__drizzle_migrations')) {
        throw new Error('Este arquivo não é um banco do Sentinela')
      }
      const count = (table: string): number =>
        tables.has(table)
          ? (backup.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
          : 0
      return {
        path: folder,
        createdAt: statSync(file).mtime,
        counts: {
          topics: count('topics'),
          notes: count('notes'),
          tasks: count('tasks'),
          books: count('books'),
          conversations: count('ai_conversations')
        }
      }
    } finally {
      backup.close()
    }
  }

  const autoBackups = (): string[] =>
    existsSync(autoDir)
      ? readdirSync(autoDir)
          .filter((name) => name.startsWith(AUTO_PREFIX))
          .toSorted()
      : []

  // Cópia automática semanal (só o banco: as imagens já ficam nesta mesma pasta de dados).
  const auto = setTimeout(() => {
    try {
      const last = autoBackups().at(-1)
      if (last && Date.now() - statSync(join(autoDir, last)).mtimeMs < AUTO_EVERY_MS) return
      write(freshFolder(autoDir, `${AUTO_PREFIX}${stamp()}`), false)
      for (const old of autoBackups().slice(0, -AUTO_KEEP)) {
        rmSync(join(autoDir, old), { recursive: true, force: true })
      }
    } catch (error) {
      console.error('Backup automático:', error)
    }
  }, 60_000)
  app.on('will-quit', () => clearTimeout(auto))

  const pickFolder = async (title: string, create: boolean): Promise<string | null> => {
    const parent = BrowserWindow.getFocusedWindow()
    const dialogOptions: Electron.OpenDialogOptions = {
      title,
      properties: create ? ['openDirectory', 'createDirectory'] : ['openDirectory']
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)
    return result.canceled ? null : result.filePaths[0]
  }

  return {
    async status() {
      const last = autoBackups().at(-1)
      return { autoDir, lastAuto: last ? statSync(join(autoDir, last)).mtime : null }
    },

    async create() {
      const parent = await pickFolder('Onde salvar o backup', true)
      if (!parent) return null
      const target = freshFolder(parent, `Sentinela backup ${stamp()}`)
      write(target, true)
      return target
    },

    async pick() {
      const folder = await pickFolder('Escolher a pasta do backup', false)
      return folder ? inspect(folder) : null
    },

    async restore(path) {
      const folder = z.string().min(1).parse(path)
      inspect(folder)
      // Antes de trocar, guarda os dados atuais (dá para voltar atrás).
      write(freshFolder(autoDir, `antes de restaurar ${stamp()}`), true)
      closeDb()
      for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) rmSync(file, { force: true })
      copyFileSync(join(folder, DB_FILE), dbPath)
      for (const current of folders) {
        const saved = join(folder, basename(current))
        if (!existsSync(saved)) continue
        rmSync(current, { recursive: true, force: true })
        cpSync(saved, current, { recursive: true })
      }
      // Reinicia depois de responder à interface; as migrations rodam ao abrir.
      // Sem --hidden: mesmo que o app tenha aberto com o sistema, volta com a janela à vista.
      setTimeout(() => {
        app.relaunch({ args: process.argv.slice(1).filter((arg) => arg !== '--hidden') })
        app.exit(0)
      }, 300)
    },

    async openAutoFolder() {
      mkdirSync(autoDir, { recursive: true })
      await shell.openPath(autoDir)
    }
  }
}
