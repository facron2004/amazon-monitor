# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> 版本号维护规则（monorepo,统一递增）：
> - 4 处 `package.json`（根 / `apps/web` / `apps/api` / `packages/shared`）同步 bump
> - 内部依赖版本（`apps/web`、`apps/api` 里 `@amazon-monitor/shared` 的版本字符串）同步更新
> - 顶部追加新版本小节 + 本次改动条目
> - 类型:`feat:` / `fix:` / `refactor:` / `chore:` / `docs:` / `perf:`

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
