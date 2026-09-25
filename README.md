# YGO CardPrint

游戏王卡图查询与线下打印清单的响应式前端。设计目标和上线规格见 [需求文档.md](./需求文档.md)。

## 本地运行

要求 Node.js LTS。运行 `npm install`，然后执行 `npm run dev`；浏览器打开 `http://localhost:3000`。

上线前可运行 `npm run lint`、`npm run typecheck` 和 `npm run build`。

## 当前已完成

- 桌面和移动端页面，卡名／密码／CID 查询、加载更多、错误及空状态。
- 服务端搜索代理 `/api/cards/search`，查询百鸽 v0 API 并规范化卡片资料。
- 简中、日文、英文、YGOPro 卡图可用性检查和图版选择。
- 打印清单的数量、排序、移除、清空及本机 30 天存储。
- 每页 3 × 3、A4 纵向的页面预览，显示张数、页数和 59 × 86 mm 规格。

**Word 导出按钮目前不可用。** 生成 `.docx`、原图质量校验、MySQL 持久化、导出任务及生产图片缓存属于后端阶段。页面明确标注该状态，不会下载占位文件。当前浏览器的本地清单仅适合单设备使用。

卡图和资料来自[百鸽 API](https://ygocdb.com/api)；上线前需确认数据、卡图及 CDN 的使用范围。

## 一键启动前端

Windows 用户可以双击项目根目录的 `启动前端.bat`。脚本会自动检查 Node.js/npm；如果尚未安装依赖，会先执行 `npm install`，然后启动 Next.js 开发服务器。

也可以在 PowerShell 中运行：

```powershell
.\启动前端.ps1
```

启动后访问 <http://localhost:3000>。在终端按 `Ctrl+C` 停止开发服务器。
