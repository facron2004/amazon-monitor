# Amazon 运营 Agent V1.0 验收矩阵

更新时间：2026-08-12（Asia/Shanghai）

本文件以 `C:\Users\Facron\Downloads\PLAN.md` 为验收源。状态只使用：

- `通过`：当前源码、测试或运行产物提供了直接证据。
- `待真实验收`：实现已存在，但缺少计划要求的真实外部条件或业务运行证据。
- `待发布决策`：需要确认版本/提交范围，不以技术测试代替发布授权。

## 里程碑

| 里程碑 | 状态 | 当前证据 |
|---|---|---|
| M0 真实数据底座 | 通过 | 根级测试覆盖五个 workspace 并以 991 个单元测试正常退出；Shadow fixture/recovery/evidence/preflight/package 另有 32 个脚本测试；根级生产构建与浏览器测试通过；SQLite、压缩包、`tmp/`、评审暂存目录和测试日志未进入提交。 |
| M1 契约与持久化 | 通过 | 独立 `apps/agent`、`apps/desktop`；9 张 Agent/审批表；组织隔离、分页、状态、期望版本、幂等键与迁移测试。 |
| M2 工具与新鲜度 | 通过 | 15 个严格 Zod 只读工具；运行时注入组织/用户；统一 envelope；强制前置 freshness；陈旧数据置信度上限 `0.49` 且只保留补采提案。 |
| M3 单 Agent 与 API | 通过 | 单 Orchestrator、SQLite Session、10 turns、流式事件、主模型重试/备用模型、工具瞬态重试、SSE 重连、取消、审计、关联 recovery。桌面端支持 OpenAI、OpenAI-compatible 与 ChatGPT OAuth 多连接自由切换；OAuth 通过内置 Codex app-server 和 15 个动态业务工具运行，API Key 路径支持 Responses / Chat Completions。正式 30 题 Gold 已串行完成，所有题均覆盖预期工具；recovery 会带回原始请求上下文，并能 fan-out 到同一去重采集 job 的全部 waiting runs。 |
| M4 审批与前端 | 通过 | modified 生成新版本并使旧版本失效；服务端固定 L2/L3；飞书二次确认；执行开始/结束各自使用 SAVEPOINT 事务；三栏工作台、步骤、工具、证据、新鲜度、提案与审计导出。 |
| M5 Electron | 通过 | Electron 43.2.0；API/Agent/Crawler 三 utilityProcess；Agent 独占 Key/SDK；API 独占 SQLite/业务工具；Crawler 独占 Worker/Chromium；sandbox/preload/safeStorage/userData/有限重启/NSIS 均有产物或运行证据。冷启动首次加载失败会按同源 URL 自动重试；异步视图不再后台预载全部 chunk，加载失败会显示可恢复错误页。旧库通过 SQLite 在线备份迁入正式 userData，覆盖 WAL 数据并保留完整备份；原库、目标库和备份的 68 张表及关键业务计数已核对一致。Agent/Crawler 被强制终止后均恢复 running，Main 会向新 Agent 重新注入内存 Key；Agent 中断会失败当前运行且不重放，API 重启会收口中断的运行/步骤/工具调用并保留等待采集的 recovery。Electron 验收完成后已按计划单独移除 Tauri 源码、CLI、锁文件和专用 CORS。 |
| M6 灰度与发布 | 通过技术验收 / 待发布决策 | `AGENT_SDK_ENABLED` 默认关闭；自动更新默认关闭；多模型接入已同步为 SemVer `1.1.0` 并生成 NSIS。正式 600 秒/题 Gold 报告经人工标注后五项指标均达标；发布仍需签名证书与发布授权。 |

## 核心场景

| # | 场景 | 状态 | 证据或缺口 |
|---|---|---|---|
| 1 | 最近 7 天 Top50 新品，至少 freshness + 2 个业务工具 | 通过 | 正式 Gold 的 breakout-01/03 均 `missingTools=[]`，真实 EXE 记录 freshness、find_new_product_breakouts 与类目快照。 |
| 2 | ASIN 调查覆盖 BSR、关键词、价格、Coupon、评论和时间范围 | 通过 | 正式 Gold 的 asin-01 等调查题均覆盖预期业务工具，结论带 scope、evidenceRefs、snapshotRefs 和置信度。 |
| 3 | 数据过期只补采，补采失败无确定性结论 | 通过 | price-04/review-03/patrol-02 在严格 freshness 合并后均为 `missing`、置信度 `0.49`，行动只保留 recollect；批准后的 recovery 运行已完成。 |
| 4 | 修改提案后旧版不可执行，重复批准只写一次 | 通过 | API/Store 回归测试覆盖版本失效、重复点击、任务/执行幂等。 |
| 5 | 飞书未经二次确认不发送 | 通过 | 注入 RecordingSender 的服务测试证明批准和首次 execute 均零发送，显式 L3 确认后仅发送一次。 |
| 6 | 模型/Agent/Crawler 崩溃后 UI 可用且不重放写操作 | 通过 | 强杀 API 后 Renderer 存活且 API 以新 PID 恢复；强杀 Agent 与 Crawler 后三进程恢复 running，重启 Agent 重新获得 safeStorage Key。Agent 退出会终止 active runs，API 启动会收口中断运行并保留等待采集的 recovery；同一去重 job 的多个 recovery 均会启动，迟到桌面事件不会重新激活终态运行。 |
| 7 | Renderer 无 SQLite/文件/Shell/明文 Key | 通过 | context isolation、sandbox、nodeIntegration 关闭；preload 白名单；测试 Key 不出现在页面文本，清除后加密文件消失。 |
| 8 | Windows 安装/升级/卸载保留 AppData | 通过 | 当前 `1.1.0` NSIS 安装版已完成隔离安装、启动、recovery、通知配置和卸载；升级 fixture 验证 `priority=C`、`org_id=1`、标记和用户数据保留。历史 `0.6.1 → 1.0.0` 真实覆盖安装证据仍保留在早期记录中；正式 userData SQLite 在全过程中保持独立且卸载不删除。 |

## 当前门禁

- 单元测试：991（shared 59、Agent 23、API 660、Web 221、Desktop 28）；Desktop 已纳入根级 `npm test`。
- API 契约门禁：`verify:openapi-routes` 通过（216 个 route operation + 5 个直接端点，与 OpenAPI 221 个 operation 双向一致）。
- 浏览器测试：9。
- 根级生产构建：通过。
- `git diff --check`：通过，仅有 Windows 行尾提示。
- 生产依赖审计：0 vulnerabilities。
- 最新 NSIS：
  - 路径：`release/electron/Amazon Monitor Setup 1.1.0.exe`
  - 大小：427,796,361 bytes
  - SHA-256：`E096CC589C7F69C3D2F0848302BBF5E830DE4A89E424339D6909FFFA943F643A`

- 2026-08-09 增量运行时证据：Agent utility 关闭会取消运行、清理 RPC 并隔离关闭后消息；Agent bridge 发送失败会清理 active run 并将 API 运行收口为 `failed`。包级 Agent boundary smoke 使用本地流式模型 stub 真实跨越 Renderer/preload/Main、safeStorage、API、Agent utility 与 Session/RPC；缺失新鲜度会进入 `waiting_approval`，批准 L2 recollect 后创建 recovery run，重复批准复用同一 execution；同时验证 SSE 事件回放、Agent 审计导出和进程输出不含配置 API Key；三 utility process 均为 `running`。全仓门禁和 Windows 包/安装/升级/发布证据已复验通过。
- 2026-08-09 API recovery 证据：首次动态 API 端口在 supervisor 中被固定，强杀 API utility 后以新 `bootId` 在同一 Renderer origin 恢复；页面仍可用且 API/Agent/Crawler 均为 `running`。该 smoke 已纳入 `verify:release:win`，本地运行命令为 `REQUIRE_PACKAGE_API_RECOVERY=true npm run verify:package-api-recovery`。
- 2026-08-09 Agent/Crawler recovery 证据：supervisor 对关闭中的 MessagePort 使用安全转发，API→Agent 转发失败会收口 active run；包级 smoke 动态排除监听 API utility 后，分别强杀剩余两个 NodeService（Agent、Crawler），每次均在同一 Renderer origin 看到 API readiness、三角色 `running` 和替换 utility。该 smoke 已纳入 `verify:release:win`，本地运行命令为 `REQUIRE_PACKAGE_AGENT_CRAWLER_RECOVERY=true npm run verify:package-agent-crawler-recovery`。
- 2026-08-09 安装版 recovery 证据：新增 `verify:package-install-recovery`，在 NSIS 安装目录的真实 EXE 上执行 Agent approval、API 与 Agent/Crawler recovery，并验证通知配置；恢复后静默卸载。安装版与 `win-unpacked` 共用同一 recovery/approval 矩阵，减少路径差异漏检。
- 2026-08-09 打包通知配置证据：新增 `verify:package-notification-runtime`，在隔离 userData 写入不含真实凭据的 `.env`，真实创建邮件计划并经本地假 SMTP 完成认证和 MIME 接收；SMTP 用户、发件人、收件人和发送日志均匹配，密码未出现在进程输出。该 smoke 已纳入 `verify:release:win`，`verify:package-install-recovery` 也会在 NSIS 安装目录复用它。
- 2026-08-09 桌面安全边界证据：IPC sender 只信任应用 Renderer 同源 URL，DevTools URL 被拒绝；supervisor 退出事件按 child 身份判定，Agent 错误回传对 `apiKey`、Bearer 和 `sk-*` 形态做脱敏；桌面 focused suite 为 28 tests。
- 2026-08-10 安装包审批闭环证据：Agent smoke 在隔离 userData 中执行 `B000TEST01` ASIN investigation，真实完成 freshness、ASIN 历史、关键词排名、价格、Coupon、评论五个专用工具；由于 fixture 无业务数据，结果明确为 `missing`/无业务证据并产生 recollect 提案，进入 `waiting_approval`。L2 批准创建 recovery run，重复批准复用同一 execution，并核对审批/执行审计记录、SSE 终态回放和 API/Agent/Crawler 均为 `running`。
- 2026-08-10 NSIS 安装版闭环证据：`verify:package-install-recovery` 已在真实安装目录 EXE 上复用 Agent approval smoke、API recovery、Agent/Crawler recovery 和通知 SMTP smoke，最后静默卸载且安装目录为空。
- 2026-08-09 Windows release workflow 门禁补齐：在签名打包前先执行根级 `npm run verify`，把生产构建、全量单测、浏览器测试、备份演练、发布门禁和生产依赖审计纳入同一 CI job；随后继续执行包级运行、安装、恢复、升级、卸载和证据校验。

- 真实 EXE 金标报告：
  - 基线：`output/agent-gold-evaluation-exe-formal-strict-2026-08-01.json`，30/30 题，`runTimeoutMs=600000`，data support `100%`、unsupported deterministic `0%`、tool success `100%`。
  - 人工标注后：`output/agent-gold-evaluation-exe-formal-strict-annotated-2026-08-01.json`，五项指标均为目标通过（data support `100%`、unsupported `0%`、alert validity `100%`、tool success `100%`、recovery `100%`）。复现范围和标注保存在 [`docs/agent-gold-scope-formal-2026-08-01.json`](agent-gold-scope-formal-2026-08-01.json)。

## 发布前剩余条件

1. 其他验收环境需完成 OAuth 或通过 Windows safeStorage 保存真实供应商 API Key，且不得把凭据写入对话、终端、SQLite 或日志。
2. 正式分发前需要 Windows 代码签名证书和发布授权；当前 NSIS 为内部未签名验收包。
