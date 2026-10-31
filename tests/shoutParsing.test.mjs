import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { PrismaClient } from '@prisma/client'
import ts from 'typescript'

const url = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const compile = code => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const utilityUrl = url(compile(readFileSync(new URL('../src/utils/merchantQuotes.ts', import.meta.url), 'utf8')))
const parserUrl = url(compile(readFileSync(new URL('../src/utils/shoutParsing.ts', import.meta.url), 'utf8')
  .replace("from './merchantQuotes'", `from ${JSON.stringify(utilityUrl)}`)
  .replace("from 're2js'", `from ${JSON.stringify(pathToFileURL(path.resolve('node_modules/re2js/build/index.js')).href)}`)))
const { quoteItemKey, quoteDay } = await import(utilityUrl)
const { buildShoutPreset, parseConfiguredShouts, defaultParsingRules, validateParsingRule, validateShoutConfirmation, shoutTextKey, compileShoutExpression } = await import(parserUrl)
const repositoryUrl = url(compile(readFileSync(new URL('../electron/db/shoutQuotes.ts', import.meta.url), 'utf8')
  .replace("from '../../src/utils/merchantQuotes'", `from ${JSON.stringify(utilityUrl)}`)
  .replace("from '../../src/utils/shoutParsing'", `from ${JSON.stringify(parserUrl)}`)))
const { ShoutQuoteRepository } = await import(repositoryUrl)
const items = [
  { name: '高级偷袭', type: '高级兽决', price: 100 },
  { name: '高级必杀', type: '高级兽决', price: 100 },
  { name: '特赦令牌', type: '五宝', price: 3500000 },
]
const defaults = defaultParsingRules(items, '测试区').map(rule => ({ ...rule, enabled: true }))
const parse = (text, rules = defaults) => parseConfiguredShouts(text, items, rules)
const custom = (expression, overrides = {}) => validateParsingRule({ ...defaults[2], mode: 'expression', expression, ...overrides })

test('configurable shorthand and units require no speaker data and preserve multiline quotes', () => {
  const result = parse('[世界] [不采集(123456)] 高偷4330 高必d4320\n高必4320')
  assert.deepEqual(result.map(row => [row.itemName, row.price]), [['高级偷袭', 43300000], ['高级必杀', 43200000]])
  assert.ok(result.every(row => !('merchant' in row) && !('gameId' in row) && !row.rawText.includes('不采集')))
  assert.equal(parse('[终究还是路人]335收牌子')[0].price, 3350000)
  assert.equal(parse('收牌子:335')[0].price, 3350000)
  const modified = defaults.map(rule => ({ ...rule, defaultUnit: '千' }))
  assert.equal(parse('收牌子335', modified)[0].price, 335000)
  assert.equal(parse('收牌子335万', modified)[0].price, 3350000)
  assert.equal(parse('收牌子335', defaults.map(rule => ({ ...rule, enabled: false }))).length, 0)
})

test('literal item aliases accept either price position and preserve safety options', () => {
  const dragon = { name: '龙鳞', type: '五宝', price: 100 }
  const rule = { ...defaultParsingRules([dragon], '测试区')[0], aliases: ['龙鳞', '鳞片'], enabled: true, defaultUnit: '万' }
  const run = (text, overrides = {}) => parseConfiguredShouts(text, [dragon], [{ ...rule, ...overrides }])
  for (const text of ['30龙鳞', '30收龙鳞', '龙鳞30', '30鳞片', '[交易]30龙鳞', '龙鳞：30收龙鳞', '30万龙鳞', '30w龙鳞']) {
    assert.equal(run(text).length, 1, text)
    assert.equal(run(text)[0].price, 300000, text)
  }
  assert.ok(run('30龙鳞')[0].warnings.some(warning => warning.includes('收购方向')))
  assert.equal(run('30龙鳞', { requireBuy: true }).length, 0)
  assert.equal(run('30收龙鳞', { requireBuy: true }).length, 1)
  assert.equal(run('30龙鳞', { enabled: false }).length, 0)
  assert.equal(run('30龙鳞', { defaultUnit: 'MHB' })[0].price, 30)
  for (const text of ['30', '30龙筋', '30V龙鳞', '30元龙鳞', '30.龙鳞', '30-31龙鳞', '30万-31万龙鳞', '30个龙鳞', '卖30龙鳞']) {
    assert.equal(run(text).length, 0, text)
  }
})

test('literal alias price positions work for every multi-character default item', async () => {
  const { default: catalog } = await import(url(compile(readFileSync(new URL('../electron/db/db.ts', import.meta.url), 'utf8'))))
  for (const item of catalog.price.filter(item => item.name.length >= 2)) {
    const rule = { ...defaultParsingRules([item], '默认')[0], enabled: true, defaultUnit: '万' }
    for (const text of [`30收${item.name}`, `30${/^\d/.test(item.name) ? ' ' : ''}${item.name}`, `${item.name}30`]) {
      const result = parseConfiguredShouts(text, [item], [rule])
      assert.equal(result.length, 1, text)
      assert.equal(result[0].price, 300000, text)
    }
    if (/^\d/.test(item.name)) assert.equal(parseConfiguredShouts(`30${item.name}`, [item], [rule]).length, 0)
  }
})

test('new rules default disabled and quick expressions support both price positions', () => {
  const disabled = defaultParsingRules(items, '新区')
  assert.ok(disabled.every(rule => !rule.enabled))
  assert.equal(parse('30收牌子 高偷30', disabled).length, 0)
  for (const preset of ['priceBefore', 'priceAfter']) {
    const template = buildShoutPreset(['牌子', '特赦令牌'], preset)
    const rule = custom(template.expression, { enabled: true, requireBuy: template.requireBuy })
    assert.equal(parse(template.example, [rule]).length, 3)
    assert.equal(parse('30收牌子', [rule])[0].price, 300000)
    assert.equal(parse('30牌子', [rule])[0].price, 300000)
    assert.equal(parse('牌子30', [rule])[0].price, 300000)
    assert.equal(parse('30收龙鳞', [rule]).length, 0)
    assert.equal(parse('30', [rule]).length, 0)
    assert.equal(parse(preset === 'priceBefore' ? '30万收牌子' : '牌子30万', [rule])[0].price, 300000)
    assert.equal(parse(preset === 'priceBefore' ? '30V收牌子' : '牌子30V', [rule]).length, 0)
    if (preset === 'priceAfter') assert.ok(parse('牌子30', [rule])[0].warnings.some(warning => warning.includes('收购方向')))
  }
  assert.ok(buildShoutPreset(['测试(物品)+'], 'priceAfter').expression.includes('测试\\(物品\\)\\+'))
  assert.throws(() => buildShoutPreset([], 'priceBefore'))
})

test('both quick buttons recognize both price positions for every multi-character default item', async () => {
  const { default: catalog } = await import(url(compile(readFileSync(new URL('../electron/db/db.ts', import.meta.url), 'utf8'))))
  for (const item of catalog.price.filter(item => item.name.length >= 2)) {
    for (const preset of ['priceBefore', 'priceAfter']) {
      const template = buildShoutPreset([item.name], preset)
      const rule = { ...defaultParsingRules([item], '默认')[0], mode: 'expression', expression: template.expression, requireBuy: template.requireBuy, enabled: true, defaultUnit: '万' }
      // Digit-leading names require a separator; 302级... is ambiguous between price 30 and 302.
      for (const text of [`30收${item.name}`, `30${/^\d/.test(item.name) ? ' ' : ''}${item.name}`, `${item.name}30`]) {
        const result = parseConfiguredShouts(text, [item], [rule])
        assert.equal(result.length, 1, `${preset}: ${text}`)
        assert.equal(result[0].itemName, item.name)
        assert.equal(result[0].price, 300000)
        if (!text.includes('收')) assert.ok(result[0].warnings.some(warning => warning.includes('收购方向')))
      }
      assert.equal(parseConfiguredShouts(`${item.name}：30收${item.name}`, [item], [rule])[0].price, 300000)
    }
  }
})

test('custom expressions support price-before-name and named units safely', () => {
  const rule = custom('(?<price>[0-9]+(?:\\.[0-9]+)?)(?<unit>万|w)?\\s*收牌子')
  assert.equal(parse('335收牌子', [rule])[0].price, 3350000)
  assert.equal(parse('3.5万收牌子', [rule])[0].price, 35000)
  const after = custom('收牌子\\s*[:=]?\\s*(?<price>[0-9]+(?:\\.[0-9]+)?)(?<unit>万|w)?')
  assert.equal(parse('收牌子=335万', [after])[0].price, 3350000)
  assert.equal(parse('收牌子=335千', [custom('收牌子=?(?<price>[0-9]+)')])[0].price, 335000)
  for (const raw of ['收牌子335V', '收牌子335元', '收牌子335-336', '收牌子335万-336万']) assert.equal(parse(raw, [after]).length, 0, raw)
  assert.throws(() => custom('牌子([0-9]+)'), /price/)
  assert.throws(() => custom('(?<price>[0-9]+'), /./)
  assert.throws(() => custom('(?<price>[0-9]+)\\1'), /./)
  assert.throws(() => custom('(?<price>.*)'), /空文本/)
  // Nested repetition runs in the safe engine, rather than native catastrophic backtracking.
  assert.equal(compileShoutExpression('(?<price>(a+)+)b').matcher('a'.repeat(20000)).find(), false)
})

test('conflicting rules, corrupted tokens, sales, quantities and system announcements are excluded', () => {
  for (const raw of ['收牌子335元', '收牌子335V', '收牌子335-336', '卖牌子335', '收10个牌子335', '[世界]系统收牌子335竞拍']) assert.equal(parse(raw).length, 0, raw)
  assert.equal(parse('收牌子335牌子336').length, 0)
  assert.deepEqual(parse('高偷4330 高必').map(row => row.itemName), ['高级偷袭'], 'a following alias cannot borrow the previous item price')
  assert.deepEqual(parse('高偷4330 高必d4320').map(row => row.itemName), ['高级偷袭'], 'a corrupted trailing price cannot fall back to the previous item price')
  assert.equal(parse('收牌子335', [...defaults, { ...defaults[2], defaultUnit: 'MHB' }]).length, 0)
  assert.equal(shoutTextKey('[世界] [甲] 收牌子 335'), shoutTextKey('[世界] [乙] 收牌子  335'))
  assert.throws(() => validateShoutConfirmation({ scope: '区', rawText: '收牌子335', observedAt: new Date().toISOString(), quotes: [{ itemKey: 'x', price: 1 }, { itemKey: 'x', price: 2 }] }), /重复/)
})

test('database atomically records a whole shout, deduplicates daily original text and persists configuration', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'shout-test-'))
  const client = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, 'test.sqlite')}` } } })
  try {
    await client.$executeRawUnsafe('CREATE TABLE prices (id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, price INTEGER NOT NULL, image TEXT NOT NULL)')
    for (let index = 0; index < items.length; index++) await client.price.create({ data: { ...items[index], id: index + 1, image: '' } })
    const repository = new ShoutQuoteRepository(client)
    await repository.init(); await repository.init()
    const snapshot = await repository.snapshot('测试区')
    assert.equal(snapshot.rules.length, 3)
    assert.ok(snapshot.rules.every(rule => !rule.enabled))
    const updated = await repository.saveRule({ ...snapshot.rules[2], name: '人工规则', aliases: ['牌子', '令牌'], defaultUnit: '千', enabled: true })
    assert.equal(updated.name, '人工规则')
    await repository.init()
    assert.equal((await repository.snapshot('测试区')).rules.find(rule => rule.id === updated.id).enabled, true, 'new disabled defaults never overwrite an existing enabled rule')
    await repository.importRules('测试区', [custom('(?<price>[0-9]+)收牌子')])
    await assert.rejects(repository.importRules('测试区', [defaults[0], { ...defaults[1], itemKey: '不存在' }]))
    assert.equal((await repository.snapshot('测试区')).rules.length, 4)
    const payload = { scope: '测试区', rawText: '[甲] 高偷4330 高必4320', observedAt: new Date().toISOString(), merchant: '不要存储', gameId: '123456',
      quotes: [{ itemKey: quoteItemKey(items[0]), price: 43300000 }, { itemKey: quoteItemKey(items[1]), price: 43200000 }] }
    assert.equal((await repository.confirm(payload)).count, 2)
    assert.equal((await repository.confirm({ ...payload, rawText: '[乙] 高偷4330 高必4320' })).inserted, false)
    assert.equal((await repository.confirm({ ...payload, rawText: '高偷4331 高必4320' })).inserted, true)
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
    assert.equal((await repository.confirm({ ...payload, observedAt: yesterday.toISOString() })).inserted, true)
    assert.equal((await repository.confirm({ ...payload, scope: '其他区' })).inserted, true)
    const history = await repository.history('测试区', quoteItemKey(items[0]))
    assert.equal(history.records.length, 3)
    assert.ok(history.records.every(row => !('merchant' in row) && !('gameId' in row)))
    assert.equal((await repository.snapshot('测试区')).recordedToday.length, 2)
    await repository.deleteQuote(history.records[0].id)
    assert.equal((await repository.confirm({ ...payload, rawText: '高偷4331 高必4320' })).inserted, false)
    const rulesBeforeDelete = (await repository.snapshot('测试区')).rules
    await assert.rejects(repository.deleteRule(updated.id, '测试区', false), /人工确认/)
    await assert.rejects(repository.deleteRule(updated.id, '测试区'), /人工确认/)
    await assert.rejects(repository.deleteRule(updated.id, '其他区', true))
    assert.deepEqual((await repository.snapshot('测试区')).rules, rulesBeforeDelete)
    await repository.deleteRule(updated.id, '测试区', true)
    const remaining = rulesBeforeDelete.filter(rule => rule.id !== updated.id)
    assert.deepEqual((await repository.snapshot('测试区')).rules, remaining)
    await repository.init()
    assert.deepEqual((await repository.snapshot('测试区')).rules, remaining, 'refresh and restart must neither clear rules nor restore a manually deleted rule')
    assert.equal((await client.price.findUnique({ where: { id: 1 } })).price, 100)
  } finally { await client.$disconnect(); await rm(directory, { recursive: true, force: true }) }
})

test('legacy quote history and aliases migrate once without clearing old data', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'shout-migration-'))
  const client = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, 'test.sqlite')}` } } })
  try {
    await client.$executeRawUnsafe('CREATE TABLE prices (id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, price INTEGER NOT NULL, image TEXT NOT NULL)')
    await client.price.create({ data: { ...items[2], id: 1, image: '' } })
    await client.$executeRawUnsafe('CREATE TABLE merchant_quotes (id INTEGER PRIMARY KEY, scope TEXT, itemKey TEXT, itemName TEXT, itemType TEXT, merchant TEXT, merchantKey TEXT, gameId TEXT, price INTEGER, rawText TEXT, observedAt TEXT, day TEXT, createdAt TEXT)')
    await client.$executeRawUnsafe('CREATE TABLE merchant_quote_rules (id INTEGER PRIMARY KEY, scope TEXT, merchantKey TEXT, itemKey TEXT, keyword TEXT)')
    await client.merchantQuote.create({ data: { scope: '测试区', itemKey: quoteItemKey(items[2]), itemName: items[2].name, itemType: items[2].type,
      merchant: '旧昵称', merchantKey: 'id:123456', gameId: '123456', price: 3350000, rawText: '[旧昵称]335收牌子', observedAt: new Date().toISOString(), day: quoteDay(), createdAt: new Date().toISOString() } })
    await client.merchantQuoteRule.create({ data: { scope: '测试区', merchantKey: 'id:123456', itemKey: quoteItemKey(items[2]), keyword: '赦令' } })
    const repository = new ShoutQuoteRepository(client)
    await repository.init(); await repository.init()
    const history = await repository.history('测试区', quoteItemKey(items[2]))
    assert.equal(history.records.length, 1)
    assert.equal(history.records[0].rawText, '335收牌子')
    assert.equal(await client.merchantQuote.count(), 1)
    assert.ok((await repository.snapshot('测试区')).rules[0].aliases.includes('赦令'))
  } finally { await client.$disconnect(); await rm(directory, { recursive: true, force: true }) }
})