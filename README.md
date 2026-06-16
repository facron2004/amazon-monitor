# Amazon 关键词竞品价格与排名监控系统

基于 PRD 落地的可运行 MVP：关键词配置、Amazon 搜索页真实采集、每日快照、竞品池、昨日对比、告警、日报、采集日志和后台页面已经串成闭环。

## 环境要求

- **Node.js >= 22.12.0**（使用 Node 内置 SQLite，不支持低版本）
- npm >= 10
- Playwright Chromium

> ⚠️ **重要**：本项目使用 Node.js 内置的 `node:sqlite` 模块，需要 Node 22.12.0 或更高版本。

## 技术栈

- `packages/shared`：TypeScript 领域模型与业务规则
- `apps/api`：Express 4 + Playwright + Node 内置 SQLite + Helmet + Zod + express-rate-limit，本地数据文件在 `data/amazon-monitor.sqlite`
- `apps/web`：Vue 3 + Vite + Pinia + ECharts + @vueuse/core + @lucide/vue

> ⚠️ **重要**：项目当前使用 Express 4.x。Express 5 存在静态文件服务兼容性问题，请勿升级。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 安装 Playwright 浏览器

```bash
npx playwright install chromium
```

### 3. 启动开发服务

```bash
npm run dev
```

**访问地址：**

- **前端开发服务器**（支持热重载）：http://localhost:5188
- **API 服务**：http://localhost:4000

> 💡 **提示**：开发时使用 5188 端口，前端代码修改会自动热重载。生产环境或构建后使用 4000 端口。

### 4. 首次使用

系统不会自动写入演示数据。启动后：

1. 在后台新增关键词或类目
2. 点击”采集当前”或”采集全部”
3. 后端会用 Playwright 打开 Amazon 采集真实数据

## 构建和部署

### 构建生产版本

```bash
npm run build
```

### 启动生产服务

构建完成后，API 服务会自动托管前端静态文件：

```bash
npm start
```

访问：http://localhost:4000

> 💡 **提示**：API 服务会自动检测并托管 `apps/web/dist` 目录，无需额外配置。

## 常用命令

### 开发命令

```bash
npm run dev              # 启动完整开发环境（API + Web）
npm run dev:api          # 仅启动 API 服务
npm run dev:web          # 仅启动 Web 开发服务器
npm run build            # 构建生产版本
npm run test             # 运行测试
```

### CLI 采集命令

无需启动 Web 服务，直接运行采集任务：

```bash
npm run collect          # 采集全部（关键词 + 类目）
npm run collect:keyword  # 仅采集关键词
npm run collect:category # 仅采集类目
npm run worker           # 启动 Worker 处理队列任务
```

> 💡 **提示**：CLI 命令适合服务器定时任务或快速测试采集功能。

## 采集说明

生产采集入口是 `apps/api/src/amazon-collector.ts` 的 `PlaywrightAmazonSearchCollector`：

- 按关键词配置打开 Amazon 搜索结果页
- 解析 ASIN、标题、图片、商品链接、搜索页价格、Coupon、Deal、评分、评论数、Sponsored、Prime、配送文案
- 如果 Amazon 返回验证码、自动访问拦截或页面没有商品卡片，任务会记录失败日志，并在 `data/collector-screenshots` 保存排查截图
- 不做假数据兜底，不生成虚构竞品

### 采集调优参数

可通过环境变量调整采集行为（Windows PowerShell 示例）：

```powershell
# 超时与重试
$env:AMAZON_COLLECT_TIMEOUT_MS="90000"
$env:AMAZON_COLLECT_DETAIL_TIMEOUT_MS="15000"
$env:AMAZON_COLLECT_SEARCH_RETRIES="3"
$env:AMAZON_COLLECT_SEARCH_RETRY_DELAY_MS="2500"

# 并发控制
$env:AMAZON_WORKER_CONCURRENCY="2"              # Worker 并行处理 job 数
$env:AMAZON_COLLECT_KEYWORD_CONCURRENCY="3"      # 关键词采集并发数
$env:AMAZON_COLLECT_CATEGORY_CONCURRENCY="2"     # 类目采集并发数
$env:AMAZON_COLLECT_DETAIL_CONCURRENCY="5"       # 商品详情页并发数

# 延迟与等待
$env:AMAZON_COLLECT_DETAIL_SETTLE_MS="300"
$env:AMAZON_COLLECT_PAGE_DELAY_MS="3000"
$env:AMAZON_BESTSELLER_SCROLL_DELAY_MS="600"
$env:AMAZON_COLLECT_WAIT_NETWORK_IDLE="false"

# 资源拦截（强烈建议开启，提速 30-50%）
$env:AMAZON_COLLECT_BLOCK_RESOURCES="true"
$env:AMAZON_COLLECT_CATEGORY_BLOCK_RESOURCES="true"
$env:AMAZON_COLLECT_CATEGORY_BLOCK_IMAGES="true"

$env:PLAYWRIGHT_HEADLESS="true"
```

完整配置说明请参考 `.env.example`。

## 通知发送配置

系统支持在后台创建每日通知计划，按 `Asia/Shanghai` 时间每天定时发送当日日报到邮箱或飞书。

### 邮件通知（SMTP）

邮箱使用真实 SMTP，不做模拟发送：

```powershell
$env:SMTP_HOST="smtp.example.com"
$env:SMTP_PORT="465"
$env:SMTP_SECURE="true"
$env:SMTP_USER="sender@example.com"
$env:SMTP_PASS="your-smtp-password"
$env:SMTP_FROM="sender@example.com"
```

### 飞书通知

飞书使用群机器人 Webhook，通知计划的目标填写完整 Webhook URL：

```text
https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxx
```

邮箱会直接附带 Excel 文件。飞书机器人不能直接上传本地附件；如果需要在飞书消息里打开同一份 Excel，给服务配置一个可访问地址：

```powershell
$env:PUBLIC_BASE_URL="https://amazon-monitor.example.com"
```

配置后，飞书日报会包含 `PUBLIC_BASE_URL/api/reports/daily.xlsx?date=YYYY-MM-DD` 下载链接。

## Category Best Sellers 采集配置

类目情报模块使用真实的 Amazon Best Sellers 页面，不使用模拟数据。

```powershell
$env:AMAZON_COLLECT_CATEGORY_RETRIES="3"
$env:AMAZON_COLLECT_CATEGORY_BLOCK_RESOURCES="true"
$env:AMAZON_COLLECT_CATEGORY_BLOCK_IMAGES="true"
$env:AMAZON_COLLECT_CATEGORY_CONCURRENCY="2"
$env:AMAZON_BESTSELLER_SCROLL_DELAY_MS="600"
$env:AMAZON_BESTSELLER_SCROLL_PASSES="12"
$env:AMAZON_BESTSELLER_STABLE_PASSES="4"
```

- `AMAZON_COLLECT_CATEGORY_RETRIES`：重试临时 Amazon 错误或空卡片页面
- `AMAZON_COLLECT_CATEGORY_BLOCK_RESOURCES`：阻止 Best Sellers 页面的字体/媒体请求以减少等待时间
- `AMAZON_COLLECT_CATEGORY_BLOCK_IMAGES`：阻止产品图片加载，开启后提速显著（图片 URL 仍从搜索结果页获取）
- `AMAZON_COLLECT_CATEGORY_CONCURRENCY`：多个类目并行采集数（默认 2）

## 项目结构

```
amazon-monitor/
├── packages/shared/              # 共享类型和业务规则
├── apps/
│   ├── api/                      # 后端服务
│   │   └── src/
│   │       ├── index.ts          # 启动入口
│   │       ├── cli.ts            # CLI 工具
│   │       ├── worker.ts         # Worker 队列处理
│   │       ├── server.ts         # Express API
│   │       ├── store.ts          # Store 接口组合
│   │       ├── store/            # Store 模块化实现
│   │       │   ├── types.ts      # 10 个子接口定义
│   │       │   ├── sql-utils.ts  # SQL 工具函数
│   │       │   ├── db.ts         # 数据库初始化 + Schema 迁移
│   │       │   ├── migration-utils.ts  # 迁移工具 + 版本追踪
│   │       │   ├── bsr-store.ts
│   │       │   ├── category-snapshot-store.ts
│   │       │   ├── category-insight-store.ts
│   │       │   ├── category-price-store.ts
│   │       │   ├── keyword-snapshot-store.ts
│   │       │   ├── monitor-store.ts
│   │       │   ├── operational-store.ts
│   │       │   ├── notification-store.ts
│   │       │   ├── queue-store.ts
│   │       │   └── ...
│   │       ├── routes/           # API 路由（按领域组织）
│   │       │   ├── categories.ts
│   │       │   ├── keywords.ts
│   │       │   ├── competitors.ts
│   │       │   ├── insights.ts
│   │       │   ├── operations.ts
│   │       │   └── notifications.ts
│   │       ├── amazon/           # 采集引擎
│   │       │   ├── parsers/      # 多市场解析器
│   │       │   ├── page-guards.ts    # CAPTCHA/封锁检测
│   │       │   ├── retry.ts          # 重试策略
│   │       │   ├── browser.ts        # Playwright 浏览器管理
│   │       │   ├── context.ts        # 浏览器上下文（时区/语言）
│   │       │   ├── config.ts         # 采集配置
│   │       │   └── ...
│   │       ├── pipeline.ts           # 关键词采集流程
│   │       ├── category-pipeline.ts  # 类目采集流程
│   │       ├── notifier.ts           # 通知推送
│   │       ├── excel-report.ts       # Excel 报告
│   │       └── scheduler.ts          # 定时任务
│   └── web/                      # 前端界面
│       └── src/
│           ├── App.vue           # 主应用
│           ├── stores/           # Pinia 状态管理
│           │   ├── category.ts
│           │   ├── keyword.ts
│           │   ├── competitor.ts
│           │   ├── alert.ts
│           │   └── dashboard.ts
│           ├── composables/      # 业务逻辑组合
│           │   ├── useAppController.ts
│           │   ├── useAppViewEffects.ts
│           │   ├── app-view-loader.ts   # TTL 视图缓存
│           │   ├── useKeywords.ts
│           │   ├── useCategoryIntelligence.ts
│           │   └── ...
│           ├── components/       # Vue 组件
│           ├── utils/            # 工具函数
│           └── api-*.ts          # API 客户端（按领域拆分）
├── data/                         # 数据目录
│   └── amazon-monitor.sqlite     # SQLite 数据库
├── package.json                  # Monorepo 配置
├── CLAUDE.md                     # AI 助手项目上下文
├── AGENTS.md                     # AI Agent 工作手册
├── AUDIT_REPORT.md               # 46 项审计报告
├── README.md                     # 本文档
├── RUN_CHECKLIST.md              # 运行检查清单
└── .env.example                  # 环境变量模板
```

## 架构亮点

### 后端

- **Store 模块化**：数据库层拆分为 10 个领域子接口（MonitorStore、BsrStore、CategorySnapshotStore 等），每个子接口对应独立实现文件
- **事务安全**：`withTransaction` 使用 SAVEPOINT 实现嵌套安全，Pipeline 写入操作包裹在 `runInTransaction()` 中
- **分页支持**：所有 list API 支持 `limit`（上界 1000）和 `offset` 参数
- **安全加固**：Helmet 安全头、express-rate-limit 速率限制、Zod 输入验证、CORS 配置
- **Worker 队列**：claim/retry/fail 状态机，支持多 lane 并行处理采集任务（默认 2 并发）
- **Schema 版本追踪**：`SCHEMA_VERSION` 常量 + `runStoreMigrationOnce` 按 key 追踪迁移

### 前端

- **Pinia 状态管理**：7 个领域 store，组件通过 `storeToRefs` 直接消费数据，消除多层 props drilling
- **Per-domain Loading**：8 个独立的 tab loading 状态 + 采集状态，切换 tab 不再误禁用采集按钮
- **视图缓存**：30 秒 TTL 缓存避免重复 API 请求
- **Watch 防抖**：`@vueuse/core` 的 `watchDebounced` 防止快速切换触发请求风暴
- **组件按需加载**：View 级组件使用 `defineAsyncComponent`，ECharts 按需引入

### 测试覆盖

35 个测试文件，333 个测试用例，覆盖：

- 共享包：18+ 文件（类型验证、业务规则、集成测试）
- 后端 Store：队列状态机、SQL 工具
- 采集引擎：浏览器管理、上下文配置、代理池、品牌质量
- 页面守卫：CAPTCHA 检测、重试策略（95 个测试）
- 解析器：多市场价格/货币/评分格式（60 个测试）
- 端到端流程：关键词 pipeline、类目 intelligence、API 路由

## 故障排查

### 采集失败

检查 `data/collector-screenshots/` 目录查看失败时的页面截图，常见原因：

- Amazon 返回验证码（需要调整采集频率或 IP）
- 网络超时（增加 `AMAZON_COLLECT_TIMEOUT_MS`）
- 页面结构变化（需要更新选择器）

### 性能优化

实测类目采集（100 商品，2 页）从 **7.5 分钟优化到 2 分钟以内**，提速 3.8 倍。关键措施：

- **开启资源拦截**：`AMAZON_COLLECT_BLOCK_RESOURCES="true"` 拦截图片/字体/媒体，每页省 2-5MB 加载时间
- **提高并发**：Worker 2 路并行 + 关键词并发 3 + 类目并发 2 + 详情页并发 5
- **降低等待延迟**：页面间隔 3s（默认 5s）、滚动延迟 600ms（默认 700ms）
- **Detail 页不等待 networkidle**：默认关闭 `AMAZON_COLLECT_WAIT_NETWORK_IDLE`，每个商品详情页省 5-15s
- **浏览器启动参数优化**：`--disable-dev-shm-usage`、`--disable-gpu`、`--disable-extensions`

> 数据完整性验证：开启资源拦截后，价格/评分/评论数/BSR 排名等字段覆盖率与关闭拦截时持平（97-100%）。

### 数据库位置

数据库文件：`data/amazon-monitor.sqlite`

可使用任何 SQLite 客户端查看，建议定期备份 `data` 目录。

## 更多文档

- [CLAUDE.md](CLAUDE.md) - AI 编码助手项目上下文
- [AGENTS.md](AGENTS.md) - AI Agent 工作手册和编码约定
- [审计报告](AUDIT_REPORT.md) - 46 项代码审计（P0-P3 全部已修复）
- [运行检查清单](RUN_CHECKLIST.md) - 运行前的逐步检查
- [开发指南](DEVELOPMENT.md) - 开发者文档和架构说明
- [项目说明](项目说明.md) - 详细的功能说明和使用指南
- [环境变量配置](.env.example) - 完整的配置选项说明
