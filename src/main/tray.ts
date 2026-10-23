import { Menu, nativeImage, Tray } from 'electron'

export interface TrayOptions {
  icon: string
  open: () => void
  quit: () => void
  remindersEnabled: () => boolean
  setRemindersEnabled: (enabled: boolean) => void
}

/** Ícone na bandeja do sistema: clique abre o app; o menu liga/desliga os lembretes e sai. */
export function createTray(options: TrayOptions): Tray {
  const tray = new Tray(nativeImage.createFromPath(options.icon).resize({ width: 32, height: 32 }))
  tray.setToolTip('Sentinela')
  tray.on('click', options.open)
  tray.on('double-click', options.open)
  // O menu é montado na hora, para o "Lembretes ligados" refletir o que mudou em Configurações.
  tray.on('right-click', () =>
    tray.popUpContextMenu(
      Menu.buildFromTemplate([
        { label: 'Abrir o Sentinela', click: options.open },
        { type: 'separator' },
        {
          label: 'Lembretes ligados',
          type: 'checkbox',
          checked: options.remindersEnabled(),
          click: (item) => options.setRemindersEnabled(item.checked)
        },
        { type: 'separator' },
        { label: 'Sair', click: options.quit }
      ])
    )
  )
  return tray
}
