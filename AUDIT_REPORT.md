## Amazon 关键词竞品监控系统 -- 全面审查报告

**审查日期**: 2026-06-14
**审查范围**: 后端、前端、爬虫、共享包/测试、安全/配置 共五个维度

---

### 总体评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 后端代码 | 7/10 | 模块化已有基础，但 store 层重复代码和 God Interface 问题突出 |
| 前端代码 | 7.5/10 | 组件拆分做得好，TypeScript 零 any，但状态管理和请求管理不一致 |
| 爬虫模块 | 6.5/10 | 采集流程完整，但反爬对抗薄弱、解析器代码大量重复 |
| 共享包与测试 | 8.5/10 | 依赖方向正确，测试质量高，有少量工具函数重复 |
| 安全与配置 | 5/10 | 认证可选、CORS 全开、无安全头，存在多个高危风险 |

---

### 关键发现汇总

共发现 **6 个严重问题、14 个高危问题、30+ 个中等问题**。以下按优先级排列。

---

### P0 -- 必须立即修复（安全与数据风险）

**1. API 认证为可选配置，默认完全开放**
文件: `apps/api/src/server.ts` 第 76-97 行

当 `AMAZON_MONITOR_API_KEY` 未设置时，所有 API 端点（包括写入、删除、触发采集、发送通知）完全无需认证。当前部署环境未设置此变量。

修复: 改为强制认证，启动时未配置 API Key 应拒绝启动或打印严重警告。

**2. 飞书 Webhook 可被用于 SSRF 攻击**
文件: `apps/api/src/notifications/senders.ts` 第 221-253 行

飞书通知的 target URL 仅验证以 `https://` 开头，无域名白名单。攻击者可设置 target 为任意服务器，系统将把包含竞品数据的报告发送过去；也可指向内网地址构成 SSRF。

修复: 添加域名白名单 (`open.feishu.cn`, `open.larksuite.com`)。

**3. CORS 完全开放 + 无安全头**
文件: `apps/api/src/server.ts` 第 28 行

`cors()` 无参数调用，允许所有来源访问 API。同时缺少 Helmet 安全头中间件（无 CSP、X-Frame-Options、HSTS 等）。任何第三方网站都可通过 JS 直接调用 API。

修复: 限制 CORS 允许的域名；添加 `helmet` 中间件。

**4. 时区与 User-Agent 硬编码暴露爬虫身份**
文件: `apps/api/src/amazon/context.ts` 第 4-5 行

时区硬编码为 `Asia/Shanghai`，UA 固定为 Chrome 133。对美国站采集来说，上海时区 + 过时 UA 是极其明显的爬虫信号。所有并发请求使用完全相同的指纹。

修复: 根据 marketplace 动态设置时区（US -> `America/New_York`, DE -> `Europe/Berlin`, JP -> `Asia/Tokyo`）；引入 UA 版本随机化。

**5. SMTP 凭据明文存储在 .env**
文件: `.env` 第 1-6 行

真实 Gmail 地址和应用专用密码以明文存储，且在磁盘上无权限限制。

修复: 使用 secrets manager 管理凭据；至少确保 `.env` 文件权限为 600。

**6. 前端无请求取消机制 -- 快速操作导致竞态条件**
文件: `apps/web/src/api-base.ts`

`request` 函数无 `AbortController` 支持。用户快速切换 Tab、日期或类目时，多个请求并发飞行，响应乱序到达会导致界面显示过期数据。

修复: 在 `request` 中支持 `AbortSignal`，每次新加载取消上一次请求。

---

### P1 -- 本周内修复（高影响）

**7. store.ts 与 store/db.ts 代码重复且不一致**
`store.ts` 中的 `configureDatabase()`、`initSchema()` 与 `store/db.ts` 中的同名函数几乎完全一致，但 `db.ts` 多了一条迁移 `backfillProductPriceHistoryPromos`，两套初始化逻辑已经不同步。

修复: 删除 `store.ts` 中的重复代码，统一从 `store/db.ts` 导入。

**8. Store 接口包含约 70 个方法（God Interface）**
文件: `apps/api/src/store/types.ts` 第 36-179 行

从关键词 CRUD 到通知调度、从 BSR 历史到队列管理全部塞在一个接口里，严重违反接口隔离原则。

修复: 拆分为 `KeywordStore`、`CategoryStore`、`CompetitorStore`、`BsrStore`、`NotificationStore`、`QueueStore` 等子接口。

**9. listBsrRankChanges 存在 N+1 查询**
文件: `apps/api/src/store/bsr-store.ts` 第 95-131 行

先查今天的全部 BSR 历史，然后对每个 scope 分别执行 3 次查询获取前一天数据。N 个 scope 产生 3N+1 次查询，数据增长后可达数百次。

修复: 使用 GROUP BY + window function 批量获取所有 scope 的 previous date。

**10. 三个解析器之间大量代码重复**
`search-card-parser.ts`、`bestseller-card-parser.ts`、`product-detail-parser.ts` 各自定义了完全相同的 `couponPatterns()`、`dealPatterns()`、`parsePrice`、`inferCurrency`、`findPromoText` 等函数。Amazon 修改 coupon 格式时需要在三个文件中同步修改。

修复: 提取共享的解析工具函数到 `parsers/parser-utils.ts`。

**11. 缺乏浏览器指纹对抗**
没有 Canvas/WebGL 指纹随机化，没有 `navigator.plugins` 模拟，搜索页没有设置 viewport，没有使用 `playwright-extra` + `stealth` 插件。

修复: 引入 stealth 插件，添加 viewport 和指纹随机化。

**12. API 端点缺少请求参数验证**
所有 POST/PATCH 路由缺少系统性输入验证。`keyword` 无长度限制，`marketplace` 无白名单，`crawlPages` 无上下界，`:id` 参数不验证是否为有效数字。

修复: 引入 zod 定义请求 schema，在路由层统一验证。

**13. CategoriesView 接收 28 个 props（Props Drilling）**
文件: `apps/web/src/components/CategoriesView.vue` 第 29-71 行

大量 props 只是从 composable 透传到子面板，典型的 props drilling 反模式。

修复: 让子面板直接通过 `useCategoryStore()` 获取数据。

**14. Pinia 与 Composable Refs 混用，状态管理不一致**
Dashboard/Alerts/Categories/Keywords 使用 Pinia store，而 Competitors 和 Notifications 使用 composable refs，无 devtools 支持，跨组件共享方式不统一。

修复: 将 Competitors 和 Notifications 也迁移到 Pinia store。

**15. 无速率限制**
整个 API 无速率限制。攻击者可无限触发采集消耗资源，或大量发送通知导致 SMTP 被封。

修复: 添加 `express-rate-limit`，对敏感端点设置更严格的限制。

**16. 开放重定向漏洞**
文件: `apps/api/src/routes/competitors.ts` 第 30-36 行

`response.redirect(result.url)` 直接使用数据库中的 URL，无域名白名单验证。如数据库被污染，可被利用构造钓鱼链接。

修复: 重定向前验证 URL 域名是否属于 Amazon 域名白名单。

**17. 畅销榜页面间延迟被硬编码截断为 1.5 秒**
文件: `apps/api/src/amazon/bestseller-collector.ts` 第 96 行

`Math.min(pageDelayMs(), 1500)` 将可配置的页面延迟（默认 5000ms）截断为 1500ms。即使运维人员配置更长延迟来规避反爬，实际只等 1.5 秒。

修复: 移除硬编码上限，尊重配置值。

**18. Worker 轮询循环未处理 graceful shutdown**
文件: `apps/api/src/worker.ts` 第 29-66 行

`stopWorker()` 只设 `running = false`，不等待当前 job 完成。进程收到 SIGTERM 时正在处理的 job 可能被中断，导致数据不一致。

修复: 实现 graceful shutdown，等待当前 job 完成后再退出。

**19. API Key 比对存在时序攻击漏洞**
文件: `apps/api/src/server.ts` 第 91 行

使用 `===` 比对密钥，攻击者可通过测量响应时间逐字节猜测 API Key。

修复: 使用 `crypto.timingSafeEqual()` 进行常数时间比对。

**20. Docker 容器以 root 用户运行**
文件: `Dockerfile`

未创建非特权用户，整个应用以 root 身份运行。容器逃逸时攻击者获得宿主机 root 权限。

修复: 在 Dockerfile 中创建非 root 用户并切换。

---

### P2 -- 两周内修复（中等影响）

**21. store.ts 中 reset() 方法无事务保护** -- 18 条 DELETE 语句没有事务包裹，中间失败会导致部分表被清空而另一部分没有。

**22. pipeline 采集操作无事务保护** -- `deleteSnapshots` + `insertSnapshots` + `insertChanges` + `upsertCompetitors` 等多个写操作没有包裹在一个事务中，中间步骤失败会导致数据不一致。

**23. 价格解析不支持欧洲格式** -- `search-card-parser.ts` 的 `parsePrice` 将逗号全部移除，无法正确解析德国站的 `1.299,99` 格式。

**24. 前端 60 秒轮询不考虑页面可见性** -- 用户最小化浏览器后仍然每 60 秒发请求，浪费资源。应加入 Page Visibility API 检查。

**25. 前端无数据缓存** -- 每次切换 Tab 都重新请求完整数据，无任何缓存层。引入带 TTL 的内存缓存或 SWR 模式。

**26. 前端无请求超时控制** -- `fetch` 调用无超时设置，后端无响应时请求无限挂起。

**27. .env 加载器无条件覆盖系统环境变量** -- `notifications/env.ts` 中 `process.env[key] = val` 可覆盖 `PATH`、`HOME` 等系统变量。应添加白名单。

**28. 全局错误处理暴露内部错误详情** -- 原始错误消息直接返回客户端，可能泄露 SMTP 配置、数据库结构等信息。生产环境应返回通用消息。

**29. useAppController 返回 90+ 变量（God Composable）** -- 多个 spread 操作符使命名冲突风险增大。应按领域拆分或让子组件直接访问 store。

**30. 共享包中 roundCurrency 在 6 个文件中重复定义** -- `brand-matrix.ts`、`category-signals.ts`、`category-activity.ts`、`action-insights.ts`、`product.ts`、`ranking.ts` 各自定义完全相同的实现。统一从 `report-formatters.ts` 导入。

**31. 搜索结果缺少 ASIN 去重** -- `search-collector.ts` 没有对搜索结果去重，同一 ASIN 可能以自然结果和 Sponsored 两种形式出现被记为两条记录。

**32. 详情页恢复流程串行且开销大** -- `recoverMissingCriticalMetricsInFreshContext` 启动全新浏览器实例且串行处理，无并发。

**33. 事件冒泡链过深** -- 事件路径如 `CategoryBoardPanel -> CategoriesView -> App.vue -> useAppController` 需要 3-4 层 emit 转发。使用 provide/inject 将 action 注入深层子组件。

**34. styles.css 单文件 3571 行** -- 所有样式集中管理，命名冲突风险高。按组件或功能拆分 CSS。

**35. 详情页每次创建/销毁新 Page** -- 100 个商品 = 100 次 `context.newPage()` + `page.close()`。使用页面池复用 page 对象。

---

### P3 -- 一个月内优化（改善质量）

**36. 缺少空状态引导** -- AlertsView、LogsView、CompetitorsView、KeywordsView 数据为空时直接渲染空表格，无引导提示。

**37. 全局单一 loading 状态** -- 一个 `loading` 控制整个应用，Categories 加载时 Sidebar 的采集按钮也被禁用。应按领域拆分。

**38. 多个 Watch 触发器可导致请求风暴** -- `useAppViewEffects.ts` 中 5 个独立 watch，同时改 Tab 和 Date 会触发两次并行请求。加入 debounce。

**39. LIMIT 参数未做上界限制** -- 客户端可请求 `?limit=99999999` 导致内存溢出。应在 store 层设上限（如 `Math.min(limit, 1000)`）。

**40. 无正式 migration 系统** -- 使用 `ensureColumn` + `runStoreMigrationOnce` 混合方式，无版本追踪。

**41. 测试缺口: page-guards.ts 和 retry.ts 未测试** -- captcha 检测和重试策略是区分"应重试"和"应中止"的关键逻辑，但完全没有单元测试。

**42. 解析器测试仅覆盖 US Amazon** -- UK/DE/JP 市场的页面差异（德语/日语文本、价格格式）完全没有测试。

**43. API 端点缺少分页支持** -- 大部分 list API 仅支持 limit，无 offset 或 cursor-based 分页。

**44. playwright 和 node-cron 在 root 和 api 两处重复声明依赖**。

**45. 路由注册顺序问题** -- `POST /api/categories/collect/run` 注册在 `:id` 参数路由之后，可能被错误匹配。

**46. App.vue.backup 死文件残留在源码目录中**。

---

### 做得好的地方

在列出大量改进建议的同时，也要认可项目中做得好的部分:

**前端**: 零 `any` 类型使用（非常难得）；App.vue 从 2099 行瘦身到 263 行；所有视图组件使用 `defineAsyncComponent` 按需加载；ECharts 按需引入并配置 manual chunks；`collect-jobs.ts` 轮询模块工程质量高，有依赖注入和完善的单元测试；Auth 流程通过 CustomEvent 解耦设计巧妙。

**后端**: SQL 全部使用参数化查询，无 SQL 注入风险；Store 模块化拆分方向正确；路由按领域组织清晰；Worker 队列设计合理（claim/retry/fail 状态机）。

**共享包**: 依赖方向完全正确（shared 不依赖 api/web）；无循环依赖；门面模式清晰；18 个测试文件覆盖从单元到集成的全链路，`category-intelligence.test.ts` 是高质量的典范。

**爬虫**: 采集失败自动截图保存；畅销榜 ASIN 去重；缓存键包含版本号和日期确保解析器升级后自动失效；弱品牌检测配合 Store 页面回查显著提升品牌数据准确性；`isSponsoredOrRecommendationElement` 正确过滤关联推荐区域的 coupon/deal 信息。

---

### 修复优先级路线图

| 阶段 | 时间 | 聚焦 | 包含问题编号 |
|------|------|------|-------------|
| 第一阶段 | 本周 | 安全加固 | 1, 2, 3, 5, 15, 16, 19, 20 |
| 第二阶段 | 下周 | 后端架构治理 | 7, 8, 9, 12, 18, 21, 22 |
| 第三阶段 | 第 3 周 | 爬虫强化 | 4, 10, 11, 17, 23, 31, 32, 35 |
| 第四阶段 | 第 4 周 | 前端体验优化 | 6, 13, 14, 24, 25, 26, 29, 33, 36 |
| 第五阶段 | 持续 | 质量提升 | 30, 34, 37-46 |
