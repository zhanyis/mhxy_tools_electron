import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parse } from '@vue/compiler-sfc'
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import ts from 'typescript'
import { PrismaClient } from '@prisma/client'

const { descriptor } = parse(readFileSync(new URL('../src/views/Today.vue', import.meta.url), 'utf8'))
let sequence = 0
async function setup(invoke = async () => {}) {
  const state = {
    bags: ref([{ id: 1, name: '龙鳞', type: '五宝', price: 300000, image: './longlin.png', count: 2 }]),
    timeStart: ref(0), recordStart: ref(0), endCash: ref(1000000), accumulatedTime: ref('00:00:00'),
  }
  const settings = { goldPrice: ref(200), pointPrice: ref(18000), sameTimeAccount: ref(1), initCash: ref(200000) }
  let resets = 0
  const messages = [], calls = []
  const store = { ...state, resetRecord: () => {
    resets++; state.bags.value = []; state.timeStart.value = 0; state.endCash.value = 0
    state.recordStart.value = 0; state.accumulatedTime.value = '00:00:00'
  } }
  const previousWindow = globalThis.window
  globalThis.window = { ipcRenderer: { invoke: async (...args) => { calls.push(args); return invoke(...args) } } }
  globalThis.__todayRecordTest = {
    computed, ref, dayjs, useTodayStore: () => store, storeToRefs: () => state, useSettings: () => settings,
    useTimestamp: () => ({ timestamp: ref(Date.now()), pause: () => {}, resume: () => {} }),
    ElMessage: message => messages.push(message), ElMessageBox: {},
  }
  const source = descriptor.scriptSetup.content.replace(/^import .*\r?\n/gm, '')
  const code = ts.transpileModule(`const { computed, ref, dayjs, useTodayStore, storeToRefs, useSettings, useTimestamp, ElMessage, ElMessageBox } = globalThis.__todayRecordTest;\n${source}\nexport { saveRecord, startTimer, endTimer, saving, netMhb, sumProfit };\n// ${sequence++}`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const model = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  return { model, state, settings, messages, calls, resets: () => resets, cleanup: () => {
    globalThis.window = previousWindow; delete globalThis.__todayRecordTest
  } }
}

test('recording a running timer includes the current segment and persists earnings in SQLite', async t => {
  const now = 1793400000000
  t.mock.method(Date, 'now', () => now)
  const directory = await mkdtemp(path.join(tmpdir(), 'today-record-'))
  const client = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, 'test.sqlite')}` } } })
  const harness = await setup(async (channel, data) => {
    assert.equal(channel, 'db:addRecord')
    await client.workRecord.create({ data })
  })
  try {
    await client.$executeRawUnsafe('CREATE TABLE records (id INTEGER PRIMARY KEY AUTOINCREMENT, start TEXT, end TEXT, time TEXT, mhb INTEGER, point INTEGER, goldPrice INTEGER, bags TEXT, profit REAL, sameTimeAccount INTEGER, bagsGain INTEGER)')
    harness.state.recordStart.value = now - 10000
    harness.state.timeStart.value = now - 10000
    await harness.model.saveRecord()
    const saved = await client.workRecord.findMany()
    assert.equal(saved.length, 1)
    assert.equal(saved[0].time, '00:00:10')
    assert.equal(saved[0].point, 300)
    assert.equal(saved[0].mhb, 1399700)
    assert.equal(saved[0].profit, 9.33, 'item gain and point cost are applied once')
    assert.equal(JSON.parse(saved[0].bags)[0].count, 2)
    assert.equal(harness.resets(), 1)
    assert.equal(harness.model.saving.value, false)
  } finally { harness.cleanup(); await client.$disconnect(); await rm(directory, { recursive: true, force: true }) }
})

test('resumed timing is included; pending save blocks duplicates and preserves input on failure', async t => {
  const now = 1793400000000
  t.mock.method(Date, 'now', () => now)
  let rejectSave
  const harness = await setup(() => new Promise((_, reject) => { rejectSave = reject }))
  try {
    harness.state.recordStart.value = now - 70000
    harness.state.accumulatedTime.value = '00:01:00'
    harness.state.timeStart.value = now - 10000
    const saving = harness.model.saveRecord()
    assert.equal(harness.model.saving.value, true)
    await harness.model.saveRecord()
    harness.model.startTimer()
    assert.equal(harness.state.timeStart.value, 0)
    assert.equal(harness.calls.length, 1)
    assert.equal(harness.calls[0][1].time, '00:01:10')
    rejectSave(new Error('数据库无法写入'))
    await saving
    assert.equal(harness.resets(), 0)
    assert.equal(harness.state.bags.value[0].count, 2)
    assert.equal(harness.state.endCash.value, 1000000)
    assert.equal(harness.state.accumulatedTime.value, '00:01:10')
    assert.equal(harness.model.saving.value, false)
    assert.match(harness.messages.at(-1).message, /数据库无法写入.*已保留/)
  } finally { harness.cleanup() }
})

test('stopped timer saves normally, but unstarted or invalid input never clears records', async t => {
  const now = 1793400000000
  t.mock.method(Date, 'now', () => now)
  const harness = await setup()
  try {
    await harness.model.saveRecord()
    assert.equal(harness.calls.length, 0)
    assert.match(harness.messages.at(-1).message, /请先开始计时/)
    harness.state.recordStart.value = now - 60000
    harness.state.accumulatedTime.value = '00:01:00'
    harness.settings.goldPrice.value = NaN
    await harness.model.saveRecord()
    assert.equal(harness.calls.length, 0)
    assert.equal(harness.resets(), 0)
    assert.match(harness.messages.at(-1).message, /金价.*已保留/)
    harness.settings.goldPrice.value = 200
    await harness.model.saveRecord()
    assert.equal(harness.calls.length, 1)
    assert.equal(harness.calls[0][1].time, '00:01:00')
    assert.equal(harness.resets(), 1)
  } finally { harness.cleanup() }
})

test('record page locks inputs during saving and derived earnings are readonly', () => {
  assert.match(descriptor.template.content, /<div[^>]*:inert="saving"/)
  assert.match(descriptor.template.content, /:loading="saving"/)
  assert.match(descriptor.template.content, /:modelValue="bagsGain" readonly/)
  assert.match(descriptor.template.content, /:modelValue="netMhb" readonly/)
  assert.match(descriptor.styles[0].content, /table-layout: fixed/)
})