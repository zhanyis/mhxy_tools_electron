import type { PrismaClient } from '@prisma/client'
import { createHash } from 'node:crypto'
import { quoteDay, quoteItemKey } from '../../src/utils/merchantQuotes'
import { defaultParsingRules, shoutTextKey, validateParsingRule, validateShoutConfirmation, type ParsingRule } from '../../src/utils/shoutParsing'

export class ShoutQuoteRepository {
  constructor(private readonly client: PrismaClient) {}
  private scope(input: unknown) {
    if (typeof input !== 'string' || !input.trim() || input.length > 80) throw new Error('无效服务器')
    return input.trim()
  }
  private hash(text: string) { return createHash('sha256').update(shoutTextKey(text)).digest('hex') }

  async init() {
    await this.client.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "shout_records" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "scope" TEXT NOT NULL, "rawKey" TEXT NOT NULL, "rawText" TEXT NOT NULL, "day" TEXT NOT NULL, "observedAt" TEXT NOT NULL, "createdAt" TEXT NOT NULL)')
    await this.client.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "shout_records_scope_rawKey_day_key" ON "shout_records" ("scope", "rawKey", "day")')
    await this.client.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "shout_quotes" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "shoutId" INTEGER NOT NULL, "scope" TEXT NOT NULL, "day" TEXT NOT NULL, "itemKey" TEXT NOT NULL, "itemName" TEXT NOT NULL, "itemType" TEXT NOT NULL, "price" INTEGER NOT NULL)')
    await this.client.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "shout_quotes_shoutId_itemKey_key" ON "shout_quotes" ("shoutId", "itemKey")')
    await this.client.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "shout_quotes_scope_itemKey_day_idx" ON "shout_quotes" ("scope", "itemKey", "day")')
    await this.client.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "shout_parsing_rules" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "scope" TEXT NOT NULL, "config" TEXT NOT NULL)')
    await this.client.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "shout_migrations" ("key" TEXT NOT NULL PRIMARY KEY)')
    const old = await this.client.$queryRawUnsafe<{ name: string }[]>("SELECT name FROM sqlite_master WHERE type='table' AND name='merchant_quotes'")
    if (old.length && !await this.client.shoutMigration.findUnique({ where: { key: 'merchant-v1' } })) {
      // Preserve old prices/history but drop structured speaker metadata in the new tables.
      await this.client.$transaction(async tx => {
        const rows = await tx.merchantQuote.findMany({ orderBy: { id: 'asc' } })
        for (const row of rows) {
          const rawText = shoutTextKey(row.rawText)
          const unique = { scope: row.scope, rawKey: this.hash(rawText), day: row.day }
          let shout = await tx.shoutRecord.upsert({ where: { scope_rawKey_day: unique }, update: {},
            create: { ...unique, rawText, observedAt: row.observedAt, createdAt: row.createdAt } })
          const previous = await tx.shoutQuote.findUnique({ where: { shoutId_itemKey: { shoutId: shout.id, itemKey: row.itemKey } } })
          if (previous && previous.price !== row.price) {
            // Historic conflicting samples stay visible; only new confirmations follow shout dedup.
            shout = await tx.shoutRecord.create({ data: { ...unique, rawKey: `${unique.rawKey}:legacy:${row.id}`, rawText, observedAt: row.observedAt, createdAt: row.createdAt } })
          }
          await tx.shoutQuote.upsert({ where: { shoutId_itemKey: { shoutId: shout.id, itemKey: row.itemKey } }, update: {},
            create: { shoutId: shout.id, scope: row.scope, day: row.day, itemKey: row.itemKey, itemName: row.itemName, itemType: row.itemType, price: row.price } })
        }
        await tx.shoutMigration.create({ data: { key: 'merchant-v1' } })
      }, { timeout: 60000 })
    }
  }

  private async ensureRules(scope: string) {
    const marker = `rules:${scope}`
    if (await this.client.shoutMigration.findUnique({ where: { key: marker } })) return
    const defaults = defaultParsingRules(await this.client.price.findMany(), scope)
    const legacyTable = await this.client.$queryRawUnsafe<{ name: string }[]>("SELECT name FROM sqlite_master WHERE type='table' AND name='merchant_quote_rules'")
    if (legacyTable.length) {
      const legacy = await this.client.merchantQuoteRule.findMany({ where: { scope } })
      for (const rule of legacy) {
        const target = defaults.find(config => config.itemKey === rule.itemKey)
        if (target && rule.keyword.length >= 2 && !target.aliases.includes(rule.keyword)) target.aliases.push(rule.keyword)
      }
    }
    await this.client.$transaction(async tx => {
      if (await tx.shoutMigration.findUnique({ where: { key: marker } })) return
      await tx.shoutParsingRule.createMany({ data: defaults.map(config => ({ scope, config: JSON.stringify(config) })) })
      await tx.shoutMigration.create({ data: { key: marker } })
    })
  }

  async saveRule(input: unknown) {
    const rule = validateParsingRule(input)
    const item = (await this.client.price.findMany()).find(item => quoteItemKey(item) === rule.itemKey)
    if (!item) throw new Error('规则物品不在当前物价表中')
    const { id, ...config } = rule
    if (!id && await this.client.shoutParsingRule.count({ where: { scope: rule.scope } }) >= 200) throw new Error('每个服务器最多200条解析规则，请先删除不需要的规则')
    const data = { scope: rule.scope, config: JSON.stringify(config) }
    const record = id ? await this.client.shoutParsingRule.update({ where: { id, scope: rule.scope }, data }) : await this.client.shoutParsingRule.create({ data })
    return { ...config, id: record.id }
  }

  async importRules(scopeInput: unknown, input: unknown) {
    const scope = this.scope(scopeInput)
    if (!Array.isArray(input) || input.length > 200) throw new Error('最多导入200条规则')
    if (await this.client.shoutParsingRule.count({ where: { scope } }) + input.length > 200) throw new Error('导入后不能超过200条规则，请先删除不需要的规则')
    const keys = new Set((await this.client.price.findMany()).map(quoteItemKey))
    const rules = input.map(value => { const rule = validateParsingRule({ ...value, scope, id: undefined }); if (!keys.has(rule.itemKey)) throw new Error(`规则物品不存在：${rule.name}`); return rule })
    // Atomic append. Invalid import cannot partially replace existing user rules.
    return this.client.shoutParsingRule.createMany({ data: rules.map(rule => ({ scope, config: JSON.stringify(rule) })) })
  }

  async confirm(input: unknown) {
    const data = validateShoutConfirmation(input)
    const items = new Map((await this.client.price.findMany()).map(item => [quoteItemKey(item), item]))
    if (data.quotes.some(quote => !items.has(quote.itemKey))) throw new Error('物品不在当前物价表中')
    const day = quoteDay(data.observedAt)
    const unique = { scope: data.scope, rawKey: this.hash(data.rawText), day }
    return this.client.$transaction(async tx => {
      const existing = await tx.shoutRecord.findUnique({ where: { scope_rawKey_day: unique } })
      if (existing) return { inserted: false, rawText: existing.rawText, day, count: 0 }
      const shout = await tx.shoutRecord.create({ data: { ...unique, rawText: data.rawText, observedAt: data.observedAt, createdAt: new Date().toISOString() } })
      await tx.shoutQuote.createMany({ data: data.quotes.map(quote => {
        const item = items.get(quote.itemKey)!
        return { shoutId: shout.id, scope: data.scope, day, itemKey: quote.itemKey, itemName: item.name, itemType: item.type, price: quote.price }
      }) })
      return { inserted: true, rawText: shout.rawText, day, count: data.quotes.length }
    })
  }

  async snapshot(scopeInput: unknown) {
    const scope = this.scope(scopeInput)
    await this.ensureRules(scope)
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 29)
    const [rules, grouped, recordedToday, recent] = await Promise.all([
      this.client.shoutParsingRule.findMany({ where: { scope }, orderBy: { id: 'asc' } }),
      this.client.shoutQuote.groupBy({ by: ['itemKey'], where: { scope }, _min: { price: true }, _max: { price: true }, _avg: { price: true }, _count: { _all: true } }),
      this.client.shoutRecord.findMany({ where: { scope, day: quoteDay() }, select: { rawText: true, day: true } }),
      this.client.shoutQuote.groupBy({ by: ['itemKey', 'day'], where: { scope, day: { gte: quoteDay(cutoff) } }, orderBy: { day: 'desc' }, _avg: { price: true } }),
    ])
    return { rules: rules.map(record => ({ ...JSON.parse(record.config), id: record.id } as ParsingRule)), recordedToday,
      summaries: grouped.map(row => {
        const days = recent.filter(day => day.itemKey === row.itemKey).slice(0, 2)
        const latestAverage = days[0]?._avg.price ?? null; const previous = days[1]?._avg.price ?? null
        return { itemKey: row.itemKey, minimum: row._min.price!, maximum: row._max.price!, average: row._avg.price!, count: row._count._all,
          latestAverage, changePercent: latestAverage !== null && previous ? (latestAverage - previous) / previous * 100 : null }
      }) }
  }

  async history(scopeInput: unknown, key: unknown) {
    const scope = this.scope(scopeInput)
    if (typeof key !== 'string' || key.length > 300) throw new Error('无效物品')
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 29)
    const where = { scope, itemKey: key }
    const [daily, quotes] = await Promise.all([
      this.client.shoutQuote.groupBy({ by: ['day'], where: { ...where, day: { gte: quoteDay(cutoff) } }, orderBy: { day: 'asc' }, _min: { price: true }, _max: { price: true }, _avg: { price: true }, _count: { _all: true } }),
      this.client.shoutQuote.findMany({ where, orderBy: [{ day: 'desc' }, { id: 'desc' }], take: 200 }),
    ])
    const shouts = new Map((await this.client.shoutRecord.findMany({ where: { id: { in: quotes.map(quote => quote.shoutId) } } })).map(row => [row.id, row]))
    return { daily: daily.map(row => ({ day: row.day, minimum: row._min.price!, maximum: row._max.price!, average: row._avg.price!, count: row._count._all })),
      records: quotes.map(quote => ({ ...quote, rawText: shouts.get(quote.shoutId)?.rawText ?? '', observedAt: shouts.get(quote.shoutId)?.observedAt ?? '' })) }
  }

  async deleteQuote(id: unknown) {
    if (!Number.isSafeInteger(id) || Number(id) <= 0) throw new Error('无效报价 ID')
    // Deleting one bad line preserves the shout dedup marker so other items are not duplicated.
    return this.client.shoutQuote.delete({ where: { id: Number(id) } })
  }
  async deleteRule(id: unknown, scopeInput: unknown, confirmed: unknown) {
    if (confirmed !== true) throw new Error('删除规则必须逐条人工确认')
    const scope = this.scope(scopeInput)
    if (!Number.isSafeInteger(id) || Number(id) <= 0) throw new Error('无效规则 ID')
    return this.client.shoutParsingRule.delete({ where: { id: Number(id), scope } })
  }
}