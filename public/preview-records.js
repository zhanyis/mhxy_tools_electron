// Explicitly imported by the browser preview only; never loaded by the Electron app.
export function createPreviewRecordInvoke(original, storage, prefix = 'mhxy-browser-preview-v1:') {
  const read = (name, fallback) => {
    const saved = storage.getItem(prefix + name)
    return saved === null ? fallback : JSON.parse(saved)
  }
  const write = (name, value) => storage.setItem(prefix + name, JSON.stringify(value))
  return async (channel, ...args) => {
    if (channel === 'db:getRecords') return read('records', [])
    if (channel === 'db:addRecord') {
      const records = read('records', [])
      const id = Math.max(read('recordSequence', 0), ...records.map(record => record.id), 0) + 1
      const record = { ...args[0], id }
      write('records', [...records, record])
      write('recordSequence', id)
      return record
    }
    if (channel === 'db:deleteRecord') {
      if (args[0] !== 'id' || !Number.isSafeInteger(args[1])) throw new Error('只能按ID删除一条预览记录')
      write('records', read('records', []).filter(record => record.id !== args[1]))
      return
    }
    if (channel === 'db:getSettings') return { ...await original(channel), ...read('settings', {}) }
    if (channel === 'db:setSettings') {
      if (!['goldPrice', 'pointPrice', 'sameTimeAccount', 'initCash'].includes(args[0])) throw new Error('无效设置')
      write('settings', { ...read('settings', {}), [args[0]]: args[1] })
      return
    }
    return original(channel, ...args)
  }
}

export function installPreviewRecords(target = window) {
  if (!/^https?:$/.test(target.location.protocol)) return false
  const bridge = target.ipcRenderer
  if (!bridge || bridge.previewRecordsInstalled) return false
  // Only extend the known read-only preview mock, not an actual IPC bridge.
  if (!bridge.invoke.toString().includes('仅预览，不写真实数据库')) return false
  bridge.invoke = createPreviewRecordInvoke(bridge.invoke.bind(bridge), target.localStorage)
  bridge.previewRecordsInstalled = true
  return true
}