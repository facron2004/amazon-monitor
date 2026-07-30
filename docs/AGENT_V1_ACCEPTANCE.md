# Amazon 运营 Agent V1.0 验收矩阵

更新时间：2026-07-30（Asia/Shanghai）

本文件以 `C:\Users\Facron\Downloads\PLAN.md` 为验收源。状态只使用：

- `通过`：当前源码、测试或运行产物提供了直接证据。
- `待真实验收`：实现已存在，但缺少计划要求的真实外部条件或业务运行证据。
- `待发布决策`：需要确认版本/提交范围，不以技术测试代替发布授权。

## 里程碑

| 里程碑 | 状态 | 当前证据 |
|---|---|---|
| M0 真实数据底座 | 通过 | 根级测试覆盖五个 workspace 并以 901 个测试正常退出；根级生产构建与浏览器测试通过；SQLite、压缩包、`tmp/`、评审暂存目录和测试日志未进入提交。v0.7/SP-API、安全底座与 Agent 源码已形成提交 `37ba0ce`。 |
| M1 契约与持久化 | 通过 | 独立 `apps/agent`、`apps/desktop`；9 张 Agent/审批表；组织隔离、分页、状态、期望版本、幂等键与迁移测试。 |
| M2 工具与新鲜度 | 通过 | 15 个严格 Zod 只读工具；运行时注入组织/用户；统一 envelope；强制前置 freshness；陈旧数据置信度上限 `0.49` 且只保留补采提案。 |
| M3 单 Agent 与 API | 通过（实现）/待真实验收（模型） | 单 Orchestrator、SQLite Session、10 turns、流式事件、主模型重试/备用模型、工具瞬态重试、SSE 重连、取消、审计、关联 recovery。模型输出已改为 OpenAI strict structured output 可接受的必填/nullable 范围与五类固定 action payload；打包 EXE 已越过 Schema 转换并到达 OpenAI 鉴权层。真实模型成功输出尚未执行。 |
| M4 审批与前端 | 通过 | modified 生成新版本并使旧版本失效；服务端固定 L2/L3；飞书二次确认；执行开始/结束各自使用 SAVEPOINT 事务；三栏工作台、步骤、工具、证据、新鲜度、提案与审计导出。 |
| M5 Electron | 通过 | Electron 43.2.0；API/Agent/Crawler 三 utilityProcess；Agent 独占 Key/SDK；API 独占 SQLite/业务工具；Crawler 独占 Worker/Chromium；sandbox/preload/safeStorage/userData/有限重启/NSIS 均有产物或运行证据。冷启动首次加载失败会按同源 URL 自动重试；异步视图不再后台预载全部 chunk，加载失败会显示可恢复错误页。旧库通过 SQLite 在线备份迁入正式 userData，覆盖 WAL 数据并保留完整备份；原库、目标库和备份的 68 张表及关键业务计数已核对一致。Agent/Crawler 被强制终止后均恢复 running，Main 会向新 Agent 重新注入内存 Key；Agent 中断会失败当前运行且不重放，API 重启会收口中断的运行/步骤/工具调用并保留等待采集的 recovery。Electron 验收完成后已按计划单独移除 Tauri 源码、CLI、锁文件和专用 CORS。 |
| M6 灰度与发布 | 待真实模型验收 | `AGENT_SDK_ENABLED` 默认关闭；自动更新默认关闭；Agent V1.0 已同步为 SemVer `1.0.0` 并生成最终 NSIS。缺少真实 Key 下的对话、调查、行动、恢复和质量指标证据。 |

## 核心场景

| # | 场景 | 状态 | 证据或缺口 |
|---|---|---|---|
| 1 | 最近 7 天 Top50 新品，至少 freshness + 2 个业务工具 | 待真实验收 | 金标题目及必需工具检查器已覆盖；需真实模型运行证明实际调用。 |
| 2 | ASIN 调查覆盖 BSR、关键词、价格、Coupon、评论和时间范围 | 待真实验收 | 工具契约与金标题目已覆盖；需真实模型结构化输出证明。 |
| 3 | 数据过期只补采，补采失败无确定性结论 | 通过（策略/测试）/待真实验收（端到端） | freshness policy、置信度/action 过滤及评分器测试通过；需安装包真实运行复核展示。 |
| 4 | 修改提案后旧版不可执行，重复批准只写一次 | 通过 | API/Store 回归测试覆盖版本失效、重复点击、任务/执行幂等。 |
| 5 | 飞书未经二次确认不发送 | 通过 | 注入 RecordingSender 的服务测试证明批准和首次 execute 均零发送，显式 L3 确认后仅发送一次。 |
| 6 | 模型/Agent/Crawler 崩溃后 UI 可用且不重放写操作 | 通过（进程/持久化）/待真实模型中断 | 强杀 API 后 Renderer 存活且 API 以新 PID 恢复；强杀 Agent 与 Crawler 后三进程恢复 running，重启 Agent 重新获得 safeStorage Key。Agent 退出会终止 active runs，API 启动会把中断运行、步骤和工具调用标记 failed 并记录 `replayed: false`，等待采集的 recovery 保持可恢复。真实模型流中断仍待 Key。 |
| 7 | Renderer 无 SQLite/文件/Shell/明文 Key | 通过 | context isolation、sandbox、nodeIntegration 关闭；preload 白名单；测试 Key 不出现在页面文本，清除后加密文件消失。 |
| 8 | Windows 安装/升级/卸载保留 AppData | 通过 | 在隔离安装目录完成 `0.6.1 → 1.0.0 → 卸载`；EXE 文件版本从 `0.6.1` 更新为 `1.0.0`。正式 userData SQLite 在全过程中的大小和 SHA-256 完全不变，卸载后仍保留；复核为 68 表、4 用户、4,446 洞察、2 任务且 `PRAGMA integrity_check = ok`。 |

## 当前门禁

- 单元测试：901（shared 59、Agent 16、API 600、Web 219、Desktop 7）；Desktop 已纳入根级 `npm test`。
- 浏览器测试：9。
- 根级生产构建：通过。
- `git diff --check`：通过，仅有 Windows 行尾提示。
- 生产依赖审计：2 个 moderate，来自 `exceljs -> uuid`；自动修复会破坏性降级 ExcelJS，未强制执行。
- 关键源码提交：`37ba0ce feat(agent): establish real-data desktop workflow`、`7e789f0 fix(agent): recover desktop runs and strict outputs`；验收矩阵与发布元数据由独立提交保存。
- 最新 NSIS：
  - 路径：`release/electron/Amazon Monitor Setup 1.0.0.exe`
  - 大小：331,304,874 bytes
  - SHA-256：`9CC495259F20E44703B485982502453EFF2222708C6756763356FB6E96AF55D1`

## 完成目标前的剩余条件

1. 在可见验收实例内通过 Windows safeStorage 保存真实 OpenAI API Key；不得把 Key 写入对话、终端、SQLite 或日志。
2. 在最终安装包内运行核心场景 1–6，导出审计 JSON。
3. 使用 `npm run agent:eval` 顺序运行 30 题真实金标集并记录五项指标；运行器通过安装包 API 调用 safeStorage 中的 Key，自动发现当前组织的真实类目、关键词、ASIN 与品牌，逐题保存审计并要求人工标注提醒有效性和恢复结果。指标不达标则继续修正，不以评分器单测代替。
