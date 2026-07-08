# Amazon 关键词竞品价格与排名监控系统

> **v0.5.0** · [更新日志](CHANGELOG.md) · [v0.5.0 Release Notes](https://github.com/facron2004/amazon-monitor/releases/tag/v0.5.0) · 2026-07-08

基于 PRD 落地的可运行系统：关键词配置、Amazon 搜索页真实采集、Category Best Sellers 采集、类目每日竞争情报首页、自营 SKU 经营中心、每日快照、竞品池、昨日对比、告警、任务、日报、采集日志和后台页面已经串成闭环。

v0.5.0 引入 **AI Agent 矩阵**（4 个确定性 + 证据绑定 + approval-gated 的分析器）和 **自营 SKU 经营中心**（风险/机会评分、Listing Health、Ads Workflow、Review VOC、Inventory Replenishment、Profit Safety Line 六大支柱），完整对齐 PRD P0 经营闭环。

## AI Agent 矩阵（v0.5.0 核心）

所有 Agent **当前实现都是确定性的**——不调用外部 LLM，不编造缺失字段，**永不执行自动写操作**。每次运行都持久化到 `ai_runs` 表（输入上下文 / 输出 JSON / model id / status / error），所有推荐动作均带 `needs_human_approval: true`。低置信度 brief 不会产出 P0 动作。

| Agent | 端点 | 数据源 | 核心用途 |
|---|---|---|---|
| **AI Daily Operator** | `POST /api/ai/daily-brief` | insight events + open tasks + SKU risk | PRD 要求的"今日 5 件事" |
| **Listing Optimizer** | `POST /api/ai/analyze-listing` | listing snapshots | 标题/图片/bullet/Q&A 改进 |
| **Ads Analyst** | `POST /api/ai/analyze-ads` | `ad_daily_metrics` | spend-waste / scale-opportunity 诊断 |
| **Review VOC** | `POST /api/ai/analyze-review-voc` | `own_product_reviews` | topic clusters + 痛点聚合 |

> 未来切换到 LLM 实现时，只需替换 `apps/api/src/services/*-agent-service.ts` 内部，**契约（`AiRecommendedAction` 类型 + `needs_human_approval` 字段）保持不变**——前端、其他服务、审计日志都不需要改。

### AI Daily Operator 详解

- 输入：今日 insight events、未关闭的 workflow tasks、SKU 当日 risk score
- 输出：5 件事 brief，每件事包含 ASIN / brand / 关联事件 / 推荐动作 / confidence / priority
- 风险控制：`needs_human_approval = true`（写操作绝不自动执行）
- 审计：`ai_runs` 永久留存调用记录（model id、status、error、duration_ms）

## 自营 SKU 经营中心

把"我方商品"作为经营对象管理，先用手动录入 / 模拟指标跑通 PRD P0 经营闭环，后续对接 SP-API / Ads API / 库存 / 利润真实数据源。

| 支柱 | 数据表 | API | 侧边栏视图 | 评分维度 |
|---|---|---|---|---|
| **SKU 主数据** | `product_main` | `/api/products` | `ProductsView.vue` | — |
| **日指标** | `product_daily_metrics` | `POST /api/products/:id/daily-metrics` | `ProductsView` | — |
| **风险评分** | `product_risk_scores` | `/api/products/:id/risk` | `ProductsView` | 库存 / 销售下滑 / 广告异常 / 核心词排名 / 评分 / 关联事件 |
| **机会评分** | `product_opportunity_scores` | `/api/products/:id/opportunity` | `ProductsView` | 销售增长 / BSR 提升 / 广告效率 / 关键词提升 / 竞品缺口 / Review 改善 |
| **Listing Health** | `listing_snapshots` | `/api/listing-health` | `ListingHealthView.vue` | 6 项检查（关键词覆盖、长度、重复、图片、bullet、Q&A、Review 反射） |
| **Ads Workflow** | `ad_daily_metrics` | `/api/ads/metrics` `/api/ads/summary` | `AdsView.vue` | ACOS / ROAS / CVR / 花费占比 / 预算使用率 |
| **Review VOC** | `own_product_reviews` | `/api/review-voc` | `ReviewVocView.vue` | sentiment / topic tags / 30 天聚合 |
| **Inventory** | `product_inventory_settings` | `/api/inventory/plans` | `InventoryView.vue` | stockout / reorder / overstock / data-gap |
| **Profit Safety** | `product_profit_settings` | `/api/profit/plans` | `ProfitView.vue` | 4 种价格情景 + minimum-safe / target-margin 安全线 |

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
npx playwright install chromium
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
```

### 启动生产服务

构建完成后，API 服务会自动托管前端静态文件：

```bash
npm start
```

访问：http://localhost:4000

> 💡 **提示**：API 服务会自动检测并托管 `apps/web/dist` 目录，无需额外配置。

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
```

> 💡 **提示**：CLI 命令适合服务器定时任务或快速测试采集功能。
> Worker 崩溃时，下次启动会通过 `recoverStuckJobs` 自动回收卡在 `processing` 状态的 job，**生产环境建议用 systemd / pm2 守护以避免长时间离线**。

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
- **AI 今日总结**：基于当前采集到的快照、排名、价格、Deal/Coupon、Review 和品牌数据生成确定性摘要，不调用外部 LLM，不编造未采集字段。
- **重点异动信息流**：按重要性展示 ASIN 卡片，包含商品图、标题、品牌、ASIN、BSR 路径、价格活动、Review 增量和建议动作。
- **品牌矩阵**：聚合品牌在 Top10/Top50/Top100 的占位、平均排名、上升/下滑数量和主要价格带，点击品牌可打开右侧详情抽屉。
- **新品黑马与价格活动雷达**：突出新进榜、快速上升、低评论高排名、价格新低、Coupon 和 Deal 信号，帮助定位需要跟进的商品。
- **完整 BSR 榜单**：保留品牌、排名区间、关键词筛选和商品明细，商品信息列会限制文本宽度，避免覆盖品牌列。

## Identity / Auth（v0.5.0）

v0.5.0 补齐了之前缺失的认证层：

- `identity-store.ts`：组织 / 用户 / session / 密码哈希（`PASSWORD_ALGO`）完整 store
- `auth.ts` + `auth-service.ts`：`POST /api/auth/login`、`POST /api/auth/register`、`POST /api/auth/logout`、`GET /api/auth/me`
- `useAuthGuard` composable：前端路由守卫
- `AuthModal.vue`：登录 / 注册模态

## 共享业务规则

`packages/shared/` 是前后端共享的领域模型与业务规则层（**严格单向依赖**：shared ← api/web，不反向）：

- 类型定义：`types.ts` / `types-products.ts` / `insight-events.ts` / `strategy-tags.ts`
- 业务规则：`amazon-url.ts`（SSRF 防护 + 多市场域名白名单）、`strategy-tags.ts`（策略标签归一化）、`insight-events.ts`（事件去重 + 优先级）
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
│   │       │   └── ...
│   │       ├── store/schema/      # ★ v0.5.0 按领域拆分的 schema
│   │       │   ├── ads-schema.ts / ai-schema.ts / category-schema.ts
│   │       │   ├── identity-schema.ts / insight-schema.ts / inventory-schema.ts
│   │       │   ├── keyword-schema.ts / metadata-schema.ts / monitor-schema.ts
│   │       │   ├── notification-schema.ts / operational-schema.ts / product-schema.ts
│   │       │   ├── profit-schema.ts / queue-schema.ts / review-voc-schema.ts
│   │       │   ├── worker-schema.ts / workflow-schema.ts
│   │       ├── services/          # ★ v0.5.0 业务服务层（路由 ↔ store 之间）
│   │       │   ├── ai-agent-service.ts         # AI Daily Operator
│   │       │   ├── ads-agent-service.ts        # Ads Analyst
│   │       │   ├── ads-workflow-service.ts
│   │       │   ├── auth-service.ts
│   │       │   ├── inventory-planning-service.ts
│   │       │   ├── listing-health-service.ts
│   │       │   ├── profit-planning-service.ts
│   │       │   ├── review-voc-agent-service.ts
│   │       │   ├── review-voc-service.ts
│   │       │   ├── sop-service.ts / task-service.ts
│   │       ├── routes/            # API 路由（v0.5.0 新增 10+ 文件）
│   │       │   ├── categories.ts / keywords.ts / competitors.ts
│   │       │   ├── insights.ts / operations.ts / notifications.ts
│   │       │   ├── reports.ts / validation.ts / http-utils.ts
│   │       │   ├── products.ts / inventory.ts / listing-health.ts / ads.ts
│   │       │   ├── review-voc.ts / profit.ts / sops.ts / tasks.ts
│   │       │   ├── auth.ts / ai.ts / brand-playbooks.ts / insight-events.ts
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
│           │   ├── insightEvents.ts
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
- **事务安全**：`withTransaction` 使用 SAVEPOINT 实现嵌套安全，Pipeline 写入操作包裹在 `runInTransaction()` 中
- **分页支持**：所有 list API 支持 `limit`（上界 1000）和 `offset` 参数
- **安全加固**：Helmet 安全头、express-rate-limit 速率限制、Zod 输入验证、CORS 配置、Amazon URL 域名白名单（`isAllowedAmazonHost`）
- **Worker 队列**：claim/retry/fail 状态机，支持多 lane 并行处理采集任务（默认 2 并发），启动时自动回收 stuck job
- **AI Agent 审计**：所有 Agent 调用的输入 / 输出 / model / status 永久写入 `ai_runs` 表

### 前端

- **Pinia 状态管理**：10+ 个领域 store，组件通过 `storeToRefs` 直接消费数据，消除多层 props drilling
- **Per-domain Loading**：8 个独立的 tab loading 状态 + 采集状态，切换 tab 不再误禁用采集按钮
- **视图缓存**：30 秒 TTL 缓存避免重复 API 请求
- **Watch 防抖**：`@vueuse/core` 的 `watchDebounced` 防止快速切换触发请求风暴
- **组件按需加载**：View 级组件使用 `defineAsyncComponent`，ECharts 按需引入
- **类目情报首页**：`CategoriesView` 复用 Pinia 类目数据 + `useCategoryDailyBriefing` 派生 KPI、三栏（事件分桶 Movers/Promotions/Fading）、其他信号洞察、BSR 榜单筛选与分页，不新增后端接口
- **自营 SKU 页面**：`ProductsView` 通过 `useProductStore` 消费 `/api/products`，展示经营指标、风险/机会评分和指标录入弹窗
- **行动中心**：`action-center/` 子目录下 ~18 个组件，覆盖事件队列、ASIN 分组、Brand Playbook、价格时间线、归属引擎、回顾节奏、信号流等
- **右侧详情抽屉**：`CategoryDailyBriefingDrawer` 支持 event/brand/opportunity 三种模式，ASIN 与品牌卡片在当前页展开详情
- **BSR 表格筛选**：客户端筛选（品牌 / ICE TYPE / Deal-Coupon / 排名窗口）+ 文本搜索；筛选变更时自动 reset `bsrTablePage = 1`
- **Auth 守卫**：`useAuthGuard` composable 路由级鉴权，未登录自动弹出 `AuthModal`

### 测试覆盖

**78 个测试文件 / 572 个测试用例，CI 全绿 ~16s**：

- 共享包：8 文件 / 39 用例（类型验证、业务规则、集成测试）
- 后端 API：42 文件 / 387 用例
  - Store：队列状态机、SQL 工具、identity、ai_runs、stuck job 回收
  - 采集引擎：浏览器管理、上下文配置、代理池、品牌质量、abort 路径
  - 解析器：多市场价格/货币/评分格式
  - 端到端：关键词 pipeline、类目 intelligence、API 路由（含 v0.5.0 的 products/inventory/listing-health/ads/review-voc/profit/sops/tasks/auth/ai）
  - Worker：`runJobWithTimeout` 在 20ms 超时下必抛 `AbortError`，且 runner 必收到 abort 信号
- 前端 Web：28 文件 / 146 用例

## 故障排查

### 采集失败

检查 `data/collector-screenshots/` 目录查看失败时的页面截图，常见原因：

- Amazon 返回验证码（需要调整采集频率或 IP）
- 网络超时（增加 `AMAZON_COLLECT_TIMEOUT_MS`）
- 页面结构变化（需要更新选择器）

### Worker 离线

- 检查 `/api/collect/worker-status`：`alive: false` 时说明 Worker 进程已挂
- 启动后会自动 `recoverStuckJobs` 回收卡住的 job，**生产环境建议用 systemd / pm2 守护**

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
