# PRD v0.7：只读真实数据底座

## 1. 文档信息

| 项目 | 内容 |
| --- | --- |
| 产品 | Amazon 关键词竞品价格与排名监控系统 |
| 目标版本 | v0.7 |
| PRD 状态 | Proposed — 可进入技术设计与任务拆分 |
| 基线版本 | v0.6.1 / `fbf3d84b2442c193ecab7c13457fdb3bddaaa6c5` |
| 日期 | 2026-07-28 |
| 产品定位 | 自有团队使用的 Amazon SP-API 私有应用只读真实数据底座 |
| 首批数据域 | Sales & Traffic 日报、FBA Inventory |
| 配套审查 | `docs/CODE_AUDIT_2026-07-28.md` |

## 2. 一句话定义

v0.7 将现有以页面采集、CSV/XLSX 和手工数据为主的运营工作台，升级为能够安全连接自有 Amazon 店铺、持续同步销售流量与 FBA 库存、按来源和运行追溯事实，并将真实数据送入现有概览、Owned SKU、freshness、Agent 和报告链路的只读底座。

本版本不执行 Amazon 写操作，不接触 Orders PII/RDT，不把系统改造成公共应用或 SaaS。

## 3. 背景与问题

v0.6.1 已具备以下可复用基础：

- `commerce_stores`、`data_source_configs`、`data_source_sync_runs`、组织和用户模型。
- `amazon_sp_api` 与 `amazon_ads_api` 数据源类型占位。
- 产品日指标中的销售额、订单、销量、Sessions、Page Views、Buy Box 和转化率字段。
- CSV/XLSX 产品、Ads、成本、库存导入。
- 概览、Owned SKU、库存、利润、Listing、Ads、Agent、事件、任务和报告消费面。
- Playwright 采集、Worker、队列、freshness 与失败原因展示。

当前缺口是：

1. `amazon_sp_api` 只有类型占位，没有凭据、连接测试和同步实现。
2. 销售与库存事实缺少独立来源、运行、状态和 freshness，混合来源可能相互覆盖。
3. 产品身份主要依赖现有 SKU/ASIN 数据，没有面向外部 API 冲突的映射问题队列。
4. 真实凭据接入前仍有缓存租户边界、session、CSP、依赖、Worker 和测试门禁问题。

## 4. 产品目标

### 4.1 P0 目标

1. 管理员可以把一个 Amazon SP-API 私有应用授权连接到现有 `commerce_store`。
2. 系统每日获取 D-1 Sales & Traffic，并滚动重拉最近 3 个业务日。
3. 系统每 30 分钟获取 FBA Inventory，并每日完成一次全量对账。
4. 同一数据批次重复执行不产生重复事实；部分站点失败不覆盖上一份成功数据。
5. 每条销售和库存事实都能追溯到组织、店铺、站点、数据源、同步运行和同步时间。
6. 未知 SKU、ASIN 冲突和歧义映射进入问题队列，不静默修改商品身份。
7. D-1 销售流量进入现有概览和 Owned SKU；健康连接的库存延迟不超过 60 分钟。
8. 所有连接与同步操作满足多租户隔离、凭据保密、细粒度权限和审计要求。

### 4.2 成功指标

| 指标 | v0.7 验收目标 |
| --- | --- |
| 真实店铺接入 | 至少 1 个自有店铺完成生产连接 |
| 销售数据可用性 | D-1 数据在站点业务日结束后的计划窗口内进入概览和 Owned SKU |
| 库存新鲜度 | API 健康时，最新成功库存不超过 60 分钟 |
| 重复事实 | 相同 run/batch 重试导致的重复事实为 0 |
| 租户越权 | 跨组织连接、事实、run 和映射问题访问成功数为 0 |
| 凭据泄漏 | 数据库明文、API 响应、应用日志和审计日志中的 LWA secret/token 为 0 |
| 可追溯性 | 销售与库存事实具备 source id 和 run id 的比例为 100% |
| 门禁 | `npm test`、`npm run test:browser`、`npm run build` 全部通过 |

## 5. 非目标

以下内容明确不属于 v0.7：

- Orders API、订单 PII、Restricted Data Token（RDT）。
- Listing、价格、促销、库存或广告的任何写操作。
- 公共应用 OAuth 授权、第三方卖家自助安装。
- Amazon Ads API。
- Finances API、结算和财务对账。
- ERP/WMS 接入。
- 外部 LLM 替换现有确定性 Agent。
- Postgres、云队列、微服务或 SaaS 多租户改造。
- 多平台接入，例如 Walmart、eBay、Shopify。
- 自动汇率换算和跨币种聚合。

## 6. 用户与权限

| 用户 | 需求 | 权限 |
| --- | --- | --- |
| 管理员 | 配置私有应用凭据、关联店铺、测试、解除连接、处理映射 | `manage_data_sources` |
| 经理/运营 | 手动同步、查看运行、处理日常失败 | `manage_collection`；映射最终确认仍需 `manage_data_sources` |
| Viewer/Developer | 查看健康状态、事实来源和运行历史 | 组织内只读；不得看到任何凭据材料 |
| Worker service identity | 换取 LWA token、调用只读 API、写同步事实 | 仅服务端；绑定组织、数据源、run 和 lease |

授权规则：

1. 凭据写入、替换、解除连接和映射确认要求 `manage_data_sources`。
2. 手动同步要求 `manage_collection`。
3. 任何资源先做组织范围解析；跨组织 ID 返回 404，已定位到本组织但缺 capability 返回 403。
4. Worker 重启属于运维动作，不默认等同于普通手动同步，应由单独的高权限策略控制。
5. 前端显隐只改善体验，后端必须独立执行同一 capability 契约。

## 7. 生产连接器 P0 前置门禁

生产功能开关 `SP_API_CONNECTOR_ENABLED` 默认必须为 `false`。以下门禁全部有自动化证据并签字后，才允许在生产环境设为 `true`：

| Gate | 要求 | 放行证据 |
| --- | --- | --- |
| G-01 租户安全缓存 | 请求、inflight、视图和领域 Store 与 session/org 绑定；账号切换统一清理 | 双组织浏览器回归；旧请求不能写入新会话 |
| G-02 HttpOnly-only session | Session token 不进入浏览器可读存储或响应体 | 存储扫描、Cookie 属性测试、登录/下载回归 |
| G-03 CSP | Web 与 Tauri 使用有效 CSP；生产不依赖任意外部脚本 | 响应头测试、Tauri 配置测试、CSP violation 回归 |
| G-04 依赖漏洞 | 生产依赖 high/critical 为 0，或有逐项批准的不可利用说明 | `npm audit --omit=dev` 和审批记录 |
| G-05 采集权限 | 后端 `manage_collection` 与前端/角色矩阵一致 | 角色矩阵参数化 API 测试 |
| G-06 Worker 生命周期 | 有 lease、续租、SIGTERM/SIGINT drain、旧 lease 写入保护 | 双 Worker、超时、终止、重启测试 |
| G-07 浏览器门禁 | `npm run test:browser` 能发现并执行既有 21 个用例 | CI 通过日志和故障注入 |
| G-08 API 契约 | Express 与 OpenAPI 双向比对通过 | 差集为 0 或只有批准 allowlist |

门禁未完成时允许 fixture 和 Amazon sandbox 开发，但禁止保存真实 refresh token。

## 8. 支持范围

### 8.1 首批站点

| 站点 | SP-API Region | 版本范围 |
| --- | --- | --- |
| US | NA | v0.7 |
| UK | EU | v0.7 |
| DE | EU | v0.7 |
| JP | FE | v0.7 |

一个 `amazon_sp_api` data source 表示一个 Region 授权连接，可关联同组织、同 seller、同 Region 的 1..N 个既有 `commerce_store`。跨 Region 必须建立不同连接。因此 US、UK+DE、JP 通常对应三个连接；每个事实仍以具体 commerce store 和 marketplace 归属。

### 8.2 Sales & Traffic

来源为 Reports API 的 `GET_SALES_AND_TRAFFIC_REPORT`，规范化字段至少包含：

| 字段 | 含义 | 规则 |
| --- | --- | --- |
| `businessDate` | 业务日期 | 按 marketplace 的 IANA 时区归属，不使用服务器本地时区 |
| `orderedSalesAmount` | 销售额 | 与 `currencyCode` 成对保存 |
| `currencyCode` | ISO 4217 币种 | 必填；不同币种禁止直接聚合 |
| `orders` | 订单/订单项口径 | 固定采用报告字段并在共享定义中写明，不与 Units 混用 |
| `unitsSold` | 销量 | 非负整数 |
| `sessions` | Sessions | 使用总计口径 |
| `pageViews` | Page Views | 使用总计口径 |
| `buyBoxPercentage` | Buy Box 百分比 | 统一保存为 0..100 percentage points |
| `conversionRate` | 转化率 | 优先采用报告的 unit-session 指标；如派生必须保存公式版本 |
| `sourceAsin` | 报告 ASIN | 原样保留，用于映射和校验 |
| `sellerSku` | 系统规范 SKU | 映射成功后写入；不可从 ASIN 静默猜测 |

同时保留两种粒度：

- `STORE_DAILY`：站点/店铺每日总计，用于概览。
- `SKU_DAILY`：映射到 seller SKU 的每日事实，用于 Owned SKU。

Sales & Traffic 的 ASIN 粒度数据若不直接提供 seller SKU，必须先在同一 `store + marketplace` 内通过现有 Owned Product 或显式 mapping 解析；无法唯一解析时进入问题队列。

### 8.3 FBA Inventory

规范化字段至少包含：

| 字段 | 含义 | 规则 |
| --- | --- | --- |
| `sellerSku` | 卖家 SKU | 主映射键组成部分 |
| `sourceAsin` | Amazon ASIN | 校验键和原始证据 |
| `fulfillableQuantity` | 可售 | 非负整数 |
| `reservedQuantity` | 预留 | 保存 Amazon 总预留量 |
| `inboundWorkingQuantity` | 在途-处理中 | 原始分量 |
| `inboundShippedQuantity` | 在途-已发货 | 原始分量 |
| `inboundReceivingQuantity` | 在途-接收中 | 原始分量 |
| `inboundQuantity` | 在途总量 | 上述三个分量之和，保留计算版本 |
| `unfulfillableQuantity` | 不可售 | 保存 Amazon 总不可售量 |
| `totalQuantity` | 总库存 | 优先保存来源总量，并与分量合计做质量校验 |
| `sourceUpdatedAt` | 来源更新时间 | 采用 API 返回时间；缺失时明确标记 |
| `syncedAt` | 本系统同步时间 | UTC 时间戳 |

库存保留“最新状态”和“运行快照”：

- 最新状态服务概览、Owned SKU 和 freshness。
- 运行快照用于审计、趋势和全量对账。
- lead time、安全库存、在途计划等人工设置继续留在设置域，不得被 API 数量覆盖。

## 9. 用户流程

### 9.1 建立连接

1. 管理员在数据源中心新建或选择 `sourceType = amazon_sp_api` 的 data source。
2. 选择 1..N 个同组织、同 seller、同 Region 的现有 `commerce_store`。
3. 选择 `NA | EU | FE`，系统校验 marketplace 与 Region 的固定映射。
4. 输入私有应用 LWA：
   - Client ID
   - Client Secret
   - Refresh Token
5. 服务端校验格式后加密保存；界面关闭后不再回显。
6. 管理员执行“测试连接”。
7. 系统分别验证 LWA、Reports/Sales & Traffic 权限、FBA Inventory 权限和 marketplace 归属。
8. 全部通过则状态为 connected；某一数据域失败则状态为 attention，并展示脱敏错误。
9. 管理员可立即执行首次同步，或等待计划任务。

### 9.2 日常使用

- 数据源卡片展示整体状态、Region、已关联店铺、凭据是否已配置、最后测试时间。
- 每个数据域单独展示最后尝试、最后成功、最新业务日期/库存时间、延迟和错误原因。
- “手动同步”可选 Sales & Traffic、FBA Inventory 或两者。
- Sales & Traffic 可选择最多 90 日回补；FBA 手动执行增量或全量对账。
- 运行历史复用 `/api/data-sources/:id/runs`。
- 映射问题显示在独立队列，修复后可重放受影响 run 或日期窗口。

### 9.3 解除连接

解除连接复用现有 `PATCH /api/data-sources/:id`，以明确的 `disconnectSpApi: true` 意图执行：

1. 停止新计划任务并取消尚未领取的同步任务。
2. 对运行中任务发出取消信号，按 Worker drain 协议结束。
3. 删除数据库中的加密凭据载荷并清空 access-token cache。
4. 将 data source 状态改为 disabled/not_connected。
5. 保留历史事实、运行记录、映射审计和“何时由谁解除”的审计记录。
6. 重新连接必须重新写入完整凭据，旧凭据不能恢复或回显。

## 10. 凭据与安全设计

### 10.1 保存规则

- 主密钥只来自部署环境或 secret manager，例如 `DATA_SOURCE_CREDENTIALS_KEY`，禁止写入 SQLite、前端配置、Git 或日志。
- 数据库只保存经过认证加密的 payload，推荐 AES-256-GCM，并保存 `keyVersion`、IV、auth tag 和 ciphertext。
- 加密 payload 至少包含 client secret 和 refresh token；为简化边界，client id 也可一并加密。
- API 仅提供写入/替换，不提供读取密钥端点。
- 写入成功只返回 `credentialsConfigured`、`updatedAt`、`keyVersion` 等非敏感元数据。
- 密钥轮换采用“新 key 写入 + 旧 key 只读解密窗口 + 后台重加密 + 旧 key 下线”，并有失败回滚。

### 10.2 LWA access token

- access token 仅在服务端内存缓存，不持久化到数据库。
- cache key 至少包含 data source id、credential version 和 Region。
- 使用 `expires_in - safetySkew` 作为实际过期时间；到期前刷新。
- 同一连接并发刷新使用 singleflight，避免 refresh storm。
- 收到认证失败时只允许清缓存并刷新一次；再次失败转为 attention，不无限重试。
- 解除连接、凭据替换和进程退出必须清空对应 cache。

### 10.3 日志与审计

禁止写入：

- Client secret、refresh token、access token。
- Authorization header、完整请求 body 中的凭据。
- Amazon 返回中可能包含的敏感 header。
- 主密钥、IV/tag/ciphertext 的完整组合。

允许写入：

- org id、data source id、commerce store id、marketplace、domain、run id。
- request id、HTTP status、Amazon error code、重试次数和脱敏错误。
- 凭据版本、配置时间、操作者，不含凭据值。

日志使用结构化 redaction；错误对象在进入日志和审计表前统一清洗。

### 10.4 Web 安全

- Session 必须是 HttpOnly-only。
- Cookie 写操作同时使用严格 CORS/Origin 校验和 CSRF 防护。
- Web/Tauri CSP 必须限制脚本、连接、图片和样式来源。
- SP-API 凭据永不进入前端 Store、浏览器缓存或错误追踪平台。

## 11. 同步规则

### 11.1 Sales & Traffic 日报

1. 每个 marketplace 按其业务时区同步 D-1。
2. 每次计划同步同时重拉 D-1、D-2、D-3，处理 Amazon 后续修订。
3. 手工回补日期范围最多 90 个自然日；超过范围返回 400。
4. v0.7 由本系统计划任务发起 Reports API 请求，不依赖 Amazon 原生 report schedule。
5. 报告生成采用异步状态机：request → poll → document → parse → validate → stage → promote。
6. 轮询必须有总 deadline；处理中不计为失败，不进行高频忙轮询。
7. 同一 source/domain/date window 只允许一个 active run；重复触发合并或返回已有 run。
8. 报告数据修订时更新同一业务事实，写入新的 run id、source report id 和 revision/content hash。

### 11.2 FBA Inventory

1. 通过 FBA Inventory `getInventorySummaries` 每 30 分钟执行增量同步。
2. 每个 marketplace 每日执行一次全量对账。
3. 首次请求保存不可变的 `startDateTime`。
4. 每页 checkpoint 同时保存原始 `startDateTime` 与新 `nextToken`；后续分页不得丢弃 `startDateTime`。
5. 断点恢复复用同一 run id、sync window 和 idempotency key，从最后成功 checkpoint 继续。
6. 全量对账只在该 marketplace 所有页验证成功后原子提升为最新版本。
7. API 未返回某 SKU 时，不得在未完成全量对账的情况下把上一成功库存静默置零。

### 11.3 失败、限流与重试

| 情况 | 行为 |
| --- | --- |
| 429 | 优先遵守 `Retry-After`；否则指数退避 + jitter |
| 500/502/503/504 | 指数退避 + jitter，在 run deadline 和最大次数内重试 |
| 网络超时/连接重置 | 可重试；保留 checkpoint |
| LWA access token 过期 | 清 cache 后刷新一次 |
| refresh token 撤销/invalid_grant | 不重试；连接进入 attention/revoked |
| 400 | 归类为配置或请求错误；不自动重试 |
| 403 | 归类为权限/角色缺失；不自动重试 |
| 报告无数据 | 根据 Amazon 状态标记 empty-success 或 failed，不能伪造零值 |
| 解析/Schema 错误 | 原始文档元数据留审计，事实不 promote；错误进入 run |

限流必须同时存在三个维度：

- 组织：避免一个组织耗尽进程资源。
- 店铺/连接：避免同一 seller 并发刷新和请求风暴。
- 数据域：Reports 与 FBA Inventory 分别受控。

实际速率不写死为 Amazon 的某个固定值；运行时读取响应和配额信息，并允许部署配置更保守的上限。

### 11.4 事务与部分成功

- 同一 domain + marketplace 的 stage、校验和 promote 在数据库事务中完成。
- 一个 marketplace 失败不回滚其他已成功 marketplace。
- 失败 marketplace 保留上一成功版本及其 `lastSuccessAt`，同时更新 `lastAttemptAt` 和明确错误。
- 整体 run 状态：
  - 全部成功：`success`
  - 至少一个成功且至少一个失败：`partial`
  - 全部失败：`failed`
- freshness 和 Agent 安全策略按 domain + marketplace 判断，不能只看 data source 的单一状态。

## 12. 幂等与一致性

### 12.1 Run 幂等

所有手动和计划同步先生成稳定的 `idempotencyKey`：

- Sales & Traffic：`source + domain + marketplace + dateWindow + triggerWindow`
- FBA 增量：`source + domain + marketplace + 30minWindow`
- FBA 全量：`source + domain + marketplace + businessDate + full`

同一 key 的重复请求返回原 run，不创建并行 run。

### 12.2 事实幂等

- Sales 当前事实唯一键：
  - 店铺汇总：`store + marketplace + businessDate + scope`
  - SKU：`store + marketplace + sellerSku + businessDate`
- Inventory 运行快照唯一键：`run + marketplace + sellerSku`。
- Inventory latest 唯一键：`store + marketplace + sellerSku`。
- 每一行还保存 source document/request id 或 checkpoint、run id 和 content hash。
- 重试同一 run 使用 upsert；新 run 的真实新观察可以形成新快照。

### 12.3 Stage/Promote

1. 外部响应先进入 run-scoped staging。
2. 完成 Schema、数量、币种、时间、映射和行数质量校验。
3. 校验失败则丢弃 staging 的事实提升资格，但保留 run/error 元数据。
4. 校验成功后按 domain + marketplace 事务化 promote。
5. promote 完成后再更新 domain health 和 data source 汇总状态。

这样可避免下载了一半、解析了一半或某一页失败时覆盖上一成功版本。

## 13. 商品映射与问题队列

### 13.1 身份规则

规范商品身份以：

`commerceStoreId + marketplace + sellerSku`

为主键，ASIN 为校验键和来源证据。

规则：

1. FBA 行携带 seller SKU 时直接按主键查找，再用 ASIN 校验。
2. Sales & Traffic ASIN 行必须在同一 store + marketplace 内解析到唯一 seller SKU。
3. 同一 seller SKU 出现不同 ASIN，标记 `asin_conflict`。
4. 一个 ASIN 对应多个本店 seller SKU 时，不自动选取，标记 `ambiguous_asin`。
5. 未知 seller SKU 标记 `unknown_sku`。
6. 未知 ASIN 标记 `unknown_asin`。
7. 不允许跨 store 或跨 marketplace 自动复用映射。

### 13.2 `DataSourceMappingIssue`

问题至少包含：

- `id`
- `orgId`
- `dataSourceId`
- `commerceStoreId`
- `marketplace`
- `domain`
- `issueType`
- `sellerSku`
- `sourceAsin`
- `candidateProductIds`
- `status`
- `firstSeenRunId`
- `lastSeenRunId`
- `occurrenceCount`
- `resolution`
- `resolvedById`
- `resolvedAt`
- `createdAt`
- `updatedAt`

处理动作：

- 关联到现有 Owned Product。
- 更正该连接下的显式 seller SKU ↔ product 映射。
- 标记忽略并填写原因。
- 重新打开。

v0.7 不自动创建 Owned Product，也不根据 ASIN 静默改写 seller SKU。

## 14. 数据来源与权威性

### 14.1 分域来源

销售流量和库存必须分别保存：

- data source id
- sync domain
- run id
- marketplace
- source observed/business time
- synced time
- sync status
- error/revision

禁止用一个通用 `data_source` 字段代表一整行中不同来源的数据。

### 14.2 来源优先级

| 数据域 | 默认权威来源 | 其他来源行为 |
| --- | --- | --- |
| Sales & Traffic 负责字段 | 新鲜且成功的 SP-API | CSV/手工可以补历史或空值；不得无提示覆盖更新鲜 API 事实 |
| FBA 实时数量 | 新鲜且成功的 SP-API | CSV/手工只能在连接未启用或显式 override 时写入，并留审计 |
| 库存策略参数 | 人工/ERP 设置 | 不由 SP-API 数量覆盖 |
| 公共 Listing/竞品信号 | Playwright/公开页面采集 | 不与店铺销售或 FBA 数量混为同一来源 |

显式 override 必须记录：

- 覆盖前来源、值和时间。
- 覆盖后来源、值和时间。
- 操作者、原因、影响日期范围。
- 是否允许下一次 SP-API 成功同步恢复默认权威。

### 14.3 多币种

- 每条金额事实必须包含 `currencyCode`。
- UK、DE、US、JP 的金额默认分开聚合和展示。
- 不配置汇率时，不展示跨币种“总销售额”。
- 未来若增加汇率，原币金额、汇率来源、汇率日期和换算金额必须同时保留；不属于 v0.7。

### 14.4 业务日期与时区

- marketplace registry 必须为每个站点配置明确 IANA 时区。
- 日期归属、D-1 计算、计划任务和日报使用站点时区。
- 数据库存储 UTC 时间戳，同时保存 `businessDate`。
- DST 站点用 IANA 规则计算，不使用固定 UTC offset。
- 同一 UTC 时间在不同站点可以属于不同业务日期，这是预期行为。

## 15. 建议数据模型

最终表名可在技术设计中调整，但职责不得合并回一个通用来源字段。

| 模型 | 职责 | 关键约束 |
| --- | --- | --- |
| `sp_api_connections` | data source 的 Region、加密凭据、credential version | `data_source_id` 唯一；所有响应排除 encrypted payload |
| `sp_api_connection_stores` | 一个 Region 连接关联多个 commerce store | 同 org、同 seller、Region 匹配；连接+store 唯一 |
| `data_source_domain_health` | 按 source/store/marketplace/domain 保存健康状态 | 独立 lastAttempt/lastSuccess/freshness/error |
| `sp_api_sales_traffic_daily` | STORE_DAILY 与 SKU_DAILY 当前事实 | 业务键唯一；source/run/currency 必填 |
| `sp_api_inventory_snapshots` | 每次成功 run 的库存观察 | `run_id + marketplace + seller_sku` 唯一 |
| `sp_api_inventory_latest` | 当前可消费库存 | `store + marketplace + seller_sku` 唯一 |
| `data_source_mapping_issues` | 未知、冲突和歧义映射 | 同一 open issue 可累计 occurrence |
| `data_source_sync_runs` 扩展/伴随详情表 | domain、trigger、window、checkpoint、外部 request/report id | idempotency key 唯一；组织和 source 外键 |

所有新表必须含 `org_id`，即使可通过父表推导，也保留数据库级隔离和查询约束；外键、唯一索引和常用查询索引随迁移一起交付。

## 16. API 契约

所有端点：

- 使用现有 session/组织上下文。
- 对 ID 做 `validateIdParam`。
- 对 body/query 用 Zod。
- 使用 `asyncHandler`。
- 固定路径放在参数路径前。
- 进入 OpenAPI，并通过路由双向比对。
- 响应不得包含 client secret、refresh token、access token、encrypted payload、IV 或 auth tag。

### 16.1 保存/替换凭据

`POST /api/data-sources/:id/sp-api/credentials`

权限：`manage_data_sources`

请求示意：

```json
{
  "region": "EU",
  "commerceStoreIds": [2, 3],
  "lwaClientId": "amzn1.application-oa2-client...",
  "lwaClientSecret": "***",
  "lwaRefreshToken": "Atzr|..."
}
```

行为：

- 校验 source type、组织、seller、Region 与 marketplace。
- 加密后原子替换 credential version。
- 清除旧 access-token cache。
- 不自动把“保存成功”当作“连接可用”。

响应：`204 No Content`，或只返回无敏感字段的配置元数据。

### 16.2 测试连接

`POST /api/data-sources/:id/test-connection`

权限：`manage_data_sources`

行为：

- 创建 `sp_api_connection_test` run。
- 验证 LWA 换 token。
- 分别验证 Reports/Sales & Traffic 与 FBA Inventory 权限。
- 验证配置站点属于授权 seller/Region。
- 不 promote 业务事实。

响应：`202 Accepted`

```json
{
  "runId": 123,
  "status": "pending"
}
```

### 16.3 触发同步

`POST /api/data-sources/:id/sync`

权限：`manage_collection`

请求示意：

```json
{
  "domains": ["sales_traffic", "fba_inventory"],
  "mode": "incremental",
  "marketplaces": ["UK", "DE"],
  "fromDate": "2026-07-25",
  "toDate": "2026-07-27"
}
```

规则：

- Sales 回补最多 90 日。
- `mode = full` 对 FBA 表示全量对账。
- 重复 idempotency key 返回已有 run。
- 异步入队，响应不等待报告生成。

响应：`202 Accepted`

### 16.4 获取健康状态

`GET /api/data-sources/:id/health`

返回整体与 domain/store/marketplace 级健康状态，包括：

- credentialsConfigured
- region
- linked stores
- last connection test
- last attempt / last success
- latest business date / inventory source time
- lag minutes
- current run
- sanitized error code/message
- mapping issue count

### 16.5 获取映射问题

`GET /api/data-sources/:id/mapping-issues`

查询参数：

- `status`
- `domain`
- `marketplace`
- `issueType`
- `limit`
- `offset`

必须使用项目统一分页 clamp。

### 16.6 处理映射问题

`PATCH /api/data-sources/:id/mapping-issues/:issueId`

权限：`manage_data_sources`

请求示意：

```json
{
  "status": "resolved",
  "productId": 42,
  "note": "Confirmed against Seller Central"
}
```

行为：

- 校验 source、issue、product、store 均属于当前组织。
- 保存解析人和时间。
- 可选择重新入队受影响 run/date window。
- 不静默改写其他 marketplace 的映射。

### 16.7 运行历史

复用：

`GET /api/data-sources/:id/runs`

增加或返回：

- domain
- trigger
- mode
- marketplace results
- requested window
- checkpoint summary
- external request/report id
- retry count
- total/imported/failed/unmapped rows
- initiated by
- started/finished
- failure category

历史响应不包含原始凭据或 access token。

## 17. Shared 类型

`packages/shared` 至少增加以下类型，并由 API 与 Web 共用：

```ts
export type SpApiRegion = "NA" | "EU" | "FE";

export type SpApiSyncDomain =
  | "sales_traffic"
  | "fba_inventory";

export type SpApiConnectionHealthStatus =
  | "not_configured"
  | "testing"
  | "healthy"
  | "degraded"
  | "attention"
  | "revoked"
  | "disabled";

export interface SpApiConnectionHealth {
  dataSourceId: number;
  region: SpApiRegion | null;
  credentialsConfigured: boolean;
  status: SpApiConnectionHealthStatus;
  linkedStoreIds: number[];
  lastTestedAt: string | null;
  domains: Array<{
    domain: SpApiSyncDomain;
    commerceStoreId: number;
    marketplace: string;
    status: "pending" | "success" | "partial" | "failed" | "stale";
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    sourceTime: string | null;
    lagMinutes: number | null;
    errorCode: string | null;
    errorMessage: string | null;
  }>;
}

export interface DataSourceMappingIssue {
  id: number;
  orgId: number;
  dataSourceId: number;
  commerceStoreId: number;
  marketplace: string;
  domain: SpApiSyncDomain;
  issueType: "unknown_sku" | "unknown_asin" | "asin_conflict" | "ambiguous_asin";
  sellerSku: string | null;
  sourceAsin: string | null;
  status: "open" | "resolved" | "ignored";
  firstSeenRunId: number;
  lastSeenRunId: number;
  occurrenceCount: number;
  resolvedProductId: number | null;
  resolutionNote: string | null;
  resolvedById: number | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

`DataSourceSyncOperation` 至少增加：

- `sp_api_connection_test`
- `sp_api_sales_traffic_daily_sync`
- `sp_api_sales_traffic_backfill`
- `sp_api_fba_inventory_incremental_sync`
- `sp_api_fba_inventory_full_reconcile`

类型和 OpenAPI schema 中禁止出现 secret/token 字段。

## 18. Worker 与任务执行

v0.7 复用现有 Worker 进程和运行历史，不另建微服务，但必须先完成 lease 门禁。

执行模型：

1. API 创建 sync run 和稳定 idempotency key。
2. 队列只保存 run id、job kind 和非敏感调度参数，不保存凭据。
3. Worker 领取 lease 后，从加密 credential store 按需解密。
4. 长任务定期续租并保存 checkpoint。
5. 每次分页、报告轮询和事实 promote 前检查 abort signal 与 lease token。
6. 完成后更新 run、domain health 和 data source 汇总状态。
7. shutdown 时停止领取、停止 reaper、取消可中断 I/O，并有界等待 active jobs。

必须防止：

- stale reaper 回收后旧 runner 继续 promote。
- 同一 run 被两个 Worker 同时执行。
- Worker 重启把上一成功数据标成失败数据。
- 连接解除后排队任务仍换取 token。

## 19. Freshness 与 Agent 安全策略

### 19.1 Freshness

| 数据域 | Healthy | Attention |
| --- | --- | --- |
| Sales & Traffic | 已有期望的最新完整业务日，且最近同步成功 | D-1 超过计划宽限仍缺失、partial、映射阻断或连续失败 |
| FBA Inventory | 最新成功数据不超过 60 分钟 | 超过 60 分钟、partial、全量对账失败或连接不可用 |

每个 marketplace 独立判断。整体连接健康不能掩盖单一站点失败。

### 19.2 Agent

- Agent 输入必须同时携带 sales freshness 与 inventory freshness。
- 使用依赖域失败时，建议显示明确原因和最后成功时间。
- stale/partial/映射未解决的数据不得支撑高置信度库存或销售动作。
- 失败不转换成零销售或零库存。
- v0.7 继续使用现有确定性 Agent，不引入外部 LLM 替换。

## 20. 前端要求

数据源中心新增：

1. SP-API 连接向导。
2. Region 与 commerce store 关联校验。
3. 只写凭据表单；保存后所有 secret 输入清空且不回显。
4. 分域连接测试结果。
5. 手动同步和 90 日内回补。
6. Sales/FBA 独立健康卡和 freshness。
7. 完整 run 列表、marketplace 结果、失败分类和重试入口。
8. 映射问题队列和解析抽屉。
9. 解除连接的二次确认。

概览与 Owned SKU：

- 明确区分“来源：SP-API / CSV / Manual / Crawler”。
- 销售和库存分别显示来源与最后成功时间。
- 多币种分开展示。
- stale/partial 状态可见，不用旧数据伪装成当前数据。
- 映射未完成的行不进入 SKU 合计，但在数据质量提示中显示数量。

所有 session/org 切换必须清空视图和请求缓存；新会话首屏必须重新请求。

## 21. 可观测性

### 21.1 结构化指标

- connection test success/failure
- LWA refresh success/failure
- sync runs by domain/status
- request latency and status by SP-API operation
- 429/5xx/retry count
- report generation latency
- rows staged/promoted/rejected/unmapped
- inventory lag minutes
- latest sales business date lag
- open mapping issues
- lease lost/recovered jobs

标签不得包含 token、client secret 或高基数原始错误。

### 21.2 失败分类

统一错误分类：

- `credentials_invalid`
- `credentials_revoked`
- `permission_missing`
- `marketplace_mismatch`
- `rate_limited`
- `amazon_5xx`
- `network_timeout`
- `report_cancelled`
- `report_fatal`
- `document_download_failed`
- `schema_invalid`
- `mapping_blocked`
- `lease_lost`
- `database_failed`
- `unknown`

UI、日志、run 和 Agent 使用同一分类，不只保存自由文本。

### 21.3 告警

- refresh token 撤销：立即 attention。
- Sales D-1 超过宽限仍缺失：告警。
- Inventory 超过 60 分钟：告警。
- 连续 429/5xx：按 source/domain 合并告警，避免风暴。
- daily full reconcile 失败：告警但保留 latest。
- mapping issue 数量持续增长：数据质量告警。

## 22. 测试与验收

### 22.1 安全

- 数据库、日志、错误响应、审计日志中无明文凭据。
- API 任何响应均不含 refresh/access token、client secret 或 ciphertext 组合。
- 账号切换后请求缓存、inflight、视图缓存和用户态 Store 全部失效。
- 跨组织访问连接、同步、运行记录、健康和映射问题返回 404/403。
- 凭据替换和解除连接会清 access-token cache。
- CSP 与 CSRF/Origin 测试通过。

### 22.2 LWA 与连接

- access token cache 命中、提前过期和 singleflight。
- access token 401 后仅刷新一次。
- refresh token 撤销/invalid_grant。
- 凭据替换的版本隔离。
- NA/EU/FE Region 与站点校验。
- Reports 权限缺失与 FBA 权限缺失分开呈现。
- Amazon sandbox 响应和可控 fixture 均有测试。

### 22.3 同步

- 429 尊重 `Retry-After`。
- 5xx、网络超时使用指数退避和 jitter。
- 报告 pending、done、cancelled、fatal、no-data。
- FBA 多页分页始终同时传递初始 `startDateTime` 与当前 `nextToken`。
- 分页中断后从 checkpoint 恢复。
- Worker lease 丢失后旧 runner 不能 promote。
- 同一同步窗口的并发触发只产生一个 active run。

### 22.4 数据

- 同一报表、run 或库存批次重复同步不新增重复事实。
- Sales D-1/D-2/D-3 重拉可更新 Amazon 修订值并保留新 run 追溯。
- 某 marketplace 失败时，上一成功数据和时间不变。
- 多币种不聚合。
- 业务日期按 marketplace 时区归属并覆盖 DST。
- 未知 SKU、ASIN 冲突、歧义映射全部进入问题队列。
- CSV/手工数据不得无提示覆盖更新鲜 SP-API 事实。
- sales freshness 与 inventory freshness 互不覆盖。

### 22.5 产品

- 一个真实店铺连接后，D-1 Sales & Traffic 自动进入现有概览和 Owned SKU。
- API 健康时库存数据不超过 60 分钟。
- 所有展示记录可追溯到 source 和 run。
- 解除连接后不再同步，历史事实和 run 仍可读。
- 映射修复后可重放受影响窗口，不产生重复事实。

### 22.6 发布门禁

以下代码门禁全部通过：

```bash
npm test
npm run test:browser
npm run build
```

附加门禁：

- `npm audit --omit=dev --audit-level=high` 达到 high/critical 为 0；如采用批准的不可利用例外，由 CI allowlist 逐项校验公告 id、到期日和审批状态。
- OpenAPI 与 Express 路由自动双向比对。
- 生产依赖 high/critical 为 0，或每项有批准的不可利用说明。
- 两组织、两账号、两个 data source 的隔离测试通过。
- sandbox、fixture 和至少一个真实私有店铺的 shadow run 通过。

## 23. 上线计划

### Stage 0：安全与工程门禁

- 完成 G-01 至 G-08。
- 保持 `SP_API_CONNECTOR_ENABLED=false`。

### Stage 1：模型与 fixture

- Schema、共享类型、加密凭据 store、run、mapping、health。
- 使用固定 fixture 完成 Sales/FBA 的解析、幂等、部分失败和时区测试。

### Stage 2：Amazon sandbox

- LWA、Reports、FBA dynamic sandbox。
- 验证 429/5xx、分页、撤销和 checkpoint。
- 仍不写真实生产事实。

### Stage 3：单店 shadow

- 选择一个自有店铺。
- 同步结果进入 shadow/staging，与 Seller Central 手工抽样对账。
- 不驱动 Agent 高置信度建议。
- 连续观察至少 7 个业务日。

### Stage 4：受控生产

- 开启一个 Region。
- 逐步扩展 US、UK、DE、JP。
- 每次扩展前确认币种、时区、映射和 freshness。
- 保持所有操作只读和人工执行边界。

### 回滚

- 关闭功能开关，停止新 sync 入队。
- drain/cancel 运行任务。
- 保留上一成功事实和运行历史。
- 必要时解除连接并删除加密凭据。
- 回滚不得把失败或空结果 promote 为最新数据。

## 24. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
| --- | --- | --- | --- |
| 凭据泄漏 | 低 | 极高 | 环境主密钥、认证加密、只写 API、redaction、HttpOnly/CSP |
| Amazon 限流或服务波动 | 中 | 高 | 三级限流、Retry-After、退避、checkpoint、保留上一成功 |
| 报告后续修订 | 高 | 中 | 每日滚动重拉 3 日、revision/run 追溯 |
| SKU/ASIN 身份冲突 | 中 | 高 | 主键规则、问题队列、禁止静默改写 |
| 多站点部分失败 | 中 | 高 | marketplace 独立事务与 health |
| Worker 重复执行 | 中 | 高 | lease token、续租、CAS、事实幂等 |
| SQLite 写竞争 | 中 | 中 | 单域短事务、stage/promote、限制并发；v0.7 不提前迁移 Postgres |
| 文档/API 漂移 | 中 | 中 | OpenAPI 双向 CI 比对 |
| 用户误以为系统会自动执行 | 中 | 高 | UI 明确“只读同步、人工执行”；写能力不在 v0.7 |

## 25. 路线图

### v0.8：更多只读经营证据

- Listings Issues / Listing 状态通知。
- Amazon Ads API 只读报表。
- 继续复用 v0.7 的连接健康、run、mapping、来源和 freshness 基础。

### v0.9：实验与归因

- 运营实验。
- 建议采纳与执行状态。
- 前后指标、观察窗、对照和结果归因。
- 建议级采纳率与复盘质量，而不只按 run 统计。

### v1.0：审批后半自动执行

- Ads/Listing 写操作预览。
- 双人审批。
- 幂等执行、审计和回滚。
- 失败补偿和权限分离。

公共 OAuth、第三方卖家安装、SaaS、计费、Postgres 和多平台另立 PRD，不自动纳入 v1.0。

## 26. 假设与外部依据

截至 2026-07-28，本 PRD 采用以下假设：

1. 首批支持现有 US、UK、DE、JP 店铺。
2. 应用是自有团队的 private app，采用 self-authorization；public app 才需要面向卖家的 OAuth 流程。参考 [Amazon SP-API Onboarding Overview](https://developer-docs.amazon.com/sp-api/docs/onboarding-overview)。
3. SP-API 使用 LWA access token；当前不再要求 AWS IAM credentials 或 SigV4。参考 [连接 Selling Partner API](https://developer-docs.amazon.com/sp-api/lang-zh_CN/docs/connecting-to-the-selling-partner-api) 和 [SP-API no longer requires AWS IAM or Signature Version 4](https://developer-docs.amazon.com/sp-api/changelog/sp-api-will-no-longer-require-aws-iam-or-aws-signature-version-4)。
4. Sales & Traffic 通过 Reports API 获取，官方支持请求或计划生成；本系统使用内部计划任务发起请求。参考 [Sales and Traffic Business Report](https://developer-docs.amazon.com/sp-api/lang-zh_CN/docs/report-type-values-analytics)。
5. FBA Inventory 提供库存摘要并支持 dynamic sandbox；分页恢复必须遵循 startDateTime 与 nextToken 的当前工作流。参考 [FBA Inventory API](https://developer-docs.amazon.com/sp-api/lang-it_IT/docs/fba-inventory-api) 和 [Inventory Summaries pagination workflow update](https://developer-docs.amazon.com/sp-api/changelog/update-to-workflow-for-retrieving-inventory-summaries-with-fba-inventory-api-v1)。
6. Amazon Ads API 有独立接入与审批要求，因此延期到 v0.8。参考 [Amazon Ads API](https://advertising.amazon.com/en-ca/about-api)。
7. 上述外部契约可能更新；进入实现和生产发布前必须再次核对官方文档、角色权限、report schema、sandbox 和限流响应，不把本 PRD 中的链接视为永久不变的 API 版本锁。

## 27. Definition of Done

v0.7 只有在以下条件全部满足时才算完成：

1. 所有 P0 前置门禁通过并有可重复证据。
2. 一个真实 private app 在至少一个店铺完成连接、测试、自动同步、手动同步、撤销和重连。
3. D-1 Sales & Traffic 与 60 分钟内 FBA Inventory 进入现有产品消费面。
4. 重试、分页、断点、部分失败、映射问题、时区和多币种验收全部通过。
5. 数据库、日志、响应和前端无明文凭据。
6. 跨组织访问测试全部拒绝。
7. 每条销售/库存事实都有 source id、run id 和独立 domain freshness。
8. OpenAPI 完整描述新接口，Express/OpenAPI 双向比对通过。
9. `npm test`、`npm run test:browser`、`npm run build` 通过。
10. 生产依赖 high/critical 为 0，或每项有批准且未过期的不可利用说明。
11. 功能开关、回滚手册、凭据轮换和解除连接流程完成演练。
