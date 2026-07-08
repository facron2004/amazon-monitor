# Workflow Agent 开发进度

## 2026-07-07

AI Daily Operator Agent foundation:
- Added `ai_runs` persistence and `/api/ai/daily-brief`.
- Daily brief uses existing insight events, open tasks, and owned SKU scores as evidence.
- Agent output follows the PRD JSON shape: `summary`, `evidence`, `impact`, `recommended_actions`, `confidence`.
- Recommended actions are approval-gated with `needs_human_approval: true`; low-confidence output cannot produce P0 actions.

Listing Health foundation:
- Added owned SKU Listing snapshots and deterministic Listing health scoring.
- Added `/api/listing-health`, `/api/products/:id/listing-snapshots`, and `/api/ai/analyze-listing`.
- Listing score covers title keywords, title length/repetition, image count, bullet count, Review VOC reflection, and Q&A gaps.
- Added a frontend `Listing Health` view for inspection, snapshot entry, and approval-gated Listing Optimizer Agent output.

Ads Workflow foundation:
- Added `ad_daily_metrics` and deterministic Ads diagnostics for high ACOS, wasted spend, budget-capped scale opportunities, and data gaps.
- Added `/api/ads/metrics`, `/api/ads/summary`, and `/api/ai/analyze-ads`.
- Ads Analyst output is persisted to `ai_runs`; every action keeps `needs_human_approval: true`.
- Added a frontend `Ads Workflow` view for metric entry, risk/scale triage, and Agent recommendations.

Review VOC foundation:
- Added `own_product_reviews` and deterministic VOC diagnostics for negative clusters, low recent rating, topic clusters, and data gaps.
- Added `/api/review-voc`, `/api/products/:id/reviews`, `/api/products/:id/review-voc`, and `/api/ai/analyze-review-voc`.
- Review VOC Agent output is persisted to `ai_runs`; every action keeps `needs_human_approval: true`.
- Added a frontend `Review VOC` view for review evidence entry, SKU triage, topic clusters, and Agent recommendations.

Inventory Replenishment foundation:
- Added `product_inventory_settings` for SKU-level lead time, safety stock, target stock, MOQ, pack size, supplier, and reorder point evidence.
- Added `/api/inventory/plans`, `/api/products/:id/inventory-plan`, and `/api/products/:id/inventory-setting`.
- Replenishment plans derive stockout risk, reorder due, overstock, and data-gap signals from owned SKU daily inventory and units-sold metrics.
- Added a frontend `Inventory` view for SKU triage, threshold editing, freshness evidence, and recommended order quantity review.

Profit Safety Line foundation:
- Added `product_profit_settings` for SKU-level cost, fee, and margin guardrail assumptions.
- Added `/api/profit/plans`, `/api/products/:id/profit-plan`, and `/api/products/:id/profit-setting`.
- Profit plans derive current, 10% Coupon, 15% Coupon, and Deal scenarios from owned SKU sales, units, ad spend, and saved cost assumptions.
- Added a frontend `Profit` view for margin-risk triage, price safety lines, scenario review, and cost assumption editing.

完成 PRD P0 的“自营 SKU 经营中心”基础切片：

- 新增 `own_products` 和 `own_product_daily_metrics` 表，用于保存我方 SKU 主数据和日经营指标。
- 新增 `/api/products`、`/api/products/:id`、`/api/products/:id/metrics`、`/api/products/:id/risk-score`、`/api/products/:id/opportunity-score`。
- 新增确定性风险/机会评分，评分只使用已有指标和关联事件，不生成无证据结论。
- 新增前端“自营 SKU”页，支持新增 SKU、录入指标、查看评分原因和近期指标。
- 新增 products route 测试，并验证 shared/API/web 构建通过。

当前边界：

- 指标录入以手动或 mock data 为主，真实 SP-API、Ads API、库存和利润系统接入留给后续阶段。
- 不执行自动调价、广告调整或 Listing 修改，只生成评分和后续任务入口所需的数据基础。
