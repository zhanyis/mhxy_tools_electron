import { app, BrowserWindow, shell, ipcMain, protocol, Menu } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { promises as fs } from 'node:fs'
import { setupApi } from '../db/setupApi'

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

// 配置自动更新
function setupAutoUpdater() {
  // 配置更新服务器（GitHub Release）
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'your-username', // 替换为你的 GitHub 用户名
    repo: 'mhxy_tools_electron', // 替换为你的仓库名
    private: false // 如果是私有仓库设置为 true
  })

  // 检查更新
  autoUpdater.checkForUpdatesAndNotify()

  // 更新事件处理
  autoUpdater.on('checking-for-update', () => {
    console.log('正在检查更新...')
  })

  autoUpdater.on('update-available', (info) => {
    console.log('发现新版本:', info.version)
    // 通知渲染进程有新版本
    win?.webContents.send('update-available', info)
  })

  autoUpdater.on('update-not-available', (info) => {
    console.log('当前版本已是最新:', info.version)
  })

  autoUpdater.on('error', (err) => {
    console.error('更新检查失败:', err)
    // 通知渲染进程更新失败
    win?.webContents.send('update-error', err.message)
  })

  autoUpdater.on('download-progress', (progressObj) => {
    let log_message = "下载速度: " + progressObj.bytesPerSecond
    log_message = log_message + ' - 已下载 ' + progressObj.percent + '%'
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')'
    console.log(log_message)
    // 通知渲染进程下载进度
    win?.webContents.send('download-progress', progressObj)
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('更新下载完成:', info.version)
    // 通知渲染进程下载完成
    win?.webContents.send('update-downloaded', info)

    // 5秒后自动重启应用安装更新
    setTimeout(() => {
      autoUpdater.quitAndInstall()
    }, 5000)
  })
}

// 设置应用菜单（包含检查更新选项）
function createMenu() {
  const template: any[] = [
    {
      label: '应用',
      submenu: [
        {
          label: '检查更新',
          click: () => {
            autoUpdater.checkForUpdatesAndNotify()
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit()
          }
        }
      ]
    }
  ]

  if (process.platform === 'darwin') {
    template[0].label = app.getName()
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

async function createWindow() {
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

  if (VITE_DEV_SERVER_URL) { // #298
    win.loadURL(VITE_DEV_SERVER_URL)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())

    // 窗口加载完成后检查更新
    if (!VITE_DEV_SERVER_URL) { // 只在生产环境检查更新
      setTimeout(() => {
        autoUpdater.checkForUpdatesAndNotify()
      }, 3000) // 3秒后检查更新
    }
  })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  setupApi();
  setupAutoUpdater();
  createMenu();

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
ipcMain.handle('check-for-updates', () => {
  autoUpdater.checkForUpdatesAndNotify()
})

ipcMain.handle('quit-and-install', () => {
  autoUpdater.quitAndInstall()
})

// Add this IPC handler after other handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})
