# 自动构建、发布与 Windows 更新

## 发布链路

推送与 package.json 版本完全一致的稳定标签，例如版本 `0.1.8` 对应 `v0.1.8`。

1. Windows job 安装依赖、生成 Prisma Client、运行测试、从已跟踪的原图生成打包图标、类型检查和 Vite 构建。
2. electron-builder 生成 NSIS x64 安装包，不直接发布。
3. 校验安装包名称、版本、SHA512、大小及 blockmap，仅归集三个更新文件。
4. macOS/Linux 另行构建；这些任务失败不会阻断 Windows 发布。
5. publish job 下载构建产物，再次校验 Windows 资源，上传到草稿 Release。
6. GitHub API 确认所有 Windows 必需资源已上传且非空后，才公开正式 Release。

本工作流只接受稳定版本，不接受 beta 等预发布标签。手动运行时必须选择对应版本标签，不能选择 main 分支。
已公开的版本不能覆盖；失败的草稿可以通过重新运行工作流继续完成。

## GitHub 权限

发布使用自动提供的 `secrets.GITHUB_TOKEN`，publish job 已声明 `contents: write`，不需要配置 `RELEASE_TOKEN`。
若组织策略禁止写权限，需由仓库管理员允许 Actions 创建 Release。
发布目的地固定为 `zhanyis/mhxy_tools_electron`；仓库迁移时同时更新 package.json 的 repository 和 electron-builder.json5 的 publish owner/repo。

## 必需的 Windows Release 附件

以 `0.1.8` 为例：

- `mhxy-tools-Windows-0.1.8-Setup.exe`
- `mhxy-tools-Windows-0.1.8-Setup.exe.blockmap`
- `latest.yml`

`latest.yml` 中的 version、path、files.url、size、sha512 必须与安装包一致。不要手工修改文件名或哈希。
不要上传 win-unpacked 内的 default.exe、elevate.exe 等内部程序代替安装包。
文件名使用 ASCII 避免上传重命名；应用显示名称、已有 appId 和用户数据路径未改变。

## Windows 客户端更新行为

- 仅已打包应用启动后检查更新一次；开发服务器和浏览器预览不执行自动更新。
- 右上角“检查更新”可手动检查，合并重复检查请求。
- 发现更高稳定版本后弹窗；用户选择“立即更新”才下载，不静默下载。
- 下载完成后可选择“立即重启安装”，或“稍后安装”（退出应用时安装）。
- 请先保存搬砖记录再安装；更新不会清空物价、解析规则或已有数据库。
- “跳过此版本”保存在本地；手动检查仍可查看该版本。
- 网络失败会显示原因，可以通过手动检查重试。

## 发布步骤

1. 修改 package.json 的 version 为未发布的新版本（当前线上已有 v0.1.7，不能再次发布这个版本）。
2. 提交修改后的代码和工作流，并推送分支。
3. 创建并推送匹配的新标签；Actions 的 Release 工作流会自动开始。
4. 检查 Windows 与 publish 两个 job 均成功，并确认 Release 包含上述三个附件。
5. 使用旧版本 Windows 已安装应用检查更新，验证提示、下载、重启安装与用户数据保留。

普通分支推送不会发布。本文不代表已经执行了推送或发布。

## 本地验证（不发布）

先关闭正在运行的 Electron 应用，避免 Prisma 引擎或 Electron 文件被占用。

```powershell
npm install --package-lock=false
npm run prisma:generate
npm test
npm run build:app
npx electron-builder --win --x64 --publish never
npm run release:stage -- win
npm run release:verify -- release-assets/win
```

本地 publish/release 命令会上传资源，不用于普通验证。

## 其他平台

macOS 同时生成 DMG 和自动更新所需的 ZIP；正式签名、公证仍需要 Apple 开发者证书。
未签名 macOS/Linux 产物不构成完整跨平台安装、更新验证，本次优先保障 Windows。

## 旧版本修复范围

旧 v0.1.7 Release 缺少更新元数据；新工作流不会自动改写这个历史版本。
需要发布更高版本才能使旧客户端从新 Release 获取安装包。旧客户端内已有的重复检查问题只能在安装新版本后消除。