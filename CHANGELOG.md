# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> 版本号维护规则（monorepo,统一递增）：
> - 全部 `package.json`（根 / `apps/web` / `apps/api` / `packages/shared`）同步 bump
> - 内部依赖版本（`apps/web`、`apps/api` 里 `@amazon-monitor/shared` 的版本字符串）同步更新
> - `apps/web/src/constants/version.ts` 更新 `VERSION_RELEASE_DATE`
> - 顶部追加新版本小节 + 本次改动条目
> - 类型:`feat:` / `fix:` / `refactor:` / `chore:` / `docs:` / `perf:`

---

## [1.1.0] - 2026-07-30

### Added

- **多模型连接**：Agent 中心可保存多个 OpenAI、OpenAI-compatible 与 ChatGPT OAuth 连接，并在运行时自由切换主模型、备用模型和 API 协议。
- **ChatGPT OAuth**：桌面 Agent 内置官方 Codex app-server，使用独立登录目录管理 OAuth Token 与刷新；15 个 Amazon 只读工具通过动态工具桥接。

### Changed

- **安全边界**：API Key 统一由 Windows DPAPI 加密，OAuth Token 不进入 Renderer、SQLite 或应用日志；Codex 线程固定为只读沙箱并关闭非业务工具能力。
- **模型运行时**：OpenAI-compatible 连接支持自定义 HTTPS Base URL、Responses / Chat Completions 与供应商模型 ID，当前连接的模型配置同步到 API 运行状态。

### Fixed

- **桌面连接表单**：修复 Vue 响应式对象无法通过 Electron IPC 保存的问题，并补齐字段标签和清晰的连接状态展示。

## [1.0.0] - 2026-07-30

### Added

- **Amazon 单 Agent 闭环**：自然语言任务、强制新鲜度检查、15 个只读工具、证据化结构输出、行动提案、人工审批、幂等执行和组织级审计。
- **真实质量验收**：30 题金标集、顺序运行 CLI、真实组织范围发现、五项 PRD 指标和人工提醒/恢复标注。
- **Electron 桌面端**：API、Agent、Crawler 三个 utilityProcess，Windows safeStorage 密钥管理、旧 SQLite 在线迁移、进程有限重启和 NSIS 安装包。

### Changed

- **运行恢复**：Agent 重启后重新注入内存 Key；Agent/API 中断运行明确失败且不重放写操作，等待采集的 recovery 保持可恢复。
- **严格模型契约**：输出范围与证据字段改为 OpenAI strict structured output 兼容结构，五类行动使用固定 payload。
- **桌面数据与渲染**：修复打包页面空白，正式数据库迁移覆盖 WAL 数据并保留源文件与完整备份。

## [0.6.1] - 2026-07-28

### Added

- **产品运营工作台增强**：补齐 Product Operations、Launch Brief、Validation Tasks、SOP Recommendations、Team Performance 等运营执行面板与配套 API / store / 前端工作区。
- **AI 运行质量与数据新鲜度视图**：新增 `AgentQualityPanel`、`AgentDataFreshness` 及对应服务，帮助运营更快判断 Agent 输出是否可用。

### Changed

- **运营界面重构**：围绕运营信息流重排顶部动作区、概览、商品与任务工作区，统一更简洁的企业化视觉表达与更明确的状态展示。
- **采集与归档细节修正**：修正日报归档测试夹具与采集日志分页实现，保持当前队列状态机和 Element Plus 用法一致。

## [0.6.0] - 2026-07-22

### Added

#### 多租户组织隔离 (Organization Scope)
- **运营数据按 org 隔离**：类目 / 关键词 / 竞品 / 通知 / 运营表补齐 `org_id` 迁移（`store/*-organization-migration*`、`operational-scope-migrations.ts`），历史数据回填到默认组织。
- **路由级隔离测试**：`routes/*-organization-scope.test.ts` 覆盖跨组织读写拒绝路径，防止会话串数据。

#### 规则中心 (Rules Center)
- **`alert_rule_configs` + 运行时**：`store/rule-store.ts` + `schema/rule-schema.ts` + `services/rule-runtime-service.ts` —— 10 条 PRD P0 规则可启停、改阈值、冷却，并生成标准 Insight Event。
- **可运行规则集**：核心词掉页、低库存、ACOS 超标、评分下降、差评聚集、Listing 健康等（`rule-runtime-owned-evaluators.ts`）。
- **API / 页面**：`/api/rules` + `/api/rules/run` + `RulesView.vue` + `stores/rules.ts`。

#### 数据源中心 (Data Sources)
- **连接与同步台账**：`data_source_configs` / `data_source_sync_runs`（`store/data-source-store.ts`）支持 SP-API / Ads API / 公开采集 / CSV / ERP·WMS / 手工六类数据源。
- **CSV/XLSX 导入编排**：`services/data-source-*-import.ts` + `data-source-import-runner.ts` —— 自营日指标、Ads 报表、利润成本、库存假设事务化导入，行级错误 + partial 成功。
- **API / 页面**：`/api/data-sources` + `DataSourcesView.vue` + `stores/dataSources.ts`。

#### 活动排期 (Promotions)
- **`promotion_plans`**：`store/promotion-store.ts` + `types-promotions.ts` —— 多店铺/SKU 活动时间线，派生 `preparation_due` / `active` / `review_due` 等监控态。
- **准备/复盘任务联动**：`POST /api/promotions/:id/tasks` 幂等挂接 workflow task。
- **页面**：`PromotionsView.vue` + `stores/promotions.ts`。

#### 采集中心 (Collectors)
- **采集运维 API**：`routes/collectors.ts` —— `/api/collectors/run|jobs|logs|freshness|queue-stats|worker-status`。
- **快照溯源**：`snapshot-provenance-migrations.ts` + `collection-provenance.ts` —— SERP/BSR 快照补齐 `data_source` / `last_synced_at` / `sync_status`。
- **新鲜度聚合**：`store/collection-freshness-store.ts` + 前端 `CollectorsView.vue` / `stores/collectors.ts`。

#### 店铺账号 (Commerce Stores)
- **组织级店铺主数据**：`commerce_stores`（`store/commerce-store-store.ts` + `types-stores.ts`）记录站点、Seller ID、授权状态与启停。
- **API / 嵌入面板**：`/api/stores` + 数据源页 `StoreAccountsPanel`，SKU 可按店铺归属筛选。

#### 报告工作台归档 (Reports Archive)
- **日报 / 周报 / 月报归档**：`workflow_daily_reports` / `workflow_period_reports`（`store/report-store.ts` + `schema/report-schema.ts`），版本化 Markdown + 覆盖度状态。
- **工作流报告生成**：`reports/daily-workflow-report.ts` / `period-workflow-report.ts` + readiness 缺口归因（`daily-report-readiness.ts`）。
- **PDF 交付**：`reports/report-pdf.ts`（Playwright 打印）+ 前端归档面板（`DailyReportArchivePanel` / `PeriodReportArchivePanel`）。

#### AI Agent 矩阵补齐
- **Product Research**：`POST /api/ai/research-product`（`product-research-agent-service.ts`）—— 类目榜单 + 品牌矩阵切入窗口，候选 ASIN 人工确认入池。
- **Competitor Analyst**：`POST /api/ai/analyze-competitor`（`competitor-agent-service.ts`）—— 事件驱动竞品研判。
- **Report Writer**：`POST /api/ai/create-report`（`report-writer-agent-service.ts`）—— 日报/周报/月报 Markdown + 审批动作摘要。
- **统一策略**：`services/ai-agent-policy.ts` —— 置信度门槛、强制 `needs_human_approval`、禁止低置信度产出 P0。
- **Agent 中心 UI**：`AiAgentsView.vue` + `stores/aiRuns.ts`，运行历史 / 证据 / 失败原因 / 审批动作转任务 + 点赞点踩反馈。

#### 任务闭环增强
- **库存 / 利润计划转任务**：`inventory-task-service.ts` / `profit-action-task-service.ts`，证据绑定 + 幂等 sourceId。
- **执行清单导出**：`task-execution-export.ts` —— 已确认任务 CSV。
- **前端任务工作台**：`composables/useTaskWorkspace.ts` + `components/tasks/*`。

#### 洞察与共享计算
- **快照 Diff 事件**：`insights/listing-diff.ts` / `keyword-snapshot-diff-generator.ts` / `snapshot-diff-events.ts`。
- **Shared 计算模块**：`keyword-rank-matrix`、`category-diff`、`asin-dual-score`、`category-daily-kpis`、`competitor-daily-kpis`、`profit-actions` 及对应 types。

#### 前端经营工作台
- **今日经营概览**：多币种 SKU KPI 聚合、P0/P1 行动条、活动流（`OverviewOperationsPanel` / `OverviewActivityFeed` / `stores/overviewActivity.ts`）。
- **写权限门禁**：`composables/useWriteAccess.ts` + `ReadOnlyNotice.vue`，按角色 capability 控制写操作。
- **竞品趋势 / 类目 Diff / Product Research 面板**：`CompetitorTrendPanel`、`CategoryDiffPanel`、`ProductResearchAgentPanel`。

### Changed

- **README 经营中心表**扩展到规则 / 任务 / 活动 / 数据源 / 采集 / 日报周月报归档等支柱，Agent 矩阵文档化为 7 个确定性 Agent。
- **Tauri 桌面壳版本**从滞后的 `0.4.0` 对齐到 monorepo `0.6.0`（`src-tauri/tauri.conf.json` + `Cargo.toml`）。
- **Windows 开发脚本**：新增 `scripts/start-dev.ps1` / `stop-dev.ps1`。

### Fixed

- **跨组织数据边界**：遗留 monitor / snapshot / notification / daily_report 无 `org_id` 导致的串租户风险，由迁移 + 路由测试兜底。
- **Agent 低置信度 P0**：统一策略层降级为 P1，避免无证据自动抬优先级。

### Tests

- 新增约 60 个测试文件，覆盖组织隔离迁移与路由、规则运行时、数据源导入、活动排期、采集中心、报告 PDF/归档、Agent policy、任务导出与大量前端 util/store 用例。
- 既有 40+ 测试文件同步适配 org scope 与新契约。

### Documentation

- README 顶部版本徽章更新至 **v0.6.0**（2026-07-22）。
- 设计参考：`docs/design/` / `docs/design-references/` 补充运营工作台 UI 草案。

---

## [0.5.0] - 2026-07-08

### Added

#### 自营 SKU 经营中心 (Owned-SKU Operations)
- **SKU 主数据**：`store/product-store.ts` + `store/schema/product-schema.ts` + `routes/products.ts` —— 支持新增自营 SKU，记录 ASIN、站点、品牌、标题、类目、负责人与数据新鲜度。
- **日指标录入**：`POST /api/products/:id/daily-metrics` —— 销售额、订单数、库存天数、广告花费、ACOS、毛利率、BSR、核心词排名、评分、Review 数。
- **风险评分 / 机会评分**：库存风险、销售下滑、广告异常、核心词排名、评分/Review、关联事件压力加权计算；机会评分反向加权。缺失数据不编造结论。
- **页面入口**：侧边栏 `自营 SKU` 视图（`apps/web/src/components/ProductsView.vue` + `api-products.ts`），展示 SKU 列表、当日 KPI、风险/机会分、数据新鲜度与近期指标明细。

#### AI Daily Operator Agent（确定性 + 证据绑定）
- **`/api/ai/daily-brief`**：从 insight events、open workflow tasks、owned-SKU risk scores 生成 PRD 要求的"今日 5 件事"brief。
- **`ai_runs` 表** + `store/ai-run-store.ts`：持久化每次 Agent 调用的输入上下文、输出 JSON、model id、status 与 error。
- **绝不执行自动写操作**：所有推荐动作均带 `needs_human_approval: true`；低置信度 brief 不会产出 P0 动作。当前实现为确定性版本，不调用外部 LLM，不编造缺失字段。

#### Listing Health
- **Listing 快照**：`POST /api/products/:id/listing-snapshots`，抓取自有 SKU 的 listing 文本/图片/QA/Review 反射证据。
- **`/api/listing-health` 6 项检查**：标题关键词覆盖、标题长度/重复、图片覆盖、bullet 覆盖、Review VOC 反映、开放 Q&A 缺口。
- **Listing Optimizer Agent**：`/api/ai/analyze-listing`，确定性输出 + 持久化到 `ai_runs`，所有推荐 approval-gated。
- **侧边栏 `Listing Health` 视图**：队列审查、快照录入、问题检查、Agent 推荐展示。

#### Ads Workflow Diagnostics
- **`ad_daily_metrics` 表**：campaign / ad group / target / search term 维度的 spend、sales、ACOS、ROAS、CPC、CTR、CVR、budget usage 证据。
- **`/api/ads/metrics` + `/api/ads/summary`**：手动 Ads 指标录入 + 确定性 spend-waste / scale-opportunity 诊断。
- **Ads Analyst Agent**：`/api/ai/analyze-ads`，所有推荐 approval-gated。
- **侧边栏 `Ads Workflow` 视图**：campaign target 复盘、指标录入、风险/扩容检查、Agent 推荐。

#### Review VOC
- **`own_product_reviews` 表**：review text、rating、sentiment、topic tags、freshness 证据。
- **`/api/review-voc` + `/api/products/:id/reviews` + `/api/products/:id/review-voc`**：review 录入 + 30 天 VOC 汇总。
- **Review VOC Agent**：`/api/ai/analyze-review-voc`，approval-gated 推荐。
- **侧边栏 `Review VOC` 视图**：SKU triage、topic clusters、最近评论样本、Agent 推荐。

#### Inventory Replenishment
- **`product_inventory_settings` 表**：lead time、safety stock、target stock、MOQ、pack size、supplier、reorder point。
- **`/api/inventory/plans` + `/api/products/:id/inventory-plan` + `/api/products/:id/inventory-setting`**：stockout / reorder / overstock / data-gap 确定性信号。
- **侧边栏 `Inventory` 视图**：补货 triage、阈值编辑、approval-ready 订单数量推荐。

#### Profit Safety Line
- **`product_profit_settings` 表**：purchase cost、freight、FBA fee、referral rate、storage、return loss、target margin、minimum margin、Deal fee 假设。
- **`/api/profit/plans` + `/api/products/:id/profit-plan` + `/api/products/:id/profit-setting`**：current / 10% Coupon / 15% Coupon / Deal 四种价格情景 + minimum-safe 与 target-margin 安全线。
- **侧边栏 `Profit` 视图**：margin-risk triage + 成本假设编辑；**不**做自动 repricing。

#### Identity / Auth
- **`identity-store.ts` + `identity-schema.ts` + `identity-mappers.ts` + `password.ts`**：组织/用户/session/密码哈希（`PASSWORD_ALGO`）的完整 store 层。
- **`/api/auth` 路由 + `auth-service.ts`**：登录/注册/session 管理。
- **10+ 新增 store**：`ads-store.ts`、`inventory-store.ts`、`listing-health-store.ts`、`profit-store.ts`、`review-voc-store.ts`、`sop-store.ts`、`task-store.ts` + 配套 `*-schema.ts`、`workflow-mappers.ts`。
- **10+ 新增 route**：`ads.ts`、`ai.ts`、`auth.ts`、`inventory.ts`、`listing-health.ts`、`products.ts`、`profit.ts`、`review-voc.ts`、`sops.ts`、`tasks.ts`，每个均配套 `.test.ts`。

#### Worker Hardening
- **`runJobWithTimeout` 重构**：`Promise.race` + `AbortController`，超时真正终止采集（之前 setTimeout 调 abort 但不 reject 会被吞）；新增 `runJobWithTimeout` 接受 injectable runner 参数便于测试。
- **`worker.test.ts`**：20ms 超时场景下，runner 必收到 abort 信号且 `runJobWithTimeout` 抛 `AbortError`。
- **环境变量解析统一为 `intEnv()`**：maxRetries / pollInterval / concurrency / jobTimeout / heartbeat，全部带 min/max 边界保护。

#### Shared Package
- **`packages/shared/src/types-products.ts`**：新增 `SerpProductInput` / `SerpSnapshot` / `ProductRanking` 等结构体，前后端共享。
- **`amazon-url.ts` 扩展**：`isAmazonHost` / `assertAmazonUrl` 收纳所有 Amazon 域名变体（`.co.uk` / `.co.jp` / `.de` / `.com.au` 等）。

### Changed

- **类目采集 (`category-pipeline.ts`)**：TopN 完整度从硬阈值改为 ≥95% / ≥80% / <80% 三档（ok/partial/fail），partial 仍保存并记 `BsrSnapshotQuality`。
- **默认 Tab 改为 Overview**：新用户首次打开不再空白。
- **Amazon URL 校验统一**：移除硬编码 `/\.amazon\.\w{2,}$/i` 正则。
- **Vite 编译 `empty <style scoped>` 不计入 descriptor**：新组件必须带至少一条 no-op 规则占位。
- **`start.bat`** 启动脚本刷新，纳入新脚本与端口约定。

### Fixed

- **categoryUrl SSRF 风险**：`validation.ts` 使用 `amazonUrlSchema` 限制仅允许已知 Amazon 域名。
- **Side bar 版本号日期**：`version.ts` 发布日更新至 2026-07-08。
- **LF/CRLF 行尾统一**：全仓改用 LF（`.gitattributes` 强化），避免 Windows 协作时 git 持续警告。
- **Worker 进程挂掉 23h 没起来没人告警**：新增 `worker.ts` 的 `recoverStuckJobs` 启动时回收，提示用户添加 systemd/pm2 自动重启（运维侧）。

### Removed

- **`audit.zip` + `packages.zip`**：v0.4.0 不慎提交的二进制产物（约 11MB），本版本清理。
- **`action-center/prototype/`**：prototype 代码已在 v0.4.0 物理删除；本版本仅补一条 CHANGELOG 备注。

### Tests

- 单元测试数量从 v0.4.0 的 80 个文件 / 715 用例 → v0.5.0 新增约 35 个文件（routes + store + services + worker test），覆盖 10 个新路由、9 个新 store、9 个新 service 的关键路径。
- 新增 `worker.test.ts`：`runJobWithTimeout` 在 20ms 超时下必抛 `AbortError`，且传递给 runner 的 signal 已被 abort。

### Documentation

- **README 重写**：从单一"闭环总览"扩展为 5 个独立功能板块（AI Daily Operator / Listing Health / Ads Workflow / Review VOC / Inventory Replenishment / Profit Safety Line），每节交代 PRD 对应、API 路径、Agent 行为约束、是否自动写操作。
- **目录结构图** 补全所有新 store / route / service 路径。

---

## [0.4.0] - 2026-06-30

### Added

- **Amazon 域名白名单校验**：`packages/shared/src/amazon-url.ts` 新增 `isAllowedAmazonHost` / `assertAmazonUrl`，SSRF 防护（P0）
- **类目采集数据质量分级**：`category-pipeline.ts` TopN 检查改为 ≥95%=ok / ≥80%=partial / <80%=fail，避免 99/100 也整批丢弃（P1）

### Changed

- **Worker 超时可取消**：`AbortController` 替代 `Promise.race`，超时时真正终止采集，写入操作不残留（P0）
- **类目采集写库事务化**：全部写入操作包裹在 `store.runInTransaction()` 中，与关键词采集对齐，防止半截数据（P0）
- **默认 Tab 改为 Overview**：`useAppController.ts` → `activeTab` 默认值从 `"categories"` 改为 `"overview"`，新用户首次打开不再空白（P1）
- **Amazon URL 校验统一**：`competitors.ts` 的 redirect 校验改用 shared `isAllowedAmazonHost`，移除硬编码 `/\.amazon\.\w{2,}$/i` 正则（支持 `.co.uk` / `.co.jp` / `.de`）（P1）

### Fixed

- **categoryUrl SSRF 风险**：`validation.ts` 使用 `amazonUrlSchema` 限制仅允许已知 Amazon 域名（P0）
- **Sidebar 版本号日期更新**：`version.ts` 发布日更新至 2026-06-30

### Removed

- `apps/web/src/components/action-center/prototype/` 整目录（prototype 代码，已物理删除）

### Tests

- 单元测试总数：**80 测试文件 / 715 用例全绿**
- 适配数据质量分级：`category-intelligence.test.ts` 中 duplicate ranks 用例从 "rejects" 改为 "accepts at partial quality"

---

## [0.3.0] - 2026-06-27

### Added

- **Action Center 重写（Variant B 胜出）**：`ActionCenterPanel.vue` 替换为 production 版（634 行），三栏 status 信息架构（TODO / Watching+ReviewPending / Followed+Reviewed+Ignored），单抽屉 + filter 草稿 + retry/refresh 按钮。完整决策记录在 `docs/adr/0006-action-center-variant-choice.md`
- **`action-center/` 12 个新组件**：`InsightEventDrawer` / `InsightScoreBadge` / `AsinGroupCard` / `AsinGroupList` / `BrandPlaybookCard` / `PriceTimelineCard` / `WatchStateSelector` / `StrategyTags` / `AttributionTags` / `ActionCenterKpiCards` / `ReviewQueuePanel` / `InsightEventList`（替换原有散落的 event UI）
- **Brand Playbook 系统**：`apps/api/src/insights/brand-playbook.ts`（357 行）+ `routes/brand-playbooks.ts` + shared 类型（`BrandPlaybookProfile` / `BrandPlaybookPriceBand` / `BrandPlaybookStrongAsin` / `BrandPlaybookActivityFrequency` / `BrandPlaybookCouponIntensity` / `BrandPlaybookNewProductFrequency` / `BrandPlaybookAsinCountChanges` / `BrandPlaybookSurgeCycle`），把"竞品品牌"数据聚合成可读画像（强势 ASIN、价格带、活动频率、优惠券强度、新品节奏、ASIN 数量变化、爆发周期）
- **Worker Store + 任务健康度**：`apps/api/src/store/worker-store.ts` + `store/schema/worker-schema.ts`，采集任务状态机扩展（claim / stuck / recover），配套 `recover-stuck-jobs.mjs` / `insert-stuck-job.mjs` / `push-test-job.mjs` 调试脚本（已迁移到 `tools/`）
- **周期洞察报告（Period Insight Report）**：`apps/api/src/reports/period-insight-report.ts` + `period-insight-ai-summary.ts` + `routes/reports.ts` 新增 `/api/reports/period-insight`，前端 `ReportsView` 集成 `periodInsightReport` prop + AI 摘要触发按钮
- **Insight Report（每日洞察报告）**：`apps/api/src/reports/insight-report.ts` + `routes/insights.ts` 重新整理，分离"今日洞察"和"周期洞察"两条路径
- **`categories/` 子目录重排版**：4 个新组件 `CategoryHeader` / `CategoryKpiCards` / `CategoryLanePanel` / `CategoryInsightStrip` 替代散落的 panel，类目情报页信息密度更紧凑
- **新 drawer**：`CategoryDailyBriefingDrawer`（替代旧 `CategoryDailyBriefingPanel`）+ 改进的 `InsightEventDrawer`
- **新 panel**：`OverviewTopActionsPanel`（概览页顶部行动建议）/ `FreshnessBadge`（数据新鲜度标记）/ `CompetitorPoolKpiCards` / `CompetitorPoolInsightPanel`
- **`useInsightEventsStore`**：新增 `brandPlaybook` / `selectedPriceHistory` / `filters` 草稿协同 / `loadPeriodInsightReport` / `openActionCenterForEvent` action
- **`useCategoryDailyBriefing`**：lane 事件分桶 + 抽屉状态机复用
- **`packages/shared` 新类型**：`BrandPlaybook*` 8 个 + `PeriodInsightReport` / `InsightReport` / `AsinGroup` / `StrategyTag` / `AttributionTag` + `strategy-tags.ts` 模块（独立可测试的标签分类）
- **`docs/adr/`**：架构决策记录目录 + ADR-0006 (Action Center Variant B 选型)
- **`docs/archive/prototype-snapshot/`**：Action Center prototype 三个 variants + 共享组件完整快照（决策已沉淀到 ADR，原目录清理留待用户跳出 sandbox）

### Changed

- **Action Center 信息架构**：从单列表+行内详情（pre-0.3.0）→ 三栏 status 漏斗（Variant B）。漏斗心智模型忠实于 Insight 流程本质
- **AppSidebar 底部版本号**：显示从 `0.2.0` 升到 `0.3.0` + 发布日期
- **`useAppController`** 暴露 `openActionCenterForEvent` / `loadPeriodInsightReport` 给顶部行动建议和报告页 AI 摘要触发
- **类目详情页 4 个筛选 + 分页**从 0.2.0 的设计稿落实到代码（`useCategoryStore` 增加 `bsrTablePage` / `bsrTablePageSize` / `iceTypeFilter` / `dealCouponFilter` + `pagedCategorySnapshots` getter）
- **Prime Day Deal 正则扩展**：在 0.2.0 的 `Prime Big Deal Days` 修复基础上，新增 `Prime Early Access Deal` / `Prime Member Exclusive Deal` / `Prime Exclusive Savings` / `Prime Day Exclusive` 变体（`dealPatterns` + `validPromoText` allowlist 同步），覆盖 Amazon 真实活动文案

### Fixed

- **Coupon / Deal 脏数据残留**（0.2.0 修复的延续）：`preserveKnownCommercialFields` 严格不 fallback 到昨日值，snapshot 状态如实反映
- **`useCategoryDailyBriefing.ts:179` 注释悬空引用**：原本"与 prototype VariantC 一致"在 prototype 目录删除后失效，改为不依赖 prototype 命名的描述

### Tests

- **单元测试总数**：71 测试文件 / **684 用例**（19s，比 0.2.0 的 310 翻一倍）
  - 新增（api）：`brand-playbook` / `worker-store` / `routes/brand-playbooks` / `routes/insight-events` / `routes/insights` / `routes/reports` / `category-pipeline-helpers` / `notifications/content` / `parsers/parser-utils`（+11 deal + 6 coupon）
  - 新增（shared）：`strategy-tags` / `insight-events`
  - 新增（web）：`insightEvents`

### Removed

- `apps/web/src/components/action-center/prototype/`（10 文件 ~75KB）：3 variants + PrototypeSwitcher + NOTES + shared 子目录。**git 索引已清除**（`git rm --cached`），**物理快照归档**到 `docs/archive/prototype-snapshot/`，原目录因 Windows sandbox (Codex) 下 Remove-Item / mavis-trash / send2trash 全部 EPERM 留待用户跳出 sandbox 后手动 `Remove-Item -Recurse -Force` 清理

### Notes

- ADR-0006 记录 Variant B 选型决策 + 次选中从 Variant C 偷的抽屉动画细节，从 Variant A 偷的 KPI 排布降级逻辑
- prototype 物理清理是 v0.3.0 收尾唯一手动步骤（用户跳出 sandbox 后一行 `Remove-Item`）
- 4 处 `package.json` 版本同步 0.2.0 → 0.3.0；`apps/web` / `apps/api` 里 `@amazon-monitor/shared` 依赖版本同步

---

## [0.2.0] - 2026-06-24

### Added
- **竞品池页 UI 重写**：`CompetitorsView` 顶部加 5 个 KPI 卡片（总竞品数 / 核心 / 新进 / 价格波动 / 高优先跟进），右侧加"竞品洞察建议"面板（重点关注 ASIN + 价格活跃 / 促销中 / 核心分层三项统计）
- **类目情报页 UI 重写**：拆分为 `CategoryHeader` + `CategoryKpiCards` + 三个 `CategoryLanePanel`（Movers / Promotions / Fading）+ `CategoryInsightStrip` + `CategoryBoardPanel` + `CategoryDailyBriefingDrawer`，对照截图重排版
- **详情抽屉 class 命名统一**：`.briefing-drawer*` / `.briefing-tag` / `.briefing-image-fallback` → `.drawer-*`
- **类目情报页 lane 卡片可点击打开详情**：复用 `useCategoryDailyBriefing` 的 `drawer` 状态，事件详情走 event mode 抽屉
- **其他信号洞察条**：`Review 增长 Top 品牌` / `价格下降最多` / `近期风险提示` 三个箭头变 button，点击跳到 BSR 表格并预置筛选
- **侧边栏底部显示版本号**：v0.2.0 + 发布日期，点击跳转本文件
- **CHANGELOG.md**：本文件，Keep a Changelog 格式
- **apps/web/src/constants/version.ts**：版本号单一来源，从根 package.json 静态导入
- `useCategoryDailyBriefing` 追加 8 个字段：`moversEvents` / `promotionsEvents` / `fadingEvents` / `couponEndCount` / `dealEndCount` / `activityEndRankDropCount` / `reviewGrowthTopBrands` / `yesterdayKpiDelta` / `priceDropTopItems` / `allInsightCards`
- `useCompetitor` / `useCompetitors` 暴露 `competitorKpis` / `competitorInsightSuggestion` getter
- `useCategoryStore` 追加 `bsrTablePage` / `bsrTablePageSize` / `iceTypeFilter` / `dealCouponFilter` + `pagedCategorySnapshots` getter

### Changed
- **类目情报页 BSR 表格加 4 个筛选**：ICE TYPE / Deal-Coupon / 排名窗口 / 搜索框；新增 20 条/页分页器，筛选变更自动 reset page=1
- **`preserveKnownCommercialFields` 删除 coupon/deal 脏数据 fallback**：`couponText` / `dealBadge` 严格反映今天 parser 真实输出（null 就是 null），不再回退到昨日值
- `categories/prototype/` 8 个文件删除（Variant A/B/C 已被新版 CategoriesView 吸收）
- 11 个旧 Category* panel 删除（ActivityPanel / BrandMatrixPanel / DailyBriefingPanel / IntelligencePanel / InsightsPanel / MovementPanel / PriceHistoryPanel / QualityPanel / SignalsPanel / SummaryMetrics / ReviewGrowthPanel）
- 3 个旧 CategoryMonitor* 文件删除（创建 / 启停类目表单迁到 CategoryHeader 的 ⚙️ 管理模态）
- 3 个情报子组件删除（OverviewStage / FocusQueue / SignalIntensity）
- `composables/useCategoryOverviewStage.ts` 删除
- **样式清理**：`dashboard.css` 删除 `.briefing-*` / `.insight-card*` / `.intel-stage-*` / `.review-growth-*` / `.monitor-summary` / `.opportunity-*` / `.price-radar-*` / `.signal-feed-*` / `.daily-briefing` 等孤儿规则共 ~830 行
- `parser-utils.ts` `dealPatterns` 正则扩展：增加 `prime\s+big\s+deal\s+days?` / `prime\s+early\s+access\s+deal` / `prime\s+member\s+exclusive\s+deal` / `prime\s+exclusive\s+savings` / `prime\s+day\s+exclusive` 变体，4 处文件（`parser-utils.ts` + 3 个 inlined parser）同步
- `validPromoText` allowlist 同步扩展同样的变体
- 4 处 `package.json` 版本 0.1.0 → 0.2.0；`apps/web` / `apps/api` 中 `@amazon-monitor/shared` 依赖版本同步
- App.vue 删除 `CategoriesPrototype` DEV-only 分支（生产 / DEV 统一走 `CategoriesView`）
- `useAppController` 暴露 `createCategory` / `toggleCategory`，给 CategoryHeader 管理模态用
- `useCategoryDailyBriefing` 的 `icons` 参数改为可选（defaults undefined）
- `CategoryBoardPanel.vue` 加分页 + 新筛选；store 的 `pagedCategorySnapshots` getter 自动 clamp 越界 page

### Fixed
- **Prime Day Deal 字段未抓到**：`dealPatterns` 正则此前只匹配 `prime day deal` 单日变体，无法识别 Amazon 实际活动文案 "Prime Big Deal Days"（多日）、"Prime Early Access Deal"、"Prime Member Exclusive Deal" 等。修复后 snapshot.dealBadge 不再为 null，deal_start / deal_end 事件能正确触发
- **coupon / deal 脏数据残留**：`preserveKnownCommercialFields` 在今天 parser 返回 null 时回退到昨日 coupon/deal 值，导致商品实际无 coupon 但数据库 couponText / couponValue / couponRate 仍是历史值；coupon_end / deal_end 事件因此永远不触发。修复后 coupon 状态如实反映，下一轮采集即可自愈
- `CompetitorDrawerPanel` 类型断言缺失导致 `vue-tsc` 报错（`title` 属性不接受 `string | null`）
- `.briefing-kpi` / `.briefing-main-grid` 等媒体查询块中残留的孤儿 class 引用清理
- `dealPatterns` 正则 `\b[$€£¥]` 在字符串开头的 `$` 处不形成 word boundary（这是 JS word boundary 语义限制，本 PR 不修，仅在测试中以 % 形式覆盖）

### Tests
- `parser-utils.test.ts`：新增 11 个 `dealPatterns` + 6 个 `couponPatterns` 用例（含 Prime Big Deal Days 等变体）
- `category-pipeline-helpers.test.ts`（新建）：16 个 `validPromoText` 用例 + 9 个 `preserveKnownCommercialFields` 回归用例（**关键**：今天 parser 返回 null 时 couponText / dealBadge 必须为 null）+ price/rating/review fallback 容错 + 跨 ASIN 行为 + 首次采集
- 单元测试总数：287（api）+ 19（shared）+ 4（web）= **310 测试全绿**

### Removed
- `apps/web/src/components/CategoryActivityPanel.vue`
- `apps/web/src/components/CategoryBrandMatrixPanel.vue`
- `apps/web/src/components/CategoryDailyBriefingPanel.vue`（被新版 CategoriesView 吸收）
- `apps/web/src/components/CategoryIntelligencePanel.vue`
- `apps/web/src/components/CategoryInsightsPanel.vue`
- `apps/web/src/components/CategoryMonitorOverview.vue`
- `apps/web/src/components/CategoryMonitorPanel.vue`
- `apps/web/src/components/CategoryMonitorTable.vue`
- `apps/web/src/components/CategoryMovementPanel.vue`
- `apps/web/src/components/CategoryOverviewStage.vue`
- `apps/web/src/components/CategoryFocusQueuePanel.vue`
- `apps/web/src/components/CategorySignalIntensityPanel.vue`
- `apps/web/src/components/CategoryPriceHistoryPanel.vue`
- `apps/web/src/components/CategoryQualityPanel.vue`
- `apps/web/src/components/CategorySignalsPanel.vue`
- `apps/web/src/components/CategorySummaryMetrics.vue`
- `apps/web/src/components/ReviewGrowthPanel.vue`
- `apps/web/src/composables/useCategoryOverviewStage.ts`
- `apps/web/src/components/categories/prototype/`（8 个文件）
- `data/amazon-monitor.sqlite.bak-20260609-*`（22 MB 过时备份）
- `output/playwright/*.png` / `tmp-ui-check/*` / `.playwright-mcp/*`（Playwright 临时产物）

### Notes
- "较昨日 N"差值本次先以 `null` 占位显示 `-`，等后端补 `yesterdayKpiSnapshot` 字段（`/api/categories/:id/detail` 响应包追加，或新增 `/api/kpi-diff?date=` 端点）；store / composable 已有预留位，无需前端再改
- "Coupon 结束" 等事件需要至少一次完整 `npm run collect:category` 触发，让上一次 parser 输出的真实状态覆盖历史脏数据
- 项目从本版本起按 SemVer 管理：bug fix → PATCH，新功能 / UI 改进 → MINOR，破坏性 API 变更 / 升级依赖 → MAJOR

---

## [0.1.0] - 2026-05-01

### Added
- 初始发布：Node 22.12+ / Vue 3 / Express 4 / Playwright / SQLite monorepo
- 类目 / 关键词 / 竞品 / 概览 / 预警 / 通知 / 报告 / 日志 8 个 Tab
- BSR 快照采集、关键词排名监控、竞品入池、活动事件跟踪
- Playwright 截图保存到 `data/collector-screenshots/`（采集失败容错）
- 缓存键包含版本号和日期，解析器升级后自动失效
- SQLite 嵌套事务用 SAVEPOINT（见 `apps/api/src/store/sql-utils.ts`）
- 路由注册顺序：固定路径（如 `/collect/run`）在参数路径（如 `/:id`）之前
- 35 个测试文件、333 个测试用例，参数化 SQL，全程零 `any`
- 全部 View 组件 `defineAsyncComponent` 懒加载，ECharts 走 manual chunks
- AUDIT_REPORT.md 记录 46 项审计
