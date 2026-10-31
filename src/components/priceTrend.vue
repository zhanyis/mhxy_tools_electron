<template>
  <el-dialog v-model="visible" :title="`${itemName} · 喊话收购价格趋势`" width="88%" top="5vh">
    <div v-loading="loading">
      <div class="stats">
        <div><span>你的设定物价</span><strong>{{ formatPrice(basePrice) }}</strong></div>
        <div><span>历史最低报价</span><strong>{{ formatPrice(summary?.minimum) }}</strong></div>
        <div><span>历史最高报价</span><strong>{{ formatPrice(summary?.maximum) }}</strong></div>
        <div><span>已确认样本</span><strong>{{ summary?.count ?? 0 }} 条</strong></div>
        <div><span>较上个有报价日</span><strong :class="change !== null && change > 0 ? 'up' : 'down'">{{ change === null ? '暂无可比数据' : `${change > 0 ? '+' : ''}${change.toFixed(2)}%` }}</strong></div>
      </div>
      <p class="notice">{{ scope }} · 最近 30 天，按已确认喊话报价计算每日均价 / 最高 / 最低。没有报价的日期留空，不插值。同日重复原文不增加样本；只代表已录入的收购报价，不代表成交价。</p>
      <div ref="chartElement" class="trend-chart" role="img" :aria-label="`${itemName}最近30天收购报价趋势`" />
      <el-empty v-if="!daily.length && !loading" description="尚无最近 30 天的确认报价" :image-size="60" />
      <h4>最近确认报价（最多 200 条）</h4>
      <el-table :data="records" max-height="340" empty-text="确认喊话后会显示在这里">
        <el-table-column prop="day" label="日期" width="115" />
        <el-table-column label="MHB 单价" width="140"><template #default="{ row }">{{ row.price.toLocaleString() }}</template></el-table-column>
        <el-table-column prop="rawText" label="喊话原文" show-overflow-tooltip />
        <el-table-column width="95" label="操作"><template #default="{ row }"><el-button link type="danger" @click="deleteQuote(row)">删除误录</el-button></template></el-table-column>
      </el-table>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { init, use, type ECharts, type EChartsCoreOption } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import { buildQuoteTrend, type DailyQuote, type QuoteSummary, type StoredQuote } from '../utils/merchantQuotes'

use([LineChart, GridComponent, TooltipComponent, LegendComponent, SVGRenderer])
const props = defineProps<{ scope: string; itemKey: string; itemName: string; basePrice: number; summary?: QuoteSummary; revision: number }>()
const visible = defineModel<boolean>({ default: false })
const emit = defineEmits<{ changed: [] }>()
const chartElement = ref<HTMLDivElement>()
const daily = ref<DailyQuote[]>([])
const records = ref<StoredQuote[]>([])
const loading = ref(false)
let chart: ECharts | undefined
let observer: ResizeObserver | undefined
let request = 0
const formatPrice = (price?: number) => price === undefined ? '—' : `${Math.round(price).toLocaleString()} MHB`
const change = computed(() => {
  const latest = daily.value.at(-1)?.average
  const previous = daily.value.at(-2)?.average
  return latest !== undefined && previous ? (latest - previous) / previous * 100 : null
})

function renderChart() {
  if (!chartElement.value || !visible.value) return
  if (!chart) {
    chart = init(chartElement.value, undefined, { renderer: 'svg' })
    observer = new ResizeObserver(() => chart?.resize())
    observer.observe(chartElement.value)
  }
  const rows = buildQuoteTrend(daily.value)
  const option: EChartsCoreOption = {
    color: ['#409eff', '#67c23a', '#e6a23c'],
    tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => typeof value === 'number' ? `${Math.round(value).toLocaleString()} MHB` : '无报价' },
    legend: { data: ['每日均价', '每日最低', '每日最高'], top: 0 },
    grid: { left: 75, right: 25, top: 45, bottom: 40 },
    xAxis: { type: 'category', data: rows.map(row => row.day.slice(5)) },
    yAxis: { type: 'value', scale: true, axisLabel: { formatter: (value: number) => value >= 10000 ? `${Number((value / 10000).toFixed(2))}万` : String(value) } },
    series: [
      { name: '每日均价', type: 'line', connectNulls: false, symbolSize: 7, data: rows.map(row => row.average) },
      { name: '每日最低', type: 'line', connectNulls: false, symbolSize: 5, data: rows.map(row => row.minimum), lineStyle: { type: 'dashed' } },
      { name: '每日最高', type: 'line', connectNulls: false, symbolSize: 5, data: rows.map(row => row.maximum), lineStyle: { type: 'dashed' } },
    ],
  }
  chart.setOption(option, true); chart.resize()
}
async function reload() {
  const id = ++request
  loading.value = true; daily.value = []; records.value = []
  try {
    const data = await window.ipcRenderer.invoke('market:history', props.scope, props.itemKey)
    if (id !== request) return
    daily.value = data.daily; records.value = data.records
    await nextTick(); renderChart()
  } catch (cause) { if (id === request) ElMessage.error(`读取趋势失败：${String(cause)}`) }
  finally { if (id === request) loading.value = false }
}
async function deleteQuote(row: StoredQuote) {
  try { await ElMessageBox.confirm('删除这条误录报价？最高最低价和趋势会重新计算，已保存的关键词规则不受影响。', '删除报价', { type: 'warning' }) }
  catch { return }
  try { await window.ipcRenderer.invoke('market:deleteQuote', row.id); emit('changed'); await reload() }
  catch (cause) { ElMessage.error(String(cause)) }
}
watch([visible, () => props.itemKey, () => props.scope, () => props.revision], () => { if (visible.value && props.itemKey) void reload() })
watch(visible, async open => { if (open) { await nextTick(); renderChart() } })
onBeforeUnmount(() => { request++; observer?.disconnect(); chart?.dispose() })
</script>

<style scoped>
.stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin: 8px 0 16px; }
.stats > div { padding: 14px; border-radius: 10px; background: var(--el-fill-color-light); }
.stats span { color: var(--el-text-color-secondary); font-size: 12px; display: block; margin-bottom: 8px; }
.stats strong { font-size: 16px; }
.notice { color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.6; }
.trend-chart { width: 100%; height: 300px; }
.up { color: var(--el-color-danger); } .down { color: var(--el-color-success); }
@media (max-width: 900px) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>