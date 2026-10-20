import { app, shell, BrowserWindow } from 'electron'
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
import { handleFileProtocol, registerFileScheme } from './protocol'

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#09090b',
    title: 'Sentinela',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // Links externos abrem no navegador padrão; o app nunca navega para fora.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return mainWindow
}

// Datas e horários dos inputs no formato brasileiro (24h, dd/mm/aaaa).
app.commandLine.appendSwitch('lang', 'pt-BR')

// Permite rodar com outra pasta de dados (testes, perfis separados).
if (process.env['SENTINELA_DATA_DIR']) app.setPath('userData', process.env['SENTINELA_DATA_DIR'])

registerFileScheme()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.sentinela.app')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    const dbPath = join(app.getPath('userData'), 'sentinela.db')
    const migrationsFolder = is.dev
      ? join(app.getAppPath(), 'drizzle')
      : join(process.resourcesPath, 'drizzle')
    const { db, close } = openDatabase(dbPath, migrationsFolder)
    app.on('will-quit', close)

    const attachmentsDir = join(app.getPath('userData'), 'attachments')
    handleFileProtocol(attachmentsDir)

    registerApi({
      app: {
        info: async () => ({ version: app.getVersion(), dbPath })
      },
      topics: createTopicsService(db),
      tasks: createTasksService(db),
      schedule: createScheduleService(db),
      notes: createNotesService(db),
      attachments: createAttachmentsService(attachmentsDir)
    })

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
