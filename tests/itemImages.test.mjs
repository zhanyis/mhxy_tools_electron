import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import ts from 'typescript'

const code = ts.transpileModule(readFileSync(new URL('../src/utils/itemImages.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { resolveItemImage } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

test('original built-in price images resolve from the app root without changing database data', () => {
  assert.equal(resolveItemImage('./jingangshi.png', '/'), '/jingangshi.png')
  assert.equal(resolveItemImage('./jingangshi.png', './'), './jingangshi.png')
  assert.equal(resolveItemImage('/public/jingangshi.png', '/app/'), '/app/jingangshi.png')
  const defaults = readFileSync(new URL('../electron/db/db.ts', import.meta.url), 'utf8')
  for (const match of defaults.matchAll(/image: '\.\/(.*?)'/g)) {
    assert.ok(existsSync(new URL(`../public/${match[1]}`, import.meta.url)), `Missing original item image: ${match[1]}`)
  }
})

test('uploaded images and data/remote protocols remain unchanged', () => {
  for (const value of ['user-image:///123_test.png', 'data:image/png;base64,abc', 'https://example.com/icon.png', 'file:///C:/images/icon.png']) {
    assert.equal(resolveItemImage(value, '/'), value)
  }
  assert.equal(resolveItemImage(undefined), '')
})