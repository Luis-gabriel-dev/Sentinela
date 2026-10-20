import { BrowserWindow, dialog, shell } from 'electron'
import { z } from 'zod'
import type { Api } from '@shared/api'
import { BOOK_EXTENSIONS } from '@shared/schemas'

/** Recursos do sistema operacional (diálogos, Explorer, janelas). */
export function createDesktopService(openWindow: (route: string) => BrowserWindow): Api['desktop'] {
  return {
    async pickBookFiles(multiple) {
      const parent = BrowserWindow.getFocusedWindow()
      const options: Electron.OpenDialogOptions = {
        title: multiple ? 'Adicionar livros' : 'Escolher arquivo',
        properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
        filters: [
          { name: 'Livros', extensions: Object.keys(BOOK_EXTENSIONS) },
          { name: 'Todos os arquivos', extensions: ['*'] }
        ]
      }
      const result = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options)
      return result.canceled ? [] : result.filePaths
    },

    async showInFolder(path) {
      shell.showItemInFolder(z.string().min(1).parse(path))
    },

    async openReaderWindow(bookId) {
      openWindow(`/leitor/${z.number().int().positive().parse(bookId)}`)
    }
  }
}
