import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { parse, compileScript } from '@vue/compiler-sfc'
import { createRenderer, h, nextTick, ref } from 'vue'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const transpile = code => ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const collectorUrl = moduleUrl(transpile(readFileSync(new URL('../src/utils/scrollingText.ts', import.meta.url), 'utf8')))
const source = readFileSync(new URL('../src/components/screenOcr.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const script = compileScript(descriptor, { id: 'screen-ocr-lifecycle' }).content
  .replace(/from ['"]vue['"]/g, `from ${JSON.stringify(pathToFileURL(require.resolve('vue')).href)}`)
  .replace(/import \{ ElMessage \} from ['"]element-plus['"]/, 'const ElMessage = { success() {}, error() {} }')
  .replace(/from ['"]\.\.\/utils\/scrollingText['"]/, `from ${JSON.stringify(collectorUrl)}`)
const { default: ScreenOcr } = await import(moduleUrl(transpile(script)))

test('closing the dialog preserves initialization and repeated OCR; explicit stop and unmount release capture', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const descriptors = new Map(['document', 'window', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const calls = []
  let frames = 0
  let stoppedTracks = 0
  let finishInitialization
  let blockInitialization = true
  let bindings
  let controls
  let state
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  }
  const track = { onended: null, stop: () => { stoppedTracks++ } }
  const video = { srcObject: null, muted: false, playsInline: false, videoWidth: 800, videoHeight: 600, readyState: 2, play: async () => {}, pause() {} }
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ drawImage() {} }),
    toBlob: callback => callback(new Blob([String(++frames)])),
  }
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: tag => tag === 'video' ? video : canvas } })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getDisplayMedia: async () => stream } } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    ipcRenderer: { invoke: async channel => {
      calls.push(channel)
      if (channel === 'screen-ocr:start' && blockInitialization) {
        await new Promise(resolve => { finishInitialization = resolve })
      }
      if (channel === 'screen-ocr:recognize') return { text: `商品${frames} 100万`, confidence: 90 }
    } },
  } })
  const renderer = createRenderer({
    createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {},
    parentNode: () => null, nextSibling: () => null,
  })
  const open = ref(true)
  const Component = {
    ...ScreenOcr,
    setup(props, setupContext) {
      bindings = ScreenOcr.setup(props, {
        ...setupContext,
        expose(value) { controls = value; setupContext.expose(value) },
      })
      return () => null
    },
  }
  const Root = { setup: () => () => h(Component, {
    modelValue: open.value,
    onStateChange: value => { state = value },
    'onUpdate:modelValue': value => { open.value = value },
  }) }
  const container = {}
  const count = channel => calls.filter(call => call === `screen-ocr:${channel}`).length
  try {
    renderer.render(h(Root), container)
    await bindings.share({ id: 'screen:1', name: '测试屏幕', thumbnail: '' })
    await nextTick()
    assert.equal(state.ready, true)

    const initialization = controls.start()
    await nextTick()
    assert.equal(state.active, true)
    open.value = false
    await nextTick()
    assert.equal(count('stop'), 0, 'closing during model loading must not stop OCR')
    assert.equal(video.srcObject, stream)
    finishInitialization()
    await initialization
    assert.equal(count('recognize'), 1)

    context.mock.timers.tick(1000)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(count('recognize'), 2, 'OCR must keep sampling while the dialog is closed')
    assert.equal(bindings.lines.value.length, 2)
    open.value = true
    await nextTick()
    assert.equal(count('stop'), 0, 'reopening must preserve the existing session')

    controls.stop()
    await nextTick()
    assert.equal(state.active, false)
    assert.equal(state.ready, false)
    assert.equal(stoppedTracks, 1)
    assert.equal(video.srcObject, null)
    context.mock.timers.tick(2000)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(count('recognize'), 2, 'turning off the external switch must cancel sampling')

    blockInitialization = false
    await bindings.share({ id: 'screen:1', name: '测试屏幕', thumbnail: '' })
    await controls.start()
    renderer.render(null, container)
    assert.equal(stoppedTracks, 2, 'leaving the price page must release capture')
    assert.equal(count('stop'), 2)
  } finally {
    renderer.render(null, container)
    context.mock.timers.reset()
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})