export interface UpdateState {
  revision: number
  status: 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'downloaded' | 'error'
  info?: { version: string; releaseNotes?: string | { version: string; note: string | null }[] | null }
  progress?: { percent: number; bytesPerSecond: number; transferred: number; total: number }
  error?: string
}

export interface UpdateAPI {
  checkForUpdates: () => Promise<UpdateState>
  getUpdateState: () => Promise<UpdateState>
  onUpdateState: (callback: (state: UpdateState) => void) => () => void
  startDownload: () => Promise<UpdateState>
  quitAndInstall: () => Promise<void>
  installLater: () => Promise<void>
  getAppVersion: () => Promise<string>
}