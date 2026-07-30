# v0.6.1 当前代码完整审查（2026-07-28）

## 1. 文档信息

| 项目 | 内容 |
| --- | --- |
| 审查对象 | Amazon 关键词竞品价格与排名监控系统 |
| 审查基线 | `v0.6.1` |
| Git 提交 | `fbf3d84b2442c193ecab7c13457fdb3bddaaa6c5` |
| 提交说明 | `chore(release): v0.6.1` |
| 审查日期 | 2026-07-28 |
| 运行环境 | Windows；Node.js `v22.22.3`；npm `10.9.8`；Vitest `4.1.6` |
| 审查范围 | `packages/shared`、`apps/api`、`apps/web`、Tauri 配置、根级脚本、生产依赖和 OpenAPI |
| 不在范围 | 不修改功能代码，不修改 README，不修改历史归档，不实施本文建议 |

## 2. 执行结论

当前版本已经形成较完整的“采集—证据—事件—任务—报告”运营闭环，Monorepo 依赖方向清楚，Store 已按领域拆分，SQLite 迁移、事务、参数化查询、分页约束和多租户字段已具备工程基础。当前验证中，149 个测试文件、792 个用例全部通过，生产构建通过。

但本版本不应直接开启真实 SP-API 生产连接器，原因不是核心业务不可用，而是存在三类发布阻断项：

1. 账号切换时前端两级缓存没有用户或组织命名空间，可能在同一浏览器中复用前一组织的数据。
2. Session token 被写入 `localStorage`，Web 与 Tauri CSP 同时关闭，且 ECharts 版本命中已知 XSS 公告，扩大了不必要的令牌暴露面。
3. 生产依赖审计仍有 13 个易受影响包节点，其中 11 个为 high；Nodemailer、ExcelJS/Archiver、Express/Body Parser、ECharts 等链路需要在发布前处理。

此外，采集权限、Worker 租约与优雅退出、浏览器测试门禁、OpenAPI 完整性仍有 P1 缺口。综合评分为 **5.8/10**；该分数反映工程成熟度，不代表可以用平均分抵消 P0，任一 P0 未关闭都应阻止真实凭据接入。

## 3. 审查方法与可重复基线

### 3.1 代码规模

统计口径为三个源码目录下的 `.ts` / `.vue` 文件，排除 `*.test.*` 与 `*.spec.*`，行数为非空行：

| 范围 | 生产源码文件 | 非空行 |
| --- | ---: | ---: |
| `apps/api/src` | 226 | 34,791 |
| `apps/web/src` | 313 | 40,276 |
| `packages/shared/src` | 46 | 5,587 |
| 合计 | **585** | **80,654** |

数据库 Schema 中静态声明 51 张表；`apps/api/src/routes` 中静态识别到 195 个 Express 路由声明。

### 3.2 当前验证事实

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 全量默认测试 | `npm test -- --silent` | 通过：149 个测试文件、792 个用例 |
| Shared | 由根级测试脚本执行 | 16 个文件、59 个用例 |
| API | 由根级测试脚本执行 | 78 个文件、520 个用例 |
| Web | 由根级测试脚本执行 | 55 个文件、213 个用例 |
| 生产构建 | `npm run build` | Shared、API、Web 全部通过 |
| 浏览器测试脚本 | `npm run test:browser` | 失败：`No test files found`，filter 为 `src/**/*.browser.test.ts` |
| 浏览器测试直接执行 | `npx vitest run apps/api/src/amazon-collector.browser.test.ts` | 通过：3 个测试文件、21 个用例 |
| 生产依赖审计 | `npm audit --omit=dev --json` | 13 个：11 high、1 moderate、1 low、0 critical |
| OpenAPI 静态比对 | Express method/path 与 OpenAPI operation 集合比对 | 195 个路由声明中 47 个未进入 OpenAPI |

说明：

- 直接执行的 browser 测试是使用浏览器运行的采集/解析集成测试，不等同于对 Amazon 线上页面的实时端到端探测。
- Vite 构建仅出现第三方 VueUse/Rollup 注释提示，不影响构建退出码；ECharts chunk 约 558 kB，属于后续性能优化项，不作为本轮发布阻断。
- `npm audit` 的 13 是 npm 对易受影响包节点的计数，不等同于 13 条互不相关的可利用路径；是否可利用仍需逐项分析，但 high/critical 发布门禁不能因此跳过。

## 4. 九维评分

| 维度 | 评分 | 当前判断 | 主要证据 |
| --- | ---: | --- | --- |
| 架构 | 7/10 | 分层和依赖方向清楚，但核心接口与部分领域文件继续膨胀 | `packages/shared ← apps/api/apps/web`；Store 分域；多批文件超过约定 |
| 安全与租户隔离 | 4/10 | 后端多数路由有组织检查，但前端缓存、token 存储、CSP 和全局 legacy key 构成高风险组合 | F-001、F-002、F-004、F-008 |
| 数据一致性 | 7/10 | 已有事务、唯一约束和 upsert；真实混合数据源的字段级来源仍无法准确表达 | `withTransaction`、`UNIQUE(product_id, metric_date)`、F-011 |
| 采集与 Worker | 6/10 | 页面守卫、重试、队列和心跳较完整；缺少所有权租约与真正的 shutdown 协议 | F-005 |
| API 契约 | 5/10 | Shared 类型和 Zod 校验较好；OpenAPI 与路由存在 47 个 operation 差口 | F-007 |
| 前端状态 | 5/10 | Pinia、composable、异步视图和请求取消基础良好；缓存生命周期没有绑定会话 | F-001 |
| 测试门禁 | 7/10 | 默认测试量和通过率良好；browser 门禁脚本实际失效且被默认测试排除 | F-006 |
| 部署运维 | 5/10 | 构建、心跳、日志和桌面配置已具备；依赖门禁、CSP、shutdown 仍不足 | F-002、F-003、F-005 |
| 产品成熟度 | 6/10 | 运营工作台功能覆盖广，但关键经营指标仍主要依赖采集、文件和手工数据 | F-009、F-011、功能方向矩阵 |

## 5. 详细发现

### F-001：账号切换可能复用前一组织的两级前端缓存

| 字段 | 内容 |
| --- | --- |
| 严重级别 | **P0 — 租户数据暴露风险 / 真实连接器前置门禁** |
| 代码位置 | `apps/web/src/api-base.ts:3,10-11,52-83,133-141`；`apps/web/src/composables/app-view-loader.ts:33-35,44-67`；`apps/web/src/composables/useAuthGuard.ts:25-41`；`apps/web/src/stores/session.ts:46-70` |
| 复现证据 | 请求缓存 key 仅为 `METHOD + path`，TTL 为 8 秒；视图缓存仅以 `TabKey` 保存同日期加载状态，TTL 为 30 秒。登录成功后只调用 `reloadCurrentView()`，没有清空请求缓存、inflight 请求、视图缓存或领域 Store，也没有把 user/org/session epoch 加入 key。可按“组织 A 登录并打开页面 → 退出/401 → 30 秒内登录组织 B → 打开相同 tab/date”验证。视图层可能直接判定已加载，或者 GET 层直接返回组织 A 的缓存值而不访问后端。 |
| 影响范围 | 所有使用通用 `request()` GET 缓存和 `loadAppView()` 的页面；同浏览器账号切换、会话过期后重新登录、未来组织切换功能。后端组织隔离无法拦截一个根本没有发出的请求。 |
| 修复建议 | 引入单一 session epoch/cache namespace，至少包含 `organization.id + user.id + session generation`；登录、退出、401、组织切换时原子地清空请求缓存、inflight 引用、视图缓存和用户态 Pinia 数据。旧会话请求即使稍后完成，也必须因 epoch 不匹配而禁止写回。最好同时持有 AbortController 取消旧请求。 |
| 可验证验收条件 | 1）单元测试在同一路径、相同日期下从组织 A 切换到 B，B 首屏必须发出新请求且不出现 A 数据；2）旧 inflight 请求在切换后完成也不能写入 B 的 Store；3）登录、退出、401 和组织切换四条路径均触发统一清理；4）真实浏览器双账号回归通过；5）缓存 key 或缓存容器可以从测试中证明绑定当前 session namespace。 |

### F-002：Session token 暴露给 JavaScript，且 Web/Tauri CSP 关闭

| 字段 | 内容 |
| --- | --- |
| 严重级别 | **P0 — 凭据暴露面 / 真实连接器前置门禁** |
| 代码位置 | `apps/web/src/stores/session.ts:7,29-50`；`apps/web/src/api-base.ts:39-49`；`apps/api/src/routes/auth.ts:28-34`；`apps/api/src/server.ts:52-55,110-130`；`src-tauri/tauri.conf.json:26`；`apps/web/package.json:16` |
| 复现证据 | 服务端已经设置 `HttpOnly; SameSite=Lax` session cookie，但前端仍将同一 session token 写入 `localStorage["amazon_monitor_session"]`。通用请求并不读取该 key，只读取旧版 `amazon_monitor_auth_token`，说明该持久化没有必要的当前请求用途。Helmet 显式设置 `contentSecurityPolicy: false`，Tauri 配置为 `"csp": null`，Swagger 页面还运行外部 CDN 脚本。当前 ECharts 为 6.0.0，并命中 `<6.1.0` 的 XSS 公告。 |
| 影响范围 | Web 和 Tauri 渲染进程中的任意脚本注入、供应链脚本或不安全 HTML 渲染都可读取持久化 token。这里没有证明现有页面已经存在可利用链，但“可读 token + 无 CSP + 已知 XSS 依赖”的组合显著放大后果。未来保存 SP-API 凭据后，账号接管影响更大。 |
| 修复建议 | 改为 **HttpOnly-only session**：登录响应不再把可复用 token 暴露给前端，前端删除 session 与 legacy token 的持久化路径，仅通过 `credentials: include` 使用 Cookie。为 Web 配置可执行 CSP，优先使用同源静态资源、nonce/hash 和精确 `script-src/style-src/connect-src/img-src`；Tauri 配置等价 CSP。Swagger 资源改为本地打包或只在受控开发环境启用。升级 ECharts 并做图表 tooltip/formatter 输入检查。 |
| 可验证验收条件 | 1）登录后 `localStorage`、`sessionStorage`、IndexedDB 和前端状态快照中均无 session token；2）认证 Cookie 具有 HttpOnly、SameSite，生产环境具有 Secure；3）Web 响应头和 Tauri 配置存在有效 CSP，自动测试拒绝未授权内联/外部脚本；4）ECharts 升至修复版本；5）全量登录、下载、401、桌面端回归通过；6）安全测试证明前端 JavaScript 无法读取认证凭据。 |

### F-003：生产依赖审计存在 11 个 high，发布门禁未关闭

| 字段 | 内容 |
| --- | --- |
| 严重级别 | **P0 — 发布门禁** |
| 代码位置 | `apps/api/package.json:20-25`；`apps/web/package.json:16`；`package-lock.json` |
| 复现证据 | `npm audit --omit=dev --json` 返回 13 个易受影响包节点：11 high、1 moderate、1 low。当前安装树包括 ECharts 6.0.0、Nodemailer 8.0.7、ExcelJS 4.4.0 → Archiver 5.3.2、Express 4.22.2 → Body Parser 1.20.5，以及 Vue 编译链中的 PostCSS 8.5.14。 |
| 影响范围 | 图表渲染、邮件通知、Excel/ZIP 报告、HTTP 请求解析和构建链。部分漏洞需要特定输入或配置才能利用，但真实连接器会扩大外部输入、凭据和自动任务的攻击价值，因此不能仅以“当前未观察到利用”放行。 |
| 修复建议 | 按直接依赖逐条建升级/替代任务：ECharts 至修复版本；Nodemailer 升级并回归 TLS、URL/file access 限制；Express/Body Parser 和 PostCSS 升级；ExcelJS/Archiver 链不要盲从 audit 建议降级到旧版，先确认上游补丁或替代归档实现，并对公式注入、路径和压缩包输入做边界测试。无法立即升级的项必须形成逐项不可利用说明，包含调用路径、输入可控性、补偿控制、责任人和到期日。 |
| 可验证验收条件 | 1）`npm audit --omit=dev` 的 high/critical 为 0，或每一项均有获批且未过期的不可利用说明；2）邮件、Excel、PDF/Markdown 报告、图表、请求体限制的回归测试通过；3）锁文件和 SBOM 固化实际版本；4）CI 将生产依赖 high/critical 设为失败门禁。 |

当前依赖链摘要：

| 包或链路 | 当前版本 | npm 严重级别 | 处理重点 |
| --- | --- | --- | --- |
| `echarts` | 6.0.0 | moderate | `<6.1.0` XSS；与无 CSP、可读 token 组合评估 |
| `nodemailer` | 8.0.7 | high | Header injection、URL/file access 绕过、TLS/OAuth2 等聚合公告 |
| `exceljs → archiver` | 4.4.0 → 5.3.2 | high | 归档链包含 glob/minimatch/brace-expansion 等；audit 自动建议并非可直接采用的安全升级 |
| `express → body-parser` | 4.22.2 → 1.20.5 | low | 非法 limit 可绕过大小限制的 DoS 风险 |
| `vue/compiler-sfc → postcss` | 3.5.34 → 8.5.14 | high | source map 路径穿越/文件泄露公告，确认生产构建输入边界 |
| 传递归档链 | 多版本 | high | `archiver-utils`、`glob`、`minimatch`、`readdir-glob`、`rimraf`、`zip-stream`、`brace-expansion` |

### F-004：后端采集授权没有使用 `manage_collection` capability

| 字段 | 内容 |
| --- | --- |
| 严重级别 | **P1 — 权限契约不一致** |
| 代码位置 | `packages/shared/src/types-identity.ts:20-46`；`apps/api/src/server.ts:178-185,327-374`；`apps/web/src/components/AppTopbar.vue:10`；`apps/web/src/components/CollectorsView.vue:17` |
| 复现证据 | Shared 权限矩阵为 manager 和 operator 分配 `manage_collection`，前端也用该 capability 控制采集操作；后端 `canModifyBusinessRequest()` 没有 `/api/collect`、`/api/collectors` 或类目采集的 capability 分支，最终回退为 admin 或 operator。因而 manager 在前端可见但后端被拒绝，而授权规则依赖角色名而不是统一能力。 |
| 影响范围 | 手动采集、采集队列、Worker 重启及未来 SP-API 手动同步；角色矩阵、前端行为和 API 实际授权不一致。 |
| 修复建议 | 建立 method + route-domain 到 capability 的集中映射；采集与同步类写操作统一检查 `manage_collection`，数据源凭据管理继续检查 `manage_data_sources`。对 Worker 重启等运维动作可拆出更高权限，而不是隐式沿用采集权限。 |
| 可验证验收条件 | 以 admin、manager、operator、viewer 等角色对每个采集/同步写端点做参数化契约测试；前后端共用同一 capability 定义；manager 的 `manage_collection` 行为与矩阵一致；无 capability 的角色稳定返回 403；跨组织资源继续返回 404/403。 |

### F-005：Worker 没有任务所有权租约，`stopWorker` 也不是真正的 graceful shutdown

| 字段 | 内容 |
| --- | --- |
| 严重级别 | **P1 — 并发一致性与运维可靠性** |
| 代码位置 | `apps/api/src/worker.ts:51-58,104-123,125-172,175-205,243-258`；`apps/api/src/store/queue-store.ts:100-168,286-331` |
| 复现证据 | Worker 用进程级 `running` 布尔值控制领取；`stopWorker()` 只将其设为 false 并立即打印“Stopped”，没有安装 SIGTERM/SIGINT handler，也没有等待 `Promise.all(lanes)` 完成。队列表仅以 `status + started_at` 判断超时，没有 lease owner、lease version 或续租时间。Reaper 可把 processing 任务改回 pending，而原 runner 的非可中断 I/O 仍可能继续写业务表；`completeJob`/`failJob` 的状态保护只能阻止旧 runner 改队列状态，不能阻止其业务写入。 |
| 影响范围 | Playwright 卡顿、网络超时、进程重启、并发 Worker、SP-API 长分页同步。可能出现同一逻辑任务并行执行、重复外部请求、部分新旧写入交错和错误 freshness 状态。 |
| 修复建议 | 为任务增加 `lease_owner`、`lease_token/version`、`lease_expires_at` 和 heartbeat 续租；领取、续租、checkpoint、完成和失败均以 lease token 做 compare-and-set。SIGTERM/SIGINT 时停止领取、停止 reaper、发出 abort、等待有界 drain，超时后保留可恢复 checkpoint。所有事实写入必须幂等，并在提交前验证运行/租约仍有效。 |
| 可验证验收条件 | 1）任务执行中发送 SIGTERM，Worker 不再领取新任务并在有界时间内 drain 或安全退出；2）旧租约 runner 在任务被重领后不能提交事实或完成状态；3）两个 Worker 同时运行不会消费同一 lease；4）超时、进程崩溃、分页中断和重启测试均不产生重复事实；5）日志明确记录 worker id、run id、lease token 摘要和恢复原因。 |

### F-006：`test:browser` 脚本无法发现测试，默认测试又明确排除它

| 字段 | 内容 |
| --- | --- |
| 严重级别 | **P1 — 测试门禁失效** |
| 代码位置 | `apps/api/package.json:10-13`；根 `package.json:25-29`；`apps/api/src/amazon-collector.browser.test.ts` |
| 复现证据 | API 默认测试使用 `--exclude '**/*.browser.test.ts'`；browser 脚本在 workspace cwd 中传入 `src/**/*.browser.test.ts`，Vitest 4.1.6 返回 `No test files found`。同一测试从仓库根直接执行时，3 个测试文件、21 个用例通过。这说明测试内容可运行，但发布脚本本身没有执行它。 |
| 影响范围 | Amazon URL、浏览器上下文、页面守卫和解析相关回归可能绕过默认 CI 与 browser CI；绿色的 `npm test` 不能证明 browser 文件被运行。 |
| 修复建议 | 将脚本改为 Vitest 能稳定解析的显式文件或 include 配置，例如在 API workspace 内直接运行 `src/amazon-collector.browser.test.ts`；CI 独立执行且失败即阻断。若该文件不启动真实浏览器，应重新命名为 integration，并另外建立真正的 Playwright fixture/live-smoke 分层。 |
| 可验证验收条件 | 1）`npm run test:browser` 退出码为 0 且输出明确包含 21 个既有用例；2）故意令其中一个断言失败时 CI 必须失败；3）`npm test` 与 `npm run test:browser` 的覆盖边界在脚本和文档中明确；4）不依赖 shell glob 在 Windows 与 Linux 上的展开差异。 |

### F-007：195 个路由声明中有 47 个未进入 OpenAPI

| 字段 | 内容 |
| --- | --- |
| 严重级别 | **P1 — 契约漂移** |
| 代码位置 | `apps/api/src/routes/*.ts`；`apps/api/src/openapi.json`；`apps/api/src/server.test.ts:171-205` |
| 复现证据 | 将 route 文件中的 `get/post/put/patch/delete + path` 规范化（去掉 `/api`，将 `:id` 转为 `{id}`）后，与 OpenAPI 的 152 个 operation 比对：195 个路由声明中 47 个无对应 operation。现有测试只用 `arrayContaining` 检查一组关键 path 是否存在，不能发现未文档化路由或陈旧 operation。 |
| 影响范围 | 认证、用户、Worker 重启、通知、SOP、规则、任务事件/备注等接口；SDK、前端契约、权限审查、渗透测试和外部集成无法以 OpenAPI 为完整清单。 |
| 修复建议 | 在 CI 增加双向比对：每个 Express method/path 必须有 OpenAPI operation，每个 OpenAPI operation 必须有实际路由；仅允许对 health/docs 等明确 allowlist。随后分批补齐 schema、状态码、认证、capability 和错误响应。长期可由 typed route/schema 生成 OpenAPI，减少手工双写。 |
| 可验证验收条件 | 自动比对差集为 0 或仅包含获批 allowlist；47 个当前缺口全部补齐；每个 v0.7 新端点在实现时同步进入 OpenAPI；CI 对新增未文档化路由和幽灵 operation 都会失败。 |

当前 47 个缺口按领域归类：

| 领域 | 数量 | 代表接口 |
| --- | ---: | --- |
| 认证与用户 | 6 | `/auth/login`、`/auth/logout`、`/auth/me`、`/auth/register-first-user`、`/users` |
| 采集与 Worker | 9 | `/collect/*` 兼容入口、`/collectors/worker-restart` |
| 通知 | 6 | `/notifications/schedules*`、`/notifications/logs` |
| SOP | 6 | `/sops*` |
| 任务/洞察关联 | 8 | task events/notes/transition、insight tasks、top-summary filter |
| 规则、报表、Listing 等其他 | 12 | `/rules*`、`/reports/category`、Listing health、活动日历等 |
| 合计 | **47** | 以自动比对结果为准 |

### F-008：生产环境强制启用的 legacy API key 会隐式绑定“第一个管理员”

| 字段 | 内容 |
| --- | --- |
| 严重级别 | **P1 — 多租户身份歧义** |
| 代码位置 | `apps/api/src/server.ts:141-157,188-200,377-386` |
| 复现证据 | 生产环境要求配置一个全局 `AMAZON_MONITOR_API_KEY`。该 key 验证成功后，`resolveLegacyApiKeyContext()` 从 `listUsers()` 中选择第一个 active admin，并使用其组织上下文，没有 key→组织、key→service account 或 scope 绑定。多组织数据存在时，身份取决于查询顺序。 |
| 影响范围 | 所有通过 legacy Bearer key 调用的自动化；可能在错误组织下读取或执行管理员能力操作，也无法按调用方区分审计主体。 |
| 修复建议 | v0.7 生产连接器默认关闭全局 legacy key。若必须保留自动化，改为可撤销的 service account/API key 记录，显式绑定 org、capability scope、过期时间和 key id；只保存 hash，支持轮换和最后使用审计。 |
| 可验证验收条件 | 两个以上组织存在时，任何 key 都不会按“第一个管理员”推断租户；key 只能访问绑定组织与 scope；轮换/撤销即时生效；审计日志可定位 service account 与 key id；生产配置不再要求一个全局管理员 key。 |

### F-009：可选外部 LLM 摘要与“所有 Agent 不调用外部 LLM”的公开说明冲突

| 字段 | 内容 |
| --- | --- |
| 严重级别 | **P2 — 产品说明与数据外发治理** |
| 代码位置 | `README.md:9-11`；`apps/api/src/reports/period-insight-ai-summary.ts:3-11,29-69,97-109`；`.env.example` |
| 复现证据 | README 明确写“所有 Agent 当前实现都是确定性的——不调用外部 LLM”；但 period insight summary 在配置 `INSIGHT_REPORT_LLM_API_KEY/OPENAI_API_KEY` 与 model 后，会向可配置的 Responses API 发送 period、top events、品牌、ASIN、证据和建议动作。`.env.example` 没有对应配置、默认行为、数据外发范围或合规说明。 |
| 影响范围 | 报告用户、品牌/ASIN 经营证据、部署合规、数据处理协议和供应商风险评估。功能默认关闭降低了即时风险，但不能消除说明不一致。 |
| 修复建议 | 将其定义为独立、默认关闭的“外部生成式摘要”，不要混入“确定性 Agent”承诺；提供管理员显式开启、允许域名、数据最小化/脱敏、超时、审计、删除策略和 UI 外发提示。若产品不准备承担外发治理，应移除该调用，仅保留确定性摘要。 |
| 可验证验收条件 | 默认配置下网络测试证明不会调用外部 LLM；启用前 UI/部署文档明确展示外发字段和提供商；`.env.example` 与运行文档一致；日志不含 API key；出站域名可限制；每次生成记录 provider、model、prompt version、数据范围和发起人。 |

### F-010：Worker 仍有生产 `any`，Store 接口和多批领域文件超过工程约定

| 字段 | 内容 |
| --- | --- |
| 严重级别 | **P2 — 可维护性与类型安全债务** |
| 代码位置 | `apps/api/src/worker.ts:54,56,182`；`apps/api/src/store/types.ts:1-1003`；`apps/api/src/store/insight-event-store.ts`；`apps/web/src/stores/insightEvents.ts`；`apps/api/src/amazon/parsers/product-detail-parser.ts`；`apps/api/src/routes/insight-events.ts` |
| 复现证据 | `worker.ts` 的 runner、store 参数共有 3 处生产 `any`。`store/types.ts` 为 1003 个物理行、971 个非空行；另有 772 行的 insight event Store、716 行的前端 insightEvents Store、671 行的 product detail parser、636 行的 event generator、627 行的 product Store、548 行的 Vue 面板和 534 行的路由文件。项目约定普通 TS 约 300 行、Vue page 约 400 行。 |
| 影响范围 | Store 契约变更、Worker 测试替身、事件域回归、解析器维护、多人并行修改和审查成本。超长本身不是缺陷，但职责耦合和类型逃逸会放大未来 SP-API 变更范围。 |
| 修复建议 | 先把 Worker 依赖收窄为 `Pick<Store, ...>` 或专用 `WorkerStore`，删除 `any`；将 `Store` 总接口按 domain capability interface 组合；按职责拆 insight event 查询/写入/review、parser sections 和大组件，保留小步、等价重构，不做全仓一次性重写。 |
| 可验证验收条件 | 生产源码中 Worker 相关 `any` 为 0；拆分前后全量测试与构建均通过；新增文件按领域职责命名，依赖方向不反转；为超出行数约定的文件建立短期例外清单或拆分计划；每一批重构 diff 可单独回滚。 |

超长文件样本采用物理行统计：

| 文件 | 物理行 |
| --- | ---: |
| `apps/api/src/store/types.ts` | 1003（971 非空） |
| `apps/api/src/store/insight-event-store.ts` | 772 |
| `apps/web/src/stores/insightEvents.ts` | 716 |
| `apps/api/src/amazon/parsers/product-detail-parser.ts` | 671 |
| `apps/api/src/insights/insight-event-generator.ts` | 636 |
| `apps/api/src/store/product-store.ts` | 627 |
| `apps/web/src/components/CategoryBoardPanel.vue` | 548 |
| `apps/api/src/routes/insight-events.ts` | 534 |

### F-011：当前经营事实只有通用来源字段，无法表达销售与库存的混合来源

| 字段 | 内容 |
| --- | --- |
| 严重级别 | **P2（当前）/ v0.7 接入前升级为 P0 数据门禁** |
| 代码位置 | `packages/shared/src/types-products.ts:191-224,309-329`；`apps/api/src/store/product-store.ts:47-79,115-149,531-582`；`apps/api/src/store/schema/product-schema.ts:31-58`；`packages/shared/src/types-inventory.ts:46-48` |
| 复现证据 | `own_product_daily_metrics` 同时承载 sessions、page views、orders、sales、buy box、conversion 等指标，但整行只有一个 `data_source/last_synced_at/sync_status/sync_error`。upsert 会同时覆盖事实字段和这组通用来源字段。库存当前主要表现为 `product_inventory_settings` 和通用来源元数据，没有按运行保存的真实库存快照。因此未来 SP-API 销售、FBA 库存、CSV 和手工数据混合时，一个来源状态可能错误代表另一数据域。 |
| 影响范围 | freshness、Agent 安全策略、报告可信度、部分同步失败恢复、CSV 回补、销售与库存不同频率同步。 |
| 修复建议 | 销售流量和 FBA 库存使用独立事实表或至少独立 domain provenance；每条事实保存 source id、run id、observed/business time、synced time、status 和 marketplace。定义来源优先级和字段所有权，SP-API 对其负责字段默认权威，CSV/手工不得静默覆盖更新鲜 API 数据。 |
| 可验证验收条件 | 销售同步失败不改变库存 freshness，库存失败不改变销售 freshness；任一页面指标可追溯到 source/run；部分 marketplace 失败保留最后成功版本；同批次重放不新增重复事实；CSV/手工覆盖新鲜 API 数据时必须被拒绝或显式确认并留审计。 |

## 6. 架构与实现正向证据

以下能力可以直接作为 v0.7 的基础，不建议推倒重建：

1. **依赖方向清楚**：Shared 同时服务 API 和 Web，API/Web 无源码互相依赖。
2. **领域 Store 已拆分**：`store/types.ts` 虽然过大，但实现已分散到 data source、product、queue、insight event 等领域文件。
3. **SQL 基础规则较成熟**：存在 `buildWhere`、`whereEq`、分页 clamp、参数化查询和 `withTransaction`；业务数据没有必要迁移到另一数据库才能开始 v0.7。
4. **幂等基础存在**：例如 `own_product_daily_metrics` 有 `UNIQUE(product_id, metric_date)`，产品指标使用 upsert；关键词快照也已有去重迁移。
5. **多租户模型已落地**：组织、用户、session、commerce store、data source 和 sync run 已存在；多数 data source 路由会检查资源 `orgId`。
6. **采集可靠性基础存在**：Amazon 页面守卫、重试分类、失败截图、任务队列、Worker heartbeat 和 stale recovery 已实现。
7. **前端分层可延伸**：Pinia Store、composable、异步视图加载和按领域 loading 已形成约定。
8. **运营闭环已具备承载面**：概览、Owned SKU、freshness、Agent、事件、任务和报告可以消费真实来源，不必另建一套 UI。

## 7. 功能方向矩阵

排序原则先看用户价值，再看前置依赖和实施风险。后续方向应沿现有产品演进，不创建平行系统。

| 顺序 | 功能方向 | 用户价值 | 必要依赖 | 实施风险 | 建议版本 | 成功信号 |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | **真实数据连接：Sales & Traffic + FBA Inventory** | 极高：把演示/导入工作台变成可持续经营系统 | 关闭全部 P0；租户安全、凭据加密、幂等同步、来源治理 | 中高 | v0.7 | D-1 销售自动进入概览；库存健康时延迟不超过 60 分钟 |
| 2 | **Listings Issues 与 Amazon Ads 只读报表** | 高：把流量、库存、Listing、广告诊断串联 | v0.7 映射、连接健康、限流与运行历史 | 中高；Ads 另有申请审批 | v0.8 | Listing 问题可追踪；广告建议有真实 spend/sales 证据 |
| 3 | **运营实验与复盘归因** | 高：从“给建议”升级为“证明建议有效” | 稳定事实、任务/事件时间线、基线与观察窗 | 中 | v0.9 | 建议采纳率、执行率、复盘率和前后指标可解释 |
| 4 | **双人审批后的半自动执行** | 高但风险高：降低重复运营操作成本 | 只读数据稳定、实验归因、细粒度权限、审计、回滚 | 极高 | v1.0 | 每次写操作可预览、双人批准、幂等执行、可回滚 |
| 5 | **供应链与财务闭环** | 中高：库存资金占用、利润和补货决策更完整 | Inventory 稳定；Finances/成本口径；ERP/WMS 边界 | 高 | v1.x 独立 PRD | 库存、在途、成本、利润口径可对账 |
| 6 | **SaaS、多平台和公共 OAuth** | 长期高：支持多客户、多渠道 | Postgres/队列/密钥管理、公共应用审核、计费与合规 | 极高 | 独立 PRD | 租户自助授权、配额、计费、SLA 和平台隔离成立 |

## 8. 建议修复顺序

### 阶段 A：真实凭据接入前的硬门禁

1. F-001：会话绑定缓存及账号切换清理。
2. F-002：HttpOnly-only session、Web/Tauri CSP、ECharts 修复。
3. F-003：生产依赖 high/critical 门禁。
4. F-004：采集 capability 后端对齐。
5. F-005：Worker shutdown 与 lease。
6. F-006：可执行 browser gate。

### 阶段 B：v0.7 开发同时完成

1. F-007：OpenAPI 双向自动比对并补齐 47 个缺口。
2. F-008：取消全局管理员 legacy API key 或改为组织绑定 service account。
3. F-011：销售/库存独立事实来源、运行与 freshness。

### 阶段 C：不阻断 v0.7 私有只读首发

1. F-009：外部 LLM 说明和数据外发治理。
2. F-010：Worker 类型和超长文件分批治理。

## 9. 发布判定

当前判定：**有条件不通过（Blocked for real-data production connection）**。

允许继续的工作：

- 本地开发与现有 v0.6.1 功能验证。
- v0.7 Schema、connector、测试和 UI 的开发分支工作。
- 使用不含真实凭据和真实业务数据的 fixture/sandbox 测试。

禁止进入的状态：

- 在 P0 未关闭时保存真实 LWA refresh token。
- 在 browser gate 仍无法发现测试时宣称连接器发布门禁通过。
- 在 Worker 无租约时启用多实例或自动高频同步。
- 在来源模型未拆分时让 CSV/手工数据静默覆盖 SP-API 新鲜事实。

最终生产放行至少要求：

1. F-001、F-002、F-003 全部关闭。
2. F-004、F-005、F-006 有通过的自动化验收证据。
3. `npm test`、`npm run test:browser`、`npm run build` 全部通过。
4. OpenAPI 与 Express 路由双向差集为 0 或只有获批 allowlist。
5. `npm audit --omit=dev` high/critical 为 0，或每项具备批准的不可利用说明。
6. 用两个组织、两个账号和一个真实私有应用完成隔离、撤销、重试、部分失败和断点恢复演练。

## 10. 审查限制

- 本轮没有对 Amazon 线上页面做实时采集，也没有接入真实 SP-API/LWA 凭据。
- 没有进行完整渗透测试、SAST/DAST、容器镜像或操作系统级漏洞扫描。
- `npm audit` 只反映 npm 当前公告与解析到的依赖树，不能代替调用路径审查。
- 路由/OpenAPI 数量来自静态 method/path 比对；动态生成路由若未来出现，需要纳入更强的运行时枚举或契约测试。
- 本文是代码与产品审查结论，不代表已实施任何修复。
