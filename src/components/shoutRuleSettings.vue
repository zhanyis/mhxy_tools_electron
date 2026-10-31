<template>
  <div class="rule-settings">
    <el-alert title="规则长期保留，刷新、导入和修改物价都不会清空。删除必须逐条人工确认；不提供批量清空。规则只产生待确认报价，不会自动入库。" type="info" :closable="false" />
    <p class="muted">首次生成的规则默认全部关闭，仅启用你关心的物品。已有规则的开关不会被自动修改。</p>
    <div class="tools">
      <el-button type="primary" @click="newRule">新增规则</el-button>
      <el-button @click="exportRules">导出规则</el-button>
      <el-upload action="#" accept=".json" :show-file-list="false" :before-upload="importRules"><el-button>导入规则（追加）</el-button></el-upload>
      <span class="muted">{{ scope }} · {{ rules.length }} 条规则 · {{ rules.filter(rule => rule.enabled).length }} 条启用</span>
      <el-input v-model="filter" placeholder="搜索物品 / 简称 / 规则" style="width:240px" clearable />
    </div>
    <el-table :data="filtered" stripe max-height="370" row-key="id">
      <el-table-column label="启用" width="70"><template #default="{ row }"><el-switch :model-value="row.enabled" :disabled="busy" @change="toggle(row)" /></template></el-table-column>
      <el-table-column prop="name" label="规则名称" min-width="150" />
      <el-table-column label="物品" min-width="150"><template #default="{ row }">{{ itemName(row.itemKey) }}</template></el-table-column>
      <el-table-column label="匹配方式" min-width="250" show-overflow-tooltip><template #default="{ row }">{{ row.mode === 'aliases' ? row.aliases.join('、') : row.expression }}</template></el-table-column>
      <el-table-column prop="defaultUnit" label="默认单位" width="95" />
      <el-table-column label="操作" width="135"><template #default="{ row }"><el-button link :disabled="busy" @click="edit(row)">编辑</el-button><el-button link type="danger" :disabled="busy" @click="remove(row)">删除</el-button></template></el-table-column>
    </el-table>
    <el-dialog v-model="editorOpen" title="人工配置喊话解析" width="760px" append-to-body :close-on-click-modal="false" :before-close="closeEditor">
      <el-form label-width="110px" :disabled="busy">
        <el-form-item label="规则名称"><el-input v-model="draft.name" maxlength="80" /></el-form-item>
        <el-form-item label="物价单品"><el-select v-model="draft.itemKey" filterable style="width:100%" @change="chooseItem"><el-option v-for="item in items" :key="quoteItemKey(item)" :value="quoteItemKey(item)" :label="`${item.type} / ${item.name}`" /></el-select></el-form-item>
        <el-form-item label="快捷正则"><div><div class="preset-tools"><el-button @click="applyPreset('priceBefore')">价格在前：30收物品</el-button><el-button @click="applyPreset('priceAfter')">价格在后：物品30</el-button></div><span class="muted">所有物品通用，任一按钮都支持“30收龙鳞”“30龙鳞”“龙鳞30”。省略收时需核对方向。按名称 / 简称生成，保存后才生效；不会删除其他规则。</span></div></el-form-item>
        <el-form-item label="匹配方式"><el-radio-group v-model="draft.mode"><el-radio value="aliases">物品简称</el-radio><el-radio value="expression">自定义表达式</el-radio></el-radio-group></el-form-item>
        <el-form-item label="物品名称 / 简称"><el-input v-model="aliasText" placeholder="多个名称用逗号、顿号或换行分隔，如：高级偷袭、高偷" type="textarea" :rows="2" /></el-form-item>
        <el-form-item v-if="draft.mode === 'expression'" label="匹配表达式"><el-input v-model="draft.expression" type="textarea" :rows="3" maxlength="500" /><div class="muted expression-help">{{ expressionHelp }}</div></el-form-item>
        <el-form-item label="省略单位时"><el-select v-model="draft.defaultUnit"><el-option label="万 MHB" value="万" /><el-option label="千 MHB" value="千" /><el-option label="原始 MHB" value="MHB" /></el-select></el-form-item>
        <el-form-item label="安全选项"><el-checkbox v-model="draft.requireBuy">必须写明收 / 收购 / 求购</el-checkbox><el-checkbox v-model="draft.enabled">启用规则</el-checkbox></el-form-item>
        <el-form-item label="测试喊话"><el-input v-model="testText" type="textarea" :rows="2" maxlength="4000" placeholder="如：高偷4330；或 335收牌子" /></el-form-item>
      </el-form>
      <el-button :disabled="busy" @click="testRule">测试匹配（不会入库）</el-button>
      <el-alert v-if="testMessage" :title="testMessage" :type="preview.length ? 'success' : 'warning'" :closable="false" class="test-message" />
      <el-table v-if="preview.length" :data="preview" max-height="170"><el-table-column prop="itemName" label="物品" /><el-table-column label="单价"><template #default="{ row }">{{ row.price.toLocaleString() }} MHB / {{ row.price / 10000 }} 万</template></el-table-column><el-table-column prop="rawText" label="原文" show-overflow-tooltip /></el-table>
      <template #footer><el-button :disabled="busy" @click="editorOpen = false">取消</el-button><el-button type="primary" :loading="busy" @click="save">保存规则</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { quoteItemKey, type QuoteItem } from '../utils/merchantQuotes'
import { buildShoutPreset, expressionHelp, parseConfiguredShouts, validateParsingRule, type ShoutPreset, type ParsingRule, type ShoutCandidate } from '../utils/shoutParsing'
const props = defineProps<{ scope: string; items: QuoteItem[]; rules: ParsingRule[] }>()
const emit = defineEmits<{ changed: [] }>()
const filter = ref('')
const filtered = computed(() => props.rules.filter(rule => `${rule.name} ${itemName(rule.itemKey)} ${rule.aliases.join(' ')} ${rule.expression}`.includes(filter.value)))
const itemName = (key: string) => props.items.find(item => quoteItemKey(item) === key)?.name ?? '物品已移出物价表'
const empty = (): ParsingRule => ({ scope: props.scope, name: '', itemKey: '', aliases: [], mode: 'aliases', expression: '', defaultUnit: '万', requireBuy: true, enabled: false })
const draft = ref<ParsingRule>(empty())
const editorOpen = ref(false)
const aliasText = ref('')
const testText = ref('')
const testMessage = ref('')
const preview = ref<ShoutCandidate[]>([])
const busy = ref(false)
function closeEditor(done: () => void) { if (!busy.value) done() }
function edit(rule: ParsingRule) {
  draft.value = { ...rule, aliases: [...rule.aliases] }; aliasText.value = rule.aliases.join('、')
  testMessage.value = ''; preview.value = []; editorOpen.value = true
}
function newRule() { edit(empty()) }
function chooseItem() {
  const item = props.items.find(item => quoteItemKey(item) === draft.value.itemKey)
  if (!item) return
  if (!draft.value.name) draft.value.name = `${item.name}喊话`
  if (!aliasText.value.trim()) aliasText.value = item.name
}
function applyPreset(preset: ShoutPreset) {
  try {
    if (!draft.value.itemKey) throw new Error('请先选择物价单品')
    const item = props.items.find(item => quoteItemKey(item) === draft.value.itemKey)
    const aliases = aliasText.value.split(/[,，、;；\r\n]+/).map(alias => alias.trim()).filter(Boolean)
    if (!aliases.length && item) aliases.push(item.name)
    const result = buildShoutPreset(aliases, preset)
    aliasText.value = aliases.join('、'); draft.value.mode = 'expression'
    draft.value.expression = result.expression; draft.value.requireBuy = result.requireBuy
    testText.value = result.example; testMessage.value = ''; preview.value = []
    ElMessage.info('快捷表达式已填入，请测试单位并勾选启用后保存；未写收的喊话仍需核对方向。')
  } catch (cause) { ElMessage.error(String(cause)) }
}
function validated() { return validateParsingRule({ ...draft.value, aliases: aliasText.value.split(/[,，、;；\r\n]+/) }) }
function testRule() {
  preview.value = []
  try {
    const rule = validated()
    preview.value = parseConfiguredShouts(testText.value, props.items, [{ ...rule, enabled: true }])
    testMessage.value = preview.value.length ? `匹配到 ${preview.value.length} 条；保存前请核对单位和物品。` : '没有匹配到有效报价，请检查表达式、简称、收购方向或数字。'
  } catch (cause) { testMessage.value = String(cause) }
}
async function save() {
  try {
    const rule = validated()
    if (rule.scope !== props.scope) throw new Error('服务器已改变，请重新打开规则')
    busy.value = true
    await window.ipcRenderer.invoke('market:saveRule', rule)
    editorOpen.value = false; emit('changed'); ElMessage.success('解析规则已保存')
  } catch (cause) { ElMessage.error(String(cause)) } finally { busy.value = false }
}
async function toggle(rule: ParsingRule) {
  busy.value = true
  try { await window.ipcRenderer.invoke('market:saveRule', { ...rule, enabled: !rule.enabled }); emit('changed') }
  catch (cause) { ElMessage.error(String(cause)) } finally { busy.value = false }
}
async function remove(rule: ParsingRule) {
  if (busy.value) return
  const deletionScope = props.scope
  const id = rule.id
  if (!id || rule.scope !== deletionScope) { ElMessage.warning('规则已改变，请刷新后重试'); return }
  busy.value = true
  try {
    await ElMessageBox.confirm(`只删除这一条规则？\n规则：${rule.name}\n物品：${itemName(rule.itemKey)}\n服务器：${deletionScope}\n其他规则和报价历史均保留。`, '逐条确认删除规则', {
      type: 'warning', confirmButtonText: '确认删除这一条', cancelButtonText: '保留规则', closeOnClickModal: false,
    })
    if (props.scope !== deletionScope) throw new Error('服务器已改变，未删除规则，请重新确认')
    await window.ipcRenderer.invoke('market:deleteRule', id, deletionScope, true)
    emit('changed'); ElMessage.success('仅删除了这一条规则，其余规则保留')
  } catch (cause) { if (cause !== 'cancel' && cause !== 'close') ElMessage.error(String(cause)) }
  finally { busy.value = false }
}
function exportRules() {
  const blob = new Blob([JSON.stringify({ version: 1, rules: props.rules.map(({ id: _id, ...rule }) => rule) }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `喊话解析规则-${props.scope.replace(/[<>:"/\\|?*]/g, '_')}.json`; link.click(); URL.revokeObjectURL(url)
}
async function importRules(file: File) {
  if (file.size > 1024 * 1024) { ElMessage.warning('规则文件不能超过1MB'); return false }
  busy.value = true
  try {
    const input = JSON.parse(await file.text())
    if (input.version !== 1 || !Array.isArray(input.rules)) throw new Error('不支持的规则文件格式')
    await window.ipcRenderer.invoke('market:importRules', props.scope, input.rules)
    emit('changed'); ElMessage.success('规则已追加导入；同物品冲突报价不会自动采用')
  } catch (cause) { ElMessage.error(String(cause)) } finally { busy.value = false }
  return false
}
</script>

<style scoped>
.tools { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 16px 0; }
.muted { font-size: 12px; color: var(--el-text-color-secondary); }
.expression-help { line-height: 1.7; margin-top: 8px; overflow-wrap: anywhere; }
.test-message { margin-top: 12px; }
.preset-tools { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
</style>