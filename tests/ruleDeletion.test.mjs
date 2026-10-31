import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { computed, ref } from 'vue'
import { parse } from '@vue/compiler-sfc'
import ts from 'typescript'

test('rules are deleted one at a time only after manual confirmation; cancellation and scope changes retain them', async () => {
  const rules = [
    { id: 1, scope: '默认', name: '令牌规则', itemKey: '["五宝","特赦令牌"]', aliases: ['牌子'], expression: '', enabled: true },
    { id: 2, scope: '默认', name: '偷袭规则', itemKey: '["高级兽决","高级偷袭"]', aliases: ['高偷'], expression: '', enabled: true },
  ]
  const props = { scope: '默认', rules, items: [{ type: '五宝', name: '特赦令牌' }] }
  const invocations = []
  const confirmations = []
  let confirm = async () => { throw 'cancel' }
  const previousWindow = globalThis.window
  globalThis.__ruleDeletionTest = {
    props, computed, ref,
    ElMessage: { error() {}, warning() {}, success() {} },
    ElMessageBox: { confirm: async (...args) => { confirmations.push(args); return confirm() } },
  }
  globalThis.window = { ipcRenderer: { invoke: async (...args) => { invocations.push(args); return {} } } }
  const { descriptor } = parse(readFileSync(new URL('../src/components/shoutRuleSettings.vue', import.meta.url), 'utf8'))
  const script = descriptor.scriptSetup.content.replace(/^import .* from ['"].*['"]\r?$/gm, '')
  const injected = `
    const { computed, ref, ElMessage, ElMessageBox } = globalThis.__ruleDeletionTest;
    const defineProps = () => globalThis.__ruleDeletionTest.props;
    const defineEmits = () => () => {};
    const quoteItemKey = item => JSON.stringify([item.type, item.name]);
    const expressionHelp = '';
    ${script}
    export { remove };
  `
  const code = ts.transpileModule(injected, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  try {
    const { remove } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    await remove(rules[0])
    assert.equal(invocations.length, 0, 'cancel keeps the rule')
    confirm = async () => { throw 'close' }
    await remove(rules[0])
    assert.equal(invocations.length, 0, 'closing dialog keeps the rule')
    confirm = async () => { props.scope = '其他区' }
    await remove(rules[0])
    assert.equal(invocations.length, 0, 'scope change during confirmation cannot delete an old rule')
    props.scope = '默认'
    let accept
    confirm = () => new Promise(resolve => { accept = resolve })
    const first = remove(rules[0])
    const promptCount = confirmations.length
    await remove(rules[1])
    assert.equal(confirmations.length, promptCount, 'only one confirmation is active at a time')
    accept()
    await first
    assert.deepEqual(invocations, [['market:deleteRule', 1, '默认', true]])
    assert.match(confirmations.at(-1)[0], /令牌规则/)
    assert.match(confirmations.at(-1)[0], /特赦令牌/)
    assert.equal(confirmations.at(-1)[2].confirmButtonText, '确认删除这一条')
    assert.equal(confirmations.at(-1)[2].cancelButtonText, '保留规则')
    assert.equal(props.rules.length, 2, 'component does not clear the rule array itself')
  } finally {
    globalThis.window = previousWindow
    delete globalThis.__ruleDeletionTest
  }
})