import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse } from '@vue/compiler-sfc'
import { computed, ref } from 'vue'
import ts from 'typescript'
const { descriptor } = parse(readFileSync(new URL('../src/components/updateNotification.vue', import.meta.url), 'utf8'))
let sequence = 0
async function setup(api) {
  const beforeWindow = globalThis.window, beforeStorage = globalThis.localStorage
  const values = new Map(), messages = []
  let mounted, unmounted
  globalThis.window = { electronAPI: api }
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  globalThis.__updateUITest = { ref, computed, onMounted: fn => mounted = fn, onUnmounted: fn => unmounted = fn,
    ElMessage: { error: text => messages.push(text), info: text => messages.push(text), success: text => messages.push(text) } }
  const source = descriptor.scriptSetup.content.replace(/^import .*\r?\n/gm, '')
  const code = ts.transpileModule(`const {ref, computed, onMounted, onUnmounted, ElMessage} = globalThis.__updateUITest;\n${source}\nexport { updateAvailable, downloading, downloaded, checkForUpdates, downloadUpdate, installLater, skipUpdate, updateInfo, releaseNotes }; // ${sequence++}`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const model = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  return { model, messages, mounted: () => mounted(), cleanup: () => {
    unmounted(); globalThis.window = beforeWindow; globalThis.localStorage = beforeStorage; delete globalThis.__updateUITest
  } }
}

test('renderer subscribes before slow initialization and ignores old snapshot; skip is overridden by manual check; cleanup is precise', async () => {
  let listener, resolveVersion, unsubscribed = 0, deferred = 0
  let state = { revision: 2, status: 'available', info: { version: '1.2.3', releaseNotes: '<p>安全更新</p>' } }
  const harness = await setup({
    onUpdateState: callback => { listener = callback; return () => unsubscribed++ },
    getAppVersion: () => new Promise(resolve => resolveVersion = resolve),
    getUpdateState: async () => ({ revision: 0, status: 'idle' }),
    checkForUpdates: async () => state,
    installLater: async () => deferred++,
  })
  try {
    const initializing = harness.mounted()
    listener(state)
    resolveVersion('1.2.2')
    await initializing
    assert.equal(harness.model.updateAvailable.value, true)
    assert.equal(harness.model.updateInfo.value.version, '1.2.3')
    assert.equal(harness.model.releaseNotes.value, '安全更新')
    harness.model.skipUpdate()
    assert.equal(harness.model.updateAvailable.value, false)
    state = { ...state, revision: 3 }
    listener(state)
    assert.equal(harness.model.updateAvailable.value, false)
    await harness.model.checkForUpdates()
    assert.equal(harness.model.updateAvailable.value, true)
    listener({ revision: 4, status: 'downloading', info: state.info })
    assert.equal(harness.model.downloading.value, true)
    listener({ revision: 5, status: 'downloaded', info: state.info })
    assert.equal(harness.model.downloaded.value, true)
    await harness.model.installLater()
    assert.equal(deferred, 1)
    assert.equal(harness.model.downloaded.value, false)
    assert.match(harness.messages.at(-1), /退出应用时安装/)
  } finally { harness.cleanup() }
  assert.equal(unsubscribed, 1)
})

test('event and rejected download IPC show only one error and preserve retry ability', async () => {
  let listener
  let state = { revision: 1, status: 'available', info: { version: '1.2.3' } }
  const harness = await setup({
    onUpdateState: callback => { listener = callback; return () => {} },
    getAppVersion: async () => '1.2.2', getUpdateState: async () => state,
    startDownload: async () => {
      state = { revision: 2, status: 'error', error: '网络错误' }; listener(state); throw new Error('网络错误')
    },
    checkForUpdates: async () => ({ revision: 3, status: 'available', info: { version: '1.2.3' } }),
  })
  try {
    await harness.mounted()
    await harness.model.downloadUpdate()
    assert.deepEqual(harness.messages, ['更新失败: 网络错误'])
    assert.equal(harness.model.downloading.value, false)
    await harness.model.checkForUpdates()
    assert.equal(harness.model.updateAvailable.value, true)
  } finally { harness.cleanup() }
})