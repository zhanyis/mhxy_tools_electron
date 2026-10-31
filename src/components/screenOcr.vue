<template>
  <el-dialog v-model="visible" title="在线识屏 · 滚动文字" width="92%" top="4vh" :close-on-click-modal="false" :destroy-on-close="false">
    <el-alert type="info" :closable="false" show-icon>
      优先选择游戏窗口，仅框选聊天或交易文字。选择整块屏幕时，启动识别会自动收起弹窗，请将本应用移出识别区域，避免画面递归。关闭弹窗不会停止识别。首次需联网下载中英文模型，之后本机识别，不上传画面，也不自动修改物价。
    </el-alert>
    <div class="toolbar">
      <el-button :loading="loadingSources" :disabled="sharing || starting || running" @click="loadSources">选择屏幕 / 窗口</el-button>
      <el-tooltip :disabled="streamReady || starting || running" content="请先选择屏幕或窗口并框选区域">
        <span class="switch-control">
          <span>在线识屏</span>
          <el-switch
            :model-value="starting || running"
            :disabled="(!streamReady && !starting && !running) || sharing"
            aria-label="在线识屏开关"
            @change="toggle"
          />
        </span>
      </el-tooltip>
      <span class="status" role="status">{{ status }}</span>
      <span class="quote-hint">精准录入：等待画面清晰稳定 → 识别一帧 → 提取高置信度报价 → 再采样</span>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" class="error" />
    <div v-if="sources.length && !streamReady" class="sources">
      <button v-for="source in sources" :key="source.id" class="source" :disabled="sharing" @click="share(source)">
        <img :src="source.thumbnail" alt="屏幕预览" />
        <span>{{ source.name }}</span>
      </button>
    </div>
    <div v-show="streamReady" class="preview-section">
      <div class="preview-hint">
        {{ sourceName }} · 拖动框选（建议只选聊天或交易文字，避免捕获本应用）
        <el-button link type="primary" :disabled="running || starting" @click="resetRegion">恢复全屏</el-button>
      </div>
      <div class="preview" :class="{ selectable: !running && !starting }" @pointerdown="beginSelection" @pointermove="moveSelection" @pointerup="endSelection" @pointercancel="endSelection">
        <video v-show="!running && !starting" ref="video" autoplay muted playsinline />
        <div v-if="!running && !starting" class="region" :style="regionStyle" />
        <div v-else class="preview-paused">识别中已隐藏实时预览，避免画面递归；停止后可重新框选。</div>
      </div>
    </div>
    <div class="settings">
      <span>最小采样间隔</span>
      <el-select v-model="interval" style="width: 120px" :disabled="running || starting">
        <el-option :value="500" label="0.5 秒" />
        <el-option :value="1000" label="1 秒" />
        <el-option :value="2000" label="2 秒" />
      </el-select>
      <el-checkbox v-model="enhance" :disabled="running || starting">灰度增强（适配深色背景）</el-checkbox>
      <span>累计最低置信度</span>
      <el-input-number v-model="minimumConfidence" :min="0" :max="100" :step="5" style="width: 120px" />
      <el-button :disabled="!lines.length" @click="copyText">复制文字</el-button>
      <el-button :disabled="!lines.length" @click="exportText">导出文本</el-button>
      <el-button @click="clear">清空</el-button>
    </div>
    <div class="results">
      <div>
        <h4>实时画面文字（原始结果） <small>{{ duration ? `${duration} ms / 帧` : '' }}</small></h4>
        <el-input :model-value="currentText" type="textarea" :rows="7" readonly placeholder="识别到的当前画面文字" />
      </div>
      <div>
        <h4>滚动累计 <small>最近 {{ lines.length }} 行</small></h4>
        <el-input :model-value="lines.join('\n')" type="textarea" :rows="7" readonly placeholder="去重后的文字将按识别顺序追加" />
      </div>
    </div>
    <p class="notice">同一行在最近 60 秒内连续出现会去重，保留最近 500 行；OCR 误字或半行文字仍可能重复。实际采样速度取决于识别耗时，滚动过快可能漏字，请缩小识别区域或减慢滚动。macOS 需允许屏幕录制；目标窗口请保持可见且不要最小化。</p>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ScrollingTextCollector } from '../utils/scrollingText'
import { ClearFrameGate, enhanceOcrPixels, selectOcrText, selectQuoteOcrText, type OcrResult, type QuoteOcrFrame } from '../utils/ocrQuality'

interface Source { id: string; name: string; thumbnail: string }
const visible = defineModel<boolean>({ default: false })
const emit = defineEmits<{
  'state-change': [state: { ready: boolean; active: boolean; busy: boolean; status: string; error: string }]
  'text-recognized': [frame: QuoteOcrFrame]
}>()
const video = ref<HTMLVideoElement>()
const sources = ref<Source[]>([])
const sourceName = ref('')
const sourceId = ref('')
const loadingSources = ref(false)
const sharing = ref(false)
const streamReady = ref(false)
const starting = ref(false)
const running = ref(false)
const error = ref('')
const status = ref('请选择要识别的屏幕或窗口')
const interval = ref(1000)
const enhance = ref(true)
const minimumConfidence = ref(55)
const lines = ref<string[]>([])
const currentText = ref('')
const duration = ref(0)
const region = ref({ x: 0, y: 0, width: 1, height: 1 })
const regionStyle = computed(() => ({
  left: `${region.value.x * 100}%`, top: `${region.value.y * 100}%`,
  width: `${region.value.width * 100}%`, height: `${region.value.height * 100}%`,
}))
const collector = new ScrollingTextCollector()
const canvas = document.createElement('canvas')
const clearFrameGate = new ClearFrameGate()
let frameSharpness = 0
// Sampling must not depend on the dialog's preview element being visible or mounted.
const captureVideo = document.createElement('video')
captureVideo.muted = true
captureVideo.playsInline = true
let previousFrame: Uint8Array | undefined
let stream: MediaStream | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let generation = 0
let anchor: { x: number; y: number } | undefined
const invoke = (channel: string, ...args: unknown[]) => window.ipcRenderer.invoke(`screen-ocr:${channel}`, ...args)
const message = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)

function resetRegion() {
  region.value = { x: 0, y: 0, width: 1, height: 1 }
  previousFrame = undefined
  clearFrameGate.reset()
}
function point(event: PointerEvent) {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
  }
}
function beginSelection(event: PointerEvent) {
  if (running.value || starting.value || event.button !== 0) return
  anchor = point(event)
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function moveSelection(event: PointerEvent) {
  if (!anchor) return
  const end = point(event)
  region.value = { x: Math.min(anchor.x, end.x), y: Math.min(anchor.y, end.y), width: Math.abs(end.x - anchor.x), height: Math.abs(end.y - anchor.y) }
}
function endSelection() {
  if (!anchor) return
  anchor = undefined
  if (region.value.width < 0.02 || region.value.height < 0.02) resetRegion()
  previousFrame = undefined
  clearFrameGate.reset()
}
async function loadSources() {
  loadingSources.value = true
  error.value = ''
  const id = generation
  try {
    const result = await invoke('sources')
    if (id !== generation) return
    sources.value = result
    if (!sources.value.length) error.value = '没有可捕获的屏幕或窗口，请检查系统屏幕录制权限。'
  } catch (cause) {
    if (id === generation) error.value = message(cause)
  } finally {
    loadingSources.value = false
  }
}
async function share(source: Source) {
  sharing.value = true
  error.value = ''
  const id = generation
  try {
    await invoke('select', source.id)
    if (id !== generation) return
    const captured = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 10 }, audio: false })
    if (id !== generation) {
      captured.getTracks().forEach(track => track.stop())
      return
    }
    stream = captured
    stream.getVideoTracks()[0].onended = () => stop()
    captureVideo.srcObject = stream
    await captureVideo.play()
    if (id !== generation) return
    await nextTick()
    if (video.value) {
      video.value.srcObject = stream
      await video.value.play()
    }
    if (id !== generation) return
    streamReady.value = true
    sourceName.value = source.name
    sourceId.value = source.id
    resetRegion()
    status.value = '请框选区域，再打开识屏开关开始识别'
  } catch (cause) {
    if (id === generation) {
      stop()
      error.value = `无法共享屏幕：${message(cause)}。请检查屏幕录制权限，授权后重启应用。`
    }
  } finally {
    if (id === generation) sharing.value = false
  }
}
function stop() {
  generation++
  clearTimeout(timer)
  running.value = false
  starting.value = false
  sharing.value = false
  streamReady.value = false
  anchor = undefined
  stream?.getTracks().forEach(track => { track.onended = null; track.stop() })
  stream = undefined
  captureVideo.pause()
  captureVideo.srcObject = null
  if (video.value) video.value.srcObject = null
  previousFrame = undefined
  clearFrameGate.reset()
  status.value = '已停止，识别结果保留'
  void invoke('stop').catch(() => {})
}
async function start() {
  if (!streamReady.value || starting.value || running.value) return
  const id = generation
  starting.value = true
  error.value = ''
  if (sourceId.value.startsWith('screen:')) visible.value = false
  status.value = '正在加载 OCR 模型（首次需联网下载，请稍候）…'
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      invoke('start'),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('模型加载超时，请检查网络后重试')), 120_000) }),
    ])
    if (id !== generation) return
    starting.value = false
    running.value = true
    previousFrame = undefined
    await tick(id)
  } catch (cause) {
    if (id === generation) {
      stop()
      error.value = `识别失败：${message(cause)}`
    }
  } finally {
    clearTimeout(timeout)
    if (id === generation) starting.value = false
  }
}
function toggle(enabled: boolean | string | number) {
  if (enabled) void start()
  else stop()
}

function capture(): Promise<Uint8Array | undefined> {
  const source = captureVideo
  if (!source?.videoWidth || source.readyState < 2) return Promise.resolve(undefined)
  const { x, y, width, height } = region.value
  const sw = Math.max(1, Math.round(source.videoWidth * width))
  const sh = Math.max(1, Math.round(source.videoHeight * height))
  canvas.width = sw
  canvas.height = sh
  const rawContext = canvas.getContext('2d')!
  rawContext.filter = 'none'
  rawContext.drawImage(source, source.videoWidth * x, source.videoHeight * y, sw, sh, 0, 0, sw, sh)
  const assessment = clearFrameGate.assess(rawContext.getImageData(0, 0, sw, sh).data, sw, sh)
  frameSharpness = assessment.sharpness
  if (!assessment.clear || !assessment.stable) {
    status.value = assessment.clear ? '等待文字画面稳定，跳过滚动中的帧…' : '画面文字不够清晰，跳过此帧；请缩小文字区域或放大游戏字体'
    return Promise.resolve(undefined)
  }
  // Upscale small text, but cap CPU and memory for large desktop captures.
  const scale = Math.min(3, 3200 / sw, 1800 / sh)
  canvas.width = Math.max(1, Math.round(sw * scale))
  canvas.height = Math.max(1, Math.round(sh * scale))
  const context = canvas.getContext('2d')!
  context.filter = 'none'
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, source.videoWidth * x, source.videoHeight * y, sw, sh, 0, 0, canvas.width, canvas.height)
  if (enhance.value) {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    enhanceOcrPixels(pixels.data)
    context.putImageData(pixels, 0, 0)
  }
  return new Promise((resolve, reject) => canvas.toBlob(async blob => {
    if (!blob) { reject(new Error('屏幕截图失败')); return }
    try {
      const frame = new Uint8Array(await blob.arrayBuffer())
      // Compare the complete image: a tiny changed price digit must not be skipped.
      const previous = previousFrame
      if (previous?.length === frame.length && frame.every((byte, index) => byte === previous[index])) {
        resolve(undefined)
        return
      }
      previousFrame = frame
      resolve(frame)
    } catch (cause) { reject(cause) }
  }, 'image/png'))
}
async function tick(id: number) {
  if (id !== generation || !running.value) return
  const began = performance.now()
  try {
    const image = await capture()
    if (id !== generation) return
    if (image) {
      status.value = '正在识别滚动文字…'
      const result: OcrResult = await invoke('recognize', image)
      if (id !== generation) return
      currentText.value = result.text.trim()
      const selected = selectOcrText(result, minimumConfidence.value)
      lines.value = [...lines.value, ...collector.append(selected.text)].slice(-500)
      const quoteText = selectQuoteOcrText(result)
      if (quoteText) emit('text-recognized', { text: quoteText, observedAt: new Date().toISOString(), confidence: result.confidence, sharpness: frameSharpness })
      // Flush the parent's synchronous quote extraction before scheduling another capture.
      await nextTick()
      if (id !== generation) return
      duration.value = Math.round(performance.now() - began)
      status.value = selected.selfCapture
        ? '检测到本应用画面，未累计；请选择游戏窗口，或将本应用移出识别区域'
        : `识别中 · 置信度 ${Math.round(result.confidence)}% · ${quoteText ? '清晰帧已送入报价提取' : '报价置信度不足，不送入录入'}${selected.rejected ? ` · 已过滤 ${selected.rejected} 行低置信度文字` : ''}`
    }
    // No frame queue: the next frame is captured only after this recognition finishes.
    timer = setTimeout(() => { void tick(id) }, Math.max(0, interval.value - (performance.now() - began)))
  } catch (cause) {
    if (id === generation) {
      stop()
      error.value = `识别中断：${message(cause)}`
    }
  }
}
function clear() {
  lines.value = []
  currentText.value = ''
  collector.clear()
  previousFrame = undefined
  clearFrameGate.reset()
}
async function copyText() {
  try { await navigator.clipboard.writeText(lines.value.join('\n')); ElMessage.success('已复制') }
  catch { ElMessage.error('复制失败，请导出文本') }
}
function exportText() {
  const url = URL.createObjectURL(new Blob(['\uFEFF', lines.value.join('\n')], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `识屏文字-${Date.now()}.txt`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
onBeforeUnmount(stop)
defineExpose({ start, stop })
watch(minimumConfidence, () => { previousFrame = undefined })
watch([streamReady, sharing, starting, running, status, error], () => {
  emit('state-change', {
    ready: streamReady.value,
    active: starting.value || running.value,
    busy: sharing.value,
    status: status.value,
    error: error.value,
  })
}, { immediate: true })
</script>

<style scoped>
.toolbar, .settings { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin: 16px 0; }
.toolbar .el-button + .el-button, .settings .el-button + .el-button { margin-left: 0; }
.switch-control { display: inline-flex; align-items: center; gap: 8px; }
.quote-hint { font-size: 12px; color: var(--el-color-primary); }
.status, .preview-hint, .notice { color: var(--el-text-color-secondary); font-size: 12px; }
.error { margin-bottom: 12px; }
.sources { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; max-height: 260px; overflow: auto; }
.source { border: 1px solid var(--el-border-color); border-radius: 8px; padding: 8px; cursor: pointer; background: var(--el-fill-color-light); color: var(--el-text-color-primary); }
.source:hover { border-color: var(--el-color-primary); }
.source img { width: 100%; height: 100px; object-fit: contain; }
.source span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.preview-section { max-width: 640px; margin: auto; }
.preview-hint { margin-bottom: 6px; }
.preview { position: relative; background: #111827; touch-action: none; user-select: none; overflow: hidden; border-radius: 6px; }
.preview-paused { padding: 24px; color: #d1d5db; text-align: center; font-size: 12px; }
.selectable { cursor: crosshair; }
video { display: block; width: 100%; pointer-events: none; }
.region { position: absolute; border: 2px solid var(--el-color-primary); background: rgb(64 158 255 / 8%); box-sizing: border-box; pointer-events: none; }
.results { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.results > div { min-width: 0; }
h4 { margin: 8px 0; }
small { font-weight: normal; color: var(--el-text-color-secondary); }
.notice { line-height: 1.7; margin-bottom: 0; }
@media (max-width: 650px) { .results { grid-template-columns: 1fr; } }
</style>