import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const code = ts.transpileModule(readFileSync(new URL('../src/utils/ocrQuality.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { selectOcrText, enhanceOcrPixels, selectQuoteOcrText, ClearFrameGate } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

test('line confidence preserves good prices even if the frame average is low', () => {
  const result = { text: '宝石 100万\n乱码', confidence: 30, lines: [
    { text: '宝石 100万', confidence: 90 }, { text: '乱码', confidence: 20 },
  ] }
  assert.deepEqual(selectOcrText(result, 55), { selfCapture: false, text: '宝石 100万', rejected: 1 })
  assert.equal(result.text, '宝石 100万\n乱码', 'raw result must remain intact')
})

test('captured OCR dialog is not added to the cumulative text', () => {
  assert.equal(selectOcrText({ text: '在线识屏 . 滩动文字\n最小采样间隔\n导出文本', confidence: 90 }, 55).selfCapture, true)
  assert.equal(selectOcrText({ text: '实时画面文字\n滚动累计', confidence: 90 }, 55).text, '')
  assert.equal(selectOcrText({ text: '出售宝石 100万', confidence: 90 }, 55).text, '出售宝石 100万')
})

test('confidence fallback, empty results and adjustable threshold are supported', () => {
  assert.equal(selectOcrText({ text: '宝石 100万', confidence: 40 }, 55).text, '')
  assert.equal(selectOcrText({ text: '宝石 100万', confidence: 40 }, 0).text, '宝石 100万')
  assert.equal(selectOcrText({ text: '', confidence: 0, lines: [] }, 55).rejected, 0)
  assert.equal(selectOcrText({ text: '乱码', confidence: NaN }, 0).text, '')
})

test('dark backgrounds become light without destroying antialiasing or alpha', () => {
  const pixels = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 200])
  enhanceOcrPixels(pixels)
  assert.deepEqual([...pixels.slice(0, 4)], [255, 255, 255, 255])
  assert.deepEqual([...pixels.slice(8, 12)], [0, 0, 0, 255])
  assert.ok(pixels[12] > 0 && pixels[12] < 255)
  assert.equal(pixels[15], 200)
})

test('light backgrounds retain polarity and colored pixels become grayscale', () => {
  const pixels = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 255])
  enhanceOcrPixels(pixels)
  assert.equal(pixels[0], 255)
  assert.equal(pixels[8], pixels[9])
  assert.equal(pixels[9], pixels[10])
  enhanceOcrPixels(new Uint8ClampedArray())
})

test('quotation text requires high line confidence and confident price words', () => {
  const clear = { text: '商人甲(123456):收金刚石80万', confidence: 90 }
  assert.equal(selectQuoteOcrText(clear), clear.text)
  assert.equal(selectQuoteOcrText({ ...clear, confidence: 70 }), '')
  assert.equal(selectQuoteOcrText({ ...clear, lines: [{ ...clear, words: [{ text: '80万', confidence: 50 }] }] }), '')
  assert.equal(selectQuoteOcrText({ ...clear, lines: [{ ...clear, words: [{ text: '80万', confidence: 90 }] }] }), clear.text)
  assert.equal(selectQuoteOcrText({ text: '实时画面文字\n滚动累计', confidence: 99 }), '')
  assert.equal(selectQuoteOcrText({ text: 'a\nb\nc', confidence: 90, lines: [
    { text: 'a', confidence: 90 }, { text: 'b', confidence: 40 }, { text: 'c', confidence: 90 },
  ] }), 'a\n[识别不清晰]\nc')
})

test('clear-frame gate waits for stable sharp pixels, rejects blur and resets sessions', () => {
  const gate = new ClearFrameGate()
  const pixels = new Uint8ClampedArray(8 * 8 * 4)
  const pattern = offset => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const index = (y * 8 + x) * 4
      pixels[index] = pixels[index + 1] = pixels[index + 2] = (x + y + offset) % 2 ? 255 : 0
      pixels[index + 3] = 255
    }
  }
  pattern(0)
  assert.equal(gate.assess(pixels, 8, 8).stable, false)
  const ready = gate.assess(pixels, 8, 8)
  assert.equal(ready.stable, true)
  assert.equal(ready.clear, true)
  pattern(1)
  assert.equal(gate.assess(pixels, 8, 8).stable, false)
  gate.reset()
  assert.equal(gate.assess(pixels, 8, 8).stable, false)
  pixels.fill(128)
  assert.equal(gate.assess(pixels, 8, 8).clear, false)
  assert.equal(gate.assess(new Uint8ClampedArray(), 0, 0).clear, false)
})