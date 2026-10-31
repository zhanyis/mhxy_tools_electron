import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPreviewRecordInvoke, installPreviewRecords } from '../public/preview-records.js'

test('preview records persist separately and deletion never clears other records or parsing rules', async () => {
  const data = new Map([['shout-preview-rules-v1:默认', '[{"id":1}]']])
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
  const calls = []
  const original = async (channel, ...args) => {
    calls.push([channel, ...args])
    return channel === 'db:getSettings' ? { goldPrice: 200, initCash: 0 } : [{ name: '龙鳞' }]
  }
  let invoke = createPreviewRecordInvoke(original, storage)
  const first = await invoke('db:addRecord', { time: '00:00:10', profit: 3, bags: '[]' })
  const second = await invoke('db:addRecord', { time: '00:00:20', profit: 5, bags: '[]' })
  invoke = createPreviewRecordInvoke(original, storage)
  assert.deepEqual(await invoke('db:getRecords'), [first, second])
  await invoke('db:deleteRecord', 'id', first.id)
  assert.deepEqual(await invoke('db:getRecords'), [second])
  await assert.rejects(invoke('db:deleteRecord', 'profit', 5))
  await invoke('db:setSettings', 'goldPrice', 202)
  assert.equal((await invoke('db:getSettings')).goldPrice, 202)
  assert.deepEqual(await invoke('db:getPrice'), [{ name: '龙鳞' }])
  assert.equal(data.get('shout-preview-rules-v1:默认'), '[{"id":1}]')
  assert.ok(!calls.some(([channel]) => channel === 'db:addRecord' || channel === 'db:deleteRecord'))
})

test('preview installer recognizes the mock even in VS Code Electron browser, never actual IPC', () => {
  const storage = { getItem: () => null, setItem: () => {} }
  const target = { location: { protocol: 'http:' }, navigator: { userAgent: 'Electron/37' }, localStorage: storage,
    ipcRenderer: { invoke: async () => { throw new Error('仅预览，不写真实数据库') } } }
  assert.equal(installPreviewRecords(target), true)
  assert.equal(installPreviewRecords(target), false)
  const actual = { ...target, ipcRenderer: { invoke: async () => 'actual IPC' } }
  assert.equal(installPreviewRecords(actual), false)
})