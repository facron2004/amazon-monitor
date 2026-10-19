# 功能与架构指南

[返回简体中文主文档](../README.md) · [部署与运维指南](operations-guide.md)

本文说明业务 Agent、SKU 经营、类目情报、组织隔离与实现结构。代码路径以仓库根目录为基准，启动步骤见[主文档](../README.md#快速开始)。

[AI Agent](#ai-agent-矩阵) · [SKU 经营](#自营-sku-经营中心) · [类目情报](#类目每日竞争情报首页) · [账号与组织](#账号与组织隔离) · [架构](#架构亮点)

## AI Agent 矩阵

所有 Agent 都先经过确定性的新鲜度、证据和权限边界；只有显式设置 `AGENT_SDK_ENABLED=true` 后才会调用 Agent 外部 LLM。报告 AI 摘要还需要单独设置 `INSIGHT_REPORT_LLM_ENABLED=true`，避免仅因配置了通用模型 Key 就把经营数据外发。无论是否调用模型，都不编造缺失字段；业务建议需人工确认，不会直接修改 Amazon 商品、价格、广告或库存。每次运行都持久化到 `ai_runs` 表（输入上下文 / 输出 JSON / model id / status / error），所有推荐动作均带 `needs_human_approval: true`。低置信度 brief 不会产出 P0 动作。

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

Agent OS 现已提供真实 Insight Event 驱动的 Signal Feed：`GET /api/agent-os/signals` 展示 `RANK_SURGE` 形成的 `RANKING_JUMP` 信号，`PATCH /api/agent-os/signals/:id` 更新状态，`POST /api/agent-os/signals/:id/investigate` 以幂等方式启动 `ranking-jump-analysis`。该 Workflow 会在研究证据后暂停等待人工审批，再生成带 Action Proposal 和 Memory 的响应计划；不会自动跟随竞品或改价。

Product Research 的新品立项草案可在人工确认后把四项必需门槛一次拆成 Review VOC、利润、合规和供应链验证任务。转换接口按 Agent run 幂等，重复确认返回原任务，不重复写入；创建任务不代表批准立项，任务详情保留草案、证据日期、验收要求和来源运行。每次选品运行同时记录 BSR 证据日期、更新时间、来源和采集状态；超过每日新鲜度要求或采集不完整时，Agent 会把置信度降到观察级、草案切换为“保持观察”，并阻止创建立项验证任务。

全部 7 个 Agent 现在统一记录证据日期、更新时间、数据来源、采集状态、失败原因和时效阈值。竞品价格/活动按 3 小时、核心排名按 6 小时，其余日报、Listing、Ads、Review、报告和 BSR 证据按 24 小时评估；过期、缺失或采集不完整时，输出置信度最高为 `0.49`，只保留 P2 数据刷新动作。Listing、Ads 与 Review 的可复制执行产物会被隐藏到证据恢复可用，切换业务日期也会立即清除上一日期的 Agent 结果。

任务详情通过 `GET /api/tasks/:id/detail` 推荐最多 3 条本组织已发布 SOP，匹配只使用任务类型和结构化的 ASIN、品牌、关键词证据，并返回可见的分类、标签或正文命中原因。运营可在任务抽屉内展开或复制步骤；无匹配时保留真实空状态。带来源任务的 SOP 必须等该任务完成复盘后才能创建，避免未经验证的执行记录进入知识复用链路。

> 业务 Agent 的推荐动作通过 `AiRecommendedAction` 与 `needs_human_approval` 表达。桌面 Agent 的工具、审批和幂等执行另见 [Agent V1 验收](AGENT_V1_ACCEPTANCE.md)。

### 桌面 Agent 运行时

桌面端支持 OpenAI、OpenAI-compatible 与 ChatGPT OAuth 多模型连接，提供自然语言任务、只读业务工具、人工审批、幂等执行、SSE 回放和组织级审计导出。API、Agent、Crawler 使用三个 utility process，并提供取消、状态展示和有限重启。

审批后的重新采集、ASIN 监控、任务创建与报告导出按服务端权限和幂等键执行；OAuth 模式使用受限工具与沙箱。模型连接和凭据的存储边界见 [Agent V1 验收](AGENT_V1_ACCEPTANCE.md)。

### AI Daily Operator 详解

- 输入：今日 insight events、未关闭的 workflow tasks、SKU 当日 risk score
- 输出：5 件事 brief，每件事包含 ASIN / brand / 关联事件 / 推荐动作 / confidence / priority
- 风险控制：`needs_human_approval = true`（写操作绝不自动执行）
- 审计：`ai_runs` 永久留存调用记录（model id、status、error、duration_ms）

## 自营 SKU 经营中心

把“我方商品”作为经营对象管理，支持手动录入与 CSV/XLSX 指标导入；SP-API 只读连接需单独配置和验收，外部 Ads API 直连仍保留接入边界。店铺账号按组织隔离，记录 Amazon 站点、Seller ID、授权状态和启停状态；SKU 可按同站点店铺分配、调整或取消归属，并支持店铺筛选。

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

## 类目每日竞争情报首页

类目页会把最新 BSR 数据优先整理成每日战报，完整榜单仍保留在页面下方，适合先看异常和机会，再进入明细排查。

- **战况总览**：展示 Top100/Top50 新进、跌出 Top100、最大上升、最大下滑、新增 Coupon、价格新低和品牌集中度等 KPI。
- **AI 今日总结**：先校验当前采集到的快照、排名、价格、Deal/Coupon、Review 和品牌证据；默认不外发数据，只有完成数据共享评审并由部署配置显式设置 `INSIGHT_REPORT_LLM_ENABLED=true` 后，才会向配置的 OpenAI-compatible Responses endpoint 发送本周期摘要、Top 事件（含 ASIN/品牌/证据摘要）和 Top 品牌信号；不编造未采集字段。
- **重点异动信息流**：按重要性展示 ASIN 卡片，包含商品图、标题、品牌、ASIN、BSR 路径、价格活动、Review 增量和建议动作。
- **品牌矩阵**：聚合品牌在 Top10/Top50/Top100 的占位、平均排名、上升/下滑数量和主要价格带，点击品牌可打开右侧详情抽屉。
- **新品黑马与价格活动雷达**：突出新进榜、快速上升、低评论高排名、价格新低、Coupon 和 Deal 信号，帮助定位需要跟进的商品。
- **完整 BSR 榜单**：保留品牌、排名区间、关键词筛选和商品明细，并在行内展示昨日排名、7 日变化、首次上榜日期、累计上榜天数、新品状态和竞品池状态。
- **榜单 Diff**：支持今日对比昨日、7 日前、30 日前或自定义日期，统一查看新进、掉榜、排名升降、价格、Coupon、Deal 和 Review 增长变化。

## 账号与组织隔离

业务 API 使用登录后的 HttpOnly session cookie；首个用户在初始化流程中创建：

- `identity-store.ts`：组织 / 用户 / session / 密码哈希（`PASSWORD_ALGO`）完整 store
- `auth.ts` + `auth-service.ts`：`POST /api/auth/login`、`POST /api/auth/register-first-user`、`POST /api/auth/logout`、`GET /api/auth/me`
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

## 架构亮点

### 后端

- **Store 模块化**：数据库层拆分为 10+ 个领域子接口（MonitorStore、BsrStore、CategorySnapshotStore、ProductStore、AdsStore、InventoryStore、ListingHealthStore、ProfitStore、ReviewVocStore、IdentityStore、AiRunStore 等），每个子接口对应独立实现文件
- **Schema 按领域拆分**：`store/schema/*-schema.ts` 取代单一 `schema.ts`，新增 schema 不再需要改集中文件
- **Service 层**：`services/` 把业务编排（评分、Agent 决策、计划生成）从 routes 中抽出来，routes 只负责 HTTP / 校验 / 鉴权
- **规则中心**：PRD P0 告警规则目录定义在 shared，API 持久化运营覆盖值；库存、广告、Review、Listing 规则可按组织即时评估并生成标准 Insight Event
- **事务安全**：`withTransaction` 使用 SAVEPOINT 实现嵌套安全，Pipeline 写入操作包裹在 `runInTransaction()` 中
- **分页支持**：所有 list API 支持 `limit`（上界 1000）和 `offset` 参数
- **安全加固**：Helmet 安全头、express-rate-limit 速率限制、Zod 输入验证、CORS 配置、Amazon URL 域名白名单（`isAllowedAmazonHost`）
- **Worker 队列**：claim/retry/fail 状态机，默认 2 路并行，支持租约、续租、重试与过期任务恢复
- **AI Agent 审计**：所有 Agent 调用的输入 / 输出 / model / status 永久写入 `ai_runs` 表

### 前端

- **运营工作台 UI v3**：采用紧凑导航轨道、全局命令栏和“经营状态 → 经营指标 → 今日行动 → 风险证据”的信息流，减少装饰卡片并强化任务扫描效率；设计基准见 [运营工作台设计参考](design/operations-command-center-apple-v3.png)
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

## 继续阅读

- [Agent V1 验收](AGENT_V1_ACCEPTANCE.md)：桌面 Agent、工具、审批与运行时边界。
- [Agent OS 路线状态](AGENT_OS_ROADMAP_STATUS.md)：信号、Workflow、Action Proposal 与 Memory。
- [Agent 金标评测](AGENT_GOLD_EVALUATION.md)：真实模型质量验证。
- [真实数据底座设计](PRD_V0.7_REAL_DATA_FOUNDATION.md)与[真实店铺 Shadow 对账](REAL_STORE_SHADOW_RECONCILIATION.md)：SP-API 接入及验收。
- [架构决策](adr/)与[界面设计参考](design/README.md)。
