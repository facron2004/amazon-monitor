# Workflow Agent 开发进度

## 2026-07-29

Agent V1.0 productization:

- Added the incremental Agent persistence boundary: sessions, complete SDK session items, runs, steps, tool calls, resumable events, proposals, approvals, and executions. All reads remain organization-scoped, list operations are bounded, and proposal/execution writes use optimistic versions and idempotency keys.
- Added a feature-flagged OpenAI Agents SDK workspace with 15 strict Zod read-only tools, mandatory freshness checks, evidence and snapshot references, bounded turns, streaming events, cancellation, primary/fallback models, and stale-data confidence/action guards. Raw model reasoning is not persisted or streamed.
- Added the approval/execution loop for recollection, ASIN monitoring, task creation, Feishu reports, and report export. L2 actions execute after approval, L3 actions require a second confirmation, modified proposals expire the previous version, and uncertain Feishu timeouts are never automatically resent.
- Server-owned action policy now fixes single recollection, ASIN monitoring, and task creation at L2, and Feishu/report export at L3; model output cannot lower these levels. Approval decisions and proposal state changes share one SQLite transaction, while execution intent remains idempotently persisted before domain or external work. Agent-created tasks use the independent `agent_run` source.
- Added deterministic task classification and a readable three-step plan before the mandatory freshness gate. Planning, freshness, model analysis, every tool attempt, retry result, and terminal state are persisted as local steps/tool calls/events without storing private reasoning.
- Query/tool transient failures retry once, model execution retries the primary model once before the fallback, and an approved recollection creates exactly one linked `recovery` run. The desktop Crawler signals collection completion to the API, which resumes that linked run without replaying completed writes.
- Action execution now uses explicit transaction boundaries for both start (`approved` proposal plus idempotent execution intent) and finish (execution result plus proposal terminal state). Regression coverage proves a version conflict rolls back both sides instead of leaving a half-written state.
- Successful and failed runs persist terminal SSE events so the workspace cannot remain stuck on a pre-terminal model status. The run ledger can export one organization-scoped audit JSON containing steps, tool calls, evidence events, proposals, approvals, and executions.
- Extended Agent Center into a three-column workspace with sessions and quick tasks, evidence-first conversation, run trace, freshness, confidence, and approval cards while retaining the deterministic Agent history tab.
- Added Electron 43.2.0 with independently supervised API, Agent, and Crawler utility processes, bounded restart and crash logs, sandboxed Renderer preferences, an allowlisted preload bridge, async OS-backed safeStorage, userData paths, verified legacy database migration, electron-builder NSIS configuration, and bundled Playwright 1.60 Chromium. The Agent utility process owns the API key and Agents SDK; API owns SQLite and restricted business tools; Crawler owns the queue Worker and packaged Chromium.
- Removed the retired Tauri shell in a separate post-acceptance change after Electron data migration, authenticated business routes, NSIS packaging, upgrade/uninstall persistence, and packaged Renderer smoke tests had all passed. Root Tauri scripts/CLI, Rust sources, lockfile, generated-artifact ignores, and Tauri-only CORS origins were removed without changing historical audit or changelog records.
- Fixed the packaged Electron cold-start blank screen: failed main-frame navigations now use the existing same-origin security check instead of an exact URL comparison, so a trailing slash cannot suppress retries while the API utility process is starting. A deterministic smoke test held port 43210 during launch, then confirmed the packaged Renderer recovered in about 3.2 seconds and displayed the login screen.
- Fixed the packaged Agent Center blank body by removing eager background loading of every feature chunk and giving every async view a bounded, visible reload state. A packaged Electron pass against the restored production database rendered the Agent tabs, safeStorage settings, three-column cockpit, and running API/Agent/Crawler badges with no page errors.
- Replaced main-file-only legacy database copying with SQLite online backup. Desktop startup now discovers the non-empty repository database across packaged and development launch locations, snapshots committed WAL data, verifies integrity, retains a complete `.legacy-backup`, and leaves the source untouched. The source, formal userData target, and backup each reported 68 tables, 4 users, 4 organizations, 4,446 insight events, and 2 tasks.
- Added OpenAPI coverage, organization-scoped Agent audit export, a 30-task Chinese gold set, and a sequential evaluation runner for the five PRD acceptance metrics. The runner checks required tool coverage, evidence/snapshot citations, stale-data deterministic claims, tool success, alert validity, and recovery outcomes.
- Connected the gold set to a runnable `npm run agent:eval` CLI that authenticates against the packaged application, discovers a concrete organization-scoped category/keyword/ASIN/brand evaluation scope, executes all 30 real Agent runs sequentially, persists every run audit, continues across failed runs, and exits nonzero for missing human annotations or missed PRD targets. Credentials remain outside command-line arguments and the CLI never reads or receives the OpenAI API Key.
- Focused verification passed for shared/API/Web/Agent/Desktop contracts, Agent route and Store behavior, OpenAPI synchronization, desktop security/data migration, and the setup-store session reset regression. The installed Electron app launched the authenticated API and Agent business routes with three Node utility processes; a no-key Agent run crossed the process boundary and persisted the expected safeStorage failure instead of executing in API.
- Forced termination of the installed API utility process left Renderer alive and produced a healthy replacement API process with a new PID. Silent install, same-directory reinstall, and uninstall all exited successfully; the previously persisted Agent session survived reinstall and the userData SQLite database remained after uninstall.
- Final repository gates passed with 897 tests (`59` shared, `14` Agent, `598` API, `219` Web, `7` Desktop), the root production build, and 9 real-browser tests. The root test command now includes the Desktop workspace. The current unsigned NSIS installer is 331,306,002 bytes with SHA-256 `0798636ACC9E7B11992B5CEC0B8DFE0C9EB46589B9D2F6F38482FA64E7262796`.
- Committed the verified real-data and Agent/Desktop source as `37ba0ce`, with acceptance and product documentation kept in a separate documentation commit. Local SQLite, review staging, archives, `tmp/`, and diagnostic text files remain untracked and excluded.
- Real-browser verification passed at 1440px and 390px for Agent Center, session creation, quick-task population, the disabled runtime boundary, and responsive layout. The mobile body and document widths both remained exactly 390px. The temporary browser-smoke Agent session was removed after validation.
- Added an Electron-only Agent security panel for safeStorage key set/replace/clear and API/Agent/Crawler process status. A packaged preload test confirmed all three processes reported running, a one-time test key became configured without appearing in rendered text, and clearing it removed the encrypted secret file.
- Rechecked the expanded Agent workspace at 1440px and 390px with the desktop bridge enabled: document and body widths matched the viewport, process badges remained visible, audit export stayed reachable, and typed key material never appeared in rendered page text.
- Live model quality scoring remains environment-gated because no `OPENAI_API_KEY` is present. The runtime stays disabled by default through `AGENT_SDK_ENABLED=false`; the gold evaluation harness is ready for credentialed internal evaluation.

## 2026-07-28

MVP / V1 completion audit:

- Rechecked the current implementation against all 14 MVP acceptance criteria and the PRD P0/P1 boundary. The live workspace covers master-data entry, real or simulated snapshots, 10 operational rule types, Today 5, event-to-task handoff, task completion/review, competitor trends, BSR Top100 and brand matrix, keyword rank matrix, evidence-backed Agents, Markdown reports, collector failure evidence, page states, and approval-gated high-risk actions.
- Confirmed the P1 workflows remain present end to end: Ads recommendations, replenishment, profit guardrails, Review VOC, Listing rewrite drafts, promotion scheduling, weekly/monthly archives, multi-store/marketplace scope, visual rule configuration, and SOP reuse.
- Updated the daily-report readiness regression fixture to follow the real queue state machine (`pending -> processing -> failed`), preserving the production guard that rejects invalid direct failures while proving failed collections route operators to the correct recovery action.
- Replaced the collector pagination component's deprecated `small` prop with `size="small"` after a real browser pass surfaced the Element Plus warning.
- Verified all 792 repository tests (`59` shared, `520` API, `213` Web), the full shared/API/Web production build, and the focused Web test/build after the UI cleanup.
- Verified authenticated desktop and 390px mobile flows for Today 5, BSR Top100/brand evidence, keyword rank matrix, reviewed tasks, report archives/data gaps, and collector failures. A fresh browser tab reported zero application errors or warnings; document width matched the viewport at 1440px and 390px.
- PRD P2 items remain intentionally outside this completion boundary: additional commerce platforms, direct ERP/finance/WMS connectors, semi-automatic repricing, Ads API execution, autonomous approval flows, native mobile apps, and SaaS commercialization.

## 2026-07-26

Owned SKU 360 operations detail:

- Extended the existing Owned SKU center into the PRD E3 operations workspace without duplicating domain data. One organization-scoped detail response now aligns sales, profit, Ads, inventory, keyword rank, BSR, Review VOC, Listing health, competitor evidence, Agent suggestions, tasks, and operation events to one business date.
- Added `GET /api/products/:id/operations` with shared contracts and OpenAPI coverage. The aggregate reuses the existing Ads and profit redaction policies, so operators receive summary fields, viewers receive denied fields, and managers/admins retain full evidence.
- Replaced the narrow score panel with three scan-first workspaces: commercial trends, health and competitor diagnosis, and the Agent/task/review loop. Empty competitor or event evidence remains an explicit data gap.
- Added organization-isolation and role-redaction route tests plus chart-option coverage for chronological, null-safe evidence.
- Verified the authenticated desktop and 390px mobile flows in a real browser, including task-center navigation, no horizontal overflow, image-failure fallback, and a fresh-tab console with zero errors or warnings.

Cross-Agent data-freshness safety:

- Extended the PRD M4 freshness contract from Product Research to Daily Operator, Competitor Analyst, Listing Optimizer, Ads Analyst, Review VOC, and Report Writer.
- Added one deterministic assessor for evidence date, source, latest sync, collection status, failure reason, and domain threshold. Competitor price/promo evidence uses a 3-hour threshold, rank evidence uses 6 hours, and daily operational datasets use 24 hours.
- Unsafe evidence now caps confidence at `0.49`, replaces execution recommendations with one P2 refresh action, and remains visible in persisted Agent history. Listing, Ads, and Review execution artifacts are hidden until evidence is fresh and complete.
- Fixed date-state leakage in the Listing, Ads, and Review Pinia stores: changing the business date or modifying source evidence clears the previous Agent result before the next run.
- Added the reusable freshness panel to all immediate Agent result surfaces and Report Writer output. Report Markdown now carries the same date/source/update/status/failure boundary.
- Verified an isolated Ads cohort with current and historical evidence. The fresh run retained its P0 diagnosis; the stale run showed the warning, 49% confidence, one P2 refresh action, and no copyable optimization artifact. Agent history preserved the same boundary.
- Verified desktop and 390px mobile layouts with no horizontal overflow and zero browser console errors or warnings.
- Split the former 490-line mixed Daily/Listing Agent service into a 228-line Daily Operator service and a 274-line Listing Optimizer service without changing route contracts.
- Verified 787 monorepo tests (`59` shared, `517` API, `211` Web), the full shared/API/Web production build, API/Web type checks, OpenAPI JSON parsing, focused freshness/route coverage, and `git diff --check`.

Product Research data-freshness safety:

- Closed PRD M4's stale-data warning gap for Product Research. Every run now persists the BSR evidence date, evaluation time, source, latest sync time, collection status, 24-hour requirement, failure reason, and explicit warning.
- Added a reusable `AiDataFreshness` contract and deterministic BSR assessor. Current/previous-day evidence remains usable; evidence older than 24 hours or with failed/partial collection is treated as unsafe.
- Advanced the model to `deterministic-product-research-v3`. Unsafe evidence caps confidence at `0.49`, emits only a P2 recollection action, changes the launch brief to `hold`, and blocks launch-validation task creation.
- Split Product Research output policy from data loading/context assembly. The main service is now 223 lines, while freshness assessment and output decisions remain isolated, testable modules under 140 lines.
- Added a reusable Agent freshness status panel to both category results and persisted Agent history. The UI exposes evidence date, update time, source, collection status, warning, and failure reason; Markdown exports preserve the same evidence boundary.
- Verified an isolated live cohort with one current and one 2026-01-01 category. The fresh run showed `validate` and the four-task command; the stale run showed `hold`, 49% confidence, a P2 recollection action, and no launch-task command. Persisted history retained the same warning.
- Verified 1440px and 390px layouts. At 390px, document and body widths stayed exactly 390px and the 337px warning region remained contained; a fresh authenticated tab had zero console errors or warnings.
- Verified 785 monorepo tests (`59` shared, `517` API, `209` Web), the full shared/API/Web production build, API/Web type checks, OpenAPI JSON parsing, focused policy/route/formatter coverage, and `git diff --check`.

## 2026-07-25

Product launch validation task handoff:

- Closed the workflow gap after the Product Research launch brief: an authorized operator can now turn its four required validation gates into Review VOC, profit, compliance, and supplier tasks after an explicit confirmation.
- Added `POST /api/ai/runs/:id/product-launch-brief/tasks`, shared response contracts, and OpenAPI coverage. The endpoint accepts only a successful, organization-scoped Product Research run with a validation-ready persisted artifact.
- Kept the approval boundary visible in both UI and task evidence. The confirmation states that task creation does not approve the launch, and every task requires human execution and review before the gate can pass.
- Preserved traceability through `sourceType=ai_run`, the original run id, category id, evidence date, gate requirement, and Agent recommendation. Task detail resolves the source artifact back to the Product Research model and run.
- Made the handoff idempotent: the first browser request returned `201` with four tasks, while the repeated confirmation returned `200` with the same task ids and no duplicate rows.
- Moved confirmation, API, and task-state synchronization out of the visual component into `useProductLaunchValidationTasks`; `ProductLaunchBriefPanel.vue` remains 222 lines and focused on rendering.
- Verified the real Task Center showed exactly four distinct P1 tasks with `review`, `price`, `other`, and `supplier` task types. The mobile task drawer was exactly 390px wide, with no page-level horizontal overflow; a fresh authenticated tab had zero console errors or warnings.
- Removed the isolated SQLite database and restored the default development services unchanged (2 tasks, 0 SOPs, API and Web reachable).
- Verified 780 monorepo tests (`59` shared, `512` API, `209` Web), the full shared/API/Web production build, API/Web type checks, OpenAPI JSON parsing, focused route/Store coverage, and `git diff --check`.

Product Research launch-brief artifact:

- Extended the deterministic Product Research run with an optional, persisted `productLaunchBrief` artifact built only from the selected category's dated snapshots and signals.
- Added an approval-gated launch decision, evidence-backed target price band, five-row competitor matrix, differentiation hypotheses, launch validation checklist, and explicit risk boundaries. Missing Review VOC remains a visible `data_gap` instead of being inferred from BSR, price, brand, or review-count evidence.
- Added shared contracts, policy validation, OpenAPI response schemas, persisted-run coverage, and a focused Markdown formatter test. Runs without category snapshots preserve the existing response and do not fabricate a launch brief.
- Added a compact launch-brief workspace to both category intelligence and Agent Center history, with copy and Markdown download commands, local table scrolling, and reusable rendering for the persisted artifact.
- Verified the isolated live response with five ranked products: the target price was the observed `USD 129.99` median, the artifact contained five competitors and four required human gates, and the model id advanced to `deterministic-product-research-v2`.
- Verified the authenticated category-generation and Agent-history flows in a real browser. Markdown downloaded as `product-launch-brief-2026-07-25.md`; a fresh authenticated tab had zero console errors or warnings.
- Verified 1440px and 390px layouts. At 390px, both document widths remained exactly 390px and the competitor matrix stayed inside its local scroll region.
- Removed the isolated SQLite database and restored the default development services unchanged (2 tasks, 0 SOPs, API and Web reachable).
- Verified 777 monorepo tests (`59` shared, `510` API, `208` Web), the full shared/API/Web production build, API/Web type checks, OpenAPI JSON parsing, and `git diff --check`.

SOP knowledge-library operations:

- Preserved the legacy `GET /api/sops` array response while adding organization-scoped `GET /api/sops/page` with `total`, bounded `limit / offset`, and status counts for the active category and search scope.
- Reused one parameterized Store filter for list and count queries. Server-side search now covers title, Markdown body, and structured tags, so ASIN and workflow labels remain discoverable beyond the first 200 records.
- Replaced the card wall with a compact master-detail workspace: segmented status counts, category and debounced search filters, a dense evidence list, stable pagination, and a selected SOP reader.
- Added draft editing in the Web workflow and retained approval-aware publish/archive actions. Icon and command buttons expose explicit accessible names without changing the visual treatment.
- Added shared contracts, Store and route coverage for pagination/search/organization isolation, Web store coverage for page clamping and edit refresh, and OpenAPI schemas for the paged response.
- Verified an isolated 27-record browser cohort: 25/2 pagination, tag search, draft editing, publish confirmation, and live status-count refresh all succeeded. The fresh post-login pass had zero console errors or warnings.
- Verified 1440px and 390px layouts. The mobile document and root widths remained exactly 390px; only the intentionally hidden navigation rail sat outside the viewport.
- Removed the isolated SQLite database and restored the default development services unchanged (2 tasks, 0 SOPs, API and Web reachable).
- Verified 775 monorepo tests (`59` shared, `509` API, `207` Web), the full shared/API/Web production build, OpenAPI JSON parsing, and focused SOP Store/route/Web coverage.

ImageGen-guided operations UI refinement:

- Generated a high-fidelity Apple-inspired operations-console reference and saved it at `docs/design/operations-workspace-imagegen-reference.png`; the bitmap is a design baseline, not a static UI replacement.
- Reworked the global shell into a compact 232px light navigation rail, restrained white command surface, semantic status colors, low-shadow panels, and denser table treatment without changing any business route or write permission.
- Added a functional global page search with `Ctrl/Cmd + K`, typed navigation events, filtered results, and direct transitions into existing views. A real browser search for `采集` returned only `采集中心` and navigated to the live collection workspace.
- Split the nine operating metrics into four primary business indicators and a five-item secondary risk/status band. This removed the previous horizontal evidence strip and keeps priority signals visible without making every datum a separate floating card.
- Verified the authenticated overview at 1440px and 390px. Desktop and mobile document widths exactly matched their viewports; mobile retained a two-column operating-metric scan with no text overlap or horizontal overflow.
- Verified 764 monorepo tests (`59` shared, `502` API, `203` Web), the full shared/API/Web production build, and `git diff --check`.

Agent recommendation quality diagnostics:

- Added manager/admin-only `GET /api/ai/quality?days=7|30|90`, backed by organization-scoped Agent runs, all team feedback for the cohort, and reviewed tasks whose source is `ai_run`.
- Added shared response contracts and a pure aggregation service for run success, actionable runs, action volume, positive/negative votes, unique run-to-task conversion, and confirmed reviewed-task outcomes.
- Kept the evidence semantics explicit: feedback rates are team votes, conversion is deduplicated by run because tasks do not persist an action index, and rates without a denominator remain unavailable instead of becoming zero.
- Added an Agent Center quality band with 7/30/90-day controls, four scan-first metrics, and a per-Agent comparison table. The aggregate refreshes after new feedback without coupling its time window to run-history pagination.
- Added route coverage for organization isolation, capability enforcement, invalid windows, mixed team feedback, and reviewed task outcomes, plus Web store coverage for independent quality-window loading.
- Verified the live 30-day cohort (10 runs, 42 actions, one positive vote), switched to a one-run 7-day cohort, and checked 1440px and 390px layouts in an authenticated browser. The mobile document remained exactly 390px wide while the 760px evidence table stayed inside its own 326px scroll region.
- Replaced the Agent pagination component's deprecated `small` prop with `size="small"` after the browser check surfaced the Element Plus warning.
- Verified 767 monorepo tests (`59` shared, `504` API, `204` Web), the full shared/API/Web production build, OpenAPI JSON parsing, and `git diff --check`.

Task-to-SOP knowledge reuse:

- Closed the gap between SOP storage and operational reuse: `GET /api/tasks/:id/detail` now returns up to three organization-scoped, published SOP recommendations alongside source-event and Agent evidence.
- Added one shared task-type-to-SOP-category map and reused it when creating SOP drafts and ranking recommendations, removing the duplicate frontend mapping.
- Kept matching deterministic and explainable. Scores use the task type plus exact structured ASIN, brand, keyword, and task-type tag matches, with a lower-weight content fallback for older SOPs without tags; every result returns its visible match reasons.
- Excluded drafts, archived SOPs, SOPs from other organizations, and the SOP created from the current task. A sourced SOP now requires a reviewed task, while standalone manually curated SOPs remain supported.
- Added an unframed task-detail evidence section with category, match reasons, three-line preview, expand/collapse, copy feedback, loading, and truthful no-match state.
- Added service and route regression coverage for ranking, legacy content fallback, source-task review enforcement, current-task exclusion, publication state, and organization isolation. OpenAPI now describes the recommendation contract.
- Verified the recommendation path against an isolated browser database: a Coupon task matched one published SOP at score 100 with five visible reasons; expand and clipboard actions succeeded, and an unrelated task displayed the expected empty state.
- Verified 1440px and 390px layouts. The mobile document remained 390px wide, the drawer measured 390px, and its 334px SOP panel stayed contained without page-level horizontal overflow; the post-login interaction pass had zero console errors or warnings.
- Removed the isolated SQLite database after verification and restored the original development API unchanged (2 tasks, 0 published SOPs, health 200).
- Verified 770 monorepo tests (`59` shared, `507` API, `204` Web), the full shared/API/Web production build, API/Web type checks, OpenAPI JSON parsing, and focused 16-test recommendation/task coverage.

Collector execution-log pagination:

- Audited live operational volumes before changing the UI: the organization had 2 workflow tasks, 137 queue jobs, and 293 collector execution logs. Only the log history exceeded its existing 100-row Web window, so the change stayed scoped to the proven gap.
- Added a shared `CollectTaskLogListResponse` contract and organization-scoped `countTaskLogs` Store method, preserving the legacy array endpoint while adding `GET /api/collectors/logs/page`.
- Extended OpenAPI and the Web collection service with `{ logs, total, limit, offset }` metadata. The collection center initially loads 50 rows and reports the complete history instead of loading all evidence into the first screen.
- Added Pinia-owned log pagination with a dedicated loading state. Changing pages refreshes only the execution-log region and does not refetch jobs, freshness, queue health, or Worker status.
- Added a compact responsive pagination footer and truthful page summary. Empty/loading behavior and the horizontally scrollable evidence table remain unchanged.
- Added API coverage for pagination metadata and cross-organization totals, plus Web store coverage for six-page calculation, clamped offsets, and log-only refresh behavior.
- Verified the live API returned `total=293`, `offset=250`, and 43 rows on the final page, covering historical log IDs 43 through 1.
- Verified an authenticated collection-center browser flow from page 1 to page 6. The UI displayed all six pages, rendered 43 final-page rows, surfaced historical failure evidence, and retained zero horizontal overflow at 1440px and 390px.
- Verified 764 monorepo tests (`59` shared, `502` API, `203` Web) and the full shared/API/Web production build.

Action Center complete daily event loading:

- Removed the Web store's fixed `limit: 100`, which silently excluded later daily events from queues, ASIN cases, KPI cards, and chart inputs.
- Added a focused API pagination helper that loads 250 events per request, preserves all active filters and sort order, deduplicates by event id, and stops safely when a repeated page makes no progress.
- Applied complete loading to both the main Action Center feed and review-due queues while preserving the existing array API contract and AbortSignal cancellation path.
- Removed the API route's internal 1000-event cap for derived evidence/action/review filters and trend aggregation; these paths now apply filters to the complete organization-scoped result before pagination or summarization.
- Added regression coverage proving a 1005-event derived query can return rows after offset 1000, the one-day trend reports all 1005 events, a 501-event Web result merges across three pages, and repeated pages cannot loop forever.
- Verified the live database contained 141 events on July 8, 144 on July 11, and 157 on July 25, all above the old 100-event ceiling.
- Verified an authenticated Action Center request for July 25 used `limit=250&offset=0`, rendered all 157 events in its operational metrics, and retained zero horizontal overflow at 1440px and 390px.
- Verified 762 monorepo tests (`59` shared, `502` API, `201` Web) and the full shared/API/Web production build.

Agent run audit pagination:

- Extended the shared `AiRunListResponse` contract and organization-scoped AI run Store with `total`, while preserving parameterized filters, clamped `limit`/`offset`, and existing role boundaries.
- Updated `GET /api/ai/runs` and its OpenAPI description to return `{ runs, total, limit, offset }`, so the Web no longer mistakes the first page for the complete persisted `ai_runs` history.
- Added Pinia-owned pagination state and page transitions. Refresh preserves the current page, while Agent/status/page-size changes reset to page 1 and keep the selected detail aligned with the visible page.
- Added a compact responsive pagination footer and corrected KPI semantics: matching runs is the filtered total, while success, failure, and approval counts are explicitly page-scoped.
- Removed the Agent view's duplicate mount fetch because the application view loader already owns initial loading and its 30-second cache behavior.
- Added API organization/filter total assertions and focused Web store regression coverage for metadata, offsets, reset behavior, and page clamping.
- Verified an authenticated browser with a deterministic 26-run response: page 1 rendered 25 runs, page 2 requested `offset=25` and rendered one failed run, and changing the Agent filter returned to page 1.
- Verified 1440px and 390px layouts with zero horizontal overflow; the mobile pagination footer and run detail remained readable without overlap.
- Verified 759 monorepo tests (`59` shared, `501` API, `199` Web) and the full shared/API/Web production build.

Competitor insight-to-action navigation:

- Replaced the competitor insight sidebar's dead detail button with an operational path into Action Center, preserving the generated Apple-style enterprise direction while improving the actual information flow.
- Split each highlighted ASIN row into a primary evidence action and a compact Amazon external-link action, so operators no longer leave the workspace when they intended to inspect internal evidence.
- Added a Pinia-owned competitor focus transition that clears stale Action Center filters, closes old detail state, selects the ASIN case workspace, and scopes either one ASIN or all core competitors.
- Kept empty evidence truthful: a highlighted ASIN with no event for the selected date opens the filtered case workspace and explains how to clear the filter or generate insights instead of fabricating analysis.
- Verified both navigation paths in an authenticated browser. The selected-ASIN path displayed the exact ASIN filter and case view; the generic path displayed an empty ASIN, checked the core-competitor filter, and retained the case view.
- Verified 1440px and 390px layouts with zero horizontal overflow. The mobile insight panel measured 362px inside a 390px viewport, and the dedicated Amazon icon remained a visible 13px square after the final visual correction.
- Verified 755 monorepo tests (`59` shared, `501` API, `195` Web) and the full shared/API/Web production build.

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

Team workflow performance:

- Added manager/admin-only `GET /api/tasks/team-performance?days=7|30|90`, with organization-scoped pagination across the complete task history.
- Added explicit workload, overdue, completion, cycle-time, due-date sample, on-time, review, and confirmed-result metrics. Rate fields remain `null` when no qualifying sample exists.
- Defined the reporting cohort as non-cancelled tasks created inside the selected window; current open and overdue counts intentionally include older unclosed work so historical backlog remains visible.
- Added a compact Team Operations section to the task workspace with 7/30/90-day segmented controls, team totals, assignee rows, an explicit unassigned bucket, and contained mobile table scrolling.
- Verified organization isolation, rate calculations, invalid reporting windows, OpenAPI JSON, all 765 repository tests, the production build, and real desktop/mobile browser flows. The mobile document width remained 390px and period switching refreshed the metric cohort without console errors.

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
