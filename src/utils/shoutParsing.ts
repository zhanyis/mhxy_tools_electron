import { RE2JS } from 're2js'
import { gameAliases, normalizeQuoteText, parseQuoteAmount, quoteItemKey, type QuoteItem } from './merchantQuotes'

export type PriceUnit = 'MHB' | '万' | '千'
export interface ParsingRule {
  id?: number; scope: string; name: string; itemKey: string; aliases: string[]
  mode: 'aliases' | 'expression'; expression: string; defaultUnit: PriceUnit
  requireBuy: boolean; enabled: boolean
}
export interface ShoutCandidate {
  itemKey: string; itemName: string; itemType: string; keyword: string; ruleName: string
  price: number; rawText: string; observedAt: string; warnings: string[]
}
export interface ShoutConfirmation {
  scope: string; rawText: string; observedAt: string; quotes: { itemKey: string; price: number }[]
}
export const expressionHelp = 'RE2 表达式，不加 / /；必须使用命名捕获组 (?<price>...)，可选 (?<unit>万|w|千|k|两)。例如：(?:高偷|高级偷袭)\\s*(?<price>[0-9]+(?:\\.[0-9]+)?)(?<unit>万|w)?。不支持反向引用。'

// Remove chat metadata without extracting or persisting speaker identity.
export function shoutBody(text: string) {
  return normalizeQuoteText(text)
    .replace(/^\[(?:世界|传音|当前|交易|帮派|队伍|私聊)\]\s*/, '')
    .replace(/^\[[^\]\n]{1,100}\]\s*[:：]?\s*/, '')
    .replace(/^[^\n:：]{1,60}\(\d{4,12}\)\s*[:：]?\s*/, '').trim()
}
export const shoutTextKey = (text: string) => shoutBody(text).replace(/\s+/g, ' ').trim()
const systemText = /识别不清晰|鬼谷道|副本|成功购得|获得了|手中接过|信手带走|自己的口袋|竞拍/

export function splitShouts(text: string) {
  const messages: string[] = []
  let current = ''
  const flush = () => { if (current.trim()) messages.push(current.trim()); current = '' }
  for (const raw of normalizeQuoteText(text).slice(0, 50000).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (systemText.test(line)) { flush(); continue }
    if (/^\[|^[^:：\n]{1,60}(?:[:：]|\(\d{4,12}\))/.test(line)) flush()
    current += `${current ? ' ' : ''}${shoutBody(line)}`
    if (current.length > 4000) { current = ''; flush() }
  }
  flush()
  return messages
}

export function defaultParsingRules(items: QuoteItem[], scope: string): ParsingRule[] {
  return items.filter(item => item.name.length >= 2).map(item => ({
    scope, name: `${item.name}喊话`, itemKey: quoteItemKey(item), aliases: [item.name, ...(gameAliases[item.name] ?? [])],
    mode: 'aliases', expression: '', defaultUnit: gameAliases[item.name] || item.type.includes('高级兽') ? '万' : 'MHB',
    requireBuy: false, enabled: false,
  }))
}

export type ShoutPreset = 'priceBefore' | 'priceAfter'
/** Escape item names instead of interpreting aliases as executable regex syntax. */
export function buildShoutPreset(aliases: string[], preset: ShoutPreset) {
  const names = [...new Set(aliases.map(alias => normalizeQuoteText(alias)).filter(Boolean))]
  if (!names.length || names.some(alias => alias.length < 2)) throw new Error('请先选择物品并填写至少2字的名称或简称')
  const item = `(?:${names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`
  const price = '(?<price>[0-9]+(?:\\.[0-9]+)?)\\s*(?<unit>万|w|千|k|亿|两)?'
  // One price capture works in both positions. Parser requires either item capture,
  // so the optional suffix cannot turn an unrelated bare number into this item's quote.
  const expression = `(?:(?<itemBefore>${item})\\s*[:：=]?\\s*|(?:^|[\\s,，;；]))${price}(?:\\s*(?:收购|求购|回收|收)?\\s*(?<itemAfter>${item}))?`
  compileShoutExpression(expression)
  return { expression, requireBuy: false, example: `30收${names[0]}\n[交易]30${names[0]}\n[交易]${names[0]}30`, preferredExample: preset === 'priceBefore' ? `30收${names[0]}` : `${names[0]}30` }
}

const compiled = new Map<string, RE2JS>()
export function compileShoutExpression(source: string) {
  if (source.length > 500 || !source.trim()) throw new Error('表达式长度须为 1～500 字符')
  let pattern = compiled.get(source)
  if (!pattern) {
    pattern = RE2JS.compile(source, RE2JS.CASE_INSENSITIVE)
    if (!Object.prototype.hasOwnProperty.call(pattern.namedGroups(), 'price')) throw new Error('表达式必须包含 (?<price>...) 命名捕获组')
    if (pattern.matcher('').find()) throw new Error('表达式不能匹配空文本')
    if (pattern.programSize() > 5000) throw new Error('表达式过于复杂，请简化')
    if (compiled.size >= 200) compiled.delete(compiled.keys().next().value!)
    compiled.set(source, pattern)
  }
  return pattern
}

export function validateParsingRule(input: unknown): ParsingRule {
  if (!input || typeof input !== 'object') throw new Error('无效规则')
  const rule = input as ParsingRule
  for (const [key, max] of [['scope', 80], ['name', 80], ['itemKey', 300], ['expression', 500]] as const) {
    if (typeof rule[key] !== 'string' || rule[key].length > max) throw new Error(`无效规则字段：${key}`)
  }
  if (!rule.scope.trim() || !rule.name.trim() || !rule.itemKey) throw new Error('服务器、规则名称和物品必填')
  if (rule.id !== undefined && (!Number.isSafeInteger(rule.id) || rule.id <= 0)) throw new Error('无效规则 ID')
  if (!['aliases', 'expression'].includes(rule.mode) || !['MHB', '万', '千'].includes(rule.defaultUnit)) throw new Error('无效解析模式或单位')
  if (typeof rule.requireBuy !== 'boolean' || typeof rule.enabled !== 'boolean') throw new Error('无效规则开关')
  if (!Array.isArray(rule.aliases) || rule.aliases.length > 50 || rule.aliases.some(alias => typeof alias !== 'string' || alias.length > 80)) throw new Error('简称最多50个，每个最多80字')
  const aliases = [...new Set(rule.aliases.map(alias => normalizeQuoteText(alias)).filter(Boolean))]
  if (rule.mode === 'aliases' && (!aliases.length || aliases.some(alias => alias.length < 2 || /^\d+$/.test(alias)))) throw new Error('简称至少2字，不能全为数字')
  if (rule.mode === 'expression') compileShoutExpression(rule.expression)
  return { ...(rule.id === undefined ? {} : { id: rule.id }), scope: rule.scope.trim(), name: rule.name.trim(), itemKey: rule.itemKey,
    aliases, expression: rule.expression, mode: rule.mode, defaultUnit: rule.defaultUnit, requireBuy: rule.requireBuy, enabled: rule.enabled }
}

function amount(price: string, unit: string | null, fallback: PriceUnit) {
  return parseQuoteAmount(`${price}${unit || (fallback === 'MHB' ? '' : fallback)}`)
}

export function parseConfiguredShouts(text: string, items: QuoteItem[], rules: ParsingRule[], observedAt = new Date().toISOString()): ShoutCandidate[] {
  const result: ShoutCandidate[] = []
  const catalog = new Map(items.map(item => [quoteItemKey(item), item]))
  const active = rules.filter(rule => rule.enabled && catalog.has(rule.itemKey)).slice(0, 200)
  for (const rawText of splitShouts(text)) {
    if (/出售|卖出|卖|不还价/.test(rawText)) continue
    const hasBuy = /收购|求购|回收|收/.test(rawText)
    const matches: { rule: ParsingRule; start: number; end: number; keyword: string; token?: string; unit?: string | null }[] = []
    for (const rule of active) {
      if (rule.requireBuy && !hasBuy) continue
      if (rule.mode === 'expression') {
        const pattern = compileShoutExpression(rule.expression)
        const matcher = pattern.matcher(rawText)
        let count = 0
        while (count++ < 100 && matcher.find()) {
          if (Object.prototype.hasOwnProperty.call(pattern.namedGroups(), 'itemBefore') &&
            Object.prototype.hasOwnProperty.call(pattern.namedGroups(), 'itemAfter') &&
            !matcher.group('itemBefore') && !matcher.group('itemAfter')) continue
          const price = matcher.group('price')
          if (!price || !/^\d+(?:\.\d+)?$/.test(price)) continue
          const capturedUnit = Object.prototype.hasOwnProperty.call(pattern.namedGroups(), 'unit') ? matcher.group('unit') : null
          // Reject partially matched corrupted digits/unsupported currencies after price capture.
          const remainder = rawText.slice(matcher.end('price'))
          const explicitUnit = remainder.match(/^\s*(万|w|千|k|亿|两)/i)?.[1] ?? null
          if (capturedUnit && explicitUnit && capturedUnit.toLowerCase() !== explicitUnit.toLowerCase()) continue
          const unit = capturedUnit || explicitUnit
          if (/^[\d.a-z元个组件颗]/i.test(remainder) && !/^(?:w|k)(?:$|\s|[\u3400-\u9fff,;])/i.test(remainder)) continue
          if (/^\s*(?:万|w|千|k|亿|两)?\s*[-~至到/]/i.test(remainder)) continue
          const priceEnd = matcher.end('price') + (explicitUnit ? remainder.indexOf(explicitUnit) + explicitUnit.length : 0)
          matches.push({ rule, start: matcher.start(), end: Math.max(matcher.end(), priceEnd), keyword: matcher.group() ?? '', token: price, unit })
        }
      } else {
        for (const alias of rule.aliases) for (let start = rawText.indexOf(alias); start >= 0; start = rawText.indexOf(alias, start + alias.length)) {
          matches.push({ rule, start, end: start + alias.length, keyword: alias })
        }
      }
    }
    const hits = matches.filter(hit => !matches.some(other => other !== hit && other.start <= hit.start && other.end >= hit.end &&
      (other.end - other.start > hit.end - hit.start || (other.start === hit.start && other.end === hit.end && other.rule.itemKey !== hit.rule.itemKey))))
      .sort((a, b) => a.start - b.start)
    const candidates: ShoutCandidate[] = []
    for (let index = 0; index < hits.length; index++) {
      const hit = hits[index]
      const next = hits.slice(index + 1).find(other => other.start >= hit.end)
      const previous = hits.slice(0, index).filter(other => other.end <= hit.start).at(-1)
      const tail = rawText.slice(hit.end, next?.start ?? rawText.length)
      const prefix = rawText.slice(previous?.end ?? 0, hit.start)
      const after = tail.match(/^[\s:=,]*([0-9]+(?:\.[0-9]+)?)\s*(万|w|千|k|亿|两)?(?=$|\s|[\u3400-\u9fff,;])/i)
      // Literal aliases accept either price position without requiring a buy verb.
      // Keep a separator for digit-leading names rather than guessing how to split digits.
      const before = /^\d/.test(hit.keyword) && /[\d.]$/.test(prefix) ? null
        : prefix.match(/(?:^|[\s,，;；:：])([0-9]+(?:\.[0-9]+)?)\s*(万|w|千|k|亿|两)?\s*(?:收购|求购|回收|收)?\s*$/i)
      if (!hit.token && !after && (/^[\s:=,]*[a-z\d.]/i.test(tail) ||
        (previous && before?.index === 0 && /^[\s:=,]*\d/.test(prefix)))) continue
      const token = hit.token ?? after?.[1] ?? before?.[1]
      const unit = hit.token ? hit.unit : after?.[2] ?? before?.[2]
      if (!token || /\d\s*(?:个|组|件|颗)/.test(prefix + tail) || /^\s*[\d.]+\s*(?:元|个|组|件|颗)/.test(tail) || /^\s*[\d.]+\s*(?:万|w)?\s*[-~至到/]/i.test(tail)) continue
      const price = amount(token, unit ?? null, hit.rule.defaultUnit)
      if (!price) continue
      const item = catalog.get(hit.rule.itemKey)!
      const warnings = [`规则：${hit.rule.name}`]
      if (!unit) warnings.push(`省略单位，按配置 ${hit.rule.defaultUnit} 解析`)
      if (!hasBuy) warnings.push('原文未明确收购方向，需人工核对')
      if (item.price > 100 && (price > item.price * 5 || price < item.price / 5)) warnings.push('与设定物价差异较大')
      candidates.push({ itemKey: hit.rule.itemKey, itemName: item.name, itemType: item.type, keyword: hit.keyword,
        ruleName: hit.rule.name, price, rawText: shoutTextKey(rawText), observedAt, warnings })
    }
    // Conflicting rules/prices for one item in one shout require rule correction, not guessing.
    result.push(...candidates.filter((row, index) => !candidates.some(other => other.itemKey === row.itemKey && other.price !== row.price) &&
      candidates.findIndex(other => other.itemKey === row.itemKey && other.price === row.price) === index))
  }
  return result
}

export function validateShoutConfirmation(input: unknown): ShoutConfirmation {
  if (!input || typeof input !== 'object') throw new Error('无效报价')
  const data = input as ShoutConfirmation
  if (typeof data.scope !== 'string' || !data.scope.trim() || data.scope.length > 80 || typeof data.rawText !== 'string' || !data.rawText.trim() || data.rawText.length > 4000) throw new Error('无效服务器或喊话原文')
  if (typeof data.observedAt !== 'string' || !Number.isFinite(Date.parse(data.observedAt)) || Date.parse(data.observedAt) > Date.now() + 300000) throw new Error('无效识别时间')
  if (!Array.isArray(data.quotes) || !data.quotes.length || data.quotes.length > 100) throw new Error('一条喊话须包含1～100个报价')
  const keys = new Set<string>()
  for (const quote of data.quotes) {
    if (typeof quote.itemKey !== 'string' || quote.itemKey.length > 300 || keys.has(quote.itemKey) || !Number.isSafeInteger(quote.price) || quote.price <= 0 || quote.price > 2147483647) throw new Error('无效或重复物品报价')
    keys.add(quote.itemKey)
  }
  // Whitelist fields: speaker information supplied by an obsolete client is never persisted.
  return { scope: data.scope.trim(), rawText: shoutTextKey(data.rawText), observedAt: new Date(data.observedAt).toISOString(), quotes: data.quotes.map(quote => ({ itemKey: quote.itemKey, price: quote.price })) }
}