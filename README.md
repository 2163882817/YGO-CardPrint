# YGO CardPrint

游戏王卡图查询与线下打印清单的响应式前端。设计目标和上线规格见 [需求文档.md](./需求文档.md)，后续实现路线见 [推荐开发顺序.md](./推荐开发顺序.md)。

## 本地运行

要求 Node.js LTS。运行 `npm install`，然后执行 `npm run dev`；浏览器打开 `http://localhost:3000`。

上线前可运行 `npm run lint`、`npm run typecheck` 和 `npm run build`。

## 当前已完成

- 桌面和移动端页面，卡名／密码／CID 查询、加载更多、错误及空状态。
- 服务端搜索代理 `/api/cards/search`，查询百鸽 v0 API 并规范化卡片资料。
- 简中、日文、英文、YGOPro 卡图可用性检查和图版选择。
- 打印清单的数量、排序、移除、清空及本机 30 天存储。
- 每页 3 × 3、A4 纵向的页面预览，显示张数、页数和 59 × 86 mm 规格。

**Word 导出已可用。** 点击“导出 Word 文档”后，服务端会创建导出任务，下载卡图并使用 `docx` 生成 A4 纵向 3 × 3 的 `.docx` 文件；生成失败会在页面提示原因。导出任务和文件暂存于本地 `storage/exports`，30 分钟后过期；MySQL 持久化仍属于后续上线阶段。当前浏览器的本地清单仅适合单设备使用。

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

任务和文件暂存于服务器本地磁盘；多实例生产部署前应接入 MySQL 和共享文件存储或对象存储。文件过期后会在下一次创建导出任务时清理。
