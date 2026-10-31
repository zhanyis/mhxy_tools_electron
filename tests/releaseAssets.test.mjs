import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm, readdir, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { validateTag, validateWindowsAssets, stageAssets } from '../scripts/releaseAssets.mjs'
const { load } = createRequire(import.meta.url)('js-yaml')

test('release tag must exactly match a stable package version', () => {
  validateTag('v1.2.3', '1.2.3')
  for (const tag of ['v1.2.4', '1.2.3', 'v1.2.3-beta.1']) assert.throws(() => validateTag(tag, '1.2.3'))
})

test('Windows staging requires consistent installer, SHA512, size, metadata and blockmap; ignores unpacked utilities', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'release-assets-'))
  const source = path.join(directory, 'source'), staged = path.join(directory, 'staged')
  const name = 'mhxy-tools-Windows-1.2.3-Setup.exe', bytes = Buffer.from('test installer only')
  const sha512 = createHash('sha512').update(bytes).digest('base64')
  const metadata = { version: '1.2.3', path: name, sha512, files: [{ url: name, sha512, size: bytes.length }] }
  try {
    await mkdir(source)
    await writeFile(path.join(source, name), bytes)
    await writeFile(path.join(source, 'latest.yml'), JSON.stringify(metadata))
    await assert.rejects(validateWindowsAssets(source, '1.2.3'), /ENOENT/)
    await writeFile(path.join(source, `${name}.blockmap`), 'blockmap')
    assert.equal((await validateWindowsAssets(source, '1.2.3')).length, 3)
    await writeFile(path.join(source, 'default.exe'), 'must not be published')
    await mkdir(path.join(source, 'win-unpacked'))
    // Stage uses the current package version; test validation separately and exact file copying.
    const current = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version
    const currentName = `mhxy-tools-Windows-${current}-Setup.exe`
    await writeFile(path.join(source, currentName), bytes)
    await writeFile(path.join(source, `${currentName}.blockmap`), 'blockmap')
    await writeFile(path.join(source, 'latest.yml'), JSON.stringify({ ...metadata, version: current, path: currentName, files: [{ url: currentName, sha512, size: bytes.length }] }))
    await stageAssets('win', source, staged)
    assert.deepEqual((await readdir(staged)).sort(), ['latest.yml', currentName, `${currentName}.blockmap`].sort())
    await writeFile(path.join(source, currentName), 'corrupted')
    await assert.rejects(validateWindowsAssets(source, current), /SHA512/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('Windows publication is gated by asset validation and built-in token, other OS failures cannot block it', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.match(pkg.scripts['build:app'], /npm run build-icon/)
  await readFile(new URL('../public/teshelingpai.png', import.meta.url))
  const workflow = load(await readFile(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8'))
  assert.equal(workflow.jobs.windows['runs-on'], 'windows-latest')
  assert.equal(workflow.jobs['other-platforms']['continue-on-error'], true)
  assert.match(workflow.jobs.publish.if, /needs.windows.result == 'success'/)
  assert.equal(workflow.jobs.publish.permissions.contents, 'write')
  const publishing = workflow.jobs.publish.steps.find(step => step.uses?.startsWith('softprops/action-gh-release'))
  assert.equal(publishing.with.draft, true)
  assert.equal(publishing.with.files, 'release-assets/*')
  assert.ok(!JSON.stringify(workflow).includes('RELEASE_TOKEN'))
  assert.ok(JSON.stringify(workflow).includes('latest.yml'))
})