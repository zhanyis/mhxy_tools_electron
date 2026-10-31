import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const code = ts.transpileModule(readFileSync(new URL('../electron/main/updateController.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { createUpdateController } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const makeUpdater = () => Object.assign(new EventEmitter(), {
  autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: true, allowDowngrade: true,
  checkForUpdates: async () => {}, downloadUpdate: async () => {}, quitAndInstall: () => {},
})

test('listeners precede checks, development never checks, concurrent checks coalesce and snapshot survives missed events', async () => {
  const updater = makeUpdater(), events = []
  let enabled = false, calls = 0
  const controller = createUpdateController(updater, () => enabled, state => events.push(state))
  assert.equal(updater.autoDownload, false)
  assert.equal(updater.autoInstallOnAppQuit, false)
  assert.equal(updater.listenerCount('update-available'), 1)
  await assert.rejects(controller.check(), /正式应用/)
  enabled = true
  updater.checkForUpdates = async () => { calls++; updater.emit('checking-for-update'); updater.emit('update-available', { version: '1.2.3' }) }
  const first = controller.check(), second = controller.check()
  assert.equal(first, second)
  await first
  assert.equal(calls, 1)
  assert.equal(controller.getState().info.version, '1.2.3')
  assert.equal(controller.getState().status, 'available')
  assert.ok(events[1].revision > events[0].revision)
})

test('failed checks/downloads are caught, completion enables explicit installation and deferral', async () => {
  const updater = makeUpdater(), events = []
  const controller = createUpdateController(updater, () => true, state => events.push(state))
  updater.checkForUpdates = async () => { const error = new Error('network unavailable'); updater.emit('error', error); throw error }
  await assert.rejects(controller.check(), /network/)
  assert.equal(events.filter(state => state.status === 'error').length, 1)
  assert.throws(() => controller.install(), /未下载/)
  assert.throws(() => controller.installLater(), /未下载/)
  updater.emit('update-available', { version: '1.2.3' })
  updater.downloadUpdate = async () => { throw new Error('download failed') }
  await assert.rejects(controller.download(), /download failed/)
  assert.equal(controller.getState().status, 'error')
  updater.emit('update-available', { version: '1.2.3' })
  updater.downloadUpdate = async () => {
    updater.emit('download-progress', { percent: 50, transferred: 5, total: 10, bytesPerSecond: 1 })
    updater.emit('update-downloaded', { version: '1.2.3' })
  }
  await controller.download()
  assert.equal(controller.getState().status, 'downloaded')
  controller.installLater()
  assert.equal(updater.autoInstallOnAppQuit, true)
  let installs = 0; updater.quitAndInstall = () => installs++
  controller.install()
  assert.equal(installs, 1)
})

test('startup checks are packaged-only and renderer subscription is installed before snapshot awaits', () => {
  const main = readFileSync(new URL('../electron/main/index.ts', import.meta.url), 'utf8')
  assert.match(main, /app.isPackaged && !startupUpdateScheduled/)
  assert.equal((main.match(/createUpdateController\(/g) ?? []).length, 1)
  const preload = readFileSync(new URL('../electron/preload/index.ts', import.meta.url), 'utf8')
  assert.match(preload, /removeListener\('update-state', listener\)/)
  const ui = readFileSync(new URL('../src/components/updateNotification.vue', import.meta.url), 'utf8')
  assert.ok(ui.indexOf('unsubscribe = api.onUpdateState') < ui.indexOf('await Promise.all'))
  assert.doesNotMatch(ui, /v-html/)
})