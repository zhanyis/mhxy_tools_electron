import { desktopCapturer, ipcMain } from "electron"
import { app } from "electron"
import { promises as fs } from 'fs'
import path from 'path'
import Database from './index'

export let db: Database | null = null;

export const setupApi = async () => {

  const database = new Database()
  await database.init()
  db = database

  ipcMain.handle('db:getPrice', async () => {
    return database.read('price')
  })

  ipcMain.handle('db:setPrice', async (event, price) => {
    if (price.length) {
      await database.setPrice(price)
    }
  })

  ipcMain.handle('db:addPrice', async (event, item) => {
    await database.addPrice(item)
  })

  ipcMain.handle('db:deletePrice', async (event, id) => {
    await database.deletePrice(id)
  })

  ipcMain.handle('db:resetPrice', async (event, data) => {
    await database.resetPrice(data)
  })

  ipcMain.handle('db:getSettings', async () => {
    return database.read('settings')
  })

  ipcMain.handle('db:setSettings', async (event, key, value) => {
    await database.updateSetting(key, value)
  })

  ipcMain.handle('db:getRecords', async () => {
    return database.read('records')
  })

  ipcMain.handle('db:addRecord', async (event, record) => {
    await database.addRecord({
      ...record,
      mhb: Number(record.mhb),
      point: Number(record.point),
      goldPrice: Number(record.goldPrice),
      profit: Number(record.profit),
      sameTimeAccount: Number(record.sameTimeAccount),
      bagsGain: Number(record.bagsGain),
    })
  })

  ipcMain.handle('db:deleteRecord', async (event, key, value) => {
    await database.deleteRecord(key, value)
  })

  ipcMain.handle('capture:getWindows', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    })

    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: source.appIcon?.toDataURL() ?? null,
    }))
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
