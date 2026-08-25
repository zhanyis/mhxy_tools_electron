import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { PrismaClient } from '@prisma/client'
import defaultDb from './db'

type LegacyPrice = { id: number; name: string; price: number; type: string; image: string }
type LegacyRecord = {
  id?: number
  start: string
  end: string
  time: string
  mhb: number
  point: number
  goldPrice: number
  bags: string
  profit: number
  sameTimeAccount: number
  bagsGain: number
}
type LegacyDatabase = {
  price: LegacyPrice[]
  settings: { goldPrice: number; pointPrice: number; sameTimeAccount: number; initCash: number }
  records: LegacyRecord[]
}

class Database {
  private readonly dbPath: string
  private readonly legacyDbPath: string
  private readonly client: PrismaClient

  constructor() {
    const userDataPath = app.getPath('userData')
    this.dbPath = path.join(userDataPath, 'db.sqlite')
    this.legacyDbPath = path.join(userDataPath, 'db.json')
    process.env.DATABASE_URL = `file:${this.dbPath}`
    this.client = new PrismaClient()
  }

  async init() {
    await this.client.$connect()
    await this.client.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "prices" ("id" INTEGER NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "price" INTEGER NOT NULL, "type" TEXT NOT NULL, "image" TEXT NOT NULL)')
    await this.client.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "Settings" ("id" INTEGER NOT NULL PRIMARY KEY, "goldPrice" INTEGER NOT NULL, "pointPrice" INTEGER NOT NULL, "sameTimeAccount" INTEGER NOT NULL, "initCash" INTEGER NOT NULL)')
    await this.client.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "records" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "start" TEXT NOT NULL, "end" TEXT NOT NULL, "time" TEXT NOT NULL, "mhb" INTEGER NOT NULL, "point" INTEGER NOT NULL, "goldPrice" INTEGER NOT NULL, "bags" TEXT NOT NULL, "profit" REAL NOT NULL, "sameTimeAccount" INTEGER NOT NULL, "bagsGain" INTEGER NOT NULL)')

    const legacyData = await this.readLegacyData()
    if (await this.client.price.count() === 0) {
      await this.client.price.createMany({ data: (legacyData?.price ?? defaultDb.price).map(this.toPrice) })
    }
    if (await this.client.settings.count() === 0) {
      await this.client.settings.create({ data: { id: 1, ...(legacyData?.settings ?? defaultDb.settings) } })
    }
    if (await this.client.workRecord.count() === 0 && legacyData?.records?.length) {
      await this.client.workRecord.createMany({ data: legacyData.records.map(record => ({
        ...(record.id === undefined ? {} : { id: Number(record.id) }),
        start: record.start, end: record.end, time: record.time, bags: record.bags,
        mhb: Number(record.mhb), point: Number(record.point), goldPrice: Number(record.goldPrice),
        profit: Number(record.profit), sameTimeAccount: Number(record.sameTimeAccount), bagsGain: Number(record.bagsGain),
      })) })
    }
  }

  async close() { await this.client.$disconnect() }

  async read(field?: string) {
    if (field === 'price') return this.client.price.findMany({ orderBy: { id: 'asc' } })
    if (field === 'settings') return this.client.settings.findUnique({ where: { id: 1 } })
    if (field === 'records') return this.client.workRecord.findMany({ orderBy: { id: 'asc' } })
    return {
      price: await this.client.price.findMany({ orderBy: { id: 'asc' } }),
      settings: await this.client.settings.findUnique({ where: { id: 1 } }),
      records: await this.client.workRecord.findMany({ orderBy: { id: 'asc' } }),
    }
  }

  async setPrice(items: Array<{ id: number; price: number }>) {
    await this.client.$transaction(items.map(item => this.client.price.update({
      where: { id: item.id }, data: { price: Number(item.price) },
    })))
  }

  async addPrice(item: { name: string; price: number; type: string; image: string }) {
    const last = await this.client.price.findFirst({ orderBy: { id: 'desc' } })
    return this.client.price.create({ data: { ...item, id: (last?.id ?? 0) + 1, price: Number(item.price) } })
  }

  async deletePrice(id: number) { await this.client.price.delete({ where: { id } }) }

  async resetPrice(items?: Array<{ id: number; name: string; price: number; type: string; image: string }>) {
    const prices = items ?? defaultDb.price
    await this.client.$transaction(async transaction => {
      await transaction.price.deleteMany()
      await transaction.price.createMany({ data: prices.map(this.toPrice) })
    })
  }

  async updateSetting(key: string, value: number) {
    if (!['goldPrice', 'pointPrice', 'sameTimeAccount', 'initCash'].includes(key)) {
      throw new Error(`Unknown setting: ${key}`)
    }
    await this.client.settings.update({ where: { id: 1 }, data: { [key]: Number(value) } })
  }

  async addRecord(record: any) { return this.client.workRecord.create({ data: record }) }

  async deleteRecord(key: string, value: number | string) {
    if (key === 'id') {
      await this.client.workRecord.delete({ where: { id: Number(value) } })
      return
    }
    const records = await this.client.workRecord.findMany()
    const ids = records.filter(record => String(record[key as keyof typeof record]) === String(value)).map(record => record.id)
    if (ids.length) await this.client.workRecord.deleteMany({ where: { id: { in: ids } } })
  }

  private async readLegacyData(): Promise<LegacyDatabase | null> {
    try { return JSON.parse(await fs.readFile(this.legacyDbPath, 'utf8')) as LegacyDatabase } catch { return null }
  }

  private readonly toPrice = (item: LegacyDatabase['price'][number]) => ({
    id: Number(item.id), name: item.name, price: Number(item.price), type: item.type, image: item.image,
  })
}

export default Database
