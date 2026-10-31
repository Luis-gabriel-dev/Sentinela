import { app, shell, safeStorage, BrowserWindow, type Tray } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { openDatabase } from './db/client'
import { registerApi } from './ipc'
import { createTopicsService } from './services/topics'
import { createTasksService } from './services/tasks'
import { createScheduleService } from './services/schedule'
import { createWeekService } from './services/week'
import { createNotesService } from './services/notes'
import { createAttachmentsService } from './services/attachments'
import { createFoldersService } from './services/folders'
import { createBooksService } from './services/books'
import { createHighlightsService } from './services/highlights'
import { createOcrService } from './services/ocr'
import { createGithubService } from './services/github'
import { createMentorService } from './services/mentor'
import { createRagService } from './ai/rag'
import type { Secrets } from './secrets'
import { createDesktopService } from './desktop'
import { handleFileProtocol, registerFileScheme } from './protocol'
import { createBackupService } from './backup'
import { createReminders } from './reminders'
import { createTray } from './tray'
import { NAVIGATE_CHANNEL } from '@shared/api'

/**
 * Abre uma janela do app. `route` é a rota da interface (ex.: "/leitor/3"); vazia = início.
 * `show` falso deixa a janela escondida (app aberto com o sistema, direto na bandeja).
 */
function createWindow(route = '', show = true): BrowserWindow {
  const isReader = route.startsWith('/leitor/')
  const window = new BrowserWindow({
    width: isReader ? 1000 : 1360,
    height: isReader ? 900 : 860,
    minWidth: isReader ? 560 : 960,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#09090b',
    title: 'Sentinela',
    // No Windows empacotado o ícone vem do .exe; aqui ele vale para o modo dev e o Linux.
    ...(process.platform !== 'darwin' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  if (show) window.on('ready-to-show', () => window.show())

  // Links externos abrem no navegador padrão; o app nunca navega para fora.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${route || '/'}`)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'), { hash: route || '/' })
  }
  return window
}

// Aberto sem console (atalho, com o Windows, por outro programa que já fechou), a saída padrão
// pode estar fechada: escrever nela (o Electron registra ali os erros do IPC) não pode virar uma
// exceção que trava o app com uma caixa de erro.
for (const stream of [process.stdout, process.stderr]) stream.on('error', () => {})

// Datas e horários dos inputs no formato brasileiro (24h, dd/mm/aaaa).
app.commandLine.appendSwitch('lang', 'pt-BR')

// Permite rodar com outra pasta de dados (testes, perfis separados).
if (process.env['SENTINELA_DATA_DIR']) app.setPath('userData', process.env['SENTINELA_DATA_DIR'])

registerFileScheme()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null
  let tray: Tray | null = null
  // Definidos quando os lembretes são criados (precisam do banco).
  let closeToTray = (): boolean => false
  let onHiddenToTray = (): void => {}
  let quitting = false
  app.on('before-quit', () => {
    quitting = true
  })

  /** Janela principal. Com a bandeja ligada, fechar só esconde (os lembretes continuam). */
  const createMainWindow = (show: boolean, route = ''): BrowserWindow => {
    const window = createWindow(route, show)
    window.on('close', (event) => {
      if (quitting || !closeToTray()) return
      event.preventDefault()
      window.hide()
      onHiddenToTray()
    })
    return window
  }

  /** Mostra a janela principal (criando se preciso) e, se pedido, vai para uma rota. */
  const openMain = (route?: string): void => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createMainWindow(true, route)
      return
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    if (route) mainWindow.webContents.send(NAVIGATE_CHANNEL, route)
  }

  app.on('second-instance', () => openMain())

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.sentinela.app')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    const dataDir = app.getPath('userData')
    const dbPath = join(dataDir, 'sentinela.db')
    const migrationsFolder = is.dev
      ? join(app.getAppPath(), 'drizzle')
      : join(process.resourcesPath, 'drizzle')
    const { db, close } = openDatabase(dbPath, migrationsFolder)
    app.on('will-quit', close)

    const attachmentsDir = join(dataDir, 'attachments')
    const coversDir = join(dataDir, 'covers')
    // filePath é só do protocolo; não vai para a API exposta à interface.
    const { filePath, ...books } = createBooksService(db, coversDir)
    const pdfjsAssetsDir = is.dev
      ? join(app.getAppPath(), 'node_modules', 'pdfjs-dist')
      : join(process.resourcesPath, 'pdfjs')
    handleFileProtocol({ attachmentsDir, coversDir, pdfjsAssetsDir, bookPath: filePath })

    // dispose encerra o worker do Tesseract; não vai para a API exposta à interface.
    const { dispose: disposeOcr, ...ocr } = createOcrService(db, join(dataDir, 'tessdata'))
    app.on('will-quit', () => void disposeOcr())

    const secrets: Secrets = {
      available: () => safeStorage.isEncryptionAvailable(),
      encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
      decrypt: (encoded) => safeStorage.decryptString(Buffer.from(encoded, 'base64'))
    }
    // Eventos main → interface (ex.: resposta da mentora chegando aos pedaços), para todas as janelas.
    const broadcast = (channel: string, payload: unknown): void => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload)
    }

    const rag = createRagService(db)
    const github = createGithubService(db, secrets)
    const reminders = createReminders(db, {
      icon,
      open: openMain,
      syncProjects: () => github.projects.sync()
    })
    closeToTray = () => reminders.settings().closeToTray
    onHiddenToTray = () => reminders.notifyTrayOnce()
    app.on('will-quit', () => reminders.stop())

    registerApi(
      {
        app: {
          info: async () => ({ version: app.getVersion(), dbPath })
        },
        topics: createTopicsService(db),
        tasks: createTasksService(db),
        schedule: createScheduleService(db),
        week: createWeekService(db),
        notes: createNotesService(db),
        attachments: createAttachmentsService(attachmentsDir),
        folders: createFoldersService(db),
        books,
        highlights: createHighlightsService(db),
        ocr,
        ...github,
        ...createMentorService(db, secrets, broadcast, rag.index),
        rag: rag.api,
        reminders: reminders.api,
        backup: createBackupService({
          db,
          dbPath,
          dataDir,
          folders: [attachmentsDir, coversDir],
          closeDb: close
        }),
        desktop: createDesktopService(createWindow)
      },
      (path) => {
        // O que muda anotações, destaques, OCR ou livros/temas (títulos, tema do livro) entra na
        // busca inteligente alguns segundos depois.
        if (
          /^(notes|highlights|ocr|books|topics)\.(create|update|remove|recognizePage|refinePage|clear|saveText)$/.test(
            path
          ) ||
          path === 'mentor.applyProposal' ||
          path === 'week.applyPlan'
        ) {
          rag.index.scheduleSync()
        }
      }
    )

    // Aberto com o sistema (--hidden): começa só na bandeja.
    mainWindow = createMainWindow(!process.argv.includes('--hidden'))

    if (process.platform !== 'darwin') {
      tray = createTray({
        icon,
        open: () => openMain(),
        quit: () => app.quit(),
        remindersEnabled: () => reminders.settings().enabled,
        setRemindersEnabled: (enabled) => reminders.setEnabled(enabled)
      })
      app.on('will-quit', () => tray?.destroy())
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow(true)
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
