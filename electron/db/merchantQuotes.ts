import type { PrismaClient } from '@prisma/client'
import { merchantIdentity, quoteDay, quoteItemKey, validateQuoteConfirmation } from '../../src/utils/merchantQuotes'

export class MerchantQuoteRepository {
  constructor(private readonly client: PrismaClient) {}

  async init() {
    // Existing installations use idempotent runtime DDL; never reset the user's prices or records.
    await this.client.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "merchant_quotes" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "scope" TEXT NOT NULL, "itemKey" TEXT NOT NULL, "itemName" TEXT NOT NULL, "itemType" TEXT NOT NULL, "merchant" TEXT NOT NULL, "merchantKey" TEXT NOT NULL, "gameId" TEXT NOT NULL, "price" INTEGER NOT NULL, "rawText" TEXT NOT NULL, "observedAt" TEXT NOT NULL, "day" TEXT NOT NULL, "createdAt" TEXT NOT NULL)')
    await this.client.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "merchant_quotes_scope_merchantKey_itemKey_day_key" ON "merchant_quotes" ("scope", "merchantKey", "itemKey", "day")')
    await this.client.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "merchant_quotes_scope_itemKey_day_idx" ON "merchant_quotes" ("scope", "itemKey", "day")')
    await this.client.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "merchant_quote_rules" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "scope" TEXT NOT NULL, "merchantKey" TEXT NOT NULL, "itemKey" TEXT NOT NULL, "keyword" TEXT NOT NULL)')
    await this.client.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "merchant_quote_rules_scope_merchantKey_itemKey_keyword_key" ON "merchant_quote_rules" ("scope", "merchantKey", "itemKey", "keyword")')
  }

  private scope(value: unknown) {
    if (typeof value !== 'string' || !value.trim() || value.length > 80) throw new Error('无效的服务器名称')
    return value.trim()
  }

  async confirm(input: unknown) {
    const data = validateQuoteConfirmation(input)
    const item = (await this.client.price.findMany()).find(item => quoteItemKey(item) === data.itemKey)
    if (!item) throw new Error('物品不在当前物价表中，请刷新后重试')
    const merchantKey = merchantIdentity(data.merchant, data.gameId)
    const day = quoteDay(data.observedAt)
    return this.client.$transaction(async tx => {
      const unique = { scope: data.scope, merchantKey, itemKey: data.itemKey, day }
      const existing = await tx.merchantQuote.findUnique({ where: { scope_merchantKey_itemKey_day: unique } })
      const quote = await tx.merchantQuote.upsert({
        where: { scope_merchantKey_itemKey_day: unique }, update: {},
        create: { ...unique, itemName: item.name, itemType: item.type, merchant: data.merchant, gameId: data.gameId,
          price: data.price, rawText: data.rawText, observedAt: new Date(data.observedAt).toISOString(), createdAt: new Date().toISOString() },
      })
      if (data.saveRule) {
        const rule = { scope: data.scope, merchantKey, itemKey: data.itemKey, keyword: data.keyword }
        await tx.merchantQuoteRule.upsert({ where: { scope_merchantKey_itemKey_keyword: rule }, create: rule, update: {} })
      }
      return { quote, inserted: !existing }
    })
  }

  async snapshot(scopeInput: unknown) {
    const scope = this.scope(scopeInput)
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 29)
    const [rules, grouped, recordedToday, recentDays] = await Promise.all([
      this.client.merchantQuoteRule.findMany({ where: { scope }, orderBy: { id: 'asc' } }),
      this.client.merchantQuote.groupBy({ by: ['itemKey'], where: { scope }, _min: { price: true }, _max: { price: true }, _avg: { price: true }, _count: { _all: true } }),
      this.client.merchantQuote.findMany({ where: { scope, day: quoteDay() }, select: { merchantKey: true, itemKey: true, day: true } }),
      this.client.merchantQuote.groupBy({ by: ['itemKey', 'day'], where: { scope, day: { gte: quoteDay(cutoff) } }, orderBy: { day: 'desc' }, _avg: { price: true } }),
    ])
    return { rules, recordedToday, summaries: grouped.map(row => {
      const days = recentDays.filter(day => day.itemKey === row.itemKey).slice(0, 2)
      const latestAverage = days[0]?._avg.price ?? null
      const previous = days[1]?._avg.price ?? null
      return { itemKey: row.itemKey, minimum: row._min.price!, maximum: row._max.price!, average: row._avg.price!, count: row._count._all,
        latestAverage, changePercent: latestAverage !== null && previous ? (latestAverage - previous) / previous * 100 : null }
    }) }
  }

  async history(scopeInput: unknown, itemKey: unknown) {
    const scope = this.scope(scopeInput)
    if (typeof itemKey !== 'string' || itemKey.length > 300) throw new Error('无效的物品')
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 29)
    const where = { scope, itemKey }
    const [daily, records] = await Promise.all([
      this.client.merchantQuote.groupBy({ by: ['day'], where: { ...where, day: { gte: quoteDay(cutoff) } }, orderBy: { day: 'asc' },
        _min: { price: true }, _max: { price: true }, _avg: { price: true }, _count: { _all: true } }),
      this.client.merchantQuote.findMany({ where, orderBy: [{ day: 'desc' }, { id: 'desc' }], take: 200 }),
    ])
    return { daily: daily.map(row => ({ day: row.day, minimum: row._min.price!, maximum: row._max.price!, average: row._avg.price!, count: row._count._all })), records }
  }

  async deleteQuote(id: unknown) {
    if (!Number.isSafeInteger(id) || Number(id) <= 0) throw new Error('无效的报价 ID')
    return this.client.merchantQuote.delete({ where: { id: Number(id) } })
  }

  async deleteRule(id: unknown) {
    if (!Number.isSafeInteger(id) || Number(id) <= 0) throw new Error('无效的规则 ID')
    return this.client.merchantQuoteRule.delete({ where: { id: Number(id) } })
  }
}