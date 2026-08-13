# Amazon 关键词竞品价格与排名监控系统

> **v1.1.0** · [更新日志](CHANGELOG.md) · 2026-08-09

基于 PRD 落地的可运行系统：关键词配置、Amazon 搜索页真实采集、Category Best Sellers 采集、类目每日竞争情报首页、自营 SKU 经营中心、规则中心、每日快照、支持手动、CSV、BSR Top100、新品黑马与 Agent 证据候选人工确认入池的竞品池、跨关键词/类目去重的 Listing 与评分变化、昨日对比、告警、任务、日报、周报、月报、采集日志和后台页面已经串成闭环。

v0.5.0 引入 **AI Agent 矩阵**（确定性 + 证据绑定 + approval-gated）、**自营 SKU 经营中心**（风险/机会评分、Listing Health、Ads Workflow、Review VOC、Inventory、Profit）与 Identity / Worker 加固。**v0.6.0** 把 PRD P0 经营闭环补齐为可运营工作台：7 个 Agent + Agent 中心、规则中心、数据源中心（CSV/XLSX 导入）、活动排期、采集中心、店铺账号、日报/周报/月报归档（PDF/Markdown/Excel）、多租户组织隔离与今日经营概览。

## AI Agent 矩阵（v0.5.0 核心）

所有 Agent 都先经过确定性的新鲜度、证据和权限边界；只有显式设置 `AGENT_SDK_ENABLED=true` 后才会调用 Agent 外部 LLM。报告 AI 摘要还需要单独设置 `INSIGHT_REPORT_LLM_ENABLED=true`，避免仅因配置了通用模型 Key 就把经营数据外发。无论是否调用模型，都不编造缺失字段，**永不执行自动写操作**。每次运行都持久化到 `ai_runs` 表（输入上下文 / 输出 JSON / model id / status / error），所有推荐动作均带 `needs_human_approval: true`。低置信度 brief 不会产出 P0 动作。

| Agent                  | 端点                              | 数据源                                              | 核心用途                                                             |
| ---------------------- | --------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| **AI Daily Operator**  | `POST /api/ai/daily-brief`        | insight events + open tasks + SKU risk              | PRD 要求的"今日 5 件事"                                              |
| **Product Research**   | `POST /api/ai/research-product`   | 类目榜单快照 + 品牌矩阵 + 类目信号                  | 价格带、低 Review 切入窗口、候选 ASIN、可审计新品立项草案与人工确认入池 |
| **Competitor Analyst** | `POST /api/ai/analyze-competitor` | selected insight event + related ASIN/brand signals | 竞品价格、排名、Review、活动信号研判                                 |
| **Listing Optimizer**  | `POST /api/ai/analyze-listing`    | Listing 快照 + 核心词 + Review/Q&A 证据             | 持久化标题、Bullet、图片与 A+ 改写草案，人工审核后再进入任务         |
| **Ads Analyst**        | `POST /api/ai/analyze-ads`        | `ad_daily_metrics`                                  | spend-waste / scale-opportunity 诊断                                 |
| **Review VOC**         | `POST /api/ai/analyze-review-voc` | Review 文本 + 情绪 + 主题证据                       | 持久化供应商整改、Listing 建议、客服话术、新品机会和显式竞品证据缺口 |
| **Report Writer**      | `POST /api/ai/create-report`      | daily/weekly/monthly reports + insight events       | Markdown 运营报告 + 审批动作摘要                                     |

Agent 运行历史通过 `GET /api/ai/runs` 暴露给前端 `Agent 中心`，响应包含组织范围内的 `total`、`limit` 和 `offset`，支持按 Agent 类型、状态和分页查看完整审计记录；刷新保留当前页，切换筛选或每页条数时回到第一页。所有已登录角色都可审计本组织运行记录，反馈和 Agent 执行则按工作流、竞品、Ads、报告等领域能力授权。每条审批动作可从 Agent 中心或 Listing、Ads、Review VOC 专项页面转为 `ai_run` 来源任务，保留 run id、证据、理由、风险和置信度，之后进入人工执行与复盘流程；运营也可对单条建议点赞或点踩，反馈按组织和用户留痕并可重复更新。管理员和经理还可通过 `GET /api/ai/quality?days=7|30|90` 与 Agent 中心质量面板查看团队反馈、含动作运行的转任务率和已复盘任务确认率；任务尚未保存动作序号，因此该指标明确按运行去重，不表述为单条建议采纳率。

Product Research 的新品立项草案可在人工确认后把四项必需门槛一次拆成 Review VOC、利润、合规和供应链验证任务。转换接口按 Agent run 幂等，重复确认返回原任务，不重复写入；创建任务不代表批准立项，任务详情保留草案、证据日期、验收要求和来源运行。每次选品运行同时记录 BSR 证据日期、更新时间、来源和采集状态；超过每日新鲜度要求或采集不完整时，Agent 会把置信度降到观察级、草案切换为“保持观察”，并阻止创建立项验证任务。

全部 7 个 Agent 现在统一记录证据日期、更新时间、数据来源、采集状态、失败原因和时效阈值。竞品价格/活动按 3 小时、核心排名按 6 小时，其余日报、Listing、Ads、Review、报告和 BSR 证据按 24 小时评估；过期、缺失或采集不完整时，输出置信度最高为 `0.49`，只保留 P2 数据刷新动作。Listing、Ads 与 Review 的可复制执行产物会被隐藏到证据恢复可用，切换业务日期也会立即清除上一日期的 Agent 结果。

任务详情通过 `GET /api/tasks/:id/detail` 推荐最多 3 条本组织已发布 SOP，匹配只使用任务类型和结构化的 ASIN、品牌、关键词证据，并返回可见的分类、标签或正文命中原因。运营可在任务抽屉内展开或复制步骤；无匹配时保留真实空状态。带来源任务的 SOP 必须等该任务完成复盘后才能创建，避免未经验证的执行记录进入知识复用链路。

> 未来切换到 LLM 实现时，只需替换 `apps/api/src/services/*-agent-service.ts` 内部，**契约（`AiRecommendedAction` 类型 + `needs_human_approval` 字段）保持不变**——前端、其他服务、审计日志都不需要改。

### AI Daily Operator 详解

- 输入：今日 insight events、未关闭的 workflow tasks、SKU 当日 risk score
- 输出：5 件事 brief，每件事包含 ASIN / brand / 关联事件 / 推荐动作 / confidence / priority
- 风险控制：`needs_human_approval = true`（写操作绝不自动执行）
- 审计：`ai_runs` 永久留存调用记录（model id、status、error、duration_ms）

## 自营 SKU 经营中心

把"我方商品"作为经营对象管理，先用手动录入 / 模拟指标跑通 PRD P0 经营闭环，后续对接 SP-API / Ads API / 库存 / 利润真实数据源。店铺账号按组织隔离，记录 Amazon 站点、Seller ID、授权状态和启停状态；SKU 可按同站点店铺分配、调整或取消归属，并支持店铺筛选。

首页 `今日经营概览` 直接聚合当前组织的精确业务日 SKU 指标，展示今日/昨日销售、7 日销售趋势、订单、广告花费、ACOS、毛利率、库存风险、重点异动和开放任务。金额始终按站点币种拆分，多站点数据不会被错误相加；缺失指标显示为 `--` 并提示补录，不以 0 冒充真实经营结果。`今日必看` 默认只保留仍需处理的 P0/P1 事件，具备权限的运营可在首页直接转任务、标记已跟进、忽略或按当前业务日期生成归档日报。

SKU 详情通过 `GET /api/products/:id/operations` 聚合为一个组织隔离、业务日期一致的 360 运营工作区，覆盖销售、利润、广告、库存、关键词、BSR、Review VOC、Listing 健康、竞品、Agent 建议、任务和操作事件。界面按“经营趋势 / 健康与竞品 / 工作闭环”组织信息，并沿用 Ads 与利润域的角色级字段脱敏；无证据时明确显示数据缺口，不跨日期或跨组织拼接推断。

竞品池右侧洞察将“查看证据”和“打开 Amazon 商品页”拆成独立动作。重点 ASIN 可直接进入行动中心的对应 ASIN 案卷，通用入口则聚焦核心竞品案卷；跳转会清除旧的品牌、状态和复盘筛选，避免沿用无关上下文。若当前日期没有匹配事件，行动中心显示可取消筛选或生成洞察的真实空状态，不会合成不存在的分析。

行动中心会按 250 条一页自动读取当前筛选范围内的全部事件，而不是只使用前 100 条计算队列、ASIN 案卷、KPI 和图表；服务端派生筛选与趋势统计同样不再受 1000 条内部上限影响。分页读取按事件 id 去重，并在服务端重复返回同一页时停止，避免异常代理或缓存造成无限请求。

| 支柱                | 数据表                                                 | API                                                            | 侧边栏视图              | 评分维度                                                                                                   |
| ------------------- | ------------------------------------------------------ | -------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| **SKU 主数据**      | `product_main`                                         | `/api/products`                                                | `ProductsView.vue`      | —                                                                                                          |
| **日指标**          | `product_daily_metrics`                                | `POST /api/products/:id/daily-metrics`                         | `ProductsView`          | —                                                                                                          |
| **SKU 360 详情**    | 跨领域只读聚合                                         | `GET /api/products/:id/operations`                             | `ProductDetailPanel.vue` | 经营趋势 / 专项健康 / 竞品对比 / Agent 建议 / 任务与复盘                                                   |
| **风险评分**        | `product_risk_scores`                                  | `/api/products/:id/risk`                                       | `ProductsView`          | 库存 / 销售下滑 / 广告异常 / 核心词排名 / 评分 / 关联事件                                                  |
| **机会评分**        | `product_opportunity_scores`                           | `/api/products/:id/opportunity`                                | `ProductsView`          | 销售增长 / BSR 提升 / 广告效率 / 关键词提升 / 竞品缺口 / Review 改善                                       |
| **Listing Health**  | `listing_snapshots`                                    | `/api/listing-health`                                          | `ListingHealthView.vue` | 6 项检查（关键词覆盖、长度、重复、图片、bullet、Q&A、Review 反射）                                         |
| **Ads Workflow**    | `ad_daily_metrics`                                     | `/api/ads/metrics` `/api/ads/summary`                          | `AdsView.vue`           | ACOS / ROAS / CVR / 花费占比 / 预算使用率                                                                  |
| **Review VOC**      | `own_product_reviews`                                  | `/api/review-voc`                                              | `ReviewVocView.vue`     | sentiment / topic tags / 30 天聚合                                                                         |
| **Inventory**       | `product_inventory_settings`                           | `/api/inventory/plans` `/api/products/:id/inventory-plan/task` | `InventoryView.vue`     | stockout / reorder / overstock / data-gap / 人工确认转补货任务                                             |
| **Profit Safety**   | `product_profit_settings`                              | `/api/profit/plans` `/api/products/:id/profit-plan/task`       | `ProfitView.vue`        | 4 种价格情景 + minimum-safe / target-margin 安全线 / 人工确认转价格或活动评审任务                          |
| **规则中心**        | `alert_rule_configs`                                   | `/api/rules` `/api/rules/run`                                  | `RulesView.vue`         | 10 条 P0 规则全部可运行；核心词、评分、库存、广告、Review、Listing 支持阈值、冷却和标准事件生成            |
| **任务闭环**        | `tasks` / `task_notes`                                 | `/api/tasks/*`                                                 | `TasksView.vue`         | 事件证据详情 / AI 建议 / 已确认任务执行清单 CSV / 人工执行记录 / 前后指标 / 复核结论 / SOP 沉淀 / 组织隔离 |
| **活动排期**        | `promotion_plans`                                      | `/api/promotions/*`                                            | `PromotionsView.vue`    | 多店铺/SKU 活动时间线 / 临期准备 / 进行中 / 待复盘 / 准备与复盘任务                                        |
| **数据源中心**      | `data_source_configs` / `data_source_sync_runs`        | `/api/data-sources`                                            | `DataSourcesView.vue`   | 连接状态 / CSV 自营 SKU 日指标与 Ads 报表导入 / 执行历史 / 行级错误 / 最近成功 / 负责人备注                |
| **采集中心**        | `amazon_collect_job_queue` / `amazon_collect_task_log` | `/api/collectors/*`                                            | `CollectorsView.vue`    | Worker 心跳 / 队列健康 / 数据新鲜度 / 任务筛选 / 失败证据                                                  |
| **日报归档**        | `workflow_daily_reports`                               | `/api/reports/daily/*`                                         | `ReportsView.vue`       | 9 章节运营日报 / 数据覆盖 / 缺口归因与跳转 / 版本历史 / PDF、Markdown 与 Excel 交付                        |
| **周报 / 月报归档** | `workflow_period_reports`                              | `/api/reports/period/*`                                        | `ReportsView.vue`       | 销售利润环比 / SKU 排行 / 竞品与类目 / Ads / Listing 与 Review / 完成任务 / 下期行动 / PDF 与 Markdown     |

**风险/机会评分的核心原则**：缺失数据**不编造结论**——该维度直接不计入总分，并标记 `data_gap: true`，让运营能立即看到"哪里没数据"。

## 环境要求

- **Node.js >= 22.12.0**（使用 Node 内置 SQLite，不支持低版本）
- npm >= 10
- Playwright Chromium

> ⚠️ **重要**：本项目使用 Node.js 内置的 `node:sqlite` 模块，需要 Node 22.12.0 或更高版本。

## 技术栈

- `packages/shared`：TypeScript 领域模型与业务规则（28 个测试文件，~180 用例覆盖）
- `apps/api`：Express 4 + Playwright + Node 内置 SQLite + Helmet + Zod + express-rate-limit，本地数据文件在 `data/amazon-monitor.sqlite`
- `apps/web`：Vue 3 + Vite + Pinia + ECharts + @vueuse/core + @lucide/vue

> ⚠️ **重要**：项目当前使用 Express 4.x。Express 5 存在静态文件服务兼容性问题，请勿升级。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 安装 Playwright 浏览器

```bash
npm run test:browser  # 缺少 Chromium 时自动安装；已安装则跳过网络安装
```

### 3. 启动开发服务

```bash
npm run dev
```

**访问地址：**

- **前端开发服务器**（支持热重载）：http://localhost:5188
- **API 服务**：http://localhost:4000

> 💡 **提示**：开发时使用 5188 端口，前端代码修改会自动热重载。生产环境或构建后使用 4000 端口。
>
> 💡 **Worker 独立进程**：`npm run dev:api` 不会自动启动 Worker（避免与采集命令抢占资源）。需要队列处理时另开一个终端 `npm run worker`。Worker 心跳会写 `amazon_worker_heartbeat` 表，UI 顶栏 "Worker 状态" 直接读这张表。

### 4. 首次使用

系统不会自动写入演示数据。启动后：

1. 在后台新增关键词或类目
2. 点击"采集当前"或"采集全部"
3. 后端会用 Playwright 打开 Amazon 采集真实数据

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

访问：http://localhost:4000

> 💡 **提示**：API 服务会自动检测并托管 `apps/web/dist` 目录，无需额外配置。

### Windows 发布包门禁

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

`verify:package-runtime`、`verify:package-agent-runtime`、`verify:package-notification-runtime`、`verify:package-api-recovery` 和 `verify:package-agent-crawler-recovery` 在 Windows 上执行：前者启动隔离 `win-unpacked`，检查真实 API/渲染页面就绪；Agent smoke 在同一隔离边界内配置临时本地 OpenAI 兼容流式模型，通过真实 preload/API 创建 Agent run，验证规划、freshness、模型和工具调用，在缺失新鲜度时进入 `waiting_approval`，批准 L2 recollect 后创建 recovery run，重复批准复用同一 execution，并检查 SSE 回放、审计导出、进程状态和输出脱敏；notification smoke 在隔离 userData 写入不含真实凭据的 `.env`，通过真实 API 创建邮件计划，并由本地假 SMTP 完成认证、收件和 MIME 数据接收，同时确认 SMTP 密码不出现在进程输出；API recovery smoke 会强杀 API utility，再验证原 Renderer origin 上的 readiness、bootId、页面和三 utility 状态恢复；Agent/Crawler recovery smoke 会识别三个 NodeService utility，排除持有监听端口的 API，分别强杀剩余两个并验证同一 Renderer、API readiness、三角色状态和替换进程恢复。所有 smoke 都会清理进程树与临时 userData。非 Windows 默认输出 skipped；设置对应的 `REQUIRE_PACKAGE_RUNTIME`、`REQUIRE_PACKAGE_AGENT_RUNTIME`、`REQUIRE_PACKAGE_NOTIFICATION_RUNTIME`、`REQUIRE_PACKAGE_API_RECOVERY` 或 `REQUIRE_PACKAGE_AGENT_CRAWLER_RECOVERY` 后，非 Windows 环境会将不支持视为失败。

`verify:package-install` 仅在 Windows 执行：它把当前版本 NSIS 安装器安装到随机临时目录，复用页面级运行时 smoke 检查已安装 EXE 的真实 API 和渲染页面，然后静默卸载并确认安装目录为空。测试使用独立的 `--user-data-dir`，不会清理或修改现有 AppData；临时目录会在成功或失败后清理。`verify:package-install-recovery` 在同一安装目录流程中进一步调用 Agent approval、API、Agent/Crawler recovery 和 notification runtime smoke，确认安装版资源路径、userData `.env` 发现、审批/recovery、SMTP 配置传递、端口固定和三 utility 重启边界与 `win-unpacked` 一致。

`verify:package-upgrade` 在同一隔离目录先写入代表旧版的 SQLite 表结构和标记，由当前 EXE 启动完成迁移，再覆盖安装、再次启动并卸载；它会确认 `priority=C`、`org_id=1` 等迁移结果以及标记在各阶段仍存在。传入 `--previous-installer=...` 时，首轮会先安装指定旧版本，再执行当前版本覆盖安装，形成真实跨版本验收（旧版本只需完成安装，运行时验收落在当前版本）。两种模式都验证用户数据与安装目录分离，完成后仍会清理整个临时根目录。

`collect:release-evidence` 只写入版本、路径、文件大小、SHA-256、Authenticode 状态、builder-debug.yml 指纹和构建提交号，不包含证书、密码或 `.env`。`verify:release-evidence` 会重新读取当前产物，核对必需文件、大小、哈希、签名状态、已知 artifact 类型和 release root 路径边界，避免上传与实际构建不一致或越界读取的证据。Windows CI 会在成功或失败后将证据 JSON 和 builder 调试元数据上传为 14 天 artifact，便于复核失败构建。

## 常用命令

### 开发命令

```bash
npm run dev              # 启动完整开发环境（API + Web）
npm run dev:api          # 仅启动 API 服务
npm run dev:web          # 仅启动 Web 开发服务器
npm run build            # 构建生产版本
npm run test             # 运行全量测试（shared + api + web）
```

### CLI 采集命令

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
> Worker 崩溃时，下次启动会通过 `recoverStuckJobs` 自动回收卡在 `processing` 状态的 job，**生产环境建议用 systemd / pm2 守护以避免长时间离线**。

`backup:db` 使用 SQLite 原生备份 API 从运行中的数据库生成快照，先执行完整性校验再落盘；目标文件已存在时会拒绝覆盖。默认写入数据库旁的 `backups/` 目录。`--verify-restore` 会把快照恢复到隔离临时库并重新打开校验，不触碰线上库；`--keep N` 才会按修改时间保留最新 N 个 `amazon-monitor-*.sqlite`，未显式指定时不会删除旧备份。也可以用 `verify:db-backup` 对已有快照单独执行恢复演练。

`verify:db-backup-drill` 使用编译后的 API 备份模块创建隔离 WAL 数据库，验证快照完整性、标记数据保留、恢复重开和 WAL/SHM sidecar 清理；不会读取或修改真实业务数据库。

## 采集说明

生产采集入口是 `apps/api/src/amazon/` 下的 Playwright 采集器：

- 按关键词配置打开 Amazon 搜索结果页
- 解析 ASIN、标题、图片、商品链接、搜索页价格、Coupon、Deal、评分、评论数、Sponsored、Prime、配送文案
- 如果 Amazon 返回验证码、自动访问拦截或页面没有商品卡片，任务会记录失败日志，并在 `data/collector-screenshots` 保存排查截图
- 不做假数据兜底，不生成虚构竞品

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
$env:AMAZON_COLLECT_CATEGORY_CONCURRENCY="2"     # 类目采集并发数
$env:AMAZON_COLLECT_DETAIL_CONCURRENCY="5"       # 商品详情页并发数

# 延迟与等待
$env:AMAZON_COLLECT_DETAIL_SETTLE_MS="300"
$env:AMAZON_COLLECT_PAGE_DELAY_MS="3000"
$env:AMAZON_BESTSELLER_SCROLL_DELAY_MS="600"
$env:AMAZON_COLLECT_WAIT_NETWORK_IDLE="false"

# 资源拦截（强烈建议开启，提速 30-50%）
$env:AMAZON_COLLECT_BLOCK_RESOURCES="true"
$env:AMAZON_COLLECT_CATEGORY_BLOCK_RESOURCES="true"
$env:AMAZON_COLLECT_CATEGORY_BLOCK_IMAGES="true"

$env:PLAYWRIGHT_HEADLESS="true"
```

完整配置说明请参考 `.env.example`。

## Worker 强化（v0.5.0）

v0.5.0 把 Worker 的"超时可控"从"会终止任务"升级为"真的会终止"。

- **可中断超时**：`runJobWithTimeout` 用 `Promise.race` + `AbortController`，20s 跑不完的采集会被**真正取消**——之前 `setTimeout(() => controller.abort(), …)` 只调 abort 不 reject 会被静默吞掉
- **可注入 runner**：`runJobWithTimeout(store, job, timeoutMs, runner)` 接受自定义 runner，便于 `worker.test.ts` 用 20ms 假 runner 验证 abort 路径
- **统一环境变量解析**：`intEnv(name, default, min, max)` 取代裸 `Number(process.env.…)`，所有 env 都有边界保护
- **启动自动回收**：`recoverStuckJobs("Worker 进程重启，上一次未完成的任务被回收")` 在 Worker 启动时把卡在 `processing` 状态的 job 标 `failed`，避免队列永远不被消费
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
$env:AMAZON_COLLECT_CATEGORY_BLOCK_IMAGES="true"
$env:AMAZON_COLLECT_CATEGORY_CONCURRENCY="2"
$env:AMAZON_BESTSELLER_SCROLL_DELAY_MS="600"
$env:AMAZON_BESTSELLER_SCROLL_PASSES="12"
$env:AMAZON_BESTSELLER_STABLE_PASSES="4"
```

- `AMAZON_COLLECT_CATEGORY_RETRIES`：重试临时 Amazon 错误或空卡片页面
- `AMAZON_COLLECT_CATEGORY_BLOCK_RESOURCES`：阻止 Best Sellers 页面的字体/媒体请求以减少等待时间
- `AMAZON_COLLECT_CATEGORY_BLOCK_IMAGES`：阻止产品图片加载，开启后提速显著（图片 URL 仍从搜索结果页获取）
- `AMAZON_COLLECT_CATEGORY_CONCURRENCY`：多个类目并行采集数（默认 2）

### 类目采集数据质量分级（v0.5.0）

`category-pipeline.ts` 把 TopN 完整度从"硬阈值"改为三档：

- **ok**（≥95%）：完整快照，正常入库
- **partial**（≥80%）：写入数据但记 `BsrSnapshotQuality.partial`，UI 显示 ⚠️ 提醒
- **fail**（<80%）：标记失败，但**不**整批丢弃（之前 99/100 也全丢）

这样运营既能立刻看到数据缺口，又不会因为 1% 失败丢失 99% 的有效数据。

## 类目每日竞争情报首页

类目页会把最新 BSR 数据优先整理成每日战报，完整榜单仍保留在页面下方，适合先看异常和机会，再进入明细排查。

- **战况总览**：展示 Top100/Top50 新进、跌出 Top100、最大上升、最大下滑、新增 Coupon、价格新低和品牌集中度等 KPI。
- **AI 今日总结**：先校验当前采集到的快照、排名、价格、Deal/Coupon、Review 和品牌证据；默认不外发数据，只有完成数据共享评审并由部署配置显式设置 `INSIGHT_REPORT_LLM_ENABLED=true` 后，才会向配置的 OpenAI-compatible Responses endpoint 发送本周期摘要、Top 事件（含 ASIN/品牌/证据摘要）和 Top 品牌信号；不编造未采集字段。
- **重点异动信息流**：按重要性展示 ASIN 卡片，包含商品图、标题、品牌、ASIN、BSR 路径、价格活动、Review 增量和建议动作。
- **品牌矩阵**：聚合品牌在 Top10/Top50/Top100 的占位、平均排名、上升/下滑数量和主要价格带，点击品牌可打开右侧详情抽屉。
- **新品黑马与价格活动雷达**：突出新进榜、快速上升、低评论高排名、价格新低、Coupon 和 Deal 信号，帮助定位需要跟进的商品。
- **完整 BSR 榜单**：保留品牌、排名区间、关键词筛选和商品明细，并在行内展示昨日排名、7 日变化、首次上榜日期、累计上榜天数、新品状态和竞品池状态。
- **榜单 Diff**：支持今日对比昨日、7 日前、30 日前或自定义日期，统一查看新进、掉榜、排名升降、价格、Coupon、Deal 和 Review 增长变化。

## Identity / Auth（v0.5.0）

v0.5.0 补齐了之前缺失的认证层：

- `identity-store.ts`：组织 / 用户 / session / 密码哈希（`PASSWORD_ALGO`）完整 store
- `auth.ts` + `auth-service.ts`：`POST /api/auth/login`、`POST /api/auth/register`、`POST /api/auth/logout`、`GET /api/auth/me`
- `useAuthGuard` composable：前端路由守卫
- `AuthModal.vue`：登录 / 注册模态

### 组织数据边界

- 关键词监控、类目监控、竞品池、采集队列、采集日志、通知计划和通知发送日志均归属当前登录组织；相同关键词、类目、竞品 ASIN 或通知时间可由不同组织独立配置和运营。
- 关键词快照、排名矩阵、日变化、告警、关键词日报，以及类目快照、榜单 Diff、品牌矩阵、类目信号、价格/活动历史、BSR 洞察和 Product Research Agent 证据，均通过组织或监控配置归属收口，跨组织 ID 返回 `404`。
- 首页统计、竞品计数、采集中心、日报/Excel 和通知正文/附件中的关键词、类目与竞品数据按当前组织聚合；定时任务和 CLI 批量采集会把监控配置的组织继续传递到 Worker 任务与日志。
- 竞品池会按组织物化每日 KPI 快照，`GET /api/competitors/kpis` 仅在存在精确昨日快照时返回总竞品、核心、新进、价格活动和高优先跟进的日差值；首次启用或筛选视图不会用当前状态伪造历史趋势。
- 旧数据库迁移时，历史监控、竞品、日变化、告警、关键词日报、采集记录、通知计划和发送日志会兼容性归入组织 `1`。
- 关键词 SERP 与类目 BSR 原始快照持久化 `data_source`、`last_synced_at` 和 `sync_status`；采集成功/部分成功、手工写入与历史迁移来源保持可审计，详情页标题区直接显示最近快照来源和同步时间。
- 全局顶部新鲜度条按当前组织融合采集队列与最新原始快照，在所有业务页面持续展示关键词/类目的数据来源、同步状态和更新时间；最新任务失败时保留失败原因，桌面与移动端均可直接核对。
- PRD 第 10 章标准 API 已提供兼容入口：Dashboard 今日动作/事件流、竞品数值 ID 详情/双来源快照/统一时间线/CSV 导入、BSR 类目/Top100/差异/品牌矩阵/新品黑马、`/api/events` 状态动作、关键词/任务 `PUT` 更新、关键词历史与任务完成；原有更细粒度接口继续保留，完整契约见 `/api/openapi.json`。

## 共享业务规则

`packages/shared/` 是前后端共享的领域模型与业务规则层（**严格单向依赖**：shared ← api/web，不反向）：

- 类型定义：`types.ts` / `types-products.ts` / `types-rules.ts` / `insight-events.ts` / `strategy-tags.ts`
- 业务规则：`amazon-url.ts`（SSRF 防护 + 多市场域名白名单）、`strategy-tags.ts`（策略标签归一化）、`insight-events.ts`（事件去重 + 优先级）、`types-rules.ts`（PRD P0 告警规则目录）
- 18+ 测试文件，~180 个测试用例

## 项目结构

```
amazon-monitor/
├── packages/shared/              # 共享类型和业务规则（前后端共享）
├── apps/
│   ├── api/                      # 后端服务
│   │   └── src/
│   │       ├── index.ts          # 启动入口（含 cron + 可选 RUN_WORKER）
│   │       ├── cli.ts            # CLI 工具（collect / collect:keyword / collect:category）
│   │       ├── worker.ts         # Worker 队列处理（v0.5.0 可中断超时 + stuck job 回收）
│   │       ├── worker.test.ts    # Worker 单元测试（abort 路径 +20ms 假 runner）
│   │       ├── server.ts         # Express API（含 auth / helmet / rate-limit）
│   │       ├── store.ts          # Store 接口组合（10+ 子接口）
│   │       ├── store/            # Store 模块化实现（v0.5.0 新增 10+ 文件）
│   │       │   ├── types.ts          # 10 个子接口定义
│   │       │   ├── sql-utils.ts      # SQL 工具函数（含 withTransaction SAVEPOINT 嵌套安全）
│   │       │   ├── db.ts             # 数据库初始化 + Schema 迁移
│   │       │   ├── migration-utils.ts # 迁移工具 + 版本追踪
│   │       │   ├── bsr-store.ts
│   │       │   ├── category-snapshot-store.ts
│   │       │   ├── category-insight-store.ts
│   │       │   ├── category-price-store.ts
│   │       │   ├── keyword-snapshot-store.ts
│   │       │   ├── product-store.ts          # ★ v0.5.0 自营 SKU 主数据
│   │       │   ├── inventory-store.ts        # ★ v0.5.0 库存
│   │       │   ├── listing-health-store.ts   # ★ v0.5.0 Listing
│   │       │   ├── ads-store.ts              # ★ v0.5.0 Ads
│   │       │   ├── profit-store.ts           # ★ v0.5.0 利润
│   │       │   ├── review-voc-store.ts       # ★ v0.5.0 Review VOC
│   │       │   ├── sop-store.ts              # ★ v0.5.0 SOP
│   │       │   ├── task-store.ts             # ★ v0.5.0 任务
│   │       │   ├── identity-store.ts         # ★ v0.5.0 认证
│   │       │   ├── ai-run-store.ts           # ★ v0.5.0 AI Agent 审计
│   │       │   ├── rule-store.ts             # 规则中心配置
│   │       │   ├── data-source-store.ts      # 数据源连接与同步状态
│   │       │   └── ...
│   │       ├── store/schema/      # ★ v0.5.0 按领域拆分的 schema
│   │       │   ├── ads-schema.ts / ai-schema.ts / category-schema.ts
│   │       │   ├── identity-schema.ts / insight-schema.ts / inventory-schema.ts
│   │       │   ├── keyword-schema.ts / metadata-schema.ts / monitor-schema.ts
│   │       │   ├── notification-schema.ts / operational-schema.ts / product-schema.ts
│   │       │   ├── profit-schema.ts / queue-schema.ts / review-voc-schema.ts
│   │       │   ├── worker-schema.ts / workflow-schema.ts / rule-schema.ts
│   │       ├── services/          # ★ v0.5.0 业务服务层（路由 ↔ store 之间）
│   │       │   ├── ai-agent-service.ts         # AI Daily Operator
│   │       │   ├── product-research-agent-service.ts # Product Research
│   │       │   ├── competitor-agent-service.ts # Competitor Analyst
│   │       │   ├── ads-agent-service.ts        # Ads Analyst
│   │       │   ├── report-writer-agent-service.ts # Report Writer
│   │       │   ├── ads-workflow-service.ts
│   │       │   ├── auth-service.ts
│   │       │   ├── inventory-planning-service.ts
│   │       │   ├── listing-health-service.ts
│   │       │   ├── profit-planning-service.ts
│   │       │   ├── alert-rule-service.ts
│   │       │   ├── review-voc-agent-service.ts
│   │       │   ├── review-voc-service.ts
│   │       │   ├── sop-service.ts / task-service.ts
│   │       ├── routes/            # API 路由（v0.5.0 新增 10+ 文件）
│   │       │   ├── categories.ts / keywords.ts / competitors.ts
│   │       │   ├── insights.ts / operations.ts / notifications.ts
│   │       │   ├── reports.ts / validation.ts / http-utils.ts
│   │       │   ├── products.ts / inventory.ts / listing-health.ts / ads.ts
│   │       │   ├── review-voc.ts / profit.ts / sops.ts / tasks.ts
│   │       │   ├── auth.ts / ai.ts / brand-playbooks.ts / insight-events.ts / rules.ts / data-sources.ts
│   │       ├── amazon/            # 采集引擎
│   │       │   ├── parsers/           # 多市场解析器
│   │       │   ├── page-guards.ts     # CAPTCHA/封锁检测
│   │       │   ├── retry.ts           # 重试策略
│   │       │   ├── browser.ts         # Playwright 浏览器管理
│   │       │   ├── context.ts         # 浏览器上下文（时区/语言）
│   │       │   ├── config.ts          # 采集配置（含 intEnv 边界保护）
│   │       │   ├── abort.ts           # ★ v0.5.0 AbortController 辅助
│   │       │   └── ...
│   │       ├── insights/          # 洞察引擎（事件生成、评分、回顾）
│   │       │   ├── insight-event-generator.ts
│   │       │   ├── insight-event-builder.ts
│   │       │   ├── scoring-engine.ts
│   │       │   ├── brand-playbook.ts
│   │       │   ├── review-scheduler.ts / review-evaluator.ts
│   │       │   └── attribution-engine.ts
│   │       ├── pipeline.ts            # 关键词采集流程
│   │       ├── category-pipeline.ts   # 类目采集流程（含数据质量分级）
│   │       ├── notifier.ts            # 通知推送
│   │       ├── excel-report.ts        # Excel 报告
│   │       ├── reports/               # 报告生成
│   │       └── scheduler.ts           # 定时任务
│   └── web/                      # 前端界面
│       └── src/
│           ├── App.vue           # 主应用
│           ├── stores/           # Pinia 状态管理
│           │   ├── category.ts / keyword.ts / competitor.ts
│           │   ├── alert.ts / dashboard.ts
│           │   ├── insightEvents.ts / rules.ts
│           │   └── ...
│           ├── composables/      # 业务逻辑组合
│           │   ├── useAppController.ts
│           │   ├── useAppViewEffects.ts
│           │   ├── app-view-loader.ts   # TTL 视图缓存
│           │   ├── useKeywords.ts
│           │   ├── useCategoryIntelligence.ts
│           │   ├── useCategoryDailyBriefing.ts
│           │   ├── useCompetitors.ts
│           │   ├── useAuthGuard.ts
│           │   ├── collect-jobs.ts
│           │   └── ...
│           ├── components/       # Vue 组件
│           │   ├── ProductsView.vue           # 自营 SKU 经营中心
│           │   ├── ListingHealthView.vue      # ★ v0.5.0 Listing
│           │   ├── AdsView.vue                # ★ v0.5.0 Ads
│           │   ├── ReviewVocView.vue          # ★ v0.5.0 Review VOC
│           │   ├── InventoryView.vue          # ★ v0.5.0 库存
│           │   ├── ProfitView.vue             # ★ v0.5.0 利润
│           │   ├── RulesView.vue              # 规则中心
│           │   ├── DataSourcesView.vue        # 数据源中心
│           │   ├── CategoriesView.vue         # 类目情报
│           │   ├── categories/                # 类目情报页子组件
│           │   │   ├── CategoryHeader.vue
│           │   │   ├── CategoryKpiCards.vue
│           │   │   ├── CategoryLanePanel.vue
│           │   │   ├── CategoryInsightStrip.vue
│           │   │   └── ProductDetailDrawer.vue
│           │   ├── CategoryBoardPanel.vue     # 完整 BSR 榜单
│           │   ├── action-center/             # 行动中心全套组件
│           │   │   ├── ActionCenterPanel.vue / ActionCenterRow.vue
│           │   │   ├── ActionCenterKpiCards.vue / ActionCenterColumn.vue
│           │   │   ├── BrandPlaybookCard.vue / AsinGroupCard.vue
│           │   │   ├── PriceTimelineCard.vue / InsightEventDrawer.vue
│           │   │   └── ...
│           │   ├── reports/                   # 报告视图
│           │   └── ...
│           ├── utils/            # 工具函数（actionCenter / reportChart 等）
│           └── api-*.ts          # API 客户端（按领域拆分）
├── data/                         # 数据目录
│   └── amazon-monitor.sqlite     # SQLite 数据库
├── package.json                  # Monorepo 配置
├── CLAUDE.md                     # AI 助手项目上下文
├── AGENTS.md                     # AI Agent 工作手册
├── docs/                         # 项目文档
│   ├── adr/                      # 架构决策记录
│   └── archive/                  # 历史归档（审计报告 / 重构进展 / 优化总结等）
├── README.md                     # 本文档
└── .env.example                  # 环境变量模板
```

## 架构亮点

### 后端

- **Store 模块化**：数据库层拆分为 10+ 个领域子接口（MonitorStore、BsrStore、CategorySnapshotStore、ProductStore、AdsStore、InventoryStore、ListingHealthStore、ProfitStore、ReviewVocStore、IdentityStore、AiRunStore 等），每个子接口对应独立实现文件
- **Schema 按领域拆分**（v0.5.0）：`store/schema/*-schema.ts` 取代单一 `schema.ts`，新增 schema 不再需要改集中文件
- **Service 层**（v0.5.0）：`services/` 把业务编排（评分、Agent 决策、计划生成）从 routes 中抽出来，routes 只负责 HTTP / 校验 / 鉴权
- **规则中心**：PRD P0 告警规则目录定义在 shared，API 持久化运营覆盖值；库存、广告、Review、Listing 规则可按组织即时评估并生成标准 Insight Event
- **事务安全**：`withTransaction` 使用 SAVEPOINT 实现嵌套安全，Pipeline 写入操作包裹在 `runInTransaction()` 中
- **分页支持**：所有 list API 支持 `limit`（上界 1000）和 `offset` 参数
- **安全加固**：Helmet 安全头、express-rate-limit 速率限制、Zod 输入验证、CORS 配置、Amazon URL 域名白名单（`isAllowedAmazonHost`）
- **Worker 队列**：claim/retry/fail 状态机，支持多 lane 并行处理采集任务（默认 2 并发），启动时自动回收 stuck job
- **AI Agent 审计**：所有 Agent 调用的输入 / 输出 / model / status 永久写入 `ai_runs` 表

### 前端

- **运营工作台 UI v3**：采用紧凑导航轨道、全局命令栏和“经营状态 → 经营指标 → 今日行动 → 风险证据”的信息流，减少装饰卡片并强化任务扫描效率；设计基准见 `docs/design/operations-command-center-apple-v3.png`
- **Pinia 状态管理**：10+ 个领域 store，组件通过 `storeToRefs` 直接消费数据，消除多层 props drilling
- **Per-domain Loading**：8 个独立的 tab loading 状态 + 采集状态，切换 tab 不再误禁用采集按钮
- **视图缓存**：30 秒 TTL 缓存避免重复 API 请求
- **Watch 防抖**：`@vueuse/core` 的 `watchDebounced` 防止快速切换触发请求风暴
- **组件按需加载**：View 级组件使用 `defineAsyncComponent`，ECharts 按需引入
- **类目情报首页**：`CategoriesView` 复用 Pinia 类目数据 + `useCategoryDailyBriefing` 派生 KPI、三栏（事件分桶 Movers/Promotions/Fading）、其他信号洞察、BSR 榜单筛选与分页，不新增后端接口
- **自营 SKU 页面**：`ProductsView` 通过 `useProductStore` 消费 `/api/products`，展示经营指标、风险/机会评分和指标录入弹窗
- **规则中心页面**：`RulesView` 按运营场景分组展示 10 条 P0 规则，支持启停、阈值编辑、通知渠道、审批提示和一键评估；10 条规则均具备运行能力
- **数据源中心页面**：`DataSourcesView` 管理 SP-API、Ads API、公开采集、文件导入、ERP/WMS 和手工数据源的连接与同步状态；文件数据源可从 CSV/XLSX 事务化导入自营 SKU 日指标、Ads 报表、利润成本及采购库存假设，支持部分成功、行级错误、SKU 关联、增量列更新和按数据源查询的执行历史，外部 API 授权仍保留后续接入边界
- **采集中心页面**：`CollectorsView` 聚合 Worker、队列、新鲜度和执行明细，支持按关键词/类目发起采集并优先定位失败任务；执行日志使用组织隔离的 `total / limit / offset` 分页，历史证据不会被首屏条数静默截断
- **SOP 知识库**：`SopsView` 使用主从式运营布局集中呈现状态计数、分类、服务端全文检索、分页列表和执行正文；草稿可编辑并经确认发布，已发布 SOP 可归档，旧版数组接口保持兼容
- **报告工作台**：独立 `reports` Pinia store 管理日报、周/月洞察和归档历史；运营可生成按日期版本化的 9 章节日报，以及按等长窗口比较、分站点币种统计的周报/月报，并从紧凑导出菜单交付 PDF / Markdown / Excel
- **行动中心**：`action-center/` 子目录下 ~18 个组件，覆盖事件队列、ASIN 分组、Brand Playbook、价格时间线、归属引擎、回顾节奏、信号流和事件转任务闭环等
- **右侧详情抽屉**：`CategoryDailyBriefingDrawer` 支持 event/brand/opportunity 三种模式，ASIN 与品牌卡片在当前页展开详情
- **BSR 表格筛选**：客户端筛选（品牌 / ICE TYPE / Deal-Coupon / 排名窗口）+ 文本搜索；筛选变更时自动 reset `bsrTablePage = 1`
- **Auth 守卫**：`useAuthGuard` composable 路由级鉴权，未登录自动弹出 `AuthModal`

### 测试覆盖

以 `npm run verify` 为发布前基线。最近一次验证（2026-08-12）共 **188 个测试文件 / 991 个单元测试用例**；Shadow fixture/recovery/evidence/preflight/package 另执行 32 个脚本测试，浏览器门禁另外执行 9 个用例，另有 21 个发布门禁单测；同时检查 Web 入口 CSS 不超过 160 KB、JS 不超过 300 KB：

- 共享包：16 文件 / 59 用例（类型验证、业务规则、集成测试）
- Agent：10 文件 / 23 用例
- 后端 API：101 文件 / 660 用例
  - Store：队列状态机、SQL 工具、identity、ai_runs、stuck job 回收
  - 采集引擎：浏览器管理、上下文配置、代理池、品牌质量、abort 路径
  - 解析器：多市场价格/货币/评分格式
  - 端到端：关键词 pipeline、类目 intelligence、API 路由（含 v0.5.0 的 products/inventory/listing-health/ads/review-voc/profit/sops/tasks/auth/ai）
- Worker：`runJobWithTimeout` 在 20ms 超时下必抛 `AbortError`，且 runner 必收到 abort 信号
- 前端 Web：58 文件 / 221 用例
- 桌面端：3 文件 / 28 用例
- 浏览器：2 文件 / 9 用例

## 故障排查

### 采集失败

检查 `data/collector-screenshots/` 目录查看失败时的页面截图，常见原因：

- Amazon 返回验证码（需要调整采集频率或 IP）
- 网络超时（增加 `AMAZON_COLLECT_TIMEOUT_MS`）
- 页面结构变化（需要更新选择器）

### Worker 离线

- 检查 `/api/collect/worker-status`：`alive: false` 时说明 Worker 进程已挂
- 启动后会自动 `recoverStuckJobs` 回收卡住的 job，**生产环境建议用 systemd / pm2 守护**
- `/api/ready` 默认把 Worker 标记为 `not_required`（桌面端和独立 Worker 模式）；只有设置 `RUN_WORKER=true` 时才会把 Worker 心跳作为就绪门槛，离线或 stale 会返回 503。

### 性能优化

实测类目采集（100 商品，2 页）从 **7.5 分钟优化到 2 分钟以内**，提速 3.8 倍。关键措施：

- **开启资源拦截**：`AMAZON_COLLECT_BLOCK_RESOURCES="true"` 拦截图片/字体/媒体，每页省 2-5MB 加载时间
- **提高并发**：Worker 2 路并行 + 关键词并发 3 + 类目并发 2 + 详情页并发 5
- **降低等待延迟**：页面间隔 3s（默认 5s）、滚动延迟 600ms（默认 700ms）
- **Detail 页不等待 networkidle**：默认关闭 `AMAZON_COLLECT_WAIT_NETWORK_IDLE`，每个商品详情页省 5-15s
- **浏览器启动参数优化**：`--disable-dev-shm-usage`、`--disable-gpu`、`--disable-extensions`

> 数据完整性验证：开启资源拦截后，价格/评分/评论数/BSR 排名等字段覆盖率与关闭拦截时持平（97-100%）。

### 数据库位置

数据库文件：`data/amazon-monitor.sqlite`

可使用任何 SQLite 客户端查看，建议定期备份 `data` 目录。

## 发布流程

仓库遵循 [Keep a Changelog](https://keepachangelog.com/) + [Semantic Versioning](https://semver.org/)：

1. `package.json`（根 / `apps/api` / `apps/web` / `packages/shared`）同步 bump
2. `apps/web` / `apps/api` 里 `@amazon-monitor/shared` 的版本字符串同步更新
3. `apps/web/src/constants/version.ts` → `VERSION_RELEASE_DATE`
4. `CHANGELOG.md` 顶部追加新版本小节
5. `npm run test` 全绿后 commit + push
6. `gh release create vX.Y.Z --notes-file CHANGELOG.md` 生成 GitHub Release

完整 ADR 见 `docs/adr/`。

## 更多文档

- [CLAUDE.md](CLAUDE.md) - AI 编码助手项目上下文
- [AGENTS.md](AGENTS.md) - AI Agent 工作手册和编码约定
- [CHANGELOG.md](CHANGELOG.md) - 版本变更记录（Keep a Changelog 格式）
- [架构决策](docs/adr/) - 关键设计选择的 ADR 记录
- [环境变量配置](.env.example) - 完整的配置选项说明
- [历史归档](docs/archive/) - 审计报告、重构进展、优化总结等历史快照
