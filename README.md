# YGO CardPrint

游戏王卡图查询与线下打印清单的响应式前端。设计目标和上线规格见 [需求文档.md](./需求文档.md)，后续实现路线见 [推荐开发顺序.md](./推荐开发顺序.md)。

## 本地运行

要求 Node.js LTS 和 MySQL 8。复制 `.env.example` 为 `.env`，填写自己的 MySQL 用户名、密码与数据库名。先在 MySQL 中创建数据库 `ygo_cardprint`（字符集 `utf8mb4`），然后运行：

```powershell
npm install
npm run db:migrate
npm run dev
```

浏览器打开 `http://localhost:3000`。开发新迁移时使用 `npm run db:dev`。

上线前可运行 `npm run lint`、`npm run typecheck` 和 `npm run build`。

## 当前已完成

- 桌面和移动端页面，卡名／密码／CID 查询、加载更多、错误及空状态。
- 服务端搜索代理 `/api/cards/search`，查询百鸽 v0 API 并规范化卡片资料。
- 卡片详情 `/api/cards/{id}` 提供完整效果文本；批量解析 `/api/cards/resolve` 支持卡片密码、名称和混合输入，多候选需要用户确认。
- 简中、日文、英文、YGOPro 卡图可用性检查和图版选择。
- 打印清单的数量、排序、移除和清空；MySQL 匿名项目及本机临时副本。
- 可复制找回链接，在其他浏览器恢复同一清单；项目令牌仅以哈希保存于数据库。
- 每页 3 × 3、A4 纵向的页面预览，显示张数、页数和 59 × 86 mm 规格。

**Word 导出已可用。** 点击“导出 Word 文档”后，服务端会创建导出任务，下载卡图并使用 `docx` 生成 A4 纵向 3 × 3 的 `.docx` 文件；生成失败会在页面提示原因。MySQL 只保存任务状态和清单快照，Word 文件不会写入 MySQL。本地缓存文件保存在 `storage/exports`；Vercel 上保存在私有 Vercel Blob。若 Vercel Blob 存储被暂停、任务请求中断或浏览器网络连接失败，页面会自动改用原生表单直接下载，文件不会保存到云端，生成期间需保持页面打开。

页面卡图经同域接口 `/api/card-images` 代理并生成 WebP 预览，浏览器无需直接连接图片 CDN。服务端优先读取百鸽 `cdn.233.momobako.com`，失败后回退到 YGOProDeck `images.ygoprodeck.com` 通用卡图；只接受固定 HTTPS 域名和卡号路径，禁止重定向到其他地址。两种来源都会检查 JPEG、PNG、WebP 格式、完整解码、像素尺寸和标准卡比例。预览与 Word 导出共用经过校验的原图缓存：本地缓存于 `storage/card-images`，Vercel 上缓存于私有 Blob。30 天后尝试刷新，回源失败时继续使用已校验的旧图；180 天后清理缓存。缓存写入故障不会阻止当次图片显示，预览缩略图另由浏览器及 Vercel CDN 缓存。低于 697 × 1016 px 但仍可用的图片会在导出任务中返回清晰度警告；两种来源都无可用图片时会显示暂无卡图并阻止导出。

打印项目采用 7 天无操作过期策略。读取、恢复、保存和导出都会刷新活动时间；过期项目会连同打印项、导出任务一起删除，失去引用的卡片和卡图也会清理。Word 文件保留 3 天，清理脚本会删除超过 3 天的 `.docx` 和临时文件。

数据库断开时页面仍保留本机清单，但会暂停 Word 导出直到同步恢复。找回链接相当于项目访问凭据，请勿公开发布。

卡图和资料来自[百鸽 API](https://ygocdb.com/api)；上线前需确认数据、卡图及 CDN 的使用范围。

## 一键启动前端

Windows 用户可以双击项目根目录的 `启动前端.bat`。脚本会自动检查 Node.js/npm；如果尚未安装依赖，会先执行 `npm install`，然后启动 Next.js 开发服务器。

需要同时准备网站、API 和 MySQL 时，可双击 `启动项目.bat`。脚本会检查 `.env` 中的 `DATABASE_URL`，在本机 MySQL 未运行时尝试启动服务，安装缺失依赖并执行 Prisma 迁移，然后启动 Next.js（页面和 `/api/*` 接口共用该服务）并打开浏览器。若 3000 端口被其他程序占用，会依次尝试 3001-3010；服务日志位于 `storage/logs/`。首次使用前仍需配置 `.env` 并创建对应数据库。

也可以在 PowerShell 中运行：

```powershell
.\启动前端.ps1
```

启动后访问 <http://localhost:3000>。在终端按 `Ctrl+C` 停止开发服务器。

## Word 导出接口

- `POST /api/exports`：提交打印清单并创建异步导出任务。
- `GET /api/exports/{id}`：查询任务状态、页数和错误信息。
- 成功任务的 `warnings` 字段会列出低清晰度卡图及其像素尺寸。
- `GET /api/exports/{id}/download`：下载生成的 Word 文件。

任务记录保存在 MySQL，导出任务和 Word 文件均保留 3 天。每次创建项目或导出任务时会清理过期数据库记录；本地文件可运行 `npm run db:cleanup` 或双击 `清理过期数据.bat` 清理。

## Vercel 上线配置

1. 在 Vercel 项目 **Storage** 中创建并连接 **Blob** 存储，选择 **Private** 访问模式。新版连接通常提供 `BLOB_STORE_ID` 并由 Vercel OIDC 鉴权；旧版连接则提供 `BLOB_READ_WRITE_TOKEN`。两者满足其一即可，未配置时导出接口会明确报错。
2. 在 Vercel Production 环境变量中配置 Railway MySQL 的公网 `DATABASE_URL`；不要使用 `127.0.0.1` 或 `.railway.internal`。同时添加随机且保密的 `CRON_SECRET`。变更环境变量后重新部署。
3. `vercel.json` 每天 03:00 UTC 调用一次 `/api/internal/cleanup`，删除过期数据库记录、超过 3 天的 Word 文件和超过 180 天的卡图缓存。Vercel 会使用 `CRON_SECRET` 鉴权；没有该变量时清理请求会返回 401。
4. 上线后用一张已保存到云端的卡测试导出，等待任务完成并下载 `.docx`。若任务失败，查看该次部署的 Functions 日志和页面错误。单次最多 120 张卡；图片下载较慢的大清单仍受 Vercel 函数执行时间限制。

若看到 `Vercel Blob: This store has been suspended`，请在 Vercel Storage 检查该 Blob 存储的暂停原因和账户用量，恢复服务或连接新的私有 Blob 存储，并确认 Production 环境的 `BLOB_STORE_ID` 或 `BLOB_READ_WRITE_TOKEN` 指向当前存储后重新部署。直接下载兜底只能完成当次请求，不能恢复被暂停存储中的历史文件，也仍受函数执行时间限制。

如果是自行部署的 Windows 服务器，请在任务计划程序中设置每天运行一次 `清理过期数据.bat`。

## 卡片接口

- `GET /api/cards/search?q=青眼白龙`：按名称、效果词、密码或 CID 搜索。
- `GET /api/cards/89631139`：按卡片密码查询详情，包含完整效果文本。
- `POST /api/cards/resolve`：提交 `{"passwords":["89631139"],"names":["青眼白龙"]}`，也可用 `{"inputs":["89631139","青眼白龙"]}` 混合输入；每项返回 `matches`、`resolved`、`requiresConfirmation`、`hasMore` 和 `error`。名称出现多个候选时，前端只在用户点选候选后进入卡图选择；上游某项失败时其他结果仍可使用。

## 匿名项目接口

- `GET /api/print-project`：通过 HttpOnly Cookie 恢复清单。
- `POST /api/print-project`：创建项目并迁入本机清单。
- `PUT /api/print-project`：携带修订号保存清单，冲突时返回 409。
- `POST /api/print-project/restore`：使用找回令牌切换到已有项目。
