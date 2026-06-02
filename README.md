# Amazon 关键词竞品价格与排名监控系统

基于 PRD 落地的可运行 MVP：关键词配置、Amazon 搜索页真实采集、每日快照、竞品池、昨日对比、告警、日报、采集日志和后台页面已经串成闭环。

## 技术栈

- `packages/shared`：TypeScript 领域模型与业务规则
- `apps/api`：Express + Playwright + Node 内置 SQLite，本地数据文件在 `data/amazon-monitor.sqlite`
- `apps/web`：Vue 3 + Vite + ECharts

## 启动

```powershell
npm install
npm run dev
```

- API: `http://localhost:4000`
- Web 开发模式: `http://localhost:5188`
- 集成访问入口: `http://localhost:4000`

不要打开 `http://localhost:5173`，该端口不是本项目固定端口，容易进入其他 Vite 程序。需要给业务侧试用时，优先使用 `http://localhost:4000`，它由 API 服务直接托管最新构建后的前端。

系统不会自动写入演示数据。启动后先在后台新增关键词，再点击“采集当前”或“采集全部”，后端会用 Playwright 打开 Amazon 搜索页采集真实搜索结果。

## 常用命令

```powershell
npm run test
npm run build
```

## 采集说明

生产采集入口是 `apps/api/src/amazon-collector.ts` 的 `PlaywrightAmazonSearchCollector`：

- 按关键词配置打开 Amazon 搜索结果页。
- 解析 ASIN、标题、图片、商品链接、搜索页价格、Coupon、Deal、评分、评论数、Sponsored、Prime、配送文案。
- 如果 Amazon 返回验证码、自动访问拦截或页面没有商品卡片，任务会记录失败日志，并在 `data/collector-screenshots` 保存排查截图。
- 不做假数据兜底，不生成虚构竞品。

可调环境变量：

```powershell
$env:AMAZON_COLLECT_TIMEOUT_MS="30000"
$env:AMAZON_COLLECT_DETAIL_TIMEOUT_MS="15000"
$env:AMAZON_COLLECT_DETAIL_CONCURRENCY="3"
$env:AMAZON_COLLECT_KEYWORD_CONCURRENCY="2"
$env:AMAZON_COLLECT_DETAIL_SETTLE_MS="300"
$env:AMAZON_COLLECT_PAGE_DELAY_MS="5000"
$env:AMAZON_COLLECT_BLOCK_RESOURCES="true"
$env:AMAZON_COLLECT_WAIT_NETWORK_IDLE="false"
$env:PLAYWRIGHT_HEADLESS="true"
```

## 通知发送配置

系统支持在后台创建每日通知计划，按 `Asia/Shanghai` 时间每天定时发送当日日报到邮箱或飞书。

邮箱使用真实 SMTP，不做模拟发送：

```powershell
$env:SMTP_HOST="smtp.example.com"
$env:SMTP_PORT="465"
$env:SMTP_SECURE="true"
$env:SMTP_USER="sender@example.com"
$env:SMTP_PASS="your-smtp-password"
$env:SMTP_FROM="sender@example.com"
```

飞书使用群机器人 Webhook，通知计划的目标填写完整 Webhook URL，例如：

```text
https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxx
```

邮箱会直接附带 Excel 文件。飞书机器人不能直接上传本地附件；如果需要在飞书消息里打开同一份 Excel，给服务配置一个可访问地址：

```powershell
$env:PUBLIC_BASE_URL="https://amazon-monitor.example.com"
```

配置后，飞书日报会包含 `PUBLIC_BASE_URL/api/reports/daily.xlsx?date=YYYY-MM-DD` 下载链接。

## Category Best Sellers collection knobs

The category intelligence module uses real Amazon Best Sellers pages, not mock data.

```powershell
$env:AMAZON_COLLECT_CATEGORY_RETRIES="2"
$env:AMAZON_COLLECT_CATEGORY_BLOCK_RESOURCES="true"
$env:AMAZON_COLLECT_CATEGORY_BLOCK_IMAGES="false"
$env:AMAZON_COLLECT_CATEGORY_CONCURRENCY="1"
```

- `AMAZON_COLLECT_CATEGORY_RETRIES`: retries temporary Amazon error or empty-card pages.
- `AMAZON_COLLECT_CATEGORY_BLOCK_RESOURCES`: blocks font/media requests on Best Sellers pages to reduce wait time.
- `AMAZON_COLLECT_CATEGORY_BLOCK_IMAGES`: keep `false` by default so product image URLs remain stable in the UI and reports.
