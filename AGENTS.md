# AGENTS.md — AI Agent 工作手册

<!-- 本文件为 AI 编码助手提供项目上下文和编码约定。 -->

## 项目基本信息

- **名称**：Amazon 关键词竞品价格与排名监控系统
- **Monorepo**：npm workspaces — `packages/shared`、`apps/api`、`apps/web`
- **技术栈**：Node 22.12+ / Vue 3 + Vite + Pinia / Express 4 / Playwright / node:sqlite
- **测试**：Vitest 4.x — 35 个文件，333 个用例
- **类型检查**：`npx tsc --noEmit`（api）、`npx vue-tsc --noEmit`（web）

## 编码标准

### 通用

- **零 `any` 类型** — 前端已达成，后端同标准
- **SQL 全部参数化查询** — 禁止字符串拼接
- **ESM** — `"type": "module"`，导入使用 `.js` 后缀
- **命名**：camelCase 变量/函数，PascalCase 类型/接口/组件

### 后端

- **Store 模式**：`store/types.ts` 定义接口，实现按领域拆分到 `store/*.ts`
- **SQL 工具**：使用 `buildWhere`、`whereEq` 等构建查询，不要手写 WHERE 拼接
- **分页**：`clampLimit(limit, max=1000)` + `clampOffset(offset)` — 所有 list 函数必须使用
- **事务**：使用 `withTransaction(db, work)` — 内部用 SAVEPOINT 实现嵌套安全
- **嵌套事务限制**：node:sqlite 不支持嵌套 BEGIN/COMMIT，必须用 SAVEPOINT
- **路由顺序**：固定路径注册在参数路径之前（如 `/collect/run` 在 `/:id` 前）
- **Worker 队列**：claim/retry/fail 状态机在 `queue-store.ts`

### 前端

- **Pinia Store**：组件通过 `storeToRefs(useXxxStore())` 直接消费数据
- **Composables**：业务逻辑组织在 `composables/` 下，不在组件内堆积
- **Loading 状态**：per-domain ref（如 `categoriesLoading`）+ `collecting` ref
- **视图缓存**：`app-view-loader.ts` 提供 30s TTL 缓存
- **防抖**：`useAppViewEffects.ts` 使用 `@vueuse/core` 的 `watchDebounced`
- **组件加载**：View 级组件使用 `defineAsyncComponent`
- **Props 传递**：避免超过 2 层 props drilling，子面板直接用 store

## 架构规则

### 依赖方向

```
packages/shared  ←  apps/api
packages/shared  ←  apps/web
```

- `shared` 不依赖 `api` 或 `web`
- `api` 和 `web` 之间无直接依赖（web 通过 HTTP API 通信）
- 无循环依赖

### 数据流

```
Amazon 页面 → Playwright 采集 → Parser 解析 → Pipeline 处理 → Store 写入 SQLite
                                                                              ↓
                                                              API Routes → 前端 Pinia Store
```

### 关键模块职责

| 模块 | 文件 | 职责 |
|------|------|------|
| 关键词采集 | `pipeline.ts` | 编排关键词 SERP 采集 → 快照 → 竞品 → 告警 → 报告 |
| 类目采集 | `category-pipeline.ts` | 编排 BSR 采集 → 快照 → 品牌矩阵 → 信号 → 质量 |
| 页面守卫 | `amazon/page-guards.ts` | CAPTCHA/封锁检测，失败截图 |
| 重试策略 | `amazon/retry.ts` | 判断错误是否可重试 |
| 解析器 | `amazon/parsers/` | 多市场价格/货币/评分解析 |
| Schema 迁移 | `store/migration-utils.ts` | `ensureColumn` + `runStoreMigrationOnce` + 版本追踪 |

## 工作流程

### 修改 Store

1. 在 `store/types.ts` 对应子接口添加/修改方法签名
2. 在 `store/xxx-store.ts` 实现
3. 在 `store/index.ts` 导出（如需要）
4. 运行 `npx tsc --noEmit` 验证

### 添加 API 端点

1. 在 `routes/xxx.ts` 添加路由
2. 使用 `asyncHandler` 包装异步处理
3. 使用 `validateIdParam` 验证路径参数
4. 使用 `optionalString`/`optionalNumber` 解析查询参数
5. 固定路径放在参数路径之前

### 添加前端功能

1. 数据层：在 `stores/` 创建/修改 Pinia store
2. 逻辑层：在 `composables/` 创建/修改 composable
3. 视图层：组件通过 `storeToRefs` 消费数据
4. 类型检查：`npx vue-tsc --noEmit`

### 添加 Schema 迁移

1. 在 `store/db.ts` 的 `initSchema` 中添加 `ensureColumn` 或 `runStoreMigrationOnce` 调用
2. 如果是数据迁移，在 `store/` 下创建 `xxx-migrations.ts` 实现迁移逻辑
3. 通过 `store/migrations.ts` 导出
4. 有破坏性变更时递增 `SCHEMA_VERSION`

### 验证清单

每次修改后执行：

```bash
cd apps/api && npx tsc --noEmit          # API 类型检查
cd apps/web && npx vue-tsc --noEmit      # 前端类型检查
npx vitest run --silent                   # 全量测试
```

## 已知限制

- Express 4.x — 不要升级到 5（静态文件兼容性问题）
- node:sqlite 实验性 API — 需要 `--no-warnings` 抑制警告
- SQLite OFFSET 需要 LIMIT — 使用 `LIMIT -1 OFFSET n` 处理无 limit 场景
- Playwright 和 node-cron 仅在 `apps/api/package.json` 声明（已从 root 去重）
- 解析器中 `parseRating` 对日文格式 `"5つ星のうち4.3"` 返回 5（匹配首个数字），已知行为

## 审计报告

`docs/archive/process-docs/AUDIT_REPORT.md` 记录 46 项审计发现，按 P0-P3 分级，全部已修复。
