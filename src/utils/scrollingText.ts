/** Ignore whitespace differences, but keep digits and punctuation: prices must not merge. */
export function textKey(line: string): string {
  return line.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}

/** A bounded, recent-line cache suppresses repeated lines in overlapping scrolling frames. */
export class ScrollingTextCollector {
  private seen = new Map<string, number>()

  clear() {
    this.seen.clear()
  }

  append(text: string, now = Date.now()): string[] {
    for (const [key, time] of this.seen) {
      if (now - time > 60_000) this.seen.delete(key)
    }
    const added: string[] = []
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      const key = textKey(line)
      if (!key) continue
      const duplicate = this.seen.has(key)
      this.seen.delete(key)
      this.seen.set(key, now)
      if (!duplicate) added.push(line)
    }
    while (this.seen.size > 2000) this.seen.delete(this.seen.keys().next().value!)
    return added
  }
}