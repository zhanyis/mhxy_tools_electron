import { readFile, readdir, mkdir, copyFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const { load } = createRequire(import.meta.url)('js-yaml')
const root = fileURLToPath(new URL('../', import.meta.url))
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))

export function validateTag(tag, version = pkg.version) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || tag !== `v${version}`) throw new Error(`仅发布稳定版本，标签必须与package版本一致：v${version}`)
}

export async function validateWindowsAssets(directory, version = pkg.version) {
  const metadata = load(await readFile(path.join(directory, 'latest.yml'), 'utf8'))
  const expected = `mhxy-tools-Windows-${version}-Setup.exe`
  if (metadata.version !== version || metadata.path !== expected || !Array.isArray(metadata.files) || metadata.files.length !== 1) throw new Error('Windows更新元数据版本或文件名不匹配')
  const file = metadata.files[0]
  if (file.url !== expected || file.url !== path.basename(file.url)) throw new Error('更新文件必须指向同目录安装包')
  const bytes = await readFile(path.join(directory, expected))
  const hash = createHash('sha512').update(bytes).digest('base64')
  if (hash !== file.sha512 || hash !== metadata.sha512 || bytes.length !== file.size) throw new Error('Windows安装包SHA512或文件大小不匹配')
  const blockmap = await stat(path.join(directory, `${expected}.blockmap`))
  if (!blockmap.size) throw new Error('Windows更新blockmap为空')
  return [expected, `${expected}.blockmap`, 'latest.yml']
}

export async function stageAssets(platform, source = path.join(root, 'release', pkg.version), destination = path.join(root, 'release-assets', platform)) {
  if (!['win', 'mac', 'linux'].includes(platform)) throw new Error('无效发布平台')
  const names = platform === 'win' ? await validateWindowsAssets(source)
    : (await readdir(source, { withFileTypes: true })).filter(entry => entry.isFile() &&
      (platform === 'mac' ? /(?:\.dmg|\.zip|\.blockmap|latest-mac\.yml)$/ : /(?:\.AppImage|\.blockmap|latest-linux\.yml)$/).test(entry.name)).map(entry => entry.name)
  if (platform === 'mac' && (!names.includes('latest-mac.yml') || !names.some(name => name.endsWith('.zip')))) throw new Error('macOS缺少ZIP或更新元数据')
  if (platform === 'linux' && (!names.includes('latest-linux.yml') || !names.some(name => name.endsWith('.AppImage')))) throw new Error('Linux缺少AppImage或更新元数据')
  await mkdir(destination, { recursive: true })
  for (const name of names) await copyFile(path.join(source, name), path.join(destination, name))
  return names
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, argument] = process.argv.slice(2)
  if (command === 'tag') validateTag(argument)
  else if (command === 'stage') console.log(await stageAssets(argument))
  else if (command === 'verify') console.log(await validateWindowsAssets(path.resolve(argument ?? 'release-assets')))
  else throw new Error('用法：releaseAssets.mjs tag vX.Y.Z | stage win/mac/linux | verify 目录')
}