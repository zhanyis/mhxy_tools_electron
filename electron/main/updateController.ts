import type { UpdateState } from '../../src/utils/updateState'

interface Updater {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  allowDowngrade: boolean
  on(event: string, callback: (value: any) => void): unknown
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(): void
}

export function createUpdateController(updater: Updater, enabled: () => boolean, notify: (state: UpdateState) => void) {
  let state: UpdateState = { revision: 0, status: 'idle' }
  let checking: Promise<UpdateState> | null = null
  let downloading: Promise<UpdateState> | null = null
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  updater.allowPrerelease = false
  updater.allowDowngrade = false
  const setState = (next: Omit<UpdateState, 'revision'>) => {
    state = { ...next, revision: state.revision + 1 }
    notify(state)
  }
  const reportError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    if (state.status !== 'error' || state.error !== message) setState({ status: 'error', error: message })
  }
  // Install listeners once, before any checks. Snapshot replay handles renderer reloads.
  updater.on('checking-for-update', () => setState({ status: 'checking' }))
  updater.on('update-available', info => setState({ status: 'available', info }))
  updater.on('update-not-available', info => setState({ status: 'current', info }))
  updater.on('download-progress', progress => setState({ status: 'downloading', info: state.info, progress }))
  updater.on('update-downloaded', info => setState({ status: 'downloaded', info }))
  updater.on('error', reportError)

  return {
    getState: () => state,
    check: (): Promise<UpdateState> => {
      if (!enabled()) return Promise.reject(new Error('请在已安装的正式应用中检查更新'))
      if (checking) return checking
      if (downloading || state.status === 'downloaded') return Promise.resolve(state)
      checking = Promise.resolve().then(async () => {
        try {
          await updater.checkForUpdates()
          return state
        } catch (error) { reportError(error); throw error }
        finally { checking = null }
      })
      return checking
    },
    download: (): Promise<UpdateState> => {
      if (!enabled()) return Promise.reject(new Error('请在已安装的正式应用中下载更新'))
      if (downloading) return downloading
      if (state.status !== 'available') return Promise.reject(new Error('请先检查并确认可用更新'))
      setState({ status: 'downloading', info: state.info })
      downloading = Promise.resolve().then(async () => {
        try { await updater.downloadUpdate(); return state }
        catch (error) { reportError(error); throw error }
        finally { downloading = null }
      })
      return downloading
    },
    install: () => {
      if (!enabled() || state.status !== 'downloaded') throw new Error('更新尚未下载完成')
      updater.quitAndInstall()
    },
    installLater: () => {
      if (!enabled() || state.status !== 'downloaded') throw new Error('更新尚未下载完成')
      // Only install on quit after the user explicitly chooses to defer installation.
      updater.autoInstallOnAppQuit = true
    },
  }
}