import { ipcMain } from "electron"
import { app } from "electron"
import { promises as fs } from 'fs'
import path from 'path'
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

  ipcMain.handle('db:addPrice', async (event, item) => {
    // 生成新的 ID
    const priceList = await db.read('price')
    const maxId = priceList.length > 0 ? Math.max(...priceList.map(p => p.id)) : 0
    const newItem = { ...item, id: maxId + 1 }
    await db.create('price', newItem)
  })

  ipcMain.handle('db:deletePrice', async (event, id) => {
    await db.delete('price', 'id', id)
  })

  ipcMain.handle('db:resetPrice', async (event, data) => {
    await db.reset('price', data)
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

  // 图片处理相关接口
  ipcMain.handle('saveImage', async (event, { fileName, data, type }) => {
    try {
      // 获取用户数据目录
      const userDataPath = app.getPath('userData')
      const imagesDir = path.join(userDataPath, 'images')

      // 确保图片目录存在
      try {
        await fs.access(imagesDir)
      } catch {
        await fs.mkdir(imagesDir, { recursive: true })
      }

      // 生成唯一的文件名
      const timestamp = Date.now()
      const ext = path.extname(fileName) || (type === 'image/png' ? '.png' : type === 'image/jpeg' ? '.jpg' : '.png')
      const uniqueFileName = `${timestamp}_${path.basename(fileName, path.extname(fileName))}${ext}`
      const imagePath = path.join(imagesDir, uniqueFileName)

      // 保存图片文件
      const uint8Array = new Uint8Array(data)
      await fs.writeFile(imagePath, uint8Array)

      // 返回可以在渲染进程中使用的路径
      const userImagePath = `user-image:///${uniqueFileName}`
      return userImagePath
    } catch (error) {
      console.error('保存图片失败:', error)
      throw error
    }
  })

  ipcMain.handle('getUserImages', async () => {
    try {
      const userDataPath = app.getPath('userData')
      const imagesDir = path.join(userDataPath, 'images')

      // 检查图片目录是否存在
      try {
        await fs.access(imagesDir)
      } catch {
        return []
      }

      // 读取目录中的所有图片文件
      const files = await fs.readdir(imagesDir)
      const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp']
      const imageFiles = files
        .filter(file => imageExtensions.includes(path.extname(file).toLowerCase()))
        .map(file => `user-image:///${file}`)

      return imageFiles
    } catch (error) {
      console.error('获取用户图片失败:', error)
      return []
    }
  })
};
