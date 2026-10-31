import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { ref } from 'vue'
import { parse } from '@vue/compiler-sfc'

const transpile = code => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const { default: defaults } = await import(moduleUrl(transpile(readFileSync(new URL('../electron/db/db.ts', import.meta.url), 'utf8'))))

test('all original base prices and pictures load without any collected shout quotes', async () => {
  const source = readFileSync(new URL('../src/hooks/usePrice.ts', import.meta.url), 'utf8')
    .replace(/import \{ onMounted, ref \} from "vue"/, 'const { onMounted, ref } = globalThis.__basePriceTestVue')
  const calls = []
  const previousWindow = globalThis.window
  globalThis.__basePriceTestVue = { ref, onMounted: callback => callback() }
  globalThis.window = { ipcRenderer: { invoke: async channel => {
    calls.push(channel)
    assert.equal(channel, 'db:getPrice')
    return structuredClone(defaults.price)
  } } }
  try {
    const { usePrice } = await import(moduleUrl(transpile(source)))
    const model = usePrice()
    await new Promise(resolve => setImmediate(resolve))
    const displayed = Object.values(model.price.value).flatMap(group => Object.values(group))
    assert.equal(displayed.length, defaults.price.length)
    assert.ok(displayed.length > 80, 'the original full catalog must not be replaced by a two-item preview fixture')
    assert.deepEqual(displayed, defaults.price)
    assert.equal(model.price.value['五宝']['特赦令牌'].price, 3770000)
    assert.equal(model.price.value['五宝']['金刚石'].image, './jingangshi.png')
    assert.deepEqual(calls, ['db:getPrice'])

    // Quote-summary conditions must never wrap the base catalog or its price input/image.
    const { descriptor } = parse(readFileSync(new URL('../src/views/Price.vue', import.meta.url), 'utf8'))
    const template = descriptor.template.content
    const catalog = template.slice(template.search(/<el-descriptions\s/), template.indexOf('</el-descriptions>'))
    assert.match(catalog, /v-for="type in Object\.keys\(price\)"/)
    assert.match(catalog, /v-for="name in Object\.keys\(price\[type\]\)"/)
    assert.match(catalog, /v-model="price\[type\]\[name\]\.price"/)
    assert.match(catalog, /imageUrl\(price\[type\]\[name\]\.image\)/)
    assert.ok(catalog.indexOf('v-if="summaryFor') > catalog.indexOf('<priceInput'))
    assert.doesNotMatch(catalog.split('<el-descriptions-item')[0], /v-if=/)
  } finally {
    globalThis.window = previousWindow
    delete globalThis.__basePriceTestVue
  }
})