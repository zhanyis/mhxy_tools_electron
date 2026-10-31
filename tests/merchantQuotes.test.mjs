import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import ts from 'typescript'

const url = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const transpile = code => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const utilityUrl = url(transpile(readFileSync(new URL('../src/utils/merchantQuotes.ts', import.meta.url), 'utf8')))
const { extractQuoteCandidates, extractPreciseQuoteCandidates, parseQuoteAmount, quoteItemKey, merchantIdentity, quoteDay, buildQuoteTrend, validateQuoteConfirmation } = await import(utilityUrl)
const repositoryCode = readFileSync(new URL('../electron/db/merchantQuotes.ts', import.meta.url), 'utf8')
  .replace(/from ['"]\.\.\/\.\.\/src\/utils\/merchantQuotes['"]/, `from ${JSON.stringify(utilityUrl)}`)
const { MerchantQuoteRepository } = await import(url(transpile(repositoryCode)))
const items = [
  { name: '金刚石', type: '五宝', price: 800000 },
  { name: '定魂珠', type: '五宝', price: 1200000 },
  { name: '红玛瑙', type: '宝石', price: 80000 },
  { name: '魔兽要诀', type: '兽决', price: 500000 },
  { name: '高级魔兽要诀', type: '兽决', price: 5000000 },
]

test('extracts exact catalog items and explicit prices with speaker IDs', () => {
  const candidates = extractQuoteCandidates('【世界】商人甲（123456）：收金刚石 80w、定魂珠 120万', items)
  assert.equal(candidates.length, 2)
  assert.equal(candidates[0].merchant, '商人甲')
  assert.equal(candidates[0].gameId, '123456')
  assert.equal(candidates[0].price, 800000)
  assert.equal(candidates[1].price, 1200000)
  assert.deepEqual(candidates[0].warnings, [])
})

test('system announcements from the supplied sample do not create market quotes', () => {
  const sample = `L_ | (降妖优魔)流年从鬼谷道士的手中接过[龙鳞]，依依不舍地
[一] (降装估证)从鬼谷道土的手中接过[红玛瑙]，心想道人你一定在下一盘很大的棋子。
[世界]系统:服务器收购竞拍说明，金刚石80万
[世界]商人甲(123456):收金刚石80万`
  assert.equal(extractQuoteCandidates(sample, items).length, 1)
  assert.equal(extractQuoteCandidates('[世界]商人甲:出售金刚石80w', items).length, 0)
})

test('supports named merchants, multiline shouts and price-before-name', () => {
  const quote = extractQuoteCandidates('[世界]商人甲:收金刚石\n80万，长期收购', items)[0]
  assert.equal(quote.price, 800000)
  assert.ok(quote.warnings.some(value => value.includes('无游戏 ID')))
  assert.equal(extractQuoteCandidates('商人甲(123456):80万收金刚石', items)[0].price, 800000)
  const unknown = extractQuoteCandidates('收金刚石80万', items)[0]
  assert.equal(unknown.merchant, '')
  assert.ok(unknown.warnings.some(value => value.includes('未识别商人')))
})

test('saved aliases are scoped to the merchant and server, not fuzzy invented mappings', () => {
  const rules = [{ scope: '测试区', merchantKey: 'id:123456', itemKey: quoteItemKey(items[2]), keyword: '红玛瑞' }]
  assert.equal(extractQuoteCandidates('商人甲(123456):收红玛瑞8w', items, [], '测试区').length, 0)
  const candidate = extractQuoteCandidates('商人甲(123456):收红玛瑞8w', items, rules, '测试区')[0]
  assert.equal(candidate.itemName, '红玛瑙')
  assert.equal(candidate.price, 80000)
  assert.equal(extractQuoteCandidates('商人乙(654321):收红玛瑞8w', items, rules, '测试区').length, 0)
  assert.equal(extractQuoteCandidates('商人甲(123456):收红玛瑞8w', items, rules, '其他区').length, 0)
})

test('does not infer absent prices, sold items, batch prices, real-world currency or ranges', () => {
  assert.equal(extractQuoteCandidates('商人甲:收金刚石，价格私聊', items)[0].price, null)
  assert.equal(extractQuoteCandidates('商人甲:收金刚石80元', items)[0].price, null)
  assert.equal(extractQuoteCandidates('商人甲:收10个金刚石80万', items)[0].price, null)
  assert.equal(extractQuoteCandidates('商人甲:收金刚石80万-90万', items)[0].price, null)
  const mixed = extractQuoteCandidates('商人甲:收金刚石80万，出售定魂珠120万', items)
  assert.equal(mixed.length, 1)
  assert.equal(mixed[0].itemName, '金刚石')
  const repeated = extractQuoteCandidates('商人甲:出售金刚石100万，收金刚石80万', items)
  assert.equal(repeated.length, 1)
  assert.equal(repeated[0].price, 800000)
  const higher = extractQuoteCandidates('商人甲:收高级魔兽要诀500万', items)
  assert.equal(higher.length, 1)
  assert.equal(higher[0].itemName, '高级魔兽要诀')
})

test('amounts reject invalid numbers, quantities and overflow; item and merchant identity are stable', () => {
  for (const [text, expected] of [['80w', 800000], ['0.8万', 8000], ['８０万', 800000], ['8千', 8000], ['800000', 800000], ['0', null], ['80元', null], ['10个', null], ['0.1', null], ['99999999999', null]]) {
    assert.equal(parseQuoteAmount(text), expected, text)
  }
  assert.equal(merchantIdentity('商 人 甲'), merchantIdentity('商人甲'))
  assert.equal(merchantIdentity('改名', '123456'), 'id:123456')
  assert.notEqual(quoteItemKey({ name: '同名', type: '类型1' }), quoteItemKey({ name: '同名', type: '类型2' }))
})

test('trend keeps missing days empty rather than inventing daily prices', () => {
  const trend = buildQuoteTrend([{ day: '2026-10-30', average: 100, minimum: 80, maximum: 120, count: 2 }], new Date(2026, 9, 31, 12))
  assert.equal(trend.length, 30)
  assert.equal(trend.at(-2).average, 100)
  assert.equal(trend.at(-1).average, null)
  assert.equal(trend.at(-1).day, '2026-10-31')
})

test('database persists rules, deduplicates by server/merchant/item/day and recomputes statistics', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'mhxy-quotes-'))
  const client = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, 'test.sqlite').replace(/\\/g, '/')}` } } })
  const repository = new MerchantQuoteRepository(client)
  try {
    await client.$executeRawUnsafe('CREATE TABLE "prices" ("id" INTEGER NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "price" INTEGER NOT NULL, "type" TEXT NOT NULL, "image" TEXT NOT NULL)')
    await client.price.createMany({ data: items.map((item, index) => ({ ...item, id: index + 1, image: '' })) })
    await repository.init(); await repository.init()
    const now = new Date(); const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
    const input = { scope: '测试区', itemKey: quoteItemKey(items[0]), merchant: '商人甲', gameId: '123456', price: 800000,
      rawText: '商人甲(123456):收金刚石80w', observedAt: now.toISOString(), keyword: '金刚石', saveRule: true }
    assert.equal((await repository.confirm(input)).inserted, true)
    const duplicate = await repository.confirm({ ...input, merchant: '新昵称', price: 900000 })
    assert.equal(duplicate.inserted, false)
    assert.equal(duplicate.quote.price, 800000, 'a repeated shout cannot overwrite the first confirmed quote')
    assert.equal((await repository.confirm({ ...input, price: 600000, observedAt: yesterday.toISOString() })).inserted, true)
    assert.equal((await repository.confirm({ ...input, gameId: '654321', price: 1000000, saveRule: false })).inserted, true)
    assert.equal((await repository.confirm({ ...input, scope: '其他区', price: 1200000 })).inserted, true)
    let snapshot = await repository.snapshot('测试区')
    assert.equal(snapshot.rules.length, 1)
    assert.equal(snapshot.recordedToday.length, 2)
    assert.equal(snapshot.summaries[0].count, 3)
    assert.equal(snapshot.summaries[0].minimum, 600000)
    assert.equal(snapshot.summaries[0].maximum, 1000000)
    assert.equal(snapshot.summaries[0].latestAverage, 900000)
    assert.equal(snapshot.summaries[0].changePercent, 50)
    const history = await repository.history('测试区', input.itemKey)
    assert.equal(history.daily.length, 2)
    assert.equal(history.daily.at(-1).day, quoteDay(now))
    assert.equal(history.daily.at(-1).average, 900000)
    assert.equal(history.daily.at(-1).count, 2)
    assert.equal((await client.price.findUnique({ where: { id: 1 } })).price, 800000, 'market quotes must not alter base prices')
    const high = history.records.find(row => row.price === 1000000)
    await repository.deleteQuote(high.id)
    snapshot = await repository.snapshot('测试区')
    assert.equal(snapshot.summaries[0].maximum, 800000)
    await repository.deleteRule(snapshot.rules[0].id)
    assert.equal((await repository.history('测试区', input.itemKey)).records.length, 2)
    await assert.rejects(repository.confirm({ ...input, itemKey: 'unknown' }), /物品不在/)
    assert.throws(() => validateQuoteConfirmation({ ...input, keyword: '胡乱匹配' }), /关键词必须/)
    await assert.rejects(repository.confirm({ ...input, price: -1 }), /单价/)
  } finally { await client.$disconnect(); await rm(directory, { recursive: true, force: true }) }
})

test('automatic precision mode excludes incomplete shouts, ambiguous units and cross-line guesses', () => {
  assert.equal(extractPreciseQuoteCandidates('商人甲(123456):收金刚石80万', items).length, 1)
  assert.equal(extractPreciseQuoteCandidates('收金刚石80万', items).length, 0)
  assert.equal(extractPreciseQuoteCandidates('商人甲:收金刚石，价格私聊', items).length, 0)
  assert.equal(extractPreciseQuoteCandidates('商人甲:收金刚石80万-90万', items).length, 0)
  assert.equal(extractPreciseQuoteCandidates('商人甲:收金刚石\n80万', items).length, 0)
  assert.equal(extractPreciseQuoteCandidates('商人甲:收金刚石80000000', items).length, 0)
  assert.equal(extractPreciseQuoteCandidates('商人甲:收金刚石80万', [...items, { name: '金', type: '如意丹', price: 100 }]).length, 1)
})

test('real game high-skill shorthand list uses 万, joins same-frame continuations and rejects corrupted digits', () => {
  const catalog = ['高级偷袭', '高级必杀', '高级连击', '高级吸血', '高级夜战', '高级神佑复生', '高级法术波动']
    .map(name => ({ name, type: '高级兽决', price: 100 }))
  const raw = '[世界] 的     高偷4330 高必d4320 高连4050 高吸1910 高夜2270 高神\n1460 高波1570 高爆1700 SE1660'
  const quotes = extractPreciseQuoteCandidates(raw, catalog)
  assert.equal(quotes.find(row => row.itemName === '高级偷袭').price, 43300000)
  assert.equal(quotes.find(row => row.itemName === '高级连击').price, 40500000)
  assert.equal(quotes.find(row => row.itemName === '高级神佑复生').price, 14600000)
  assert.equal(quotes.some(row => row.itemName === '高级必杀'), false, 'd4320 must not be silently corrected')
  assert.ok(quotes.every(row => !row.merchant && row.warnings.some(warning => warning.includes('缺少商人'))))
  assert.ok(quotes.every(row => row.warnings.some(warning => warning.includes('收购方向'))))
  const clear = extractPreciseQuoteCandidates('[世界] [商人甲(123456)] 高偷4330 高必4320 高连4050', catalog)
  assert.equal(clear.find(row => row.itemName === '高级必杀').price, 43200000)
  assert.ok(clear.every(row => row.merchant === '商人甲' && row.gameId === '123456'))
  assert.equal(extractPreciseQuoteCandidates('[世界] [商人甲] 出售高偷4330 高必4320', catalog).length, 0)
})

test('牌子 and price-before-item in bracketed game shouts use explicit trade units', () => {
  const catalog = [{ name: '特赦令牌', type: '五宝', price: 3770000 }, { name: '摇钱树树苗', type: '种子', price: 450000 }]
  const quote = extractPreciseQuoteCandidates('[终究还是路人]335收牌子', catalog)[0]
  assert.equal(quote.merchant, '终究还是路人')
  assert.equal(quote.itemName, '特赦令牌')
  assert.equal(quote.price, 3350000)
  assert.equal(quote.keyword, '牌子')
  assert.ok(quote.warnings.some(warning => warning.includes('按万')))
  assert.equal(extractPreciseQuoteCandidates('[世界] [商人甲]335w收牌子', catalog)[0].price, 3350000)
  assert.equal(extractPreciseQuoteCandidates('[商人甲]35W收摇钱树苗', catalog)[0].price, 350000)
  assert.equal(extractPreciseQuoteCandidates('[商人甲]335V收牌子', catalog).length, 0)
  assert.equal(extractPreciseQuoteCandidates('[商人甲]收牌子335元', catalog).length, 0)
})

test('frame barriers, channels and unconfigured skills never inherit another merchant or generic high-book item', () => {
  const catalog = [{ name: '高级偷袭', type: '高级兽决', price: 100 }, { name: '高级必杀', type: '高级兽决', price: 100 }, { name: '高级魔兽要诀', type: '其他', price: 100 }]
  const quotes = extractPreciseQuoteCandidates('[世界] [甲]收高偷4330\n[识别不清晰]\n高必4320\n[世界] [乙]收高必4000', catalog)
  assert.equal(quotes.find(row => row.itemName === '高级必杀').merchant, '乙')
  assert.equal(quotes.some(row => row.itemName === '高级魔兽要诀'), false)
  assert.equal(extractPreciseQuoteCandidates('[甲]收高爆1700', catalog).length, 0)
})