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
- 简中、日文、英文、YGOPro 卡图可用性检查和图版选择。
- 打印清单的数量、排序、移除和清空；MySQL 匿名项目及本机临时副本。
- 可复制找回链接，在其他浏览器恢复同一清单；项目令牌仅以哈希保存于数据库。
- 每页 3 × 3、A4 纵向的页面预览，显示张数、页数和 59 × 86 mm 规格。

**Word 导出已可用。** 点击“导出 Word 文档”后，服务端会创建导出任务，下载卡图并使用 `docx` 生成 A4 纵向 3 × 3 的 `.docx` 文件；生成失败会在页面提示原因。任务状态和清单快照保存在 MySQL，Word 文件暂存在服务器本地 `storage/exports`，30 分钟后过期。项目 30 天无更新后过期。

数据库断开时页面仍保留本机清单，但会暂停 Word 导出直到同步恢复。找回链接相当于项目访问凭据，请勿公开发布。

卡图和资料来自[百鸽 API](https://ygocdb.com/api)；上线前需确认数据、卡图及 CDN 的使用范围。

## 一键启动前端

Windows 用户可以双击项目根目录的 `启动前端.bat`。脚本会自动检查 Node.js/npm；如果尚未安装依赖，会先执行 `npm install`，然后启动 Next.js 开发服务器。

也可以在 PowerShell 中运行：

```powershell
.\启动前端.ps1
```

启动后访问 <http://localhost:3000>。在终端按 `Ctrl+C` 停止开发服务器。

## Word 导出接口

- `POST /api/exports`：提交打印清单并创建异步导出任务。
- `GET /api/exports/{id}`：查询任务状态、页数和错误信息。
- `GET /api/exports/{id}/download`：下载生成的 Word 文件。

任务记录保存在 MySQL，文件暂存于服务器本地磁盘；多实例生产部署前应接入共享文件存储或对象存储。过期任务和文件会在下一次创建导出任务时清理。

## 匿名项目接口

- `GET /api/print-project`：通过 HttpOnly Cookie 恢复清单。
- `POST /api/print-project`：创建项目并迁入本机清单。
- `PUT /api/print-project`：携带修订号保存清单，冲突时返回 409。
- `POST /api/print-project/restore`：使用找回令牌切换到已有项目。
