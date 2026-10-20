// Gera os ícones do app a partir de build/icon.svg usando o Chromium do próprio Electron.
// Uso: npm run icons
//
// Saídas:
//   build/icon.ico      Windows (exe, instalador, barra de tarefas): 16 a 256 px
//   build/icon.icns     macOS
//   build/icon.png      Linux / electron-builder (1024 px)
//   resources/icon.png  ícone da janela em desenvolvimento (512 px)

import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'build', 'icon.svg'))

/** Renderiza o SVG num canvas do tamanho pedido (vetor → nítido em qualquer tamanho). */
async function renderPng(win, size) {
  const dataUrl = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image()
    img.src = 'data:image/svg+xml;base64,${svg.toString('base64')}'
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = ${size}
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, ${size}, ${size})
    return canvas.toDataURL('image/png')
  })()`)
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

/** ICO com PNGs embutidos (aceito pelo Windows Vista em diante). */
function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + images.length * 16
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)])
}

/** ICNS com PNGs embutidos. */
function buildIcns(bySize) {
  const types = [
    ['icp4', 16],
    ['icp5', 32],
    ['ic11', 32],
    ['ic12', 64],
    ['ic07', 128],
    ['ic13', 256],
    ['ic08', 256],
    ['ic14', 512],
    ['ic09', 512],
    ['ic10', 1024]
  ]
  const chunks = types.map(([type, size]) => {
    const png = bySize.get(size)
    const head = Buffer.alloc(8)
    head.write(type, 0, 'ascii')
    head.writeUInt32BE(png.length + 8, 4)
    return Buffer.concat([head, png])
  })
  const body = Buffer.concat(chunks)
  const head = Buffer.alloc(8)
  head.write('icns', 0, 'ascii')
  head.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([head, body])
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false })
  await win.loadURL('data:text/html,<meta charset="utf-8">')

  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
  const bySize = new Map()
  for (const size of sizes) bySize.set(size, await renderPng(win, size))

  writeFileSync(
    join(root, 'build', 'icon.ico'),
    buildIco([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, png: bySize.get(size) })))
  )
  writeFileSync(join(root, 'build', 'icon.icns'), buildIcns(bySize))
  writeFileSync(join(root, 'build', 'icon.png'), bySize.get(1024))
  writeFileSync(join(root, 'resources', 'icon.png'), bySize.get(512))
  console.log('Ícones gerados em build/ e resources/')
  app.quit()
})
