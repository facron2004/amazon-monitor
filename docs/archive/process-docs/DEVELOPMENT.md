# Amazon Monitor 开发指南

本文档面向开发者，介绍项目架构、开发流程和最佳实践。

## 项目架构

### 整体架构

Amazon Monitor 采用 Monorepo 架构，包含三个主要模块：

```
amazon-monitor/
├── packages/shared/      # 共享领域模型和业务规则
├── apps/api/            # 后端服务（Express + Playwright + SQLite）
├── apps/web/            # 前端界面（Vue 3 + Vite）
└── data/                # 数据存储目录
```

### 技术选型

**运行时和语言：**
- Node.js >= 22.12.0（使用内置 SQLite）
- TypeScript 5.9+（严格模式）
- ES Modules（ESM）

**后端技术栈：**
- Express 5.2 - Web 框架
- Playwright 1.57 - 浏览器自动化
- Node.js 内置 SQLite - 数据库
- node-cron 4.2 - 定时任务
- nodemailer 8.0 - 邮件发送

**前端技术栈：**
- Vue 3.5 - UI 框架
- Vite 7.2 - 构建工具
- ECharts 6.0 - 数据可视化
- Lucide Icons - 图标库

## 开发环境设置

### 1. 前置要求

```bash
# 检查 Node 版本
node -v  # 必须 >= 22.12.0

# 检查 npm 版本
npm -v   # 建议 >= 10.0.0
```

### 2. 安装依赖

```bash
# 安装 npm 依赖
npm install

# 安装 Playwright 浏览器
npx playwright install chromium
```

### 3. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件
# 最少需要配置 SMTP 相关参数以启用邮件通知
```

### 4. 启动开发服务

```bash
# 启动完整开发环境
npm run dev

# 或分别启动
npm run dev:api  # 后端服务（http://localhost:4000）
npm run dev:web  # 前端服务（http://localhost:5188）
```

## 代码组织

### Shared 包（packages/shared）

**职责：**
- 定义领域模型（类型定义）
- 实现业务规则（数据分析、信号检测）
- 提供跨模块复用的工具函数

**主要导出：**
```typescript
// 类型定义
export type KeywordMonitor = { ... };
export type CategoryMonitor = { ... };
export type BestsellerRankSnapshot = { ... };

// 业务规则
export function analyzeDailyChanges(...);
export function buildCompetitorActionInsights(...);
export function decorateSnapshotRanks(...);
```

**设计原则：**
- 纯函数，无副作用
- 不依赖 Node.js API（浏览器和 Node 都能用）
- 完整的 TypeScript 类型覆盖

### API 后端（apps/api/src）

**目录结构：**
```
apps/api/src/
├── index.ts                   # 启动入口（Express + Cron）
├── cli.ts                     # CLI 工具入口
├── server.ts                  # Express 路由定义
├── store.ts                   # 数据库访问层（4000+ 行，待拆分）
├── amazon-collector.ts        # Playwright 采集引擎
├── pipeline.ts                # 关键词采集流程编排
├── category-pipeline.ts       # 类目采集流程编排
├── notifier.ts                # 通知推送（邮件/飞书）
├── excel-report.ts            # Excel 报告生成
└── scheduler.ts               # 定时任务调度器
```

**关键模块说明：**

1. **store.ts - 数据访问层**
   - 封装所有数据库操作
   - 包含 21 张表的 CRUD 方法
   - 使用参数化查询防止 SQL 注入
   - 当前 4138 行，计划拆分为多个 repository

2. **amazon-collector.ts - 采集引擎**
   - `PlaywrightAmazonSearchCollector` - 关键词搜索采集
   - `PlaywrightAmazonBestSellerCollector` - Best Sellers 采集
   - 错误处理和截图保存
   - 资源拦截优化（阻止图片/字体）

3. **pipeline.ts - 采集流程**
   - 编排采集任务
   - 并发控制
   - 日志记录
   - 数据存储

4. **server.ts - API 路由**
   - RESTful API 设计
   - 前端静态文件托管
   - CORS 配置

### Web 前端（apps/web/src）

**目录结构：**
```
apps/web/src/
├── App.vue        # 主应用（1875 行，待拆分）
├── api.ts         # API 客户端封装
├── main.ts        # 应用入口
└── styles.css     # 全局样式
```

**当前状态：**
- 单文件组件（SFC）架构
- 所有功能集中在 App.vue
- 使用 Composition API

**计划优化：**
```
apps/web/src/
├── App.vue
├── components/         # 通用组件
│   ├── Toast.vue
│   ├── DataTable.vue
│   └── ...
├── views/             # 页面视图
│   ├── CategoriesView.vue
│   ├── KeywordsView.vue
│   └── ...
└── composables/       # 组合式函数
    ├── useToast.ts
    └── useApi.ts
```

## 数据库设计

### 表结构概览

系统使用 21 张表存储数据：

**监控配置：**
- `amazon_keyword_monitor` - 关键词监控配置
- `amazon_bestseller_category_monitor` - Best Sellers 类目监控

**快照数据：**
- `amazon_keyword_serp_snapshot` - 搜索结果快照
- `amazon_bestseller_rank_snapshot` - Best Sellers 排名快照
- `amazon_brand_matrix_snapshot` - 品牌矩阵快照

**产品主数据：**
- `amazon_product_master` - 产品主数据
- `amazon_product_price_history` - 价格历史

**竞品分析：**
- `amazon_competitor_pool` - 竞品池
- `amazon_competitor_daily_change` - 每日变化
- `amazon_competitor_signal_log` - 信号日志
- `amazon_competitor_activity_event` - 活动事件
- `amazon_competitor_action_insight` - 行动洞察

**BSR 相关：**
- `amazon_bsr_rank_history` - BSR 历史
- `amazon_bsr_snapshot_quality` - 快照质量检查

**系统功能：**
- `amazon_alert_log` - 告警日志
- `amazon_collect_task_log` - 采集任务日志
- `amazon_daily_report` - 每日报告
- `amazon_category_daily_report` - 类目每日报告
- `amazon_notification_schedule` - 通知计划
- `amazon_notification_send_log` - 通知发送日志
- `amazon_schema_metadata` - 数据库元数据

### 数据库特性

**WAL 模式：**
- 启用 Write-Ahead Logging
- 支持并发读写
- 提高性能和可靠性

**索引优化：**
- 复合索引优化查询
- UNIQUE 约束防止重复

**时间处理：**
- 统一使用 ISO 8601 格式字符串
- 时区统一为 Asia/Shanghai

## 开发工作流

### 1. 功能开发流程

```bash
# 1. 创建功能分支
git checkout -b feature/your-feature

# 2. 开发和测试
npm run dev
npm run test

# 3. 提交代码
git add .
git commit -m "feat: add your feature"

# 4. 推送并创建 PR
git push -u origin feature/your-feature
```

### 2. 测试策略

```bash
# 运行所有测试
npm run test

# 运行特定模块测试
npm --workspace @amazon-monitor/api run test
npm --workspace @amazon-monitor/shared run test

# 监听模式（开发时）
npm run test -- --watch
```

**测试覆盖范围：**
- Shared 包：业务规则单元测试
- API 后端：集成测试
- 采集器：Mock 测试（避免真实请求）

### 3. 代码规范

**TypeScript 规范：**
- 启用严格模式
- 避免 `any` 类型
- 使用接口而非类型别名定义复杂对象
- 导出类型时使用 `export type`

**命名规范：**
- 文件名：kebab-case（`amazon-collector.ts`）
- 变量/函数：camelCase（`runCollection`）
- 类型/接口：PascalCase（`KeywordMonitor`）
- 常量：UPPER_SNAKE_CASE（`MAX_RETRIES`）

**导入顺序：**
```typescript
// 1. Node.js 内置模块
import { fileURLToPath } from "node:url";

// 2. 第三方依赖
import express from "express";

// 3. 本地模块
import { openAppStore } from "./store.js";
```

**注意事项：**
- 使用 `.js` 后缀导入（ESM 要求）
- 避免循环依赖
- 使用参数化查询防止 SQL 注入

## 常见开发任务

### 添加新的关键词监控字段

1. 在 `packages/shared/src/index.ts` 更新类型定义
2. 在 `apps/api/src/store.ts` 更新建表 SQL
3. 在 `apps/api/src/store.ts` 更新相关查询
4. 在 `apps/web/src/App.vue` 更新表单和表格
5. 运行测试确保向后兼容

### 添加新的采集参数

1. 在 `.env.example` 添加环境变量说明
2. 在 `apps/api/src/amazon-collector.ts` 读取并使用
3. 更新 README.md 的配置说明
4. 测试不同参数值的效果

### 添加新的通知渠道（如企业微信）

1. 在 `apps/api/src/notifier.ts` 添加发送函数
2. 在 `packages/shared/src/index.ts` 更新通知类型
3. 在 `apps/web/src/App.vue` 添加配置表单
4. 更新文档说明

## 调试技巧

### 1. 调试采集失败

```bash
# 启用详细日志
$env:DEBUG="*"  # Windows PowerShell
export DEBUG="*"  # macOS/Linux

# 启用有头模式查看浏览器
$env:PLAYWRIGHT_HEADLESS="false"

# 运行单个关键词采集
npm run collect:keyword
```

**检查截图：**
- 位置：`data/collector-screenshots/`
- 命名：`{keyword}-{timestamp}.png`

### 2. 调试数据库问题

```bash
# 使用 SQLite 客户端查看数据库
sqlite3 data/amazon-monitor.sqlite

# 查看表结构
.schema amazon_keyword_monitor

# 查询数据
SELECT * FROM amazon_keyword_monitor LIMIT 10;
```

### 3. 调试前端问题

```bash
# 启动开发服务器（支持热重载）
npm run dev:web

# 打开浏览器控制台（F12）
# - Console: 查看日志和错误
# - Network: 查看 API 请求
# - Vue DevTools: 查看组件状态
```

### 4. 调试 API 问题

```bash
# 使用 curl 测试 API
curl http://localhost:4000/api/categories

# 使用 Postman 或 Insomnia
# 导入 API 端点并测试
```

## 性能优化

### 采集性能优化

```bash
# 增加并发数（小心触发限流）
$env:AMAZON_COLLECT_KEYWORD_CONCURRENCY="3"
$env:AMAZON_COLLECT_DETAIL_CONCURRENCY="5"

# 阻止不必要的资源
$env:AMAZON_COLLECT_BLOCK_RESOURCES="true"

# 减少页面等待时间
$env:AMAZON_COLLECT_PAGE_DELAY_MS="3000"
```

### 数据库性能优化

- 使用复合索引覆盖常用查询
- 定期 VACUUM 压缩数据库
- 考虑分页加载大数据集

### 前端性能优化

- 使用虚拟滚动加载大列表
- 图片懒加载
- 组件按需加载

## 部署指南

### 构建生产版本

```bash
# 构建所有模块
npm run build

# 检查构建输出
ls apps/api/dist
ls apps/web/dist
```

### 生产环境运行

```bash
# 设置环境变量
export NODE_ENV=production
export PORT=4000
export DB_PATH=/data/amazon-monitor.sqlite

# 启动服务
node apps/api/dist/index.js
```

### Docker 部署（待完善）

```dockerfile
# 未来计划
FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build
CMD ["node", "apps/api/dist/index.js"]
```

## 常见问题

### Q: 为什么必须使用 Node 22.12+？

A: 项目使用了 Node.js 内置的 `node:sqlite` 模块，这是 Node 22.12+ 才引入的实验性特性。低版本无法运行。

### Q: 如何切换数据库？

A: 当前使用 SQLite，如需切换到 PostgreSQL 或 MySQL，需要：
1. 修改 `apps/api/src/store.ts` 的数据库连接
2. 调整 SQL 语法差异
3. 更新迁移脚本

### Q: 采集频率建议？

A: 
- 开发测试：手动触发
- 生产环境：每天 1-2 次（避免触发 Amazon 限流）
- 高频监控：配合代理池使用

### Q: 如何扩展到多用户？

A: 当前是单用户系统，扩展需要：
1. 添加用户表和认证系统
2. 数据隔离（添加 user_id 字段）
3. 权限控制
4. Session 管理

## 贡献指南

### 提交代码

1. Fork 项目
2. 创建功能分支
3. 提交代码（遵循规范）
4. 运行测试
5. 创建 Pull Request

### Commit 规范

```
feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式
refactor: 重构
test: 测试
chore: 构建/工具
```

## 路线图

### P1 优先级（降低维护成本）

- [ ] 拆分 App.vue 为多个组件
- [ ] 拆分 store.ts 为多个 repository
- [ ] 增加 API 文档（Swagger/OpenAPI）
- [ ] 完善错误处理和日志

### P2 优先级（准备长期运行）

- [ ] API 和 Worker 进程分离
- [ ] Docker 化部署
- [ ] 增加简单认证
- [ ] 数据备份和恢复

### P3 优先级（产品化）

- [ ] 多用户支持
- [ ] 任务队列
- [ ] 代理池集成
- [ ] 云端部署方案

## 参考资源

- [Node.js 文档](https://nodejs.org/docs/)
- [TypeScript 手册](https://www.typescriptlang.org/docs/)
- [Vue 3 文档](https://vuejs.org/)
- [Playwright 文档](https://playwright.dev/)
- [SQLite 文档](https://sqlite.org/docs.html)

---

**最后更新**：2026年6月
