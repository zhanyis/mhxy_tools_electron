import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Use the existing TypeScript dependency; no extra test runner is needed.
const source = readFileSync(new URL('../src/utils/scrollingText.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
const { ScrollingTextCollector } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

test('overlapping scrolling frames only append new lines', () => {
  const collector = new ScrollingTextCollector()
  assert.deepEqual(collector.append('收购宝石 100万\n出售兽诀 200万', 0), ['收购宝石 100万', '出售兽诀 200万'])
  assert.deepEqual(collector.append('出售兽诀 200万\n出售珍珠 80万', 1000), ['出售珍珠 80万'])
})
test('normalizes spaces and full width without merging different prices', () => {
  const collector = new ScrollingTextCollector()
  collector.append('宝石 １００万', 0)
  assert.deepEqual(collector.append('宝石100万\r\n宝石101万\n\n', 1000), ['宝石101万'])
})
test('repeated visible lines refresh the deduplication window', () => {
  const collector = new ScrollingTextCollector()
  collector.append('宝石100万', 0)
  assert.deepEqual(collector.append('宝石100万', 59_000), [])
  assert.deepEqual(collector.append('宝石100万', 61_000), [])
  assert.deepEqual(collector.append('宝石100万', 122_000), ['宝石100万'])
})
test('clear allows the same text to be recognized again', () => {
  const collector = new ScrollingTextCollector()
  collector.append('宝石100万', 0)
  collector.clear()
  assert.deepEqual(collector.append('宝石100万', 1000), ['宝石100万'])
})
test('cache stays bounded during long sessions', () => {
  const collector = new ScrollingTextCollector()
  collector.append(Array.from({ length: 2500 }, (_, i) => `商品${i}`).join('\n'), 0)
  assert.deepEqual(collector.append('商品0\n商品2499', 1000), ['商品0'])
})