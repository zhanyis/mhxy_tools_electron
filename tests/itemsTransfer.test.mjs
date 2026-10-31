import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse } from '@vue/compiler-sfc'
import { computed, ref } from 'vue'
import ts from 'typescript'

const { descriptor } = parse(readFileSync(new URL('../src/components/itemsTransfer.vue', import.meta.url), 'utf8'))

test('item categories preserve catalog and bag data while quantity controls preserve earnings', async () => {
  const items = [
    { id: 1, name: '高级召唤兽内丹', type: '内丹', image: './neidan.png', price: 500 },
    { id: 2, name: '龙鳞', type: '五宝', image: './longlin.png', price: 300 },
    { id: 3, name: '召唤兽内丹', type: '内丹', image: './neidan.png', price: 200 },
  ]
  const bags = ref([])
  globalThis.__itemsTransferTest = { computed, usePrice: () => ({ originResult: ref(items) }), bags }
  const source = descriptor.scriptSetup.content
    .replace(/^import .*;\s*$/gm, '')
    .replace(/const bags = defineModel[^\n]+/, 'const bags = globalThis.__itemsTransferTest.bags')
    .replace(/const props = defineProps<[\s\S]*?>\(\)/, '')
  const output = ts.transpileModule(`const { computed, usePrice } = globalThis.__itemsTransferTest;\n${source}\nexport { catalogGroups, bagGroups, totalCount, addToBags, minsItem };`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  try {
    const model = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
    assert.deepEqual(model.catalogGroups.value.map(group => [group.type, group.items.map(item => item.id)]), [['内丹', [1, 3]], ['五宝', [2]]])
    model.addToBags(items[0]); model.addToBags(items[1]); model.addToBags(items[0])
    assert.equal(model.totalCount.value, 3)
    assert.deepEqual(model.bagGroups.value.map(group => group.type), ['内丹', '五宝'])
    assert.equal(bags.value.reduce((sum, item) => sum + item.count * item.price, 0), 1300)
    model.minsItem(bags.value[0])
    assert.equal(bags.value[0].count, 1)
    model.minsItem(bags.value[0])
    assert.deepEqual(bags.value.map(item => item.id), [2])
    assert.deepEqual(items.map(item => item.price), [500, 300, 200])
  } finally { delete globalThis.__itemsTransferTest }
})

test('compact names remain single-line and history hides all editing controls', () => {
  assert.match(descriptor.template.content, /v-for="group in catalogGroups"/)
  assert.match(descriptor.template.content, /v-for="group in bagGroups"/)
  assert.match(descriptor.template.content, /:title="item.name"/)
  assert.match(descriptor.template.content, /resolveItemImage\(item.image\)/)
  assert.equal((descriptor.template.content.match(/<button v-if="!disabled"/g) ?? []).length, 2)
  assert.match(descriptor.styles[0].content, /white-space: nowrap; text-overflow: ellipsis/)
  assert.match(descriptor.styles[0].content, /\.panel-scroll[^}]*overflow: auto/)
})