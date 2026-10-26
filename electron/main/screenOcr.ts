import { app, BrowserWindow, desktopCapturer, ipcMain, systemPreferences } from 'electron'
import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

interface OcrResult { text: string; confidence: number }

function createSession(cachePath: string) {
  // Isolate OCR and its child worker so stopping also cancels model downloads.
  const workerPath = fileURLToPath(new URL(/* @vite-ignore */ './ocrWorker.mjs', import.meta.url))
    .replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`)
  const worker = new Worker(workerPath, { workerData: { cachePath } })
  worker.on('error', () => {}) // Forward errors through the active request below.
  function request<T>(type: string, image?: Uint8Array): Promise<T> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout)
        worker.off('message', onMessage)
        worker.off('error', onError)
        worker.off('exit', onExit)
      }
      const onError = (error: Error) => { cleanup(); reject(error) }
      const onExit = () => onError(new Error('识别线程已停止'))
      const onMessage = (message: { type: string; data: T; error?: string }) => {
        if (message.type === 'error') { onError(new Error(message.error)); return }
        if (message.type === type) { cleanup(); resolve(message.data) }
      }
      const timeout = setTimeout(() => onError(new Error('OCR 处理超时，请缩小区域或检查模型下载网络')), type === 'ready' ? 120_000 : 30_000)
      worker.on('message', onMessage)
      worker.once('error', onError)
      worker.once('exit', onExit)
      if (image) worker.postMessage(image)
    })
  }
  return { worker, busy: false, stopped: false, ready: request<void>('ready'), recognize: (image: Uint8Array) => request<OcrResult>('result', image) }
}

// OCR runs in a Node worker thread, never on the UI thread. Images stay local.
export function setupScreenOcr(window: BrowserWindow) {
  let selectedSource: string | undefined
  let session: ReturnType<typeof createSession> | undefined
  const stop = () => {
    selectedSource = undefined
    const previous = session
    session = undefined
    if (previous) {
      previous.stopped = true
      void previous.worker.terminate().catch(() => {})
    }
  }
  const assertSender = (event: Electron.IpcMainInvokeEvent) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('不允许的识屏请求')
    }
  }

  window.webContents.session.setDisplayMediaRequestHandler(async (request, callback) => {
    const sourceId = selectedSource
    selectedSource = undefined // Each explicit selection permits exactly one capture.
    if (!sourceId || request.frame !== window.webContents.mainFrame) {
      callback({})
      return
    }
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] })
      const source = sources.find(item => item.id === sourceId)
      callback(source ? { video: source } : {})
    } catch {
      callback({})
    }
  })

  const handlers: Record<string, (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any> = {
    'screen-ocr:sources': async event => {
      assertSender(event)
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'], thumbnailSize: { width: 240, height: 140 },
      })
      if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') === 'denied') {
        throw new Error('请在系统设置 → 隐私与安全性 → 屏幕录制中允许本应用，然后重启应用。')
      }
      return sources.map(source => ({ id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL() }))
    },
    'screen-ocr:select': (event, id: string) => {
      assertSender(event)
      if (typeof id !== 'string' || !/^(screen|window):/.test(id)) throw new Error('无效的屏幕来源')
      selectedSource = id
    },
    'screen-ocr:start': async event => {
      assertSender(event)
      stop()
      const current = createSession(path.join(app.getPath('userData'), 'ocr-models'))
      session = current
      try {
        await current.ready
        if (current.stopped) throw new Error('识别已停止')
      } catch (error) {
        if (session === current) stop()
        throw error
      }
    },
    'screen-ocr:recognize': async (event, image: Uint8Array) => {
      assertSender(event)
      const current = session
      if (!current || current.stopped || current.busy) throw new Error('识别未就绪或正在处理上一帧')
      if (!(image instanceof Uint8Array) || image.byteLength > 12 * 1024 * 1024) throw new Error('识别区域过大')
      current.busy = true
      try {
        await current.ready
        if (current.stopped) throw new Error('识别已停止')
        return await current.recognize(image)
      } finally {
        current.busy = false
      }
    },
    'screen-ocr:stop': event => {
      assertSender(event)
      stop()
    },
  }
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler)
  }
  window.webContents.on('did-start-navigation', (_event, _url, _inPlace, mainFrame) => {
    if (mainFrame) stop()
  })
  window.on('closed', () => {
    stop()
    for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel)
  })
}