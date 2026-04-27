<template>
  <div>
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
          <div v-html="updateInfo.releaseNotes"></div>
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
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'

// 声明 electronAPI 类型到 window
declare global {
  interface Window {
    electronAPI?: {
      onUpdateAvailable: (callback: (info: any) => void) => void
      onDownloadProgress: (callback: (progress: any) => void) => void
      onUpdateDownloaded: (callback: (info: any) => void) => void
      onUpdateError: (callback: (error: string) => void) => void
      removeAllUpdateListeners: () => void
      startDownload: () => Promise<void>
      quitAndInstall: () => void
      getAppVersion: () => Promise<string>
    }
  }
}

const updateAvailable = ref(false)
const downloading = ref(false)
const downloaded = ref(false)
const updateInfo = ref<any>(null)
const currentVersion = ref('1.0.0') // 默认版本，会从主进程获取真实版本

const downloadProgress = ref(0)
const downloadSpeed = ref('0 B/s')
const downloaded_bytes = ref(0)
const total = ref(0)
const countdown = ref(5)
const countdownTimer = ref<NodeJS.Timeout | null>(null)

const formatProgress = (percentage: number) => {
  return `${percentage}%`
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatSpeed = (bytesPerSecond: number) => {
  return formatBytes(bytesPerSecond) + '/s'
}

const skipUpdate = () => {
  updateAvailable.value = false
  ElMessage.info('已跳过此版本更新')
}

const downloadUpdate = () => {
  updateAvailable.value = false
  downloading.value = true
  window.electronAPI?.startDownload()
  ElMessage.success('开始下载更新...')
}

const installNow = () => {
  if (countdownTimer.value) {
    clearInterval(countdownTimer.value)
  }
  window.electronAPI?.quitAndInstall()
}

const installLater = () => {
  if (countdownTimer.value) {
    clearInterval(countdownTimer.value)
  }
  downloaded.value = false
  ElMessage.info('更新将在下次启动时安装')
}

const startCountdown = () => {
  countdown.value = 5
  countdownTimer.value = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(countdownTimer.value!)
      installNow()
    }
  }, 1000)
}

onMounted(async () => {
  // 获取应用版本
  if (window.electronAPI?.getAppVersion) {
    try {
      currentVersion.value = await window.electronAPI.getAppVersion()
    } catch (error) {
      console.error('Failed to get app version:', error)
    }
  }

  if (window.electronAPI) {
    // 监听更新事件
    window.electronAPI.onUpdateAvailable((info: any) => {
      updateInfo.value = info
      updateAvailable.value = true
      ElMessage.success(`发现新版本 ${info.version}`)
    })

    window.electronAPI.onDownloadProgress((progress: any) => {
      downloadProgress.value = Math.round(progress.percent)
      downloadSpeed.value = formatSpeed(progress.bytesPerSecond)
      downloaded_bytes.value = progress.transferred
      total.value = progress.total
    })

    window.electronAPI.onUpdateDownloaded((info: any) => {
      downloading.value = false
      downloaded.value = true
      ElMessage.success('更新下载完成，准备安装...')
    })

    window.electronAPI.onUpdateError((error: string) => {
      updateAvailable.value = false
      downloading.value = false
      downloaded.value = false
      ElMessage.error(`更新失败: ${error}`)
    })
  }
})

onUnmounted(() => {
  if (countdownTimer.value) {
    clearInterval(countdownTimer.value)
  }
  if (window.electronAPI) {
    window.electronAPI.removeAllUpdateListeners()
  }
})
</script>

<style scoped>
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
