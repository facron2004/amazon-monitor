# Workflow Agent 开发进度

## 2026-07-22

Competitor daily KPI evidence and truthful trend presentation:

- Replaced the competitor workspace's permanent null placeholder with an organization-scoped daily KPI snapshot for total, core, new, price-active, and key competitors, using one shared rule across API persistence and Web presentation.
- Added `GET /api/competitors/kpis` without changing the existing competitor-list response. The route refreshes today's idempotent snapshot and returns an exact previous-day comparison only when that snapshot exists.
- Kept filtered keyword/source/tier views out of the global comparison so their cards never inherit an incompatible baseline, and retained null deltas for first-use days instead of synthesizing history.
- Removed decorative seeded KPI sparklines and now draw only the real yesterday-to-today movement. The insight sidebar also uses the verified price/core deltas and reports unavailable promo-subset history as unknown.
- Verified the authenticated competitor workspace with 499 total, 111 core, 32 new, 169 price-active, and 0 key competitors; the first captured day displayed no false deltas or trend lines, and both 1440px and 390px layouts had zero horizontal overflow.
- Verified 753 monorepo tests (`59` shared, `501` API, `193` web), the full shared/API/web production build, OpenAPI JSON, and focused shared/API/Web regression coverage.

Category daily KPI evidence and briefing responsibility split:

- Added one shared category-activity lane and daily KPI rule for movers, promotions, fading, and positive Review growth, then reused it across the API and Web instead of maintaining separate event buckets.
- Extended the category detail response with `yesterdayKpiSnapshot`; it returns an exact previous-day baseline only when that day has a verified category snapshot, so missing evidence remains unknown instead of being treated as zero.
- Decoupled full KPI totals from the six-event lane preview limit. The real category workspace now reports 14 movers, 22 promotions, 11 fading events, and 8 Review-growth events while each lane remains scan-friendly.
- Reduced `useCategoryDailyBriefing.ts` from 521 to 83 lines and split battle summary, insight cards, signal lanes, pure presentation helpers, and types into focused modules no larger than 184 lines.
- Fixed the category event drawer's mismatched Vue model name (`modelValue` versus `drawer`), restoring direct lane-card detail with evidence, cause, impact, and suggested action.
- Verified authenticated desktop rendering, real previous-day deltas, lane-card detail, and the 390px drawer/layout with zero horizontal overflow; the only browser console error was the expected pre-login `/api/auth/me` `401`.
- Verified 747 monorepo tests (`56` shared, `500` API, `191` web) and the full shared/API/web production build.

Action Center workspace responsibility split:

- Reduced `ActionCenterPanel.vue` from 755 to 444 lines by moving filter scope and supporting-data refresh into `useActionCenterFilterScope`, and detail selection, linked tasks, competitor analysis, status updates, review scheduling, and task conversion into `useActionCenterDrawerWorkflow`.
- Added typed workspace helpers for status-column routing, unique ASIN/watch/high-risk counts, and review-due KPI details, with regression coverage for all six event states and date-bound review queues.
- Preserved the existing Action Center component contract, Pinia stores, API calls, approval dialog, external-navigation auto-open behavior, filter interactions, and drawer workflow while keeping the extracted composables within the code-engineering size guidance.
- Verified authenticated desktop rendering, P0 focus (`42` scheduled reviews narrowed to `21`), event detail loading with AI analysis/evidence/owner/tasks, and the 390px mobile layout with zero horizontal overflow; the only browser console error was the expected pre-login `/api/auth/me` `401`.
- Verified 742 monorepo tests (`53` shared, `500` API, `189` web) and the full shared/API/web production build.

Task Center workspace responsibility split:

- Reduced `TasksView.vue` from 507 to 101 lines by moving workflow state and actions into `useTaskWorkspace`, and extracting the operations header, adaptive board, notes dialog, and SOP promotion dialog into focused components no larger than 176 lines.
- Replaced the six-column horizontal board with a responsive three/two/one-column workflow grid, added stable handoff counts for pending, execution, confirmation, recap, and overdue work, and kept filtering, assignment, execution, review, notes, cancellation, detail evidence, export, and SOP promotion behavior intact.
- Added typed task grouping, overdue, and summary helpers with regression coverage; the implementation keeps the existing shared task contract, Pinia store, API routes, and approval-gated state machine unchanged.
- Verified authenticated desktop rendering, task detail evidence, P0 filtering, and the 390px mobile layout with zero horizontal overflow; the only browser console error was the expected pre-login `/api/auth/me` `401`.
- Verified 739 monorepo tests (`53` shared, `500` API, `186` web) and the full shared/API/web production build.

## 2026-07-21

PRD MVP final-acceptance audit:

- Rechecked all 14 Section 19 acceptance items against the current routes, stores, operational views, and regression suites. The current implementation has executable paths for monitor intake, snapshots, 26 insight-event types, Daily Operator actions, event-to-task conversion, task execution/review, competitor trends, BSR Top100/brand matrix, keyword rank matrix, evidence-bound Agents, Markdown daily reports, collection failure evidence, loading/error/empty states, and approval-gated actions.
- Kept external production connectors outside the completion claim: SP-API, Ads API, ERP/WMS, and third-party delivery remain configuration or adapter boundaries until real credentials and production synchronization are supplied.

Action Center chart responsibility split:

- Extracted the 11-chart grid, ECharts lifecycle, captions, and pointer-to-filter interactions from `ActionCenterChartsPanel.vue` into a dedicated chart component while preserving the existing parent props and emitted workflow events.
- Moved panel-only presentation rules into a scoped stylesheet and removed chart-grid rules that no longer belong to the parent, reducing the main panel from 897 to 474 lines.
- Replaced the 1,268-line chart utility with an 8-line compatibility facade and responsibility-based modules for shared types/theme, aggregation, brand pressure, summaries, takeaways, and overview/driver/review option builders. The largest resulting module is 281 formatted lines and existing imports remain unchanged.
- Verified all overview, driver, and review charts with non-empty canvas pixel checks, exercised a chart-to-filter interaction, and confirmed 1440px and 390px layouts have no horizontal overflow.
- Verified 737 monorepo tests (`53` shared, `500` API, `184` web) and the full shared/API/web production build.

Owned SKU workspace responsibility split:

- Reduced `ProductsView.vue` from 642 to 150 lines by extracting the KPI strip, SKU table, scoring/detail panel, create flow, metric-entry flow, and store-assignment flow into focused components no larger than 163 lines.
- Bound metric submission directly to the SKU that opened the dialog instead of relying on an asynchronously refreshed global selection, removing a list-row editing race while preserving the existing product store and API contracts.
- Moved page styling to a dedicated stylesheet and made all three write dialogs viewport-bounded. At 390px the create dialog now fits at 366px, forms collapse to one column, the toolbar stacks cleanly, and the page has no horizontal overflow.
- Verified the empty state and create validation in a real authenticated browser, all 184 Web tests, all 737 monorepo tests, and the full shared/API/Web production build.

Keyword-source Listing and rating change evidence:

- Extended snapshot-diff event construction from category-only context to either category or keyword evidence without duplicating scoring, review scheduling, strategy tags, or approval behavior.
- Keyword collection now compares consecutive SERP snapshots and emits `LISTING_CHANGED` for normalized title/main-image changes and `RATING_DROP` for decreases of at least `0.2`, including before/after fields and the originating keyword in evidence.
- Deduplicated same-day ASIN changes across keyword monitors and category collection. A later category observation upgrades the existing event with richer category and brand-matrix context instead of creating a second operator action.
- Added integration coverage for keyword-only competitors, same-date rerun idempotency, and keyword/category cross-source deduplication.
- Verified 726 monorepo tests (`53` shared, `489` API, `184` web) and the full shared/API/web production build.

## 2026-07-18

Operations Workspace UI v4:

- Generated an implementation-oriented Apple enterprise operations mockup with ImageGen and saved it as `docs/design/operations-workspace-apple-direction.png`.
- Reworked the overview into a compact daily command surface with a live operations pulse, stable KPI strip, table-like priority queue, and denser risk context.
- Preserved all PRD homepage actions and data contracts, including site/category/brand/owner filters, report generation, Agent brief, event detail, task conversion, follow-up, and ignore actions.
- Added a compact score-badge mode and extracted event presentation logic from the action component, keeping the changed Vue, TypeScript, and CSS modules within the code-engineering size guidance.
- Verified authenticated desktop and mobile layouts, filter selection/reset, zero browser console errors, Web type checking, Web tests, and the production build.

Organization-scoped Keyword Collection:

- Added `org_id` ownership to keyword monitors, collection queue jobs, and collection task logs with backward-compatible default-organization migrations and organization-aware indexes.
- Scoped keyword CRUD, detail, snapshots, rank-matrix date fallback, single/batch collection requests, collector job history, freshness, queue health, and task logs to the signed-in organization.
- Updated queue deduplication to use `(org_id, task_type, target_id, date)`, so identical collection requests from different organizations remain independent while same-organization duplicates still collapse.
- Preserved a global Worker claim loop while carrying job organization into category task logs; category monitor configuration itself remains a shared legacy domain for a later organization-migration slice.
- Added dual-organization route coverage and queue-level deduplication coverage, and stabilized the period-report task fixture with an explicit completion date.
- Verified all 710 monorepo tests, API/Web type checking, and the production build.

Organization-scoped BSR Category Workflow:

- Added `org_id` ownership to category monitors with a backward-compatible default-organization migration and organization/status index.
- Scoped category CRUD, single/batch collection, snapshots, detail, Diff, brand matrix, signals, product price/activity evidence, BSR history/quality/change insights, Product Research, Brand Playbook, and review evidence to the signed-in organization.
- Carried category ownership through cron, CLI, Worker queue jobs, task logs, dashboard aggregation, daily reports, and Excel delivery; cross-organization category ids and product links now return `404` instead of falling back to global product evidence.
- Kept derived category tables anchored to the category monitor through `category_id` joins, avoiding duplicated ownership columns that could drift from their source configuration.
- Added legacy-schema migration coverage and a dual-organization route suite covering lists, detail evidence, reports, dashboard counts, collection requests, queue ownership, and cross-organization rejection.
- Verified all 712 monorepo tests plus the shared, API, and Web production builds.

Organization-scoped Competitor Pool:

- Added `org_id` ownership to competitor-pool rows and replaced the global `(asin, marketplace)` uniqueness rule with `(org_id, asin, marketplace)`, allowing separate teams to manage the same ASIN independently.
- Added a table-rebuild migration that preserves legacy ids and evidence fields, backfills historical rows to organization 1, restores organization-aware indexes, and enforces the new composite key.
- Scoped manual and CSV intake, keyword/category discovery upserts, pool lists and folders, key-competitor state, product links, category row pool status, activity calendars, Dashboard counts, rank matrix, Agents, and daily reports to the signed-in organization.
- Filtered activity-calendar category, keyword, event, signal, BSR, price, action-insight, and keyword-change evidence through their source monitor ownership instead of trusting ASIN equality alone.
- Split competitor persistence out of the 470-line keyword snapshot Store: `competitor-store.ts` now owns pool behavior while `keyword-snapshot-store.ts` is reduced to snapshot and history responsibilities.
- Added legacy migration and dual-organization HTTP coverage proving independent titles, key status, links, activity evidence, and Dashboard counts for the same ASIN.
- Verified all 714 monorepo tests plus the shared, API, and Web production builds.

Organization-scoped Keyword Alerts and Reports:

- Added `org_id` ownership to keyword daily changes, alert logs, and legacy keyword daily reports, keeping all three outputs from a keyword collection transaction under the same organization boundary.
- Rebuilt the legacy keyword-report table around `(org_id, report_date, keyword)`, migrated historical ids and timestamps to organization 1, and changed daily-change deduplication to include organization ownership.
- Scoped alert lists and status transitions, daily-change feeds, keyword detail, Dashboard alert counts, live keyword reports, archived workflow-report evidence, Report Writer inputs, and product activity calendars to the signed-in organization.
- Preserved notification-content calls without an organization only while notification schedules remain a documented global legacy domain; schedule ownership and organization-aware delivery are the next migration slice.
- Added dual-organization HTTP coverage for alert visibility, cross-organization status rejection, daily changes, Dashboard counts, and same-date/same-keyword report independence, plus a three-table legacy migration regression.
- Verified all 716 monorepo tests plus the shared, API, and Web production builds.

Organization-scoped Notification Delivery:

- Added `org_id` ownership to notification schedules and send logs, with compatible backfill of legacy rows to organization 1 and organization-aware due/log indexes.
- Scoped schedule lists, creation, updates, deletion, manual sends, and log history to the signed-in organization; cross-organization ids return `404`, while mutation access follows the PRD `manage_reports` capability.
- Carried schedule ownership through text, Feishu, HTML, Dashboard summaries, keyword/category reports, Action Center evidence, BSR promotions, and Excel attachments, including organization-scoped previous-day Brand Top10 comparisons.
- Kept the background due-schedule scan global by design so one worker serves every organization, while each generated message and delivery log remains locked to the schedule organization.
- Closed the older `/api/task-logs` and `/api/collect/*` compatibility-route gap so jobs, logs, freshness, and queue statistics use the same session organization as `/api/collectors/*`.
- Added dual-organization HTTP/delivery coverage, attachment-content assertions, viewer permission coverage, and legacy schedule/log migration regression.
- Verified all 718 monorepo tests plus the shared, API, and Web production builds.

Snapshot Provenance and Freshness Evidence:

- Added `data_source`, `last_synced_at`, and `sync_status` to keyword SERP and category BSR raw snapshots, with a backward-compatible migration that labels existing rows as legacy successful evidence and backfills their original creation time.
- Carried collector provenance through both pipelines: default browser collection records `amazon_playwright`, injected collectors record `collector`, complete runs record `success`, and accepted incomplete BSR coverage records `partial`.
- Kept direct Store writes explicit as `manual` so imported or test-created evidence is never presented as an Amazon browser sync.
- Returned the provenance fields through existing snapshot APIs and surfaced the latest source, state, and sync time in keyword and category detail headers without changing existing endpoint shapes.
- Added migration, Store/API, pipeline success/partial, and frontend formatter regression coverage; verified desktop semantics and the 390px operations layout in an authenticated browser session.
- Verified all 721 monorepo tests, API/Web type checking, and the shared, API, and Web production builds.

Global Collection Freshness Evidence:

- Extended the organization-scoped collection freshness contract with `dataSource`, `lastSyncedAt`, `syncStatus`, and `syncError`, combining the latest queue state with the latest owned keyword or category raw snapshot.
- Kept queue semantics explicit: pending/processing jobs report pending, the newest failed job overrides prior successful evidence and exposes its concrete error, and completed jobs preserve snapshot-level success, partial, manual, or legacy provenance.
- Extracted the aggregate from the oversized queue Store into `collection-freshness-store.ts`, leaving queue claim/retry/fail behavior unchanged while reducing mixed responsibilities.
- Reworked the global topbar evidence chips so every authenticated workspace shows source, state, and age; the 390px layout keeps the same evidence in a stable two-line grid and exposes exact timestamps and failure reasons through keyboard-focusable status text.
- Added queue-state and dual-organization snapshot-source regression assertions, shared display-label coverage, and authenticated browser checks for success, partial, and CAPTCHA failure states.
- Verified all 722 monorepo tests, API/Web type checking, and the shared, API, and Web production builds.

PRD API Contract Compatibility:

- Audited all Section 10 PRD endpoints against the live Express routes and the `/api`-prefixed OpenAPI document, separating real gaps from server-prefix false positives.
- Added organization-scoped Dashboard action/event feeds and BSR Center category, Top100 snapshot, date diff, brand matrix, and new-riser endpoints on top of existing Store methods.
- Added the canonical `/api/events` workflow resource with acknowledge, ignore, detail, list, and idempotent event-to-task conversion while preserving the richer `/api/insight-events` routes.
- Added `PUT` compatibility for keyword/task updates, keyword history, and task completion without bypassing the existing execution and review state machine.
- Published every compatibility route in OpenAPI and added contract, status-flow, organization-scope, BSR evidence, and idempotency coverage.
- Verified all 724 monorepo tests and the shared, API, and Web production builds.

Competitor ID, Snapshot, and Timeline Contract:

- Added organization-scoped numeric-id lookup for competitor-pool records while preserving existing ASIN link, Amazon-open, key-state, and activity-calendar routes.
- Added `/api/competitors/:id/snapshots` as a source-preserving read model over keyword SERP and category BSR raw snapshots; each row retains source scope, price, promotion, rating, Review, rank, provenance, and sync state without duplicating persistence.
- Added `/api/competitors/:id/timeline` over the existing activity calendar, including category/keyword ranks, prices, promotions, BSR, signals, action insights, keyword changes, Listing events, and organization-scoped Insight Events.
- Added the canonical `/api/competitors/import` CSV path and switched the frontend client and competitor activity workflow to the numeric-id contract while keeping `/import/csv` compatible.
- Normalized `amazon.*` and `www.amazon.*` host variants at parameterized query time so historical evidence remains connected without mixing different country marketplaces.
- Added dual-organization, dual-source, pagination, cross-organization rejection, empty-manual-timeline, CSV alias, and OpenAPI contract assertions; verified all 724 monorepo tests and the shared, API, and Web production builds.

## 2026-07-17

Complete P0 Rule Runtime:

- Added PRD-aligned S/A/B/C keyword priority to the shared model, SQLite schema, backward-compatible migration, keyword CRUD, rank matrix, and operations UI.
- Connected the remaining core-keyword page-drop rule to owned-ASIN rank evidence, requiring an S keyword, a drop of at least five positions, and movement from page one beyond rank 48.
- Connected the remaining owned-SKU rating-drop rule to the latest two organization-scoped product rating metrics, preserving both evidence dates and before/after values.
- Added dedicated `KEYWORD_PAGE_DROP` and `OWNED_RATING_DROP` events so owned-operation signals are not conflated with competitor rank/rating events; task conversion maps them to keyword and Review work.
- The full PRD P0 catalog now reports 10 of 10 rules as runnable while retaining configurable thresholds, severity, cooldown, idempotency, and mandatory human approval.
- Verified legacy SQLite migration, rule evidence, rank-matrix priority propagation, task mapping, desktop/mobile UI, all 698 monorepo tests, and the production build.

Rule Runtime:

- Added `POST /api/rules/run` and an operator-facing immediate evaluation action in Rules Center.
- Connected four owned-operation rules to organization-scoped Inventory, Ads, Review VOC, and Listing Health data, with configurable enabled state, thresholds, severity, and cooldown.
- Standardized generated evidence as Insight Events so qualifying signals can enter Action Center, convert to domain-correct tasks, and continue through review and SOP workflows.
- Added deterministic same-day idempotency and cross-day cooldown handling; rule execution never performs purchasing, repricing, Ads mutations, or other automatic business writes.
- Verified focused runtime, threshold, permission, cooldown, and task-mapping coverage plus the then-current 695-test monorepo suite and production build.

Operations Workspace UI v3:

- Generated a new Apple-enterprise operations reference with ImageGen and saved it as `docs/design/operations-command-center-apple-v3.png`.
- Added a final shared UI layer that reduces decorative cards, tightens the navigation and command bar, and gives the first viewport to operating status, business KPIs, priority actions, and risk evidence.
- Changed priority actions from separated floating cards into a compact queue with stable row rhythm, restrained semantic colors, and clearer command emphasis.
- Kept the existing Vue component and Pinia boundaries intact while improving desktop density, 390px reflow, and the mobile navigation drawer.
- Verified the real authenticated UI at 1600x1000 and 390x844, the full monorepo build, and all 690 unit tests.

Organization-scoped Insight Workflow:

- Added `org_id` ownership to Insight Events and ASIN watch states, including a backward-compatible migration from the legacy single-ASIN watch-state primary key to `(org_id, asin)`.
- Scoped event lists, detail, notes, assignments, status transitions, review queues, task conversion, activity-calendar evidence, Daily Operator inputs, competitor analysis, and daily/period reports to the signed-in organization.
- Prevented cross-organization event ids, task links, watch states, and report evidence from being read or mutated through another tenant's session.
- Ensured the default organization is created before organization-scoped foreign-key migrations backfill legacy rows, including fresh and existing SQLite databases.
- Added migration, route, task-link, report, and cross-organization regression coverage; the full shared/API/web suite now passes.

Archived Report PDF Delivery:

- Added approval-gated PDF delivery for archived daily, weekly, and monthly reports without recomputing or mutating the archived business evidence.
- Built a dedicated Playwright print renderer with Chinese typography, report metadata, version and coverage audit, Markdown headings/lists/tables/code support, page numbering, and an explicit human-approval boundary.
- Added `/api/reports/daily.pdf` and `/api/reports/period.pdf`, preserving organization isolation, report permissions, deterministic filenames, and archive-not-found behavior.
- Consolidated the crowded report toolbar into two export menus: period PDF/Markdown and daily PDF/Markdown/Excel.
- Added pure print-HTML safety coverage plus route tests using an injected renderer, so unit tests do not require a browser while production still renders real PDFs through Chromium.

Weekly / Monthly Operations Report Archive:

- Upgraded the existing event-only weekly/monthly insight view into an organization-scoped, versioned operations-report archive with dedicated generation, read, history, and Markdown delivery endpoints.
- Added equal-length current/previous period comparison for sales, gross profit, orders, and Ads efficiency while keeping every marketplace currency separate and excluding unassigned Ads rows from monetary aggregation.
- Implemented all eight PRD weekly-report sections: sales/profit change, SKU ranking, competitor timeline, category movement, Ads efficiency, Listing/Review issues, completed tasks, and next-period actions.
- Added explicit coverage metadata, missing-evidence fallbacks, human-approval boundaries, weekly/monthly history selection, and version increments for regeneration.
- Split report generation from Markdown formatting and extracted the report workspace header, period archive panel, and reader card so page and service files remain within the code-engineering size guidance.
- Added route coverage for weekly/monthly windows, versioning, organization isolation, role permissions, multi-currency output, and Markdown delivery.

Profit Safety Action Loop:

- Added shared, deterministic target-margin, Coupon, and Deal action options derived from the selected SKU's current profit plan; scenarios below the minimum safe price or minimum margin are blocked before task creation.
- Added an idempotent, organization-scoped `/api/products/:id/profit-plan/task` endpoint that converts a human-selected safe scenario into a price or promotion review task.
- Preserved the evidence date, proposed price and margin, configured guardrails, Ads cost/TACOS, inventory days and risk level, plus an explicit comparable-competitor landed-price evidence gap in the task background.
- Kept execution approval-gated: the task records a recommendation only and cannot automatically change price, create Coupon/Deal campaigns, or modify Ads budgets.
- Added a compact price-action panel to Profit Safety, extracted it into a focused component, and stopped multi-market profit from being summed across currencies.
- Verified safe/blocked scenarios, first-create `201`, idempotent `200`, Task Center provenance, desktop rendering, and 390px mobile rendering with zero horizontal overflow in a real browser.

## 2026-07-16

Inventory Plan-to-Task Loop:

- Added an idempotent, organization-scoped inventory-plan task endpoint that converts critical, reorder-watch, or overstock evidence into an approval-gated workflow task.
- Preserved the evidence date, stock, velocity, days of cover, reorder point, recommended quantity, stockout/reorder dates, supplier, and issue evidence in the task background.
- Prevented data-gap-only plans from creating false replenishment work, and reused the existing task for the same SKU, evidence date, and signal instead of duplicating it.
- Added a prominent human-confirmation action panel to Inventory, explicitly blocking automatic purchasing, repricing, or Ads changes while supporting direct handoff to Task Center.
- Improved task detail provenance for rule/plan tasks and verified first-create `201`, idempotent `200`, Task Center evidence, desktop layout, and 390px mobile rendering in a real browser.

Operations Workspace UI v2:

- Generated a high-fidelity operations command-center reference with ImageGen and saved it under `docs/design/operations-command-center-v2.png`.
- Added a final shared workspace theme layer with a 224px navigation rail, 58px global command bar, restrained Apple-style neutral surfaces, compact controls, semantic status colors, and flatter enterprise panels.
- Reordered the Overview information flow into operating status, business KPIs, priority actions with a risk context rail, and chronological activity evidence.
- Kept API contracts and business behavior unchanged while applying the shell treatment consistently to dense pages such as Ads Workflow.
- Verified production build, focused tests, 1440px desktop layout, 390px mobile reflow, mobile navigation drawer, and zero horizontal overflow in a real browser.

Review VOC Deep Action Pack:

- Extended the persisted Agent artifact contract with negative-topic summaries, supplier corrective actions, Listing recommendations, support-response drafts, product opportunities, customer language, competitor pain-comparison rows, and decision risks.
- Upgraded the deterministic Review VOC Agent to v2 and derived every item from Review topics, sentiment, sample ids, and the current 30-day evidence window.
- Kept competitor comparison honest: competitor evidence remains explicitly unavailable until competitor Review text is imported, so the Agent cannot claim a relative advantage from own-product reviews alone.
- Added artifact validation before `ai_runs` persistence and a reusable review/copy panel in Review VOC and Agent Center with container-aware desktop/sidebar behavior.
- Added policy, route persistence, and frontend formatting coverage; verified the v2 action pack, Agent-history readback, desktop rendering, and 390px mobile layout in a real browser.

Listing Rewrite Assistant:

- Extended the shared Agent output with an optional persisted Listing rewrite artifact covering a proposed title, five evidence-backed Bullet drafts, image briefs, A+ modules, and publication risk notes.
- Upgraded the deterministic Listing Optimizer to v2 and generated drafts only from the current title, core keywords, existing bullets, Review highlights, and Q&A gaps without inventing product specifications.
- Added artifact-level validation so incomplete or evidence-free Listing drafts fail before they are written to `ai_runs`; every draft retains an explicit human-approval and claim-verification boundary.
- Added one reusable review-and-copy panel to Listing Health and Agent Center, with container-aware desktop/sidebar layout and responsive 390px mobile behavior.
- Added policy, route persistence, and frontend Markdown-format coverage; verified generation, persisted Agent history, copy interaction, and zero horizontal overflow in a real browser.

Product Research Candidate-to-Pool Loop:

- Added structured Product Research candidates from current-date new-product breakout and low-Review Top50 evidence, with deterministic ordering and a five-ASIN cap.
- Returned candidate rank, price, Review count, evidence reason, and current competitor-pool state without allowing the Agent to write automatically.
- Added permission-aware human confirmation in the category research panel, reusing the existing category-to-competitor API and synchronizing the visible BSR pool state after success.
- Added API and frontend Store regression coverage; verified the real Agent generation and competitor-pool write flow at desktop and 390px mobile widths with no horizontal overflow.

Multi-store Operations Foundation:

- Added organization-scoped Amazon store accounts with marketplace, Seller ID, authorization health, and active/paused status, exposed through admin-managed `/api/stores` routes.
- Added the store-account workspace to Data Sources Center and store assignment/filtering to Owned SKU Center, including reassignment and unassignment for legacy SKUs.
- Added a nullable store relationship to owned products with an additive SQLite migration; existing products remain explicitly unassigned.
- Enforced organization, marketplace, paused-store, and assigned-marketplace integrity, with route coverage for permissions and the complete assignment lifecycle.
- Verified the operational flow with real desktop and 390px mobile browser sessions, including store creation, assigned SKU visibility, store filtering, and no horizontal overflow.

Promotion Calendar Workflow:

- Added organization-scoped promotion plans linked to existing stores and owned SKUs, covering campaign type, date window, target price, budget, inventory target, readiness, and notes.
- Derived preparation-due, upcoming, active, review-due, completed, and cancelled states from the selected business date instead of persisting stale monitoring conclusions.
- Added idempotent preparation and campaign-review task creation with source traceability, due dates, ASIN/brand context, and direct visibility in Task Center.
- Added the Activity Calendar operations page with status summaries, store/state/search filters, plan editing, readiness/completion actions, and responsive mobile layout.
- Enforced organization, marketplace, and assigned-store integrity and added shared-state, route, permission, relation, and task-idempotency coverage.

Task Execution Checklist:

- Added an Excel-compatible CSV export for human-confirmed `in_progress` tasks, with optional priority and assignee filters and organization-scoped assignee names.
- Protected the fixed export route with the shared `manage_workflow` capability and kept read-only roles from seeing the Task Center export control.
- Added UTF-8 BOM, quoted multiline cells, and spreadsheet-formula injection protection for operator-entered task content.
- Connected the Task Center priority filter to the export while keeping execution status fixed to `in_progress` so pending suggestions cannot be mistaken for approved actions.

Dashboard Operations Overview:

- Added organization-scoped exact-date aggregation for active owned-SKU sales, orders, Ads spend, weighted ACOS, weighted gross margin, inventory risk, and open workflow tasks.
- Added a seven-day sales series and previous-day comparison without per-SKU query loops; dashboard aggregation stays parameterized and excludes inactive products and other organizations.
- Kept financial values separated by marketplace so USD, GBP, EUR, and JPY are never presented as one misleading total; missing evidence remains `null` instead of becoming zero.
- Added a compact operations KPI band to the home workspace with data coverage, last-sync evidence, single-market trend bars, multi-market breakdowns, and responsive desktop/mobile states.

Today 5 Direct Action Loop:

- Tightened the home feed to current-date P0/P1 events that still require action; P2, followed, ignored, reviewed, and task-converted events no longer reappear in Today 5.
- Added permission-aware home actions for event detail, task conversion, followed status, and ignore status, with per-event submission locking and immediate feed refresh.
- Reused the existing event-to-task API and a shared deterministic task-type mapper across Home and Action Center instead of duplicating conversion rules.
- Added one-click daily report generation for the selected business date through the existing Reports Store and `manage_reports` capability, while refreshing the operations task count after conversion.
- Connected each Daily Operator recommendation to the existing organization- and user-scoped thumbs-up/down feedback API, with immediate active-state feedback and shared merge logic across Home and Agent Center.
- Added server-backed Today 5 filters for marketplace, category, brand, and assignee, with complete actionable option lists and a compact responsive operations toolbar.
- Replaced the legacy keyword-only change ticker with a chronological P0/P1 activity feed covering ranking, price and promotion, Listing, and Review events, with direct Action Center handoff.
- Extracted home workflow orchestration and panel styling so the view component remains within the code-engineering component-size guideline.
- Made the shared app-view boundary the constrained vertical scroller, keeping the topbar visible while long desktop and mobile workspaces remain reachable instead of being clipped by the fixed-height main shell.

## 2026-07-15

Competitor Detail Trend Evidence:

- Added a focused competitor trend workspace to the existing 30-day activity calendar, using the same snapshot evidence for price, Review count, category rank, and BSR instead of introducing a parallel data source.
- Added structured `LISTING_CHANGED` InsightEvent evidence to the activity-calendar response and a compact Listing change timeline, so title and main-image changes remain distinct from promotion and rank events.
- Kept the chart runtime lazy-loaded and separated chart option construction, ECharts lifecycle, and Vue rendering responsibilities; the trend utility and route composition have focused regression coverage.
- Repaired two current-worktree verification blockers without changing their intended behavior: API entry imports now use the required ESM `.js` suffix, and the topbar Worker controls call the controller's real poll/restart methods.

Page State Coverage:

- Added a shared current-view state boundary so every top-level operations page now presents contextual loading, a retained failure reason, and an explicit retry command instead of briefly rendering empty business content.
- Reused the controller's existing per-domain loading refs and kept domain-specific table/list empty states unchanged; no store or API contract was duplicated.
- Fixed initial loading and fast tab switching by removing duplicate preloads and resetting superseded page-level loading flags before the next request starts.
- Added focused state-priority coverage and verified the real loading, failure, and retry flow at desktop and 390px mobile widths with no horizontal overflow.

Product Research Agent:

- Added deterministic `POST /api/ai/research-product`, using the selected category's actual evidence date, BSR snapshots, brand matrix, and category signals for price-band and entry-window research.
- Added a snapshot-derived brand fallback when the daily brand matrix is unavailable, so Agent evidence remains consistent with the visible category leaderboard.
- Persisted every result to `ai_runs` as `product_research`; all recommendations remain approval-gated, and missing Review VOC is stated as an evidence gap rather than inferred as a customer pain point.
- Added the Product Research panel to the category intelligence flow and wired its runs into Agent Center labels and task conversion.
- Added route, permission, fallback, and task-mapping coverage; verified the generated Northstar evidence and persisted run at desktop and 390px mobile widths without horizontal overflow.

## 2026-07-13

Category BSR Historical Context:

- Enriched the category-detail snapshot contract with the exact previous-day rank, latest rank at or before the 7-day baseline, signed 7-day rank change, first-listed date, observed listing days, and a 30-day new-listing flag.
- Loaded historical context for the full current snapshot set in one parameterized SQLite query and added a matching category/ASIN/date index instead of issuing per-row queries.
- Kept the operations table compact by placing historical movement in the rank cell and listing age in the product cell, alongside the existing promotion, breakout, and competitor-pool actions.
- Added route coverage for historical rank semantics and the category-to-competitor-pool lifecycle.

Category BSR Snapshot Diff:

- Added a shared deterministic snapshot comparator covering new entries, dropped products, rank movement, price changes, Coupon/Deal changes, and Review growth across explicit dates.
- Added `GET /api/categories/:id/diff` with validated historical comparison dates and route-level evidence for the requested date pair.
- Added a dedicated category Diff workspace with 1-day, 7-day, 30-day, and custom comparisons, operational filters, compact summaries, and product-detail handoff.

Keyword Rank Matrix:

- Added an organization-aware rank matrix across monitored keywords and active owned/competitor ASINs, backed by an unbounded dedicated snapshot query rather than paginated list endpoints.
- Added `GET /api/keywords/rank-matrix`, resolving the latest available snapshot at or before the requested date while keeping previous-day and seven-day comparisons exact.
- Added a keyword-page operations matrix with ownership and text filters, sticky keyword rows, organic/ad ranks, seven-day movement, BSR, Coupon, and Deal signals.
- Kept Amazon Choice and Best Seller badge state explicitly unavailable because the current collector does not return those badge fields; BSR evidence is shown separately and is not presented as a badge claim.

## 2026-07-12

PRD Role Capability Foundation:

- Expanded identity roles to admin, manager, operator, ads operator, product researcher, and viewer while retaining the existing developer role as read-only compatibility.
- Added a shared business-capability matrix consumed by both API and web code instead of duplicating role-string checks.
- Migrated Action Center, task, and SOP write access to the `manage_workflow` capability; manager, operator, ads operator, and product researcher can manage the workflow, while viewer and legacy developer remain read-only.
- Kept the new roles scoped: product researchers can create workflow tasks but cannot mutate category configuration, and data-source administration remains admin-only.
- Added shared, frontend, auth-route, and server integration coverage. Other business domains still use their existing admin/operator boundaries and will migrate incrementally.
- Split task creation from task assignment with a dedicated `assign_tasks` capability: admin and manager can assign or unassign owners, while operator, ads operator, and product researcher can still create and operate unassigned tasks.
- Added an assignment dialog and assignee labels to the task board, backed by an organization-scoped active-user directory; cross-organization users are no longer returned by `GET /api/users`.
- Aligned rule management, report generation/export, and data-source administration with the PRD capability matrix and added role-level API regression coverage.
- Added `manage_competitors` for admin, manager, operator, and product researcher. Key-competitor flags and ASIN watch levels now share this boundary, while ads operators and read-only roles retain browse-only access in both API and UI.
- Added field-level profit permissions: admin and manager retain full cost details and setting management; operator and product researcher receive safety prices, margin rates, scenarios, and risk signals with raw costs, sales, Ads spend, and absolute profit redacted; ads operator and read-only roles cannot access the module.
- Added field-level Ads permissions: admin, manager, and ads operator retain Campaign/keyword metrics plus metric entry and Ads analysis; operator receives ACOS and risk/scale signals with Campaign identity, spend, sales, conversion, budget, SKU, and evidence details redacted; product researcher and read-only roles cannot access the module.
- Closed the Agent recommendation-to-task handoff: approval-gated actions in Agent Center, Listing Health, Ads Workflow, and Review VOC can create organization-scoped `ai_run` tasks while preserving run id, evidence, reason, risk, confidence, domain task type, and related product context.
- Scoped AI run persistence, history queries, and task-source lookups to the signed-in organization; existing databases backfill historical runs to organization 1, and cross-organization AI run references are rejected.
- Added per-action thumbs-up/down feedback in Agent Center. Feedback is organization- and user-scoped, updates idempotently, and is returned only to the submitting user so operations can label useful recommendations without exposing individual preferences.
- Gated automatic view loading, date/filter watchers, and category polling on authenticated session state. A fresh login screen now performs only the required `/api/auth/me` cookie-session probe, and successful login loads each initial business feed once.
- Aligned Agent APIs with the shared capability matrix: every authenticated role can inspect organization-scoped run history, workflow managers can run general Agents and submit feedback, while competitor, Ads, and Report Writer execution requires the matching domain capability. Read-only roles can audit runs without seeing write controls.
- Added PRD B2 manual competitor intake: authorized operators can add or reactivate a validated ASIN for US, UK, DE, or JP, repeated submissions update the existing pool row, manual provenance remains filterable, and unknown snapshot metrics stay explicitly empty until collection supplies evidence.
- Extended PRD B2 intake with CSV import: operators can download a stable template, upload up to 1,000 rows, preserve quoted commas/BOM input, and receive row-level validation or duplicate errors while valid rows are written through the same transactional competitor upsert path.

## 2026-07-10

Task Execution and Review Integrity:

- Added an organization-scoped task-detail endpoint and an operational detail drawer that keeps the linked event, evidence, AI recommendation, execution metrics, review outcome, and SOP state in one read-only context.
- Removed internal event-source markers from newly converted task descriptions; source provenance is now presented as structured task detail instead of operational copy.
- Added a structured task execution submission contract for human action records plus optional before/after metric entries; `in_progress -> awaiting_review` now occurs atomically only through that record.
- Made review a guarded final step: tasks must be completed and contain an execution record before a reviewer can record a conclusion, and SOP promotion is reserved for reviewed tasks.
- Added a dedicated execution dialog and review dialog, while extracting SOP draft construction from `TasksView` so the task board stays focused on workflow orchestration.
- Scoped task and SOP list/read/write operations to the signed-in organization, validates task assignees against that organization, and requires operator/admin roles for task notes and SOP mutations.
- Added baseline access control to the Action Center event and ASIN watch-state APIs: reads require a signed-in session, while generation, review evaluation, assignment, notes, status transitions, reviews, and watch-state writes require operator/admin access.
- Added route coverage for execution evidence, lifecycle guards, and cross-organization isolation; focused route tests and web type checking pass.

Daily Report Data Gap Attribution:

- Added `GET /api/reports/daily/readiness?date=...`, which keeps daily coverage evidence separate from current operational state and maps each missing core feed to either a configured data source or the collector queue.
- Added shared readiness types for self-operated SKU metrics, keyword snapshots, category snapshots, ads metrics, and inventory plans; reports now distinguish an unconfigured source, connection/sync attention, failed same-day collection, and a ready connection without output.
- Added a compact report-workspace data-gap panel with current evidence, matching source context, and direct navigation to `数据源` or `采集中心`, so an operator can move from a partial report to a concrete corrective action.
- Added route coverage for archive-aware readiness, source attribution, collector failure attribution, and authentication; API build, web type checking, and OpenAPI JSON validation pass.

Daily Report Archive:

- Added organization-scoped `workflow_daily_reports` persistence with one archive per business date, revision increments on regeneration, coverage metadata, signal/risk/task counts, and generator audit fields.
- Added `/api/reports/daily/generate`, `/api/reports/daily/archive`, `/api/reports/daily/history`, and `/api/reports/daily.md` while preserving the live keyword/category report endpoints and Excel export.
- Built the PRD daily report structure with operating overview, Today 5, competitor changes, BSR, keyword rank, ads, inventory, open tasks, and evidence-backed AI summary; missing feeds remain explicit instead of being inferred.
- Moved report state and API calls out of the Dashboard store into a dedicated reports store, and added generation, coverage status, version history, archive selection, and Markdown export to the report workspace.
- Split the report signal sidebar and archive panel out of `ReportsView`, keeping page composition below the code-engineering size guideline.
- Verified focused archive/API-client tests, the full 585-test suite, the root monorepo build, and real desktop/mobile browser flows for generation, revision increments, cross-date history selection, responsive width, reader contrast, and zero post-login console errors.

Collector Operations Center:

- Added the PRD-aligned `/api/collectors/run`, `/api/collectors/jobs`, `/api/collectors/jobs/:id`, and `/api/collectors/logs` contract while preserving the legacy collection routes.
- Added collector freshness, queue-health, and Worker-heartbeat endpoints under the same namespace, with focused route coverage for all/targeted runs, validation, disabled targets, jobs, logs, and status reads.
- Moved collection operations out of the Dashboard store into a dedicated Pinia store and API client boundary.
- Rebuilt the former logs page as `采集中心`, prioritizing Worker health, active queue, keyword/category freshness, failed jobs, filters, sorting, refresh, and clear next-step empty/error states.
- Verified the focused collector route tests, the full 583-test suite, root builds, and real desktop/mobile browser flows including refresh, failed-only filtering, responsive navigation, and table overflow behavior.

## 2026-07-08

Rules Center foundation:

- Added shared PRD P0 alert rule definitions in `packages/shared/src/types-rules.ts`, covering competitor price, deal, new product, keyword rank, inventory, ads, rating, review, BSR, and listing-health scenarios.
- Added `alert_rule_configs` persistence so operators can override enabled state, thresholds, notification channels, owner, and notes without duplicating the static rule catalog.
- Added `/api/rules`, `/api/rules/:ruleId`, `PATCH /api/rules/:ruleId`, and `DELETE /api/rules/:ruleId/config`; updates and resets require operator/admin role.
- Added a frontend `规则中心` view for grouped rule inspection, quick enable/disable, threshold editing, notification channel selection, owner notes, and approval-gated operation copy.
- Added focused route coverage for list/filter/update/reset/auth behavior and verified shared/API/web builds.
- Split rule configuration state from runtime capability: 4 competitor/BSR rules are marked as live, while 6 owned-SKU, inventory, ads, VOC, and Listing-health rules explicitly show their missing data requirements and freshness expectations. The operations UI now presents this readiness boundary in Chinese on desktop and mobile.

InsightEvent -> Task loop hardening:

- Fixed event-task lookup to accept real string InsightEvent ids via `/api/insight-events/:id/tasks` while keeping the legacy `/api/insights/:id/tasks` route.
- Added an Action Center linked-task panel in the event drawer so operators can see which task was created from the signal.
- After converting an event to a task, the drawer refreshes the event detail, reloads linked tasks, and moves the event into the closed workflow column.
- Added route coverage proving insight-event task creation updates event status to `CONVERTED_TO_TASK` and returns linked tasks by event id.

Competitor Analyst Agent foundation:

- Added deterministic `/api/ai/analyze-competitor`, using the selected insight event plus related ASIN/brand/category signals as bounded evidence.
- Persisted Competitor Analyst output to `ai_runs` with `agentType = competitor_analyst`, model id, confidence, evidence, impact, and approval-gated actions.
- Added `RATING_DROP` and `LISTING_CHANGED` competitor events from consecutive category snapshots. Rating drops require at least `0.2`; title and main-image comparisons normalize whitespace/casing and ignore image query parameters to reduce noise.
- Event evidence now retains before/after rating, title, image URL, and changed-field metadata; Agent recommendations, task typing, and automated 3/7-day review understand both event types.
- Daily workflow reports now include `RATING_DROP` and `LISTING_CHANGED` in the competitor-change section, with before/after rating, changed Listing fields, title evidence, and approval-gated next actions; archive coverage counts these structured events as competitor changes.
- Added an Action Center drawer panel so operators can run the competitor analyst inside the event workflow before changing price, promo, ads, or listing work.
- Added route coverage for persisted competitor analysis output and shared/API/web verification.
- Closed the development-mode authentication bypass: all business `/api` routes now require a login session even when no legacy API key is configured. Only health, login, first-admin bootstrap, explicitly exposed docs, and static frontend assets remain public; test mode retains anonymous fixture compatibility.
- Added a server-level write boundary: `developer` accounts are read-only across business APIs, including side-effecting `*/open` links, while `operator` and `admin` accounts may create, update, delete, collect, generate, or send. Logout remains available to every authenticated role.
- Added a shared frontend write-access composable and read-only state across Rules, Data Sources, Collectors, Reports, and the global sidebar collection entry. Developer accounts can still inspect, filter, refresh, and download evidence, while mutation, collection, report generation, and Agent controls are disabled before submission.

Report Writer Agent foundation:

- Added deterministic `/api/ai/create-report` for daily, weekly, and monthly report writing from existing report markdown plus insight-event evidence.
- Persisted Report Writer output to `ai_runs` with `agentType = report_writer`, source event ids, confidence, evidence, impact, and approval-gated actions.
- Added a Reports workspace `Report Writer` pane and action button so operators can generate the markdown report directly from the report reader.
- Added route coverage for persisted report markdown output and verified API/web builds.

Agent Center foundation:

- Added `GET /api/ai/runs` so operators can review persisted Agent runs by Agent type, status, limit, and offset.
- Added a frontend `Agent 中心` view that surfaces run history, success/failure state, evidence, confidence, error messages, and approval-gated actions from `ai_runs`.
- Wired the view into the existing navigation, async view loader, and Pinia store pattern without changing Agent generation behavior.
- Centralized the PRD Agent safety policy: every action must require human approval, confidence stays within `0..1`, and suggestions below `0.5` confidence cannot enter P0. All six Agent services now share this gate.
- Repaired the Agent Center title encoding and verified the live run/evidence/action layout at desktop and 390px mobile widths without horizontal overflow.
- Added API route coverage for filtered/paginated run history.

Data Sources Center foundation:

- Added `data_source_configs` persistence for SP-API, Ads API, public crawler, CSV import, ERP/WMS, and manual data source registrations.
- Added `/api/data-sources` list/create and `PATCH /api/data-sources/:id` so operators can manage connection state, sync state, last success time, errors, owner, and notes.
- Added a frontend `数据源` view under system tools with filters, source metrics, selected-source detail, and create/edit dialog.
- Added route coverage for create/filter/update/auth behavior; this slice records configuration and sync status only, leaving real connector authorization and automatic sync to later phases.

## 2026-07-21

Operations UI information-flow refinement:

- Used ImageGen to establish a high-fidelity operations-console reference, saved at `docs/design-references/operations-console-imagegen.png`.
- Added a final global polish layer with a narrower light navigation rail, compact two-row command bar, restrained borders and shadows, denser panels and tables, and semantic-only status color.
- Reworked mobile overview behavior so pulse metrics and operating metrics fit their containers without internal horizontal scrolling; the nine operating metrics become a two-column scan with the final priority item spanning the row.
- Verified Overview and Data Sources in a real browser at 1440px and 390px widths with no document-level or targeted panel overflow.

Data Sources CSV execution loop:

- Added `POST /api/data-sources/:id/import/products` for PRD-priority manual CSV ingestion into owned SKU master data and daily operating metrics.
- Required identity fields are validated with row numbers; source-level marketplace can replace the CSV marketplace column. Valid rows commit in one SAVEPOINT transaction while invalid rows produce a `partial` sync result.
- Re-imports update the exact organization/marketplace/SKU and preserve metric columns omitted by incremental files; explicit empty cells still clear their corresponding values.
- Data source status now records success, partial, or failed execution with last sync, last success, and a concise failure summary. Malformed files update the failed state before returning `400`.
- Added an operations UI import panel with file selection, result counters, and row-level errors. External SP-API, Ads API, and ERP/WMS authorization remain future connector work.
- Verified focused route coverage plus shared, API, and web type checks before the full repository gates.

Data Sources Ads report execution loop:

- Added `POST /api/data-sources/:id/import/ads` for PRD-priority manual Ads report ingestion into `ad_daily_metrics`, and documented both CSV import endpoints in OpenAPI.
- Required Campaign identity and date fields receive row-level validation. Optional SKU linkage is marketplace-aware and organization-scoped; missing or cross-market products are rejected without writing ambiguous links.
- Ads report re-imports are idempotent by date, Campaign, Ad Group, Target, and Search Term. Omitted metric columns preserve prior values, explicit empty cells clear them, and percentage fields such as ACOS and CTR accept report-native `%` values.
- The data-source detail now presents separate Product operations and Ads performance import actions with one compact result stream for created, updated, failed, and row-level error counts.
- Verified the focused 8-test data-source route suite, API and web builds, and a real browser flow from partial Ads CSV import into the Ads Workflow. Mobile width remained 390px with no horizontal overflow.
- External SP-API and Ads API authorization, token storage, scheduled synchronization, and ERP/WMS connectors remain future data-source work.

Data Sources sync audit trail:

- Added `data_source_sync_runs` so every Product CSV and Ads CSV attempt keeps its operation, status, row counts, created/updated impact, error summary, operator, and timestamps instead of being overwritten by the next run.
- Added organization-scoped `GET /api/data-sources/:id/runs` with status filtering and bounded pagination, plus route coverage for newest-first history, partial outcomes, malformed-file failures, and Ads re-imports.
- Added a compact Sync history panel to the selected data-source detail. Imports refresh it immediately; failed and partial runs retain their reason and point operators to the matching retry action.
- External SP-API and Ads API authorization, token storage, scheduled synchronization, and ERP/WMS connectors remain future data-source work.

Data Sources Excel ingestion:

- Extended Product operations and Ads performance imports to accept `.xlsx` workbooks alongside CSV while retaining the legacy `{ csv }` API request for existing scripts.
- Added one shared tabular parser that reads the first worksheet, preserves worksheet row numbers, validates required and duplicate headers, ignores blank rows, and caps imports at 1,000 rows and 5 MB.
- Added format-specific Product Excel and Ads Excel sync operations so audit history does not mislabel workbook runs as CSV.
- Updated the operations UI file picker, local size feedback, history labels, shared contracts, and OpenAPI request schemas.
- Verified Product partial-row and Ads success flows through the real API using generated workbooks; external credentials and ERP/WMS integration remain separate connector work.

Data Sources cost-table ingestion:

- Added `POST /api/data-sources/:id/import/costs` for the PRD manual cost-table path, accepting CSV/XLSX through the shared file parser.
- Cost rows resolve an organization-scoped owned SKU by marketplace, accept amount and percentage fields, preserve omitted settings on incremental imports, and write valid rows in one transaction.
- Added Cost CSV/Excel audit operations, created/updated/failed counts, row-level errors, and a third Cost assumptions action in the Data Sources operations panel.
- Covered partial Excel imports, percentage normalization, missing-SKU errors, incremental CSV updates, and malformed cost headers in API tests.

Inventory and purchasing ingestion:

- Added `POST /api/data-sources/:id/import/inventory` for CSV/XLSX procurement and inventory assumptions, including production/inbound lead time, in-transit and local stock, expected arrival, MOQ, pack size, supplier, and stock thresholds.
- Replenishment recommendations now subtract the full supply position (`FBA + in transit + local warehouse`) while preserving the legacy lead-time field for existing integrations.
- Inventory planning exposes PRD-required 7-day and 30-day sales velocity alongside FBA stock, supply position, expected arrival, stockout timing, and recommended quantity.
- Added format-specific audit history, row-level validation, partial-import handling, incremental updates, and a legacy SQLite migration regression.

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
