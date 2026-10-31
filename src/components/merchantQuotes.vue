<template>
  <el-dialog v-model="visible" title="喊话报价 · 确认与解析配置" width="94%" top="4vh" :close-on-click-modal="false">
    <el-alert type="info" :closable="false" show-icon>
      只提取当前物价表内的收购物品；OCR 候选与规则匹配都必须人工确认。价格统一为 MHB 单价，不修改你的基础物价。
      不采集商人名称和 ID。同一服务器、同一天、相同喊话正文只录一次；点击确认会一起保存该喊话的全部待确认物品，可先忽略不需要的行。
    </el-alert>
    <div class="quote-toolbar">
      <span>服务器 / 分区</span>
      <el-input :model-value="scope" maxlength="80" style="width: 220px" :disabled="saving" @change="changeScope" />
      <el-tag type="warning">待确认 {{ pending.length }} 条</el-tag>
      <el-button :loading="loading" @click="reload">刷新统计 / 规则</el-button>
      <span class="muted">{{ frameStatus }}</span>
    </div>
    <el-tabs v-model="tab">
      <el-tab-pane label="喊话确认" name="quotes">
        <div class="frame-text">
          <span class="muted">最近送入报价提取的清晰帧（直接来自识屏，无需复制或手动录入）</span>
          <el-input :model-value="props.frame?.text ?? ''" type="textarea" :rows="2" readonly placeholder="打开识屏，框选游戏喊话区域；清晰稳定帧识别完成后会自动生成下方候选" />
        </div>
        <div class="quote-toolbar">
          <el-button :disabled="!pending.length || saving" @click="pending = []">清空待确认</el-button>
          <el-button link @click="showImport = !showImport">{{ showImport ? '收起' : '展开' }}旧文本测试 / 导入</el-button>
        </div>
        <div v-if="showImport" class="import-tools">
          <el-input v-model="inputText" type="textarea" :rows="2" maxlength="50000" placeholder="仅用于旧识屏文本测试；仍只提取完整、明确的收购报价" />
          <div class="quote-toolbar">
            <el-button :disabled="!inputText.trim() || loading" @click="parseInput">测试文本提取</el-button>
            <el-upload action="#" accept=".txt" :show-file-list="false" :before-upload="importText"><el-button>导入旧识屏文本</el-button></el-upload>
          </div>
        </div>
        <el-table :data="pagedPending" row-key="uid" border stripe size="small" max-height="440" empty-text="暂无精准报价；等待清晰帧，模糊、无单价或系统公告不会进入清单">
          <el-table-column label="识别时间" width="90"><template #default="{ row }">{{ new Date(row.observedAt).toLocaleTimeString() }}</template></el-table-column>
          <el-table-column label="物品（原图）" width="190"><template #default="{ row }">
            <div class="item-cell">
              <el-image :src="itemImage(row.itemKey)" :alt="row.itemName" fit="contain" class="item-icon" />
              <el-select v-model="row.itemKey" size="small" filterable :disabled="saving" aria-label="物品" @change="selectItem(row)">
                <el-option v-for="item in items" :key="quoteItemKey(item)" :value="quoteItemKey(item)" :label="`${item.type} / ${item.name}`">
                  <div class="item-cell"><el-image :src="imageUrl(item.image)" :alt="item.name" fit="contain" class="item-icon" /><span>{{ item.type }} / {{ item.name }}</span></div>
                </el-option>
              </el-select>
            </div>
          </template></el-table-column>
          <el-table-column label="MHB 单价" width="130"><template #default="{ row }"><el-input v-model="row.priceText" size="small" :disabled="saving" aria-label="MHB 单价" /><span class="muted">{{ priceInWan(row.priceText) }}</span></template></el-table-column>
          <el-table-column prop="ruleName" label="匹配规则" width="150" show-overflow-tooltip />
          <el-table-column prop="rawText" label="识别原文" min-width="200" show-overflow-tooltip />
          <el-table-column label="解析依据 / 核对" min-width="210"><template #default="{ row }">
            <el-tooltip :content="row.warnings.join('；')"><span class="review-warning">{{ row.warnings.join('；') }}</span></el-tooltip>
            <el-checkbox v-if="needsReview(row)" v-model="row.reviewed" :disabled="saving">已核对收购方向、价格单位与原文</el-checkbox>
          </template></el-table-column>
          <el-table-column label="操作" width="132" fixed="right"><template #default="{ row }">
            <el-button size="small" type="success" :loading="savingId === row.uid" :disabled="saving" @click="confirm(row)">确认喊话</el-button>
            <el-button size="small" link type="danger" :disabled="saving" @click="remove(row)">忽略</el-button>
          </template></el-table-column>
        </el-table>
        <el-pagination v-model:current-page="currentPage" :page-size="20" :total="pending.length" layout="total, prev, pager, next" class="pagination" />
      </el-tab-pane>
      <el-tab-pane :label="`解析配置 (${rules.length})`" name="rules">
        <ShoutRuleSettings :scope="scope" :items="items" :rules="rules" @changed="rulesChanged" />
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { parseQuoteAmount, quoteDay, quoteItemKey, type QuoteItem, type QuoteSummary } from '../utils/merchantQuotes'
import { parseConfiguredShouts, shoutTextKey, type ParsingRule, type ShoutCandidate } from '../utils/shoutParsing'
import ShoutRuleSettings from './shoutRuleSettings.vue'
import { resolveItemImage } from '../utils/itemImages'
import type { QuoteOcrFrame } from '../utils/ocrQuality'

const props = defineProps<{ items: QuoteItem[]; frame?: QuoteOcrFrame }>()
const visible = defineModel<boolean>({ default: false })
const scope = defineModel<string>('scope', { default: '默认' })
const emit = defineEmits<{ 'pending-change': [count: number]; 'summaries-change': [summaries: QuoteSummary[]]; 'quotes-change': [] }>()
type Pending = ShoutCandidate & { uid: number; priceText: string; reviewed: boolean }
const needsReview = (row: ShoutCandidate) => row.warnings.some(warning => /省略单位|收购方向|差异较大/.test(warning))
const priceInWan = (value: string) => { const price = parseQuoteAmount(value); return price ? `折合 ${Number((price / 10000).toFixed(4))} 万` : '无效单价' }
const pending = ref<Pending[]>([])
const rules = ref<ParsingRule[]>([])
const inputText = ref('')
const showImport = ref(false)
const currentPage = ref(1)
const pagedPending = computed(() => pending.value.slice((currentPage.value - 1) * 20, currentPage.value * 20))
const frameStatus = ref('等待清晰帧识别结果')
const imageUrl = (image?: string) => resolveItemImage(image, import.meta.env.BASE_URL)
const itemImage = (key: string) => imageUrl(props.items.find(item => quoteItemKey(item) === key)?.image)
const tab = ref('quotes')
const loading = ref(false)
const savingId = ref<number>()
const saving = computed(() => savingId.value !== undefined)
let sequence = 0
let request = 0
const seen = new Set<string>()
const recorded = new Set<string>()
const recordKey = (row: { rawText: string; day: string }) => JSON.stringify([shoutTextKey(row.rawText), row.day])

async function reload() {
  const id = ++request
  loading.value = true
  try {
    const data: { rules: ParsingRule[]; summaries: QuoteSummary[]; recordedToday: { rawText: string; day: string }[] } = await window.ipcRenderer.invoke('market:snapshot', scope.value)
    if (id !== request) return
    rules.value = data.rules
    recorded.clear(); data.recordedToday.forEach(row => recorded.add(recordKey(row)))
    pending.value = pending.value.filter(row => !recorded.has(recordKey({ rawText: row.rawText, day: quoteDay(row.observedAt) })))
    emit('summaries-change', data.summaries)
  } catch (cause) { if (id === request) ElMessage.error(`读取报价失败：${String(cause)}`) }
  finally { if (id === request) loading.value = false }
}

function ingest(text: string, observedAt = new Date().toISOString()) {
  if (loading.value) return 0
  const candidates = parseConfiguredShouts(text, props.items, rules.value, observedAt)
  let added = 0
  for (const candidate of candidates) {
    if (recorded.has(recordKey({ rawText: candidate.rawText, day: quoteDay(observedAt) }))) continue
    const key = JSON.stringify([scope.value, candidate.itemKey, quoteDay(observedAt), candidate.rawText])
    if (seen.has(key)) continue
    // Do not partially queue a multi-item shout at the capacity boundary.
    const group = candidates.filter(row => row.rawText === candidate.rawText)
    if (!pending.value.some(row => row.rawText === candidate.rawText) && pending.value.length + group.length > 100) continue
    seen.add(key)
    // Bound session memory without losing persisted database uniqueness protection.
    if (seen.size > 2000) seen.delete(seen.values().next().value!)
    pending.value.push({ ...candidate, uid: ++sequence, priceText: String(candidate.price), reviewed: false })
    added++
  }
  return added
}
function parseInput() {
  const added = ingest(inputText.value)
  ElMessage.info(added ? `新增 ${added} 条待确认报价` : '未发现新的可解析报价；系统公告、未知简称、损坏数字或重复喊话不会新增。')
}
async function rulesChanged() {
  pending.value = []; seen.clear()
  await reload()
  if (props.frame?.text) ingest(props.frame.text, props.frame.observedAt)
}
async function importText(file: File) {
  if (file.size > 1024 * 1024) { ElMessage.warning('请导入 1MB 以内的文本'); return false }
  try { inputText.value = (await file.text()).slice(0, 50000); parseInput() }
  catch { ElMessage.error('读取文本失败') }
  return false
}
function selectItem(row: Pending) {
  const item = props.items.find(item => quoteItemKey(item) === row.itemKey)
  row.itemName = item?.name ?? ''; row.itemType = item?.type ?? ''
  if (!row.keyword) row.keyword = item?.name ?? ''
}
function remove(row: Pending) { pending.value = pending.value.filter(item => item.uid !== row.uid) }
async function confirm(row: Pending) {
  if (saving.value) return
  const day = quoteDay(row.observedAt)
  const group = pending.value.filter(candidate => candidate.rawText === row.rawText && quoteDay(candidate.observedAt) === day)
  if (group.some(candidate => needsReview(candidate) && !candidate.reviewed)) { ElMessage.warning('请先核对该喊话所有物品行的方向、单位和原文；不需要的行可先忽略'); return }
  const quotes = group.map(candidate => ({ itemKey: candidate.itemKey, price: parseQuoteAmount(candidate.priceText) }))
  if (quotes.some(quote => !quote.price || !props.items.some(item => quoteItemKey(item) === quote.itemKey)) || new Set(quotes.map(quote => quote.itemKey)).size !== quotes.length) { ElMessage.warning('请填写有效单价，同一喊话不能重复选择相同物品'); return }
  const confirmationScope = scope.value
  savingId.value = row.uid
  try {
    await ElMessageBox.confirm(`一起保存此喊话的 ${quotes.length} 个物品报价？\n${group.map(candidate => `${candidate.itemName}：${candidate.priceText} MHB`).join('\n')}`, '确认整条喊话', { type: 'warning' })
    if (confirmationScope !== scope.value) throw new Error('服务器已改变，请重新确认')
    const result: { inserted: boolean; rawText: string; day: string; count: number } = await window.ipcRenderer.invoke('market:confirm', {
      scope: confirmationScope, quotes, rawText: row.rawText, observedAt: row.observedAt,
    })
    recorded.add(recordKey(result))
    pending.value = pending.value.filter(candidate => recordKey({ rawText: candidate.rawText, day: quoteDay(candidate.observedAt) }) !== recordKey(result))
    ElMessage.success(result.inserted ? `喊话已确认，保存 ${result.count} 个物品报价` : '该喊话当天已记录，未重复计入')
    await reload(); emit('quotes-change')
  } catch (cause) { if (cause !== 'cancel' && cause !== 'close') ElMessage.error(String(cause)) }
  finally { savingId.value = undefined }
}
function changeScope(value: string) {
  if (saving.value) return
  if (!value.trim()) { ElMessage.warning('服务器名称不能为空'); return }
  scope.value = value.trim()
}
watch(scope, () => {
  pending.value = []; seen.clear(); recorded.clear(); rules.value = []
  emit('summaries-change', [])
  localStorage.setItem('merchant-quote-scope', scope.value)
  void reload()
}, { immediate: true })
watch(() => props.frame, frame => {
  if (!frame?.text) return
  const added = ingest(frame.text, frame.observedAt)
  frameStatus.value = `${new Date(frame.observedAt).toLocaleTimeString()} · 置信度 ${Math.round(frame.confidence)}% · ${added ? `新增 ${added} 条精准报价` : '无新增完整报价（或已去重）'}`
})
watch(loading, value => { if (!value && props.frame?.text) ingest(props.frame.text, props.frame.observedAt) })
watch(() => pending.value.length, count => emit('pending-change', count), { immediate: true })
watch(() => pending.value.length, count => { currentPage.value = Math.min(currentPage.value, Math.max(1, Math.ceil(count / 20))) })
defineExpose({ reload })
</script>

<style scoped>
.quote-toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 16px 0; }
.muted { color: var(--el-text-color-secondary); font-size: 12px; }
.item-cell { display: flex; align-items: center; gap: 6px; }
.item-cell .el-select { flex: 1; min-width: 0; }
.item-icon { width: 28px; height: 28px; flex-shrink: 0; }
.frame-text .el-textarea { margin-top: 6px; }
.import-tools { padding: 12px; background: var(--el-fill-color-light); margin-bottom: 12px; }
.pagination { justify-content: flex-end; margin-top: 12px; }
.review-warning { display: block; max-height: 32px; overflow: hidden; color: var(--el-color-warning); font-size: 11px; }
</style>