# SP-API 真实店铺 Shadow 对账验收单

> 状态：模板，不代表任何真实店铺已经通过验收。
>
> 目的：把 Stage 3 的单店 shadow 从“口头确认”收敛为可复核、可停止、可回滚的证据包。Shadow 期间只允许写入隔离的 shadow/staging 事实，不能驱动 Agent 高置信度建议或改变生产业务数据。

## 1. 使用边界

- [ ] 只选择经授权的自有店铺，并记录组织、店铺、区域、marketplace、业务时区。
- [ ] `SP_API_CONNECTOR_ENABLED=true` 只在专用 shadow 进程/环境中启用；关闭开关即可停止新的同步入队。
- [ ] 生产凭据只通过本地受保护配置注入；证据、日志、截图和导出文件不得包含 access token、refresh token、client secret、API key 或完整买家/收件人信息。
- [ ] 运行开始前完成数据库备份并记录备份文件校验值；任何修复先在 shadow 数据库重放。
- [ ] 每个同步域都保留 `sourceId`、`syncRunId`、`jobId`、页码/checkpoint 和原始报告引用，外部引用只记录 Seller Central 报告编号或哈希，不复制凭据。
- [ ] 业务日期按店铺配置的业务时区计算；不得用机器本地日期替代业务日期。

## 2. Preflight 记录

| 字段 | 实际值 | 通过条件 |
| --- | --- | --- |
| Evidence bundle ID |  | 唯一、不可复用 |
| 执行人 / 复核人 |  | 至少一名复核人 |
| 组织 ID |  | 与数据源、产品映射同组织 |
| Commerce store ID |  | 目标店铺唯一 |
| Marketplace / Region |  | 如 `US / NA` |
| Currency |  | 仅在同币种内求和 |
| Business timezone |  | 明确 IANA 时区 |
| Shadow DB / userData |  | 与生产库隔离 |
| Package / commit |  | 记录实际运行版本 |
| Connector flag |  | 仅 shadow 环境为 `true` |
| Backup path / SHA-256 |  | 可恢复、校验值匹配 |
| Window start / end |  | 连续 7 个业务日 |
| Initial successful run |  | 记录各域初始成功 run |

### Preflight 停止条件

- [ ] 找不到可恢复的备份、组织边界或业务时区。
- [ ] 发现 shadow 进程复用了生产数据库、生产 userData 或未隔离的队列。
- [ ] 发现日志/证据会输出任何凭据或未脱敏的买家/地址信息。
- [ ] 产品映射不完整，无法把 Seller Central 抽样行稳定映射到内部 SKU。

## 3. 七个业务日逐日证据

每一行对应一个业务日；不得以自然日、请求完成日或报告下载日替代 `businessDate`。金额按最小货币单位（fen/cents）保存和比较，展示值仅用于阅读。

| businessDate | Seller Central 外部引用 | Sales source/run | FBA source/run | 店铺销售额（最小单位） | SKU 销售额（最小单位） | orders / units | currency | FBA 最新时间 / freshness | 映射/缺失 | 状态 | 复核签名 |
| --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |

每日同时保存一份结构化 JSON/CSV，建议文件名：

```text
<evidenceBundleId>/<businessDate>/sales-summary.json
<evidenceBundleId>/<businessDate>/fba-summary.json
<evidenceBundleId>/<businessDate>/reconciliation.csv
```

最小 JSON 字段契约如下；`externalReference` 只能是报告编号、下载时间和哈希，不能是原始报告内容：

```json
{
  "evidenceBundleId": "shadow-2026-08-10-us-001",
  "businessDate": "2026-08-04",
  "businessTimezone": "America/Los_Angeles",
  "organizationId": "org-redacted",
  "commerceStoreId": "store-redacted",
  "marketplace": "US",
  "currency": "USD",
  "externalReference": {
    "reportId": "seller-report-redacted",
    "downloadedAt": "2026-08-05T08:00:00Z",
    "sha256": "redacted"
  },
  "sales": {
    "sourceId": "source-redacted",
    "syncRunId": "run-redacted",
    "storeDailyAmountMinor": 0,
    "skuAmountMinor": 0,
    "unmappedAmountMinor": 0,
    "orders": 0,
    "units": 0,
    "factRows": 0,
    "replayCreatedRecords": 0,
    "replayUpdatedRecords": 0
  },
  "fba": {
    "sourceId": "source-redacted",
    "syncRunId": "run-redacted",
    "snapshotRows": 0,
    "latestRows": 0,
    "asOfRows": 0,
    "freshnessMinutes": 0
  },
  "mappingIssues": [],
  "status": "pending"
}
```

证据 manifest v2 中，`snapshotRows` 是选定完成 run 的全部快照行，`asOfRows` 是其中在该日 `observedAt` 前已经写入的行；`latestRows` 仅表示采集时当前 `sp_api_inventory_latest` 视图，允许因后续同步而多于历史快照。这样历史业务日不会把当前库存数量误当成当日状态。

## 4. 对账规则

### 4.1 金额和币种

- [ ] `storeDailyAmountMinor` 与 Seller Central 同业务日期、同 marketplace、同币种金额逐笔对齐。
- [ ] `skuAmountMinor` 为纳入映射 SKU 的明细和；未映射金额必须单独列为差异，不能静默丢弃。
- [ ] 允许的舍入差异为 0 个最小单位；任何 1 个最小单位以上的差异都必须有可定位的订单/报告行证据。
- [ ] 不跨币种相加；Dashboard 的 currency、source/run 和 marketplace 必须一致。
- [ ] `STORE_DAILY` 存在时，Dashboard 以店铺事实为权威，不再把同日 SKU 销售额重复加到店铺总额。
- [ ] 没有店铺事实时才使用字段级有效 SKU 指标；手工/CSV override 必须有理由、操作者、前后值和对应 SP-API run。

### 4.2 运行、幂等和失败

- [ ] 重放同一 Sales 报告时 `createdRecords=0`，只允许既有事实被安全更新，且 source/run lineage 不丢失。
- [ ] 每个事实行都能回到唯一 `sourceId + syncRunId + businessDate + productId`；分页事实还要能回到 checkpoint/page。
- [ ] 部分失败不得 promote 空结果或失败 run；上一成功事实继续可读，并在 domain health 标记延迟/失败原因。
- [ ] `SP_API_CONNECTOR_ENABLED=false` 后不产生新的周期任务；已入队任务以 `connector_disabled` 终态收口。
- [ ] FBA 最新快照与逐页 checkpoint 一致；失败重试从最后成功页继续，不重复 promotion 已完成页；证据采集器必须看到 `completed=true`、无待处理 `nextToken` 且 `rowsSeen` 与快照行数一致。

### 4.3 Freshness 和映射

- [ ] FBA 库存 freshness 在约定阈值内（默认不超过 60 分钟；如业务另有约定须在 Preflight 写明）；计算优先使用事实的 `source_time`（SP-API `lastUpdatedTime`），不能只用本地 `synced_at` 证明上游新鲜。
- [ ] 任一 FBA 快照缺少或无法解析 `source_time` 都必须标为 `delayed`，不得用刚刚写入数据库的时间掩盖上游数据延迟。
- [ ] 7 日内每天都有 Sales/FBA 的明确状态：`pass`、`delayed`、`failed` 或 `not-applicable`，不得留空。
- [ ] 每个差异都有归类：时区、币种、报告延迟、映射缺失、API 失败、重复/幂等、金额不一致或未知。
- [ ] 未知差异不能标记为 `pass`，必须停止扩区并建立后续 action。

## 5. 收口、停止和回滚

### 通过条件

- [ ] 连续 7 个业务日全部有完整证据，且每日金额、订单、单位、币种、映射差异均通过复核。
- [ ] 无未解释的金额差异、跨组织读取、凭据泄漏或 source/run 断链。
- [ ] FBA freshness、checkpoint、失败保留上一成功事实的规则在至少一次真实失败/重试中得到证据。
- [ ] 产品负责人、数据负责人和发布负责人均签名；只有三方签名后才允许进入受控生产 Stage 4。

### 任一条件触发立即停止

- [ ] 发现生产库/生产队列被写入，或 shadow 数据进入 Agent 高置信度建议。
- [ ] 任何凭据、买家个人数据或未脱敏原始报告进入日志、审计或共享证据包。
- [ ] 出现无法解释的金额差异、跨币种聚合、组织越权或重复计数。
- [ ] 连续失败导致 freshness 超阈值，且上一成功事实没有被保留。

### 回滚动作

1. 将 `SP_API_CONNECTOR_ENABLED` 设为 `false`，停止新同步入队。
2. drain/cancel shadow 队列，保留失败 run、checkpoint 和错误分类。
3. 从最后一个成功备份恢复 shadow 数据库；不得删除原始证据和审计记录。
4. 核对生产数据库、Agent 建议和通知记录没有被 shadow 写入后，再解除连接或删除加密凭据。

## 6. 证据包检查

- [ ] `README`：目标范围、版本、时间窗、执行/复核人和已知限制。
- [ ] `preflight.json`：第 2 节字段及备份校验值。
- [ ] 每日 `sales-summary.json`、`fba-summary.json`、`reconciliation.csv`。
- [ ] `run-lineage.csv`：source、run、job、checkpoint、页码和终态。
- [ ] 脱敏后的关键日志、失败/重试截图和 Dashboard 导出。
- [ ] `checksums.txt`：证据文件 SHA-256；不包含任何 secret。
- [ ] `signoff.md`：三方签名、未决差异和 Stage 4 决策。

### 6.1 SQLite/WAL 运行观测

每次 shadow 日终或备份前，使用只读观测命令记录主库、WAL、SHM 和页级增长；命令默认不会执行 checkpoint，也不会读取业务行：

```bash
npm run inspect:db-storage -- <shadow-db-path> --require-wal --max-wal-mb=512 --max-total-mb=1024
```

应将输出中的 `observedAt`、`databaseBytes`、`walBytes`、`shmBytes`、`pageCount`、`freelistCount`、`journalMode` 和阈值结果保存到证据包；`observerBusyTimeoutMs` 只表示观测连接自身的等待配置，不代表已连接 API/Worker 的连接参数。`--checkpoint=passive` 只用于明确的观测窗口；`--checkpoint=truncate` 会截断 WAL sidecar，只能在 shadow 队列 drain、备份完成并由复核人批准后执行。任何 WAL/总容量阈值超限都必须先停同步、保留上一成功事实并完成备份，再决定是否继续。

## 7. 自动校验

开始真实 shadow 前，先对隔离数据库和连接边界运行只读 preflight；它不会执行 checkpoint、写业务表、读取/解密凭据或访问 Amazon：

```bash
npm run verify:sp-api-shadow-preflight -- <config.json> \
  --production-db=<production-db-path> \
  --backup=<verified-backup-path> \
  --user-data=<shadow-userData-path> \
  --production-user-data=<production-userData-path> \
  --runtime-db=<shadow-db-path> \
  --require-wal \
  --max-wal-mb=512 \
  --max-total-mb=1024
```

该门禁检查七日配置与外部引用、shadow 数据库路径不等于生产库、备份完整性和 SHA-256、shadow/production `userData` 不重叠、运行时 `DB_PATH` 确实指向 Shadow 库、`SP_API_CONNECTOR_ENABLED=true`、fixture 模式关闭、SQLite 为 WAL 且可读，并以 512 MiB WAL / 1 GiB 主库+WAL+SHM 默认上限检查存储容量；可用 `--max-freelist-ratio=N` 增加碎片率上限。实际阈值会写入 preflight 的 `storage.thresholds`，证据包 verifier 会拒绝缺少这些阈值的 preflight。它还检查目标组织、`amazon_sp_api` 数据源、Amazon 店铺、SP-API 连接、连接-店铺绑定和事实行级边界均满足要求。示例配置故意指向不存在的 `tmp/shadow.sqlite` 隔离占位路径；必须复制后填入实际 shadow 数据库、备份、userData 和 ID。preflight 通过只代表本地运行前置条件满足，不代表 Amazon 网络、LWA、Reports/FBA 权限或 Seller Central 对账已经通过。浏览器门禁只在 Chromium 缺失时执行安装，已有浏览器时跳过网络安装。

preflight 输出还会保存脱敏 `scope`（证据包 ID、组织/店铺/来源证据 ID、Marketplace、币种、业务时区和七日窗口）；证据包 verifier 会将这些字段与 `evidence.json` 逐项比对，避免把其它店铺、币种或时间窗的 preflight 与当前 manifest 拼接。

数据库中的每日事实可用只读收集器生成脱敏 manifest；它不会读取凭据，不会写业务表，也不会把 SKU 明细写入证据包：

```bash
npm run collect:sp-api-shadow-evidence -- scripts/fixtures/sp-api-shadow-collector.config.example.json \
  --output=tmp/shadow-evidence.json
npm run verify:sp-api-shadow-evidence -- tmp/shadow-evidence.json --report-only
```

实际运行前必须复制并修改配置中的组织/数据源/店铺 ID、外部报告引用和每日观测时间；示例配置只用于说明结构。`--require-all-pass` 只在七日证据已经收齐、并准备进入发布验收时使用；默认输出允许 `delayed`/`failed`，防止收集器把缺失数据伪装成通过。

证据包的脱敏 manifest 使用 `schemaVersion: 2`、`evidenceMode`、窗口和 `days[7]` 结构；校验器继续兼容旧的 v1 manifest。仓库提供确定性的结构校验器，不读取数据库、不访问网络，也不会处理凭据：

```bash
npm run test:shadow-evidence
npm run verify:sp-api-shadow-evidence -- <path-to-evidence.json>
```

校验器默认要求 7 天全部为 `pass`，并检查日期覆盖、金额等式、币种/来源字段、FBA freshness、映射差异、重放新增数和未知/凭据字段。`--report-only` 只用于查看尚未收口的证据，不能作为发布门禁；仓库内的 `scripts/fixtures/sp-api-shadow-evidence.example.json` 必须显式使用 `--allow-example`，它是合成数据，不代表真实店铺通过。

本模板与 `npm run verify:sp-api-fixture-shadow` 的隔离 fixture 门禁互补：fixture 门禁证明本地 runner、幂等、来源追溯、Dashboard 权威和无网络旁路；证据校验器证明外部 shadow 结果满足结构和安全边界；本单据只有在真实私有店铺连续 7 个业务日证据齐全并由三方签名后才能标记为通过。

### 7.1 证据包门禁

建议先把六个输入文件放在一个临时目录，再由只读组装器创建一个新的交付目录。组装器不会读取其它文件，不会覆盖已有目录，会拒绝符号链接和凭据样式内容，并自动生成 `checksums.txt`：

```bash
npm run assemble:sp-api-shadow-package -- \
  --source-dir=<evidence-input-directory> \
  --output=<new-evidence-package-directory>
```

输入目录必须包含 `preflight.json`、收集器输出的 `evidence.json`、`run-lineage.csv`、`reconciliation.csv`、`README.md` 和人工签名的 `signoff.md`。组装完成后，对新目录运行最终门禁：

`signoff.md` 至少要有三行明确的角色签名，角色可使用中英文名称；每行必须包含 `signed`、`approved`、`已签字`、`批准`、`✅` 或 `[x]` 等明确通过标记，`pending`、`未签` 等状态不会通过：

```text
Product owner: Alice — signed 2026-08-12
Data owner: Bob — approved 2026-08-12
Release owner: Carol — signed 2026-08-12
```

```bash
npm run verify:sp-api-shadow-package -- <evidence-package-directory>
```

该门禁只读检查：preflight schema 与全部安全检查、scope 与 evidence 的组织/店铺/来源/窗口一致性、真实模式七日 manifest、必需文件、校验和覆盖/匹配、路径安全、符号链接，以及数据库/环境/密钥文件和凭据样式文本。`run-lineage.csv` 必须覆盖七日内 Sales/FBA 的成功行、正整数页码和 preflight 来源 ID；`reconciliation.csv` 的每日金额、订单和单位必须同时满足金额等式并与 evidence 每日 Sales 摘要一致。它不会把 `--report-only`、example manifest 或缺少签名的包当作发布通过。组装器和门禁都不会访问 Amazon、读取凭据或修改业务数据库；三方签名和真实业务对账仍需人工完成。
