# CLAUDE.md — Amazon 关键词竞品监控系统

## 项目概览

Node 22.12+ / Vue 3 / Express 4 / Playwright / SQLite 的 monorepo 项目。用于监控 Amazon 关键词搜索排名和类目 BSR 榜单。

## 常用命令

```bash
npm run dev              # 启动开发环境（API :4000 + Web :5188）
npm run dev:api          # 仅 API
npm run dev:web          # 仅 Web
npm run build            # 构建生产版本（shared → api → web）
npm run test             # 全量测试（vitest run）
npm run collect          # CLI 采集全部
npm run collect:keyword  # CLI 仅关键词采集
npm run collect:category # CLI 仅类目采集
npm run worker           # 启动 worker 处理队列任务
```

## 技术约束

- **Node.js >= 22.12.0**：使用内置 `node:sqlite`，不支持低版本
- **Express 4.x**：不要升级到 5（静态文件兼容性问题）
- **node:sqlite 不支持嵌套 BEGIN/COMMIT**：项目用 SAVEPOINT 实现嵌套安全（见 `apps/api/src/store/sql-utils.ts` 的 `withTransaction`）
- **SQLite OFFSET 需要 LIMIT**：当 limit 未提供但有 offset 时，使用 `LIMIT -1 OFFSET n`

## 架构要点

### 后端（apps/api）

- **Store 模块化**：`store/types.ts` 定义 10 个子接口（MonitorStore、CategorySnapshotStore、BsrStore 等），Store 通过继承组合
- **Store 实现按领域拆分**：`store/` 目录下每个文件负责一个领域（`bsr-store.ts`、`category-snapshot-store.ts`、`operational-store.ts` 等）
- **SQL 工具**：`store/sql-utils.ts` 提供 `buildWhere`、`whereEq`、`whereLte`、`whereGte`、`clampLimit`、`clampOffset`、`withTransaction`
- **分页**：所有 list API 支持 `limit`（上界 1000）和 `offset` 参数
- **Schema 版本追踪**：`SCHEMA_VERSION` 常量 + `getSchemaVersion`/`setSchemaVersion`，迁移通过 `runStoreMigrationOnce` 按 key 追踪
- **采集流程**：`pipeline.ts`（关键词）和 `category-pipeline.ts`（类目），写入操作包裹在 `store.runInTransaction()` 中
- **Worker 队列**：`queue-store.ts` 实现 claim/retry/fail 状态机

### 前端（apps/web）

- **Pinia Stores**：`stores/` 下有 category、keyword、competitor、alert、dashboard 等 store，组件通过 `storeToRefs` 直接消费
- **Composables**：`composables/` 下组织业务逻辑（`useAppController`、`useKeywords`、`useCategoryIntelligence` 等）
- **Loading 状态拆分**：8 个 per-tab loading ref + 1 个 `collecting` ref + 计算属性 `loading` 聚合
- **视图缓存**：`app-view-loader.ts` 实现 30 秒 TTL 缓存，避免重复请求
- **Watch 防抖**：`useAppViewEffects.ts` 使用 `@vueuse/core` 的 `watchDebounced`（200-300ms）
- **组件按需加载**：所有 View 组件使用 `defineAsyncComponent`
- **ECharts 按需引入**：配合 manual chunks 优化构建体积

### 共享包（packages/shared）

- 依赖方向严格单向：shared ← api/web，不反向
- 18+ 测试文件覆盖从单元到集成

## 测试

```bash
npx vitest run                                    # 全量
npx vitest run apps/api/src/amazon/retry.test.ts  # 单文件
npx vitest run --silent                           # 静默模式
```

当前：35 个测试文件，333 个测试用例。

## 编码约定

- 零 `any` 类型（前端已达成）
- SQL 全部参数化查询，无拼接
- 采集失败自动截图保存到 `data/collector-screenshots/`
- 缓存键包含版本号和日期，解析器升级后自动失效
- 路由注册顺序：固定路径（如 `/collect/run`）在参数路径（如 `/:id`）之前

## 重要文件索引

| 文件 | 用途 |
|------|------|
| `apps/api/src/store/types.ts` | Store 接口定义（10 个子接口） |
| `apps/api/src/store/sql-utils.ts` | SQL 工具函数 |
| `apps/api/src/store/db.ts` | 数据库初始化 + Schema 迁移 |
| `apps/api/src/store/migration-utils.ts` | 迁移工具 + 版本追踪 |
| `apps/api/src/pipeline.ts` | 关键词采集流程 |
| `apps/api/src/category-pipeline.ts` | 类目采集流程 |
| `apps/api/src/amazon/page-guards.ts` | CAPTCHA/封锁检测 |
| `apps/api/src/amazon/retry.ts` | 重试策略判断 |
| `apps/api/src/amazon/parsers/parser-utils.ts` | 价格/货币/评分解析（多市场） |
| `apps/web/src/composables/useAppController.ts` | 前端主控制器 |
| `apps/web/src/composables/app-view-loader.ts` | 视图加载 + TTL 缓存 |
| `apps/web/src/stores/category.ts` | 类目 Pinia store |
| `AUDIT_REPORT.md` | 46 项审计报告（全部已修复） |
