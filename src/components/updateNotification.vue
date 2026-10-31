<template>
  <div>
    <el-button v-if="api" class="check-update-button" size="small" :loading="checking" :disabled="downloading" @click="checkForUpdates">检查更新</el-button>
    <!-- 更新可用通知 -->
    <el-dialog
      v-model="updateAvailable"
      title="发现新版本"
      width="400px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
    >
      <div>
        <p>发现新版本 <strong>{{ updateInfo?.version }}</strong></p>
        <p>当前版本: <strong>{{ currentVersion }}</strong></p>
        <div v-if="updateInfo?.releaseNotes" class="release-notes">
          <p><strong>更新内容:</strong></p>
          <div class="release-notes-text">{{ releaseNotes }}</div>
        </div>
      </div>
      <template #footer>
        <el-button @click="skipUpdate">跳过此版本</el-button>
        <el-button type="primary" @click="downloadUpdate">立即更新</el-button>
      </template>
    </el-dialog>

    <!-- 下载进度对话框 -->
    <el-dialog
      v-model="downloading"
      title="正在下载更新"
      width="400px"
      :show-close="false"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
    >
      <div>
        <el-progress
          :percentage="downloadProgress"
          :format="formatProgress"
          status="success"
        />
        <p class="download-info">
          下载速度: {{ downloadSpeed }} |
          已下载: {{ formatBytes(downloaded_bytes) }} / {{ formatBytes(total) }}
        </p>
      </div>
    </el-dialog>

    <!-- 下载完成对话框 -->
    <el-dialog
      v-model="downloaded"
      title="更新下载完成"
      width="350px"
      :show-close="false"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
    >
      <div>
        <p>更新已下载完成，是否立即重启安装？</p>
      </div>
      <template #footer>
        <el-button @click="installLater">稍后安装</el-button>
        <el-button type="primary" @click="installNow">立即重启安装</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import type { UpdateAPI, UpdateState } from '../utils/updateState'

// 声明 electronAPI 类型到 window
declare global {
  interface Window {
    electronAPI?: UpdateAPI
  }
}

const updateAvailable = ref(false)
const api = window.electronAPI
const checking = ref(false)
const downloading = ref(false)
const downloaded = ref(false)
const updateInfo = ref<UpdateState['info']>(undefined)
const currentVersion = ref('')

const downloadProgress = ref(0)
const downloadSpeed = ref('0 B/s')
const downloaded_bytes = ref(0)
const total = ref(0)
let unsubscribe: (() => void) | undefined
let lastRevision = -1
const releaseNotes = computed(() => {
  const notes = updateInfo.value?.releaseNotes
  return (typeof notes === 'string' ? notes : notes?.map(note => `${note.version}\n${note.note ?? ''}`).join('\n') ?? '').replace(/<[^>]*>/g, '')
})

const formatProgress = (percentage: number) => {
  return `${percentage}%`
}

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const skipUpdate = () => {
  if (updateInfo.value) localStorage.setItem('skipped-update-version', updateInfo.value.version)
  updateAvailable.value = false
  ElMessage.info('已跳过此版本更新')
}

const downloadUpdate = async () => {
  try {
    if (!api) return
    applyState(await api.startDownload())
  } catch (error) { await handleFailure(error) }
}

const installNow = async () => {
  try { await api?.quitAndInstall() } catch (error) { showFailure(error) }
}

const installLater = async () => {
  try {
    await api?.installLater()
    downloaded.value = false
    ElMessage.info('更新将在退出应用时安装，请先保存当前记录')
  } catch (error) { showFailure(error) }
}

const showFailure = (error: unknown) => {
  ElMessage.error(`更新失败: ${error instanceof Error ? error.message : String(error)}`)
}

const handleFailure = async (error: unknown) => {
  // The event and rejected IPC describe the same failure; show it only once.
  try {
    const state = await api?.getUpdateState()
    if (state?.status === 'error') { applyState(state); return }
  } catch { /* Snapshot unavailable: report the original IPC failure. */ }
  showFailure(error)
}

const applyState = (state: UpdateState, manual = false) => {
  if (state.revision < lastRevision) return
  const changed = state.revision > lastRevision
  lastRevision = state.revision
  checking.value = state.status === 'checking'
  downloading.value = state.status === 'downloading'
  downloaded.value = state.status === 'downloaded'
  if (state.info) updateInfo.value = state.info
  updateAvailable.value = state.status === 'available' && (manual || localStorage.getItem('skipped-update-version') !== state.info?.version)
  if (state.progress) {
    downloadProgress.value = Math.max(0, Math.min(100, Math.round(state.progress.percent)))
    downloadSpeed.value = `${formatBytes(state.progress.bytesPerSecond)}/s`
    downloaded_bytes.value = state.progress.transferred
    total.value = state.progress.total
  }
  if (changed && state.status === 'error') showFailure(state.error)
}

const checkForUpdates = async () => {
  if (!api || checking.value || downloading.value) return
  checking.value = true
  try {
    const state = await api.checkForUpdates()
    applyState(state, true)
    if (state.status === 'current') ElMessage.success('当前已是最新版本')
  } catch (error) { await handleFailure(error) }
  finally { checking.value = false }
}

onMounted(async () => {
  if (!api) return
  // Subscribe before awaiting anything, then replay the main process snapshot.
  unsubscribe = api.onUpdateState(state => applyState(state))
  try {
    const [version, state] = await Promise.all([api.getAppVersion(), api.getUpdateState()])
    currentVersion.value = version
    applyState(state)
  } catch (error) { showFailure(error) }
})

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe()
  }
})
</script>

<style scoped>
.check-update-button { vertical-align: middle; }
.release-notes-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.release-notes {
  margin-top: 16px;
  padding: 12px;
  background-color: #f5f5f5;
  border-radius: 4px;
  max-height: 200px;
  overflow-y: auto;
}

.download-info {
  margin-top: 16px;
  font-size: 14px;
  color: #666;
}
</style>
