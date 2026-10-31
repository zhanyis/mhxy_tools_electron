import { app, BrowserWindow, shell, ipcMain, protocol, Menu } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { promises as fs } from 'node:fs'
import { setupApi } from '../db/setupApi'
import { setupScreenOcr } from './screenOcr'
import { createUpdateController } from './updateController'

import pkg from 'electron-updater'
const { autoUpdater } = pkg

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

const updates = createUpdateController(autoUpdater, () => app.isPackaged, state => {
  if (win && !win.isDestroyed()) win.webContents.send('update-state', state)
})
let startupUpdateScheduled = false

async function createWindow() {
  // Remove the native application menu without changing the window title bar.
  Menu.setApplicationMenu(null)
  win = new BrowserWindow({
    title: 'Main window',
    icon: path.join(process.env.VITE_PUBLIC, 'icon.ico'),
    width: 790,
    height: 660,
    webPreferences: {
      preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // nodeIntegration: true,

      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      // contextIsolation: false,
    },
  })

  await setupApi()
  setupScreenOcr(win)

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())

    // 窗口加载完成后检查更新（只在生产环境，且只检查不自动下载）
    if (app.isPackaged && !startupUpdateScheduled) {
      startupUpdateScheduled = true
      setTimeout(() => {
        void updates.check().catch(error => console.error('更新检查失败:', error))
      }, 3000)
    }
  })

  if (VITE_DEV_SERVER_URL) {
    void win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    void win.loadFile(indexHtml)
  }

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // 注册用户图片协议处理器
  protocol.handle('user-image', async (req) => {
    try {
      const url = new URL(req.url)
      const imagePath = decodeURIComponent(url.pathname)
      const userDataPath = app.getPath('userData')
      const fullPath = path.join(userDataPath, 'images', imagePath)

      // 检查文件是否存在
      await fs.access(fullPath)

      // 读取文件并返回
      const data = await fs.readFile(fullPath)
      return new Response(data, {
        headers: {
          'Content-Type': getContentType(fullPath)
        }
      })
    } catch (error) {
      console.error('加载用户图片失败:', error)
      return new Response('Image not found', { status: 404 })
    }
  })
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.png': return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.gif': return 'image/gif'
    case '.webp': return 'image/webp'
    default: return 'application/octet-stream'
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})

// 添加 IPC 处理程序用于手动检查更新
ipcMain.handle('check-for-updates', () => updates.check())
ipcMain.handle('get-update-state', () => updates.getState())

// 用户确认后开始下载
ipcMain.handle('start-download', () => updates.download())

ipcMain.handle('quit-and-install', () => updates.install())
ipcMain.handle('install-update-later', () => updates.installLater())

// Add this IPC handler after other handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})
