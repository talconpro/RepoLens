# RepoLens

RepoLens 是一个 Chrome MV3 浏览器插件，用于在浏览 GitHub 公开仓库时生成可阅读、可导出的项目学习报告。

它会读取仓库的 README、目录结构、配置文件和关键源码抽样，然后调用你配置的 OpenAI 兼容接口生成报告。插件没有自建后端，API Key 和历史报告都保存在浏览器本地 `chrome.storage.local`。

## 功能

- 识别当前 GitHub 仓库页面。
- 生成项目概览、适合人群、核心价值、技术栈分析。
- 解释目录结构和关键文件阅读顺序。
- 给出运行方式、学习路线、二次开发建议和风险提示。
- 支持中文和中英双语报告。
- 支持 Markdown / HTML 下载。
- 提供本地历史记录页面，可回看已分析项目。

## 在线主页

项目主页使用 GitHub Pages 部署，源码位于 `docs/`。

启用方式：

1. 打开 GitHub 仓库 `Settings -> Pages`。
2. 将 Source 设置为 `GitHub Actions`。
3. 合并到 `main` 后，`.github/workflows/pages.yml` 会自动部署 `docs` 目录。

## 安装插件

### 从 Release 下载

1. 打开仓库的 GitHub Releases 页面。
2. 下载 `repolens-extension-v*.zip`。
3. 解压 zip。
4. 打开 Chrome 的 `chrome://extensions`。
5. 打开右上角“开发者模式”。
6. 点击“加载已解压的扩展程序”。
7. 选择解压后的扩展目录。

### 从源码加载

```bash
pnpm install
pnpm run build
```

然后在 Chrome 中加载：

```text
apps/extension/dist
```

代码更新后需要重新执行：

```bash
pnpm run build
```

并在 `chrome://extensions` 中点击 RepoLens 的刷新按钮。

## 插件配置

安装后打开 RepoLens 的 Options 设置页，填写：

```text
API Base URL: https://api.openai.com/v1
API Key: sk-xxxxxxxx
Model: gpt-4o-mini
报告语言: 中文 / 中英双语
```

点击“保存配置”，再点击“测试连接”。

说明：

- API Key 保存在 `chrome.storage.local`。
- 插件会直接请求你配置的 OpenAI 兼容接口。
- 如果使用自定义 API Base URL，Chrome 会请求授予对应域名访问权限。

## 使用方式

1. 打开任意 GitHub 公开仓库，例如 `https://github.com/vercel/next.js`。
2. 点击浏览器工具栏中的 RepoLens 图标。
3. 点击“开始分析”。
4. 分析完成后会自动打开报告页。
5. 在报告页可下载 Markdown / HTML。
6. 后续可从 popup 或报告页进入“历史记录”查看已分析项目。

## 本地开发

```bash
pnpm install
pnpm --filter @repolens/extension dev
```

常用命令：

```bash
pnpm run test
pnpm run build
pnpm run package:extension
```

打包命令会读取 `apps/extension/public/manifest.json` 的 `version`，生成：

```text
release/repolens-extension-v0.1.0.zip
```

## 自动化流程

仓库包含三条 GitHub Actions：

- `.github/workflows/ci.yml`
  - push / PR 时运行测试、构建、扩展打包。
  - 上传 `release/*.zip` 作为 workflow artifact。
- `.github/workflows/pages.yml`
  - `main` 分支更新 `docs/**`、`README.md` 或 workflow 文件时部署 GitHub Pages。
- `.github/workflows/release.yml`
  - 推送 `v*` tag 时创建 GitHub Release。
  - 自动上传扩展 zip。

发布新版本示例：

```bash
git tag v0.1.0
git push origin v0.1.0
```

注意：发布前请同步更新 `apps/extension/public/manifest.json` 中的 `version`。

## 项目结构

```text
apps/extension        Chrome MV3 插件
packages/shared       共享类型、报告结构、URL 解析和文件筛选工具
docs                  GitHub Pages 静态主页
scripts               本地和 CI 辅助脚本
.github/workflows     CI、Pages、Release 自动化
```

## 隐私与安全

- RepoLens 只分析 GitHub 公开仓库。
- 插件不提供自建后端。
- API Key 存在浏览器本地 `chrome.storage.local`。
- 历史报告也保存在浏览器本地。
- 插件不会执行仓库代码，只读取公开文本内容。
