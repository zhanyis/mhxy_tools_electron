export interface QuoteItem { name: string; type: string; price: number; image?: string }
export interface QuoteRule { id?: number; scope: string; merchantKey: string; itemKey: string; keyword: string }
export interface QuoteCandidate {
  itemKey: string; itemName: string; itemType: string; keyword: string
  merchant: string; gameId: string; price: number | null; rawText: string
  observedAt: string; warnings: string[]
}
export interface QuoteConfirmation {
  scope: string; itemKey: string; merchant: string; gameId: string
  price: number; rawText: string; observedAt: string; keyword: string; saveRule: boolean
}
export interface StoredQuote extends Omit<QuoteConfirmation, 'keyword' | 'saveRule'> {
  id: number; merchantKey: string; itemName: string; itemType: string; day: string; createdAt: string
}
export interface QuoteSummary { itemKey: string; minimum: number; maximum: number; average: number; count: number; latestAverage: number | null; changePercent: number | null }
export interface DailyQuote { day: string; average: number; minimum: number; maximum: number; count: number }

export const normalizeQuoteText = (text: string) => text.normalize('NFKC').replace(/【/g, '[').replace(/】/g, ']').trim()
export const quoteItemKey = (item: Pick<QuoteItem, 'type' | 'name'>) => JSON.stringify([item.type, item.name])
export const merchantIdentity = (merchant: string, gameId = '') => gameId.trim()
  ? `id:${gameId.trim()}` : `name:${normalizeQuoteText(merchant).replace(/\s/g, '').toLowerCase()}`
export function quoteDay(value: Date | string = new Date()) {
  const date = typeof value === 'string' ? new Date(value) : value
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function parseQuoteAmount(text: string): number | null {
  const match = normalizeQuoteText(text).match(/^(\d+(?:\.\d+)?)\s*(万|w|千|k|亿|m|两|个|元)?$/i)
  if (!match) return null
  const unit = (match[2] ?? '').toLowerCase()
  // 元 is real-world currency, not MHB; quantities are not unit prices.
  if (unit === '元' || unit === '个') return null
  const value = Number(match[1]) * ({ 万: 10000, w: 10000, 千: 1000, k: 1000, 亿: 100000000, m: 1000000 }[unit] ?? 1)
  return Number.isSafeInteger(value) && value > 0 && value <= 2147483647 ? value : null
}

function speaker(text: string) {
  const withoutChannel = text.replace(/^\[(?:世界|传音|当前|交易|帮派|队伍|私聊)\]\s*/, '')
  const bracket = withoutChannel.match(/^\[([^\]\n]{1,80})\]\s*[:：]?\s*/)
  if (bracket) {
    const identity = bracket[1].match(/^(.*?)\s*\((\d{4,12})\)\s*$/)
    return { merchant: (identity?.[1] ?? bracket[1]).trim(), gameId: identity?.[2] ?? '', body: withoutChannel.slice(bracket[0].length) }
  }
  const id = withoutChannel.match(/^(.{1,40}?)\s*[([]\s*(\d{4,12})\s*[)\]]\s*[:：]?\s*/)
  if (id) return { merchant: id[1].trim(), gameId: id[2], body: withoutChannel.slice(id[0].length) }
  const named = withoutChannel.match(/^([^:：\n]{1,40})[:：]\s*/)
  if (named) return { merchant: named[1].trim(), gameId: '', body: withoutChannel.slice(named[0].length) }
  return { merchant: '', gameId: '', body: withoutChannel }
}

/** Conservative local parsing: no fuzzy substitutions, no guessed prices, no automatic writes. */
export function extractQuoteCandidates(text: string, items: QuoteItem[], rules: QuoteRule[] = [], scope = '默认', observedAt = new Date().toISOString()) {
  const result: QuoteCandidate[] = []
  const lines = normalizeQuoteText(text).split(/\r?\n/).filter(line => line.trim())
  // Join only continuation lines; a new speaker/channel always begins a new shout.
  const messages: string[] = []
  for (const line of lines) {
    if (messages.length && !speaker(line).merchant && !/^\[/.test(line) && (!/(?:收购|求购|回收|收)/.test(line) || /^\s*\d/.test(line))) {
      messages[messages.length - 1] += ` ${line.trim()}`
    } else messages.push(line.trim())
  }
  for (const rawText of messages) {
    // System loot announcements must never become market quotes, even if they name catalog items.
    if (/(?:鬼谷道[士土]|降妖伏魔|降妖优魔|服务器.*竞拍|从.{0,40}手中接过|信手带走)/.test(rawText)) continue
    const { merchant, gameId, body } = speaker(rawText)
    if (!/(?:收购|求购|回收|收)/.test(body)) continue
    const identity = merchantIdentity(merchant, gameId)
    const hits: { item: QuoteItem; keyword: string; start: number; end: number }[] = []
    for (const item of items) {
      const keywords = [item.name, ...rules.filter(rule => rule.scope === scope && rule.merchantKey === identity && rule.itemKey === quoteItemKey(item)).map(rule => rule.keyword)]
      for (const keyword of [...new Set(keywords)].sort((a, b) => b.length - a.length)) {
        if (!keyword) continue
        let start = body.indexOf(keyword)
        while (start !== -1) {
          hits.push({ item, keyword, start, end: start + keyword.length })
          start = body.indexOf(keyword, start + keyword.length)
        }
      }
    }
    // Prefer a longer exact name (e.g. 高级魔兽要诀 rather than 魔兽要诀).
    const unique = hits.filter(hit => !hits.some(other => other !== hit && other.start <= hit.start && other.end >= hit.end &&
      (other.keyword.length > hit.keyword.length || (other.start === hit.start && other.end === hit.end && quoteItemKey(other.item) !== quoteItemKey(hit.item)))))
      .sort((a, b) => a.start - b.start)
    for (let i = 0; i < unique.length; i++) {
      const hit = unique[i]
      const intents = [...body.slice(0, hit.start).matchAll(/收购|求购|回收|收|出售|卖出|卖|出/g)]
      if (intents.length && /^(?:出售|卖出|卖|出)$/.test(intents.at(-1)![0])) continue
      const suffix = body.slice(hit.end, unique[i + 1]?.start ?? body.length)
      const previousEnd = unique[i - 1]?.end ?? 0
      const prefix = body.slice(previousEnd, hit.start)
      const after = suffix.match(/^[\s:：=,，]*?(\d+(?:\.\d+)?\s*(?:万|w|千|k|亿|m|两|元|个)?)/i)
      // Price-before-name is accepted only at the beginning of a quote, avoiding reuse of another item's price.
      const before = i === 0 ? prefix.match(/(\d+(?:\.\d+)?\s*(?:万|w|千|k|亿|m|两|元|个)?)\s*(?:收购|求购|回收|收)?\s*$/i) : null
      const token = after?.[1] ?? before?.[1]
      let price = token ? parseQuoteAmount(token) : null
      const warnings: string[] = []
      if (!merchant) warnings.push('未识别商人，请补填昵称或游戏 ID')
      else if (!gameId) warnings.push('无游戏 ID，按昵称去重；同名或 OCR 错字需人工核对')
      if (!price) warnings.push('未找到明确单价，请核对原文并填写 MHB 单价')
      if (/\d\s*(?:个|组|件|颗)/.test(prefix) || /\d\s*(?:个|组|件|颗).*\d/.test(suffix) || /\d+(?:\.\d+)?\s*(?:万|w|千|k)?\s*(?:[-~至到]|\/)/i.test(suffix)) {
        price = null; warnings.push('可能是批量价、价格区间或多档报价，不能直接作为单价')
      }
      if (price && hit.item.price > 0 && (price > hit.item.price * 5 || price < hit.item.price / 5)) warnings.push('与当前设定物价相差较大，请核对单位和数字')
      result.push({ itemKey: quoteItemKey(hit.item), itemName: hit.item.name, itemType: hit.item.type, keyword: hit.keyword,
        merchant, gameId, price, rawText, observedAt, warnings })
    }
  }
  return result
}

export function validateQuoteConfirmation(input: unknown): QuoteConfirmation {
  if (!input || typeof input !== 'object') throw new Error('无效的报价数据')
  const value = input as Record<string, unknown>
  const limits: Record<string, number> = { scope: 80, itemKey: 300, merchant: 80, gameId: 12, rawText: 4000, observedAt: 40, keyword: 80 }
  for (const [key, max] of Object.entries(limits)) {
    if (typeof value[key] !== 'string' || (value[key] as string).length > max) throw new Error(`无效的字段：${key}`)
  }
  const data = { ...value } as unknown as QuoteConfirmation
  data.scope = data.scope.trim(); data.merchant = normalizeQuoteText(data.merchant); data.gameId = data.gameId.trim(); data.keyword = normalizeQuoteText(data.keyword)
  if (!data.scope || !data.merchant || !data.rawText.trim()) throw new Error('请填写服务器、商人及喊话原文')
  if (data.gameId && !/^\d{4,12}$/.test(data.gameId)) throw new Error('游戏 ID 应为 4～12 位数字')
  if (!Number.isSafeInteger(data.price) || data.price <= 0 || data.price > 2147483647) throw new Error('请填写有效的整数 MHB 单价')
  const time = Date.parse(data.observedAt)
  if (!Number.isFinite(time) || time > Date.now() + 300000) throw new Error('无效的识别时间')
  if (typeof data.saveRule !== 'boolean') throw new Error('无效的规则选项')
  if (data.saveRule && (!data.keyword || /^\d+$/.test(data.keyword))) throw new Error('规则关键词不能为空或只有数字')
  if (data.saveRule && !normalizeQuoteText(data.rawText).includes(data.keyword)) throw new Error('规则关键词必须出现在喊话原文中')
  return data
}

export function buildQuoteTrend(daily: DailyQuote[], now = new Date()) {
  const byDay = new Map(daily.map(row => [row.day, row]))
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(now); date.setDate(date.getDate() - (29 - index))
    const day = quoteDay(date)
    return { day, average: byDay.get(day)?.average ?? null, minimum: byDay.get(day)?.minimum ?? null, maximum: byDay.get(day)?.maximum ?? null }
  })
}

/** Automatic capture is precision-first: no missing identity/price, no ambiguous
 * quantity/range, no single-character catalog substring, no large unit outliers. */
export function extractPreciseQuoteCandidates(text: string, items: QuoteItem[], rules: QuoteRule[] = [], scope = '默认', observedAt = new Date().toISOString()) {
  const game = extractGameQuoteCandidates(text, items, rules, scope, observedAt)
  const basic = text.split(/\r?\n/).flatMap(line => extractQuoteCandidates(line, items, rules, scope, observedAt))
    .filter(candidate => candidate.merchant && candidate.keyword.length >= 2 && candidate.price !== null &&
      candidate.warnings.every(warning => warning.startsWith('无游戏 ID')))
    .filter(candidate => !game.some(row => row.itemKey === candidate.itemKey && row.merchant === candidate.merchant && row.rawText.includes(candidate.rawText)))
  return [...game, ...basic]
}

// Explicit game vocabulary, not fuzzy OCR correction. Only catalog items may be quoted.
export const gameAliases: Record<string, string[]> = {
  特赦令牌: ['牌子'], 摇钱树树苗: ['摇钱树苗'], 高级魔兽要诀: ['垃圾高兽', '垃圾高兽决'],
  高级偷袭: ['高偷'], 高级必杀: ['高必'], 高级连击: ['高连'], 高级吸血: ['高吸'],
  高级夜战: ['高夜'], 高级神佑复生: ['高神'], 高级魔之心: ['高魔'],
  高级法术波动: ['高波'], 高级法术暴击: ['高爆'], 高级敏捷: ['高敏'],
  高级防御: ['高防'], 高级强力: ['高强'], 高级驱鬼: ['高驱'], 高级幸运: ['高幸'],
  高级感知: ['高感'], 高级隐身: ['高隐'], 催心浪: ['催心'],
}

/** Per-frame grouping: never carry a merchant or price across OCR frames, channels,
 * system announcements, or rejected OCR lines. Bare amounts use 万 only in this explicit vocabulary. */
export function extractGameQuoteCandidates(text: string, items: QuoteItem[], rules: QuoteRule[] = [], scope = '默认', observedAt = new Date().toISOString()) {
  const messages: string[] = []
  for (const raw of normalizeQuoteText(text).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (/^\[|鬼谷道|副本|成功购得|获得了|手中接过|信手带走|自己的口袋/.test(line)) messages.push(line)
    else if (messages.length) messages[messages.length - 1] += ` ${line}`
    else messages.push(line)
  }
  const result: QuoteCandidate[] = []
  for (const rawText of messages) {
    if (/识别不清晰|鬼谷道|副本|成功购得|获得了|手中接过|信手带走|自己的口袋/.test(rawText)) continue
    const who = speaker(rawText)
    const hits: { item: QuoteItem; keyword: string; start: number; end: number; high: boolean }[] = []
    for (const item of items) {
      const aliases = [...(gameAliases[item.name] ?? []),
        ...rules.filter(rule => rule.scope === scope && rule.itemKey === quoteItemKey(item) && rule.merchantKey === merchantIdentity(who.merchant, who.gameId)).map(rule => rule.keyword)]
      // Explicit full names of advanced skill books participate in the same 万-price list.
      if (item.name.startsWith('高级') && item.type.includes('兽')) aliases.push(item.name)
      for (const keyword of new Set(aliases)) {
        if (keyword.length < 2) continue
        for (let start = who.body.indexOf(keyword); start >= 0; start = who.body.indexOf(keyword, start + keyword.length)) {
          hits.push({ item, keyword, start, end: start + keyword.length, high: keyword.startsWith('高') && item.name.startsWith('高级') })
        }
      }
    }
    const unique = hits.filter(hit => !hits.some(other => other !== hit && other.start <= hit.start && other.end >= hit.end &&
      (other.keyword.length > hit.keyword.length || (other.start === hit.start && other.end === hit.end && quoteItemKey(other.item) !== quoteItemKey(hit.item)))))
      .sort((a, b) => a.start - b.start)
    // A high-skill price list can omit 收. It is a market quote, but its direction must be confirmed.
    const hasBuy = /收购|求购|回收|收/.test(who.body)
    const highList = unique.filter(hit => hit.high).length >= 2
    if (!hasBuy && !highList) continue
    if (/出售|卖出|卖|不还价/.test(who.body)) continue
    for (let i = 0; i < unique.length; i++) {
      const hit = unique[i]
      const tail = who.body.slice(hit.end, unique[i + 1]?.start ?? who.body.length)
      const beforeText = who.body.slice(unique[i - 1]?.end ?? 0, hit.start)
      // No removal of d/V/SE or guessed digit substitution. Corrupted tokens are rejected individually.
      const after = tail.match(/^[\s:=,]*([0-9]+(?:\.[0-9]+)?\s*(?:万|w|千|k|亿|两)?)(?=$|\s|[\u3400-\u9fff,，。;；])/i)
      const before = beforeText.match(/(?:^|[\s,，;；])([0-9]+(?:\.[0-9]+)?\s*(?:万|w|千|k|亿|两)?)\s*(?:收购|求购|回收|收)\s*$/i)
      const token = after?.[1] ?? before?.[1]
      if (!token || /\d\s*(?:个|组|件|颗)/.test(beforeText + tail) || /^\s*[\d.]+\s*(?:元|个|组|件|颗)/.test(tail) || /^\s*[\d.]+\s*(?:万|w)?\s*[-~至到/]/i.test(tail)) continue
      const explicitUnit = /万|w|千|k|亿|两/i.test(token)
      const price = parseQuoteAmount(explicitUnit ? token : `${token.trim()}万`)
      if (!price) continue
      const warnings = ['游戏简称报价，确认时请核对物品和数字']
      if (!explicitUnit) warnings.push('按交易喊话规则：省略单位的报价按万 MHB 解析')
      if (!who.merchant) warnings.push('缺少商人昵称 / ID，必须补全身份后才能确认')
      else if (!who.gameId) warnings.push('无游戏 ID，按昵称去重；请核对昵称')
      if (!hasBuy) warnings.push('技能价格清单未写收购方向，请先核对是否为收购价')
      // Default 100 is a placeholder in this catalog, not a reliable market reference.
      if (hit.item.price > 100 && (price > hit.item.price * 5 || price < hit.item.price / 5)) warnings.push('与设定价格差异较大，请核对单位')
      result.push({ itemKey: quoteItemKey(hit.item), itemName: hit.item.name, itemType: hit.item.type, keyword: hit.keyword,
        merchant: who.merchant, gameId: who.gameId, price, rawText, observedAt, warnings })
    }
  }
  return result
}