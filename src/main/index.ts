import { app, shell, safeStorage, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { openDatabase } from './db/client'
import { registerApi } from './ipc'
import { createTopicsService } from './services/topics'
import { createTasksService } from './services/tasks'
import { createScheduleService } from './services/schedule'
import { createNotesService } from './services/notes'
import { createAttachmentsService } from './services/attachments'
import { createFoldersService } from './services/folders'
import { createBooksService } from './services/books'
import { createHighlightsService } from './services/highlights'
import { createOcrService } from './services/ocr'
import { createGithubService } from './services/github'
import { createDesktopService } from './desktop'
import { handleFileProtocol, registerFileScheme } from './protocol'

/** Abre uma janela do app. `route` é a rota da interface (ex.: "/leitor/3"); vazia = início. */
function createWindow(route = ''): BrowserWindow {
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

  window.on('ready-to-show', () => window.show())

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

// Datas e horários dos inputs no formato brasileiro (24h, dd/mm/aaaa).
app.commandLine.appendSwitch('lang', 'pt-BR')

// Permite rodar com outra pasta de dados (testes, perfis separados).
if (process.env['SENTINELA_DATA_DIR']) app.setPath('userData', process.env['SENTINELA_DATA_DIR'])

registerFileScheme()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null

  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

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

    registerApi({
      app: {
        info: async () => ({ version: app.getVersion(), dbPath })
      },
      topics: createTopicsService(db),
      tasks: createTasksService(db),
      schedule: createScheduleService(db),
      notes: createNotesService(db),
      attachments: createAttachmentsService(attachmentsDir),
      folders: createFoldersService(db),
      books,
      highlights: createHighlightsService(db),
      ocr,
      ...createGithubService(db, {
        available: () => safeStorage.isEncryptionAvailable(),
        encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
        decrypt: (encoded) => safeStorage.decryptString(Buffer.from(encoded, 'base64'))
      }),
      desktop: createDesktopService(createWindow)
    })

    mainWindow = createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
