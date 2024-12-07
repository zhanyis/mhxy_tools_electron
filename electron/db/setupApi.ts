import { ipcMain } from "electron"
import LocalLowDb from './index'

export let db = null;

export const setupApi = async () => {

  db = new LocalLowDb()
  await db.init()

  ipcMain.handle('db:getPrice', async () => {
    return db.read('price')
  })

  ipcMain.handle('db:setPrice', async (event, price) => {
    console.log('setPrice', price)
    const idPriceMap = price.reduce((acc, item) => {
      acc[item.id] = item
      return acc
    }, {})
    const ids = price.map((item) => item.id)
    if (price.length) {
      await db.update('price', (data) => {
        return data.map((item) => {
          if (ids.includes(item.id)) {
            item.price = idPriceMap[item.id].price
          }
          return item
        })
      })
    }
  })

  ipcMain.handle('db:getSettings', async () => {
    return db.read('settings')
  })

  ipcMain.handle('db:setSettings', async (event, key, value) => {
    await db.update('settings', (data) => {
      data[key] = value
      return data
    })
  })

  ipcMain.handle('db:getRecords', async () => {
    return db.read('records')
  })

  ipcMain.handle('db:addRecord', async (event, record) => {
    const records = await db.read('records')
    const id = records.length ? records[records.length - 1].id + 1 : 1
    await db.create('records', { ...record, id })
  })

  ipcMain.handle('db:deleteRecord', async (event, key, value) => {
    await db.delete('records', key, value)
  })
};
