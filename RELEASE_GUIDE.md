# 自动构建 & 发布到 GitHub Release 教程

## 原理概览

```
git push tag v1.0.0
      ↓
GitHub Actions 触发
      ↓
在 Windows / macOS / Linux 三平台并行构建
      ↓
electron-builder 打包安装包，自动上传到 GitHub Release
```

---

## 一、前置条件

### 1. 确认仓库权限设置

打开你的 GitHub 仓库 → **Settings → Actions → General → Workflow permissions**

选择 **Read and write permissions**，并保存。

> 这样 `GITHUB_TOKEN` 才能自动创建 Release 并上传文件，无需手动配置 Secret。

### 2. 确认 package.json 中有 `repository` 字段（可选但推荐）

如果 `electron-builder` 无法自动识别仓库地址，在 `package.json` 中添加：

```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/你的用户名/你的仓库名.git"
  }
}
```

---

## 二、相关文件说明

| 文件 | 作用 |
|------|------|
| `.github/workflows/build.yml` | GitHub Actions 工作流，监听 `v*` tag，触发三平台构建与发布 |
| `electron-builder.json5` | 打包配置，新增 `publish.provider = "github"` 让构建结果自动上传 Release |

---

## 三、发布新版本的完整步骤

### 第一步：更新版本号

修改 `package.json` 中的 `version` 字段：

```json
{
  "version": "1.0.0"
}
```

> 版本号格式建议遵循 [Semantic Versioning](https://semver.org/)：`主版本.次版本.修订号`

### 第二步：提交代码

```bash
git add .
git commit -m "chore: release v1.0.0"
git push
```

### 第三步：打 Tag 并推送

```bash
# 创建带注释的 tag（推荐）
git tag -a v1.0.0 -m "Release v1.0.0"

# 推送 tag 到远程，触发 GitHub Actions
git push origin v1.0.0
```

> **注意**：Tag 名称必须以 `v` 开头（如 `v1.0.0`），否则不会触发工作流。

---

## 四、查看构建进度

1. 打开 GitHub 仓库，点击顶部 **Actions** 标签页
2. 找到名为 **Release** 的工作流，点击进入
3. 可以看到三个平台的构建任务并行运行

等待全部完成后（约 5~15 分钟），进入仓库的 **Releases** 页面即可看到自动创建的 Release，包含：

- `搬砖记录器-Windows-版本号-Setup.exe`（Windows 安装包）
- `搬砖记录器-Mac-版本号-Installer.dmg`（macOS 安装包）
- `搬砖记录器-Linux-版本号.AppImage`（Linux 可执行镜像）

---

## 五、常见问题

### Q: macOS 构建失败，提示签名问题？

macOS 默认不做代码签名，构建出的 `.dmg` 用户首次打开时需要在 **系统设置 → 隐私与安全性** 中手动允许。

如需正式签名，需在 GitHub Secrets 中配置以下内容：

| Secret 名称 | 说明 |
|------------|------|
| `CSC_LINK` | 开发者证书 (.p12) 的 Base64 编码 |
| `CSC_KEY_PASSWORD` | 证书密码 |
| `APPLE_ID` | Apple ID 邮箱（用于公证 Notarize） |
| `APPLE_APP_SPECIFIC_PASSWORD` | Apple 专用密码 |

### Q: 构建成功但 Release 没有文件？

检查 **Settings → Actions → General → Workflow permissions** 是否已设为 **Read and write permissions**。

### Q: 只想构建 Windows 版本？

修改 `.github/workflows/build.yml` 中的 `matrix.os`：

```yaml
strategy:
  matrix:
    os: [windows-latest]
```

### Q: 如何发布预发布版本（Pre-release）？

将 `electron-builder.json5` 中的 `releaseType` 改为 `prerelease`：

```json
"publish": [
  {
    "provider": "github",
    "releaseType": "prerelease"
  }
]
```

或者在 Tag 名称中加入预发布标识：`v1.0.0-beta.1`

---

## 六、快速命令速查

```bash
# 查看所有 tag
git tag

# 删除本地 tag（误打时）
git tag -d v1.0.0

# 删除远程 tag（慎用，会触发重建或需手动清理 Release）
git push origin :refs/tags/v1.0.0

# 一次推送所有本地 tag
git push origin --tags
```
