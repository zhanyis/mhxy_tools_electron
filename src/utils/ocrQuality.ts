export interface OcrResult {
  text: string
  confidence: number
  lines?: { text: string; confidence: number; words?: { text: string; confidence: number }[] }[]
}

export interface QuoteOcrFrame { text: string; observedAt: string; confidence: number; sharpness: number }

// Quotation extraction has a separate, stricter threshold than the text viewer.
// Word confidence matters: a clear sentence can still contain one uncertain price digit.
export function selectQuoteOcrText(result: OcrResult) {
  if (selectOcrText(result, 0).selfCapture || !Number.isFinite(result.confidence)) return ''
  const lines = result.lines ?? [{ text: result.text, confidence: result.confidence }]
  const accepted = lines.map(line => Number.isFinite(line.confidence) && line.confidence >= 85 &&
    (!line.words || line.words.filter(word => word.text.trim()).every(word => Number.isFinite(word.confidence) && word.confidence >= 75)))
  if (!accepted.some(Boolean)) return ''
  // Preserve a boundary where an unreadable line was removed: never join two merchants
  // or attach a continuation price to a preceding, unrelated clear speaker.
  return lines.map((line, index) => accepted[index] ? line.text.trim() : '[识别不清晰]').join('\n')
}

/** Sparse native-pixel edge sampling (before upscale/enhancement). This is a
 * heuristic blur gate, not an OCR accuracy guarantee. Two stable samples precede OCR. */
export class ClearFrameGate {
  private previous?: Uint8Array
  reset() { this.previous = undefined }
  assess(pixels: Uint8ClampedArray, width: number, height: number) {
    const signature: number[] = []
    let edges = 0
    let samples = 0
    const step = Math.max(1, Math.ceil(Math.sqrt(width * height / 4096)))
    const gray = (x: number, y: number) => {
      const index = (y * width + x) * 4
      return (pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114)
    }
    for (let y = 1; y < height - 1; y += step) {
      for (let x = 1; x < width - 1; x += step) {
        const value = gray(x, y)
        if (!Number.isFinite(value)) continue
        signature.push(Math.round(value))
        edges += Math.abs(4 * value - gray(x - 1, y) - gray(x + 1, y) - gray(x, y - 1) - gray(x, y + 1))
        samples++
      }
    }
    const sharpness = samples ? edges / samples : 0
    const current = Uint8Array.from(signature)
    const previous = this.previous
    this.previous = current
    const change = previous?.length === current.length && current.length
      ? current.reduce((sum, value, index) => sum + Math.abs(value - previous[index]), 0) / current.length : Infinity
    return { sharpness, clear: sharpness >= 6, stable: change <= 2 }
  }
}

// Keep raw OCR visible, but do not feed captured application UI back into the collector.
export function selectOcrText(result: OcrResult, minimumConfidence: number) {
  const selfCapture = ['最小采样间隔', '实时画面文字', '滚动累计', '导出文本', '在线识屏']
    .filter(label => result.text.replace(/\s/g, '').includes(label)).length >= 2
  const candidates = result.lines ?? result.text.split(/\r?\n/).map(text => ({ text, confidence: result.confidence }))
  const nonEmpty = candidates.filter(line => line.text.trim())
  const accepted = nonEmpty.filter(line => Number.isFinite(line.confidence) && line.confidence >= minimumConfidence)
  return {
    selfCapture,
    text: selfCapture ? '' : accepted.map(line => line.text.trim()).join('\n'),
    rejected: selfCapture ? nonEmpty.length : nonEmpty.length - accepted.length,
  }
}

// OCR prefers dark glyphs on a light background. Do not binarize: that erases
// antialiased strokes and colored game text. Apply a modest grayscale stretch instead.
export function enhanceOcrPixels(pixels: Uint8ClampedArray) {
  let brightness = 0
  const count = pixels.length / 4
  if (!count) return
  for (let i = 0; i < pixels.length; i += 4) {
    brightness += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
  }
  const invert = brightness / count < 128
  for (let i = 0; i < pixels.length; i += 4) {
    let value = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
    if (invert) value = 255 - value
    value = Math.max(0, Math.min(255, (value - 128) * 1.2 + 128))
    pixels[i] = pixels[i + 1] = pixels[i + 2] = value
  }
}