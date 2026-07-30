# Amazon 运营 Agent V1.0 验收矩阵

更新时间：2026-07-30（Asia/Shanghai）

本文件以 `C:\Users\Facron\Downloads\PLAN.md` 为验收源。状态只使用：

- `通过`：当前源码、测试或运行产物提供了直接证据。
- `待真实验收`：实现已存在，但缺少计划要求的真实外部条件或业务运行证据。
- `待发布决策`：需要确认版本/提交范围，不以技术测试代替发布授权。

## 里程碑

| 里程碑 | 状态 | 当前证据 |
|---|---|---|
| M0 真实数据底座 | 通过 | 根级测试覆盖五个 workspace 并以 891 个测试正常退出；根级生产构建与浏览器测试通过；SQLite、压缩包、`tmp/`、评审暂存目录和测试日志未进入提交。v0.7/SP-API、安全底座与 Agent 源码已形成提交 `37ba0ce`。 |
| M1 契约与持久化 | 通过 | 独立 `apps/agent`、`apps/desktop`；9 张 Agent/审批表；组织隔离、分页、状态、期望版本、幂等键与迁移测试。 |
| M2 工具与新鲜度 | 通过 | 15 个严格 Zod 只读工具；运行时注入组织/用户；统一 envelope；强制前置 freshness；陈旧数据置信度上限 `0.49` 且只保留补采提案。 |
| M3 单 Agent 与 API | 通过（实现）/待真实验收（模型） | 单 Orchestrator、SQLite Session、10 turns、流式事件、主模型重试/备用模型、工具瞬态重试、SSE 重连、取消、审计、关联 recovery。真实模型成功输出尚未执行。 |
| M4 审批与前端 | 通过 | modified 生成新版本并使旧版本失效；服务端固定 L2/L3；飞书二次确认；执行开始/结束各自使用 SAVEPOINT 事务；三栏工作台、步骤、工具、证据、新鲜度、提案与审计导出。 |
| M5 Electron | 通过 | Electron 43.2.0；API/Agent/Crawler 三 utilityProcess；Agent 独占 Key/SDK；API 独占 SQLite/业务工具；Crawler 独占 Worker/Chromium；sandbox/preload/safeStorage/userData/有限重启/NSIS 均有产物或运行证据。冷启动首次加载失败会按同源 URL 自动重试；强制延迟 API 后约 3.2 秒恢复并渲染登录页。 |
| M6 灰度与发布 | 待真实验收 | `AGENT_SDK_ENABLED` 默认关闭；自动更新默认关闭；最终 NSIS 已生成。缺少真实 Key 下的对话、调查、行动、恢复和质量指标证据；正式发布版本号尚未确认。 |

## 核心场景

| # | 场景 | 状态 | 证据或缺口 |
|---|---|---|---|
| 1 | 最近 7 天 Top50 新品，至少 freshness + 2 个业务工具 | 待真实验收 | 金标题目及必需工具检查器已覆盖；需真实模型运行证明实际调用。 |
| 2 | ASIN 调查覆盖 BSR、关键词、价格、Coupon、评论和时间范围 | 待真实验收 | 工具契约与金标题目已覆盖；需真实模型结构化输出证明。 |
| 3 | 数据过期只补采，补采失败无确定性结论 | 通过（策略/测试）/待真实验收（端到端） | freshness policy、置信度/action 过滤及评分器测试通过；需安装包真实运行复核展示。 |
| 4 | 修改提案后旧版不可执行，重复批准只写一次 | 通过 | API/Store 回归测试覆盖版本失效、重复点击、任务/执行幂等。 |
| 5 | 飞书未经二次确认不发送 | 通过 | 注入 RecordingSender 的服务测试证明批准和首次 execute 均零发送，显式 L3 确认后仅发送一次。 |
| 6 | 模型/Agent/Crawler 崩溃后 UI 可用且不重放写操作 | 部分通过 | 强杀 API utilityProcess 后 Renderer 存活、API 新 PID 恢复；三进程共享有限重启策略；写入幂等与 recovery 测试通过。真实模型中断恢复仍待 Key。 |
| 7 | Renderer 无 SQLite/文件/Shell/明文 Key | 通过 | context isolation、sandbox、nodeIntegration 关闭；preload 白名单；测试 Key 不出现在页面文本，清除后加密文件消失。 |
| 8 | Windows 安装/升级/卸载保留 AppData | 通过 | 静默安装、同目录重装、卸载均成功；Agent 会话在重装后可读，卸载后 SQLite 保留。 |

## 当前门禁

- 单元测试：891（shared 59、Agent 11、API 597、Web 219、Desktop 5）；Desktop 已纳入根级 `npm test`。
- 浏览器测试：9。
- 根级生产构建：通过。
- `git diff --check`：通过，仅有 Windows 行尾提示。
- 生产依赖审计：2 个 moderate，来自 `exceljs -> uuid`；自动修复会破坏性降级 ExcelJS，未强制执行。
- 源码提交：`37ba0ce feat(agent): establish real-data desktop workflow`；验收矩阵与产品文档由独立文档提交保存。
- 最新 NSIS：
  - 路径：`release/electron/Amazon Monitor Setup 0.6.1.exe`
  - 大小：331,302,352 bytes
  - SHA-256：`932EA23C7A8A107327F13C2ECB05449C03BA461F61293F65CB13F761CDAD29CA`

## 完成目标前的剩余条件

1. 在可见验收实例内通过 Windows safeStorage 保存真实 OpenAI API Key；不得把 Key 写入对话、终端、SQLite 或日志。
2. 在最终安装包内运行核心场景 1–6，导出审计 JSON。
3. 顺序运行 30 题金标集并记录五项真实指标；指标不达标则继续修正，不以评分器单测代替。
4. 确认产品发布版本继续使用 `0.6.1`，还是将 Agent V1.0 同步到新的 SemVer，并形成独立发布提交。
