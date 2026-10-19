# 部署与运维指南

[返回简体中文主文档](../README.md) · [功能与架构指南](feature-guide.md)

以下命令除特别说明外均在仓库根目录执行。首次安装依赖、构建共享包与 Agent 包、安装 Chromium 的步骤见主文档。

[构建部署](#构建和部署) · [CLI 与备份](#cli-采集备份与-shadow-验证) · [采集配置](#采集说明) · [Worker](#worker-与队列) · [通知](#通知发送配置) · [故障排查](#故障排查)

## 构建和部署

### 构建生产版本

```bash
npm run build
npm run build:release    # 清理旧产物后构建可发布版本
npm run verify            # 构建、单测、浏览器测试和生产依赖门禁
npm run test:release-gates # 发布门禁脚本的单元测试
npm run verify:openapi-routes # 双向检查 Express 路由与 OpenAPI operation
npm run verify:web-bundle  # 检查入口 CSS/JS 体积预算
```

### 启动生产服务

构建完成后，API 服务会自动托管前端静态文件：

```bash
npm start
```

访问：[http://127.0.0.1:4000](http://127.0.0.1:4000)。另开终端运行编译后的 Worker：

```bash
node --no-warnings apps/api/dist/worker.js
```

API 默认绑定 `127.0.0.1`；需要外部访问时，可在部署进程环境中配置 `HOST`，并配合反向代理。生产进程使用 `NODE_ENV=production`。

> 💡 **提示**：API 服务会自动检测并托管 `apps/web/dist` 目录，无需额外配置。

### Windows 打包与发布门禁

在 Windows 构建 NSIS 安装器，产物位于 `release/electron/`：

```bash
npm --workspace @amazon-monitor/desktop run package:win
```

包扫描、签名、运行时与安装验收命令：

```bash
npm run verify:package     # 检查 app.asar 未包含源码、测试、映射、数据库、环境、Cookie、日志或密钥文件
npm run verify:signature   # 检查 win-unpacked 可执行文件；本地无证书时给出兼容性提示
npm run verify:signatures  # 按桌面版本选择主 EXE；加 --installer 时同时检查 NSIS 安装器
npm run verify:package-runtime # 启动隔离 win-unpacked，检查真实页面/API 就绪并清理进程树
npm run verify:package-agent-runtime # 启动隔离 win-unpacked，验证真实 Agent bridge/模型/工具链路
npm run verify:package-notification-runtime # 启动隔离 win-unpacked，验证 userData .env 到 SMTP 通知的真实边界
npm run verify:package-api-recovery # 强杀 API utility，验证同端口重启、Renderer 和三进程状态恢复
npm run verify:package-agent-crawler-recovery # 分别强杀 Agent/Crawler utility，验证 Renderer、API 和状态恢复
npm run verify:package-install # 临时目录静默安装、运行已安装 EXE、再静默卸载
npm run verify:package-install-recovery # 安装当前 NSIS 后，在安装目录 EXE 上执行 recovery 和通知配置矩阵
npm run verify:package-upgrade # 临时目录覆盖安装，验证 userData 数据保留后再卸载
npm run collect:release-evidence # 输出版本、SHA-256、大小和签名状态的无秘密证据 JSON
npm run verify:release-evidence # 复核证据对应的当前文件、哈希和签名状态
# 如有上一版本安装器，可执行真实跨版本覆盖验收
npm run verify:package-upgrade -- --previous-installer="release/electron/Amazon Monitor Setup 1.0.0.exe"
npm run verify:release     # 执行包扫描、Web 体积、签名和真实运行时门禁
```

生产发布必须在 Windows 签名环境中显式开启严格门禁：

```powershell
$env:REQUIRE_CODE_SIGNATURE = "true"
npm run verify:release

# 已生成 NSIS 安装器时，额外验证安装器签名
$env:REQUIRE_INSTALLER_SIGNATURE = "true"
npm run verify:release:win
```

严格模式只接受 Authenticode 状态 `Valid`；无证书的本地 `win-unpacked` 会失败，这是预期结果。通过 electron-builder 的 `CSC_LINK` / `CSC_KEY_PASSWORD` 注入证书和密码，不要把证书、密码或 `.env` 放进仓库或安装包。

Windows 发布 CI 先执行根级 `npm run verify`（生产构建、全量单测、浏览器测试、备份演练、发布门禁和生产依赖审计），再使用 `npm --workspace @amazon-monitor/desktop run package:win` 生成当前版本安装器，随后执行 `npm run verify:release:win`，并额外完成安装、恢复、升级、卸载和证据校验；同时强制验证 `win-unpacked/Amazon Monitor.exe` 和 `Amazon Monitor Setup <desktop-version>.exe`。仓库中的 `.github/workflows/windows-release-verify.yml` 仅支持手动触发，证书从 GitHub Actions secrets 注入。

`verify:package-runtime`、`verify:package-agent-runtime`、`verify:package-notification-runtime`、`verify:package-api-recovery` 和 `verify:package-agent-crawler-recovery` 在 Windows 上执行：前者启动隔离 `win-unpacked`，检查真实 API/渲染页面就绪；Agent smoke 在同一隔离边界内配置临时本地 OpenAI 兼容流式模型，通过真实 preload/API 创建 Agent run，验证规划、freshness、模型和工具调用，在缺失新鲜度时进入 `waiting_approval`，批准 L2 recollect 后创建 recovery run，重复批准复用同一 execution，并检查 SSE 回放、审计导出、进程状态和输出脱敏；notification smoke 在隔离 userData 写入不含真实凭据的 `.env`，通过真实 API 创建邮件计划，并由本地假 SMTP 完成认证、收件和 MIME 数据接收，同时确认 SMTP 密码不出现在进程输出；API recovery smoke 会强杀 API utility，再验证原 Renderer origin 上的 readiness、bootId、页面和三 utility 状态恢复；Agent/Crawler recovery smoke 会识别三个 NodeService utility，排除持有监听端口的 API，分别强杀剩余两个并验证同一 Renderer、API readiness、三角色状态和替换进程恢复。所有 smoke 都会清理进程树与临时 userData。`verify:package-runtime` 同时支持 macOS；其余 smoke 在非 Windows 环境默认输出 skipped。设置对应的 `REQUIRE_PACKAGE_RUNTIME`、`REQUIRE_PACKAGE_AGENT_RUNTIME`、`REQUIRE_PACKAGE_NOTIFICATION_RUNTIME`、`REQUIRE_PACKAGE_API_RECOVERY` 或 `REQUIRE_PACKAGE_AGENT_CRAWLER_RECOVERY` 后，不支持的平台会视为失败。

`verify:package-install` 仅在 Windows 执行：它把当前版本 NSIS 安装器安装到随机临时目录，复用页面级运行时 smoke 检查已安装 EXE 的真实 API 和渲染页面，然后静默卸载并确认安装目录为空。测试使用独立的 `--user-data-dir`，不会清理或修改现有 AppData；临时目录会在成功或失败后清理。`verify:package-install-recovery` 在同一安装目录流程中进一步调用 Agent approval、API、Agent/Crawler recovery 和 notification runtime smoke，确认安装版资源路径、userData `.env` 发现、审批/recovery、SMTP 配置传递、端口固定和三 utility 重启边界与 `win-unpacked` 一致。

`verify:package-upgrade` 在同一隔离目录先写入代表旧版的 SQLite 表结构和标记，由当前 EXE 启动完成迁移，再覆盖安装、再次启动并卸载；它会确认 `priority=C`、`org_id=1` 等迁移结果以及标记在各阶段仍存在。传入 `--previous-installer=...` 时，首轮会先安装指定旧版本，再执行当前版本覆盖安装，形成真实跨版本验收（旧版本只需完成安装，运行时验收落在当前版本）。两种模式都验证用户数据与安装目录分离，完成后仍会清理整个临时根目录。

`collect:release-evidence` 只写入版本、路径、文件大小、SHA-256、Authenticode 状态、builder-debug.yml 指纹和构建提交号，不包含证书、密码或 `.env`。`verify:release-evidence` 会重新读取当前产物，核对必需文件、大小、哈希、签名状态、已知 artifact 类型和 release root 路径边界，避免上传与实际构建不一致或越界读取的证据。Windows CI 会在成功或失败后将证据 JSON 和 builder 调试元数据上传为 14 天 artifact，便于复核失败构建。

### macOS ARM64 打包

桌面端已增加 Apple Silicon ARM64 DMG 构建入口：

```bash
npm --workspace @amazon-monitor/desktop run package:mac:arm64
```

在 Agent 全量类型检查通过后，该命令会生成 `release/electron` 下的 macOS ARM64 DMG，并使用 `@openai/codex-darwin-arm64` 运行 Codex app-server。macOS 构建必须在 macOS runner 或 Mac 机器上执行；正式分发还需要 Developer ID 签名与 notarization。当前 Windows 主机只能完成源码、类型和打包配置验证，不能直接产出 macOS 安装包。

仓库提供 `.github/workflows/macos-arm64-package.yml` 手动工作流；在 GitHub Actions 中运行 `workflow_dispatch` 后，构建出的未签名 DMG 会作为 artifact 下载。正式对外发布时，再配置 Developer ID 签名和 notarization。

macOS 工作流在上传 DMG 前执行 `npm run verify:package-runtime`，使用隔离 userData 和数据库启动包内应用，验证页面、登录、业务 API 与就绪状态，并清理测试进程。

## CLI 采集、备份与 Shadow 验证

无需启动 Web 服务，直接运行采集任务：

```bash
npm run collect          # 采集全部（关键词 + 类目）
npm run collect:keyword  # 仅采集关键词
npm run collect:category # 仅采集类目
npm run worker           # 启动 Worker 处理队列任务
npm run backup:db        # 创建完整性校验后的 SQLite 快照
npm run backup:db -- --output D:\backups\amazon-monitor.sqlite
npm run backup:db -- --keep 7 --verify-restore
npm run verify:db-backup -- --input D:\backups\amazon-monitor.sqlite
npm run verify:db-backup-drill # 使用隔离 WAL fixture 演练备份、恢复和数据保留
npm run collect:sp-api-shadow-evidence -- <collector-config.json> --output=<evidence.json>
npm run verify:sp-api-shadow-evidence -- <evidence.json>
npm run verify:sp-api-shadow-preflight -- <config.json> --production-db=<production-db-path> --backup=<backup-path> --user-data=<shadow-userData> --production-user-data=<production-userData> --runtime-db=<shadow-db-path> --require-wal --max-wal-mb=512 --max-total-mb=1024
npm run assemble:sp-api-shadow-package -- --source-dir=<evidence-input-directory> --output=<new-package-directory>
npm run verify:sp-api-shadow-package -- <evidence-package-directory> # 校验真实 Shadow 证据包、SHA-256 和脱敏边界
```

> 💡 **提示**：CLI 命令适合服务器定时任务或快速测试采集功能。
> Worker 重启时会回收旧版无租约任务与已过期租约；生产环境可使用 systemd / PM2 守护进程。

`backup:db` 使用 SQLite 原生备份 API 从运行中的数据库生成快照，先执行完整性校验再落盘；目标文件已存在时会拒绝覆盖。默认写入数据库旁的 `backups/` 目录。`--verify-restore` 会把快照恢复到隔离临时库并重新打开校验，不触碰线上库；`--keep N` 才会按修改时间保留最新 N 个 `amazon-monitor-*.sqlite`，未显式指定时不会删除旧备份。也可以用 `verify:db-backup` 对已有快照单独执行恢复演练。

`verify:db-backup-drill` 使用编译后的 API 备份模块创建隔离 WAL 数据库，验证快照完整性、标记数据保留、恢复重开和 WAL/SHM sidecar 清理；不会读取或修改真实业务数据库。

## 采集说明

生产采集入口是 `apps/api/src/amazon/` 下的 Playwright 采集器：

- 按关键词配置打开 Amazon 搜索结果页
- 解析 ASIN、标题、图片、商品链接、搜索页价格、Coupon、Deal、评分、评论数、Sponsored、Prime、配送文案
- 如果 Amazon 返回验证码、自动访问拦截或页面没有商品卡片，任务会记录失败日志，并在 `data/collector-screenshots` 保存排查截图
- 不做假数据兜底，不生成虚构竞品
- 普通定时采集可复用同一 Worker 内当日的详情缓存以控制负载；界面发起的“重抓”会携带 `forceRefresh=true`，重新访问商品详情页，并在任务完成后清理前端请求/视图缓存再加载结果
- 同一目标同一业务日的强制重抓不会与正在执行的普通任务并发，而是等待前一任务结束后再执行，避免交叉写入同日快照

### 采集调优参数

可通过环境变量调整采集行为（Windows PowerShell 示例）：

```powershell
# 超时与重试
$env:AMAZON_COLLECT_TIMEOUT_MS="90000"
$env:AMAZON_COLLECT_DETAIL_TIMEOUT_MS="15000"
$env:AMAZON_COLLECT_SEARCH_RETRIES="3"
$env:AMAZON_COLLECT_SEARCH_RETRY_DELAY_MS="2500"

# 并发控制
$env:AMAZON_WORKER_CONCURRENCY="2"              # Worker 并行处理 job 数
$env:AMAZON_COLLECT_KEYWORD_CONCURRENCY="3"      # 关键词采集并发数
$env:AMAZON_COLLECT_CATEGORY_CONCURRENCY="1"     # 类目采集并发数
$env:AMAZON_COLLECT_DETAIL_CONCURRENCY="5"       # 商品详情页并发数

# 延迟与等待
$env:AMAZON_COLLECT_DETAIL_SETTLE_MS="300"
$env:AMAZON_COLLECT_PAGE_DELAY_MS="3000"
$env:AMAZON_BESTSELLER_SCROLL_DELAY_MS="600"
$env:AMAZON_COLLECT_WAIT_NETWORK_IDLE="false"

# 资源拦截（先保持默认值，再根据采集完整度调整）
$env:AMAZON_COLLECT_BLOCK_RESOURCES="true"
$env:AMAZON_COLLECT_CATEGORY_BLOCK_RESOURCES="true"
$env:AMAZON_COLLECT_CATEGORY_BLOCK_IMAGES="false"

$env:PLAYWRIGHT_HEADLESS="true"
```

基础配置见 [`.env.example`](../.env.example)。上述数值是调优示例；实际默认值见 [采集配置源码](../apps/api/src/amazon/config.ts)。

## Worker 与队列

Worker 使用独立的任务取消、租约、重试与心跳机制。

- **可中断超时**：`runJobWithTimeout` 使用 `Promise.race` + `AbortController`，超时后取消采集。任务超时由 `AMAZON_WORKER_JOB_TIMEOUT_MS` 控制，默认 10 分钟。
- **可注入 runner**：`runJobWithTimeout(store, job, timeoutMs, runner)` 接受自定义 runner，便于 `worker.test.ts` 用 20ms 假 runner 验证 abort 路径
- **统一环境变量解析**：`intEnv(name, default, min, max)` 取代裸 `Number(process.env.…)`，所有 env 都有边界保护
- **租约恢复**：启动时回收旧版无租约任务和已过期租约；运行中定期续租与回收，按重试次数重新排队或终止任务。
- **心跳可观测**：每 5s 写 `amazon_worker_heartbeat`（workerId / pid / host / startedAt / version / lastJobId / lastStatus），UI 顶栏绿/红点直接读这张表
- **多 lane 并行**：默认 2 个 lane 共享队列，每 lane 独立 `claimNextJob` + `AbortController`

## 通知发送配置

系统支持在后台创建每日通知计划，按 `Asia/Shanghai` 时间每天定时发送当日日报到邮箱或飞书。
通知计划、发送日志、正文、HTML 和 Excel 附件均归属当前组织；后台定时扫描可处理所有组织的到期计划，但每次投递只读取计划所属组织的数据。

### 邮件通知（SMTP）

邮箱使用真实 SMTP，不做模拟发送：

```powershell
$env:SMTP_HOST="smtp.example.com"
$env:SMTP_PORT="465"
$env:SMTP_SECURE="true"
$env:SMTP_USER="sender@example.com"
$env:SMTP_PASS="your-smtp-password"
$env:SMTP_FROM="sender@example.com"
```

桌面 EXE 不会把邮箱凭据打进安装包。安装版优先读取 `%APPDATA%\Amazon Monitor\.env`，也支持将 `.env` 放在 EXE 同目录；修改后重启 EXE 生效。

邮件正文使用 `Amazon Intelligence Brief` HTML 模板：先展示 30 秒执行摘要，再按事件归并 Critical Alerts，随后给出市场变化、BSR Top Movers、价格/Coupon/Deal、关键词动向和压缩后的普通变化；已有 Insight Event 会继续保留 What happened / Why it matters / Recommended action 和 Action Center 跟进信息。邮件仍附带完整 Excel 证据，未配置公开地址时不会伪造 Dashboard 链接。

如果需要邮件中的 Dashboard CTA，配置：

```powershell
$env:PUBLIC_BASE_URL="https://amazon-monitor.example.com"
```

邮件 CTA 会带 `source=email` 和报告日期参数；商品卡片沿用已采集的 Amazon listing 链接，完整历史和普通变化仍以 Web/Excel 为准。

### 飞书通知

飞书使用群机器人 Webhook，通知计划的目标填写完整 Webhook URL：

```text
https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxx
```

邮箱会直接附带 Excel 文件。飞书机器人不能直接上传本地附件；如果需要在飞书消息里打开同一份 Excel，给服务配置一个可访问地址：

```powershell
$env:PUBLIC_BASE_URL="https://amazon-monitor.example.com"
```

配置后，飞书日报会包含 `PUBLIC_BASE_URL/api/reports/daily.xlsx?date=YYYY-MM-DD` 下载链接。

## Category Best Sellers 采集配置

类目情报模块使用真实的 Amazon Best Sellers 页面，不使用模拟数据。

```powershell
$env:AMAZON_COLLECT_CATEGORY_RETRIES="3"
$env:AMAZON_COLLECT_CATEGORY_BLOCK_RESOURCES="true"
$env:AMAZON_COLLECT_CATEGORY_BLOCK_IMAGES="false"
$env:AMAZON_COLLECT_CATEGORY_CONCURRENCY="1"
$env:AMAZON_BESTSELLER_SCROLL_DELAY_MS="600"
$env:AMAZON_BESTSELLER_SCROLL_PASSES="12"
$env:AMAZON_BESTSELLER_STABLE_PASSES="4"
```

- `AMAZON_COLLECT_CATEGORY_RETRIES`：重试临时 Amazon 错误或空卡片页面
- `AMAZON_COLLECT_CATEGORY_BLOCK_RESOURCES`：阻止 Best Sellers 页面的字体/媒体请求以减少等待时间
- `AMAZON_COLLECT_CATEGORY_BLOCK_IMAGES`：阻止产品图片加载；默认 `false`，以保持商品图 URL 稳定。
- `AMAZON_COLLECT_CATEGORY_CONCURRENCY`：多个类目并行采集数（默认 1）

### 类目采集数据质量分级

`category-pipeline.ts` 把 TopN 完整度从"硬阈值"改为三档：

- **ok**（≥95%）：完整快照，正常入库
- **partial**（≥80%）：写入数据但记 `BsrSnapshotQuality.partial`，UI 显示 ⚠️ 提醒
- **fail**（<80%）：抛出 `StrictBsrCountError`，记录失败及质量信息，不作为成功快照入库。

存在缺失排名或重复排名时，即使数量达标也会降级为 `partial`。

## 故障排查

### 采集失败

检查 `data/collector-screenshots/` 目录查看失败时的页面截图，常见原因：

- Amazon 返回验证码（需要调整采集频率或 IP）
- 网络超时（增加 `AMAZON_COLLECT_TIMEOUT_MS`）
- 页面结构变化（需要更新选择器）

### Worker 离线

- 检查 `/api/collect/worker-status`：`alive: false` 表示没有有效心跳；先确认已另开终端运行 `npm run worker`。
- 启动后会回收旧版无租约任务及过期租约；生产环境可使用 systemd / PM2 守护。
- `/api/ready` 默认把 Worker 标记为 `not_required`（桌面端和独立 Worker 模式）；设置 `RUN_WORKER=true` 时会把 Worker 心跳作为就绪门槛，离线或 stale 会返回 503。

### 性能优化

先检查数据完整度和失败原因，再调整并发、超时、页面间隔与资源拦截。

- Worker 默认 2 路并行，类目默认 1 路，详情页默认 3 路。
- 类目字体和媒体请求默认拦截，类目图片默认保留，避免影响商品图 URL 稳定性。
- 普通任务可使用同日详情缓存；排查旧数据时使用界面的“重抓”入口。
- 调优后核对商品数量、排名覆盖、价格、评分与评论字段，不以耗时缩短代替质量检查。

### 数据库位置

源码运行默认使用仓库根目录的 `data/amazon-monitor.sqlite`，可通过 `DB_PATH` 修改；相对路径按启动进程的工作目录解析，多进程部署宜使用相同的绝对路径。桌面安装版使用独立 userData，升级时不要以源码目录覆盖安装版数据。

备份运行中的数据库时使用 `npm run backup:db`，并通过 `verify:db-backup` 演练恢复，保留 SQLite WAL 模式下的一致性。

## 发布流程

仓库遵循 [Keep a Changelog](https://keepachangelog.com/) + [Semantic Versioning](https://semver.org/)：

1. 根目录与 5 个工作区的 `package.json` 同步更新版本号。
2. 同步更新所有工作区内部的 `@amazon-monitor/*` 依赖版本与 `package-lock.json`。
3. `apps/web/src/constants/version.ts` → `VERSION_RELEASE_DATE`
4. 在 [更新日志](../CHANGELOG.md) 顶部追加新版本小节，同时更新主 README 的版本徽章。
5. 执行 `npm run verify` 和目标平台打包验收；发布提交与推送按团队流程执行。
6. `gh release create vX.Y.Z --notes-file CHANGELOG.md` 生成 GitHub Release

完整 ADR 见 [架构决策](adr/)。两个平台的工作流见 [Windows 发布验证](../.github/workflows/windows-release-verify.yml)和 [macOS ARM64 打包](../.github/workflows/macos-arm64-package.yml)，均需手动触发。
