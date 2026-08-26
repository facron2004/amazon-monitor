# Amazon Agent OS 路线图实现状态

> 记录日期：2026-08-20
> 对照文档：`C:\Users\Facron\Downloads\Amazon_Agent_Workflow_Roadmap.md`；本轮增量对照 `C:\Users\Facron\Downloads\Amazon_Agent_Upgrade_PRD.md`

本文区分“源码闭环已实现”和“必须使用真实店铺/生产环境才能证明”，不把 fixture 或本地 smoke 当成生产结论。

## 已实现的源码闭环

| 路线图 | 当前实现 | 主要入口 |
| --- | --- | --- |
| P0 Goal / Memory | 组织隔离、幂等、分页、乐观锁、Goal/Memory API 与 Agent OS 页面 | `apps/api/src/agent-os/`, `apps/web/src/stores/agentOs.ts` |
| P0 Signal Engine / Signal Feed | 将真实 `InsightEvent(RANK_SURGE)` 组织级映射为 `RANKING_JUMP` 信号，保留排名前后值、来源事件、证据和状态；Signal Feed 支持研究、忽略和权限控制 | `apps/api/src/agent-os/signal-engine.ts`, `apps/api/src/routes/agent-os-signals.ts`, `apps/web/src/components/agent-os/AgentOsSignalFeed.vue` |
| P0 Supervisor | 7 个现有业务 skill 的确定性注册、计划、证据门禁和刷新建议 | `apps/agent/src/supervisor.ts` |
| P0 Workflow Engine | 可暂停/恢复的多节点 runtime、快照校验、七个路线图模板（含 Ranking Jump Workflow）、数据库运行记录 | `apps/agent/src/workflow-runtime.ts`, `apps/agent/src/workflow-templates.ts`, `apps/api/src/agent-os/workflow-runner.ts` |
| Phase 0 Data Quality | 真实 Store 的数据源、采集新鲜度、域健康和映射问题汇总；Workflow 执行前覆盖调用方输入中的伪造质量状态 | `apps/api/src/agent-os/data-quality-adapter.ts` |
| Phase 3 Intelligence | Opportunity / Decision / Experiment 持久化与 CRUD，Before/After、归因、结论和 Memory 候选 | `apps/agent/src/*-engine.ts`, `apps/api/src/agent-os/intelligence-store.ts` |
| Phase 4 Action Gateway | Proposal、Approval、Execution、幂等、审计、Verification、组织隔离和权限守卫 | `apps/api/src/agent-os/action-gateway.ts` |
| Phase 5 初始低风险动作 | `RECOLLECT_DATA`、`CREATE_TASK`、`CREATE_REPORT`、`SEND_EMAIL`、`SEND_FEISHU` 使用真实 Store/报告/通知服务 | `apps/api/src/agent-os/action-gateway.ts` |

Workflow 生成的 Ads、Pricing、Promotion、Listing 等动作仍是高风险/提案模式；没有真实执行器时 Gateway 明确拒绝执行，不会把“返回成功”当成完成。

## 必须外部验收的门槛

以下项目不能由本地测试替代：

- 真实私有店铺 SP-API shadow run、权限验证和 API 限流行为；
- 至少 7 个业务日的真实数据对账，以及 Sales/Inventory/Freshness/Data Quality 一致性；
- Worker 重启、跨进程恢复和长期运行；
- 有效 Authenticode/NSIS 发布包、真实 SMTP/飞书投递和正式发布授权。

## 既有基线验证证据（2026-08-14）

- shared：18 个文件 / 69 个用例；Agent：18 个文件 / 60 个用例；
- API：112 个文件 / 692 个用例（排除 browser）；Web：61 个文件 / 229 个用例；Desktop：3 个文件 / 31 个用例；
- API/shared/agent 类型检查、Web `vue-tsc`、Vite 隔离临时输出目录生产构建通过；
- OpenAPI 双向覆盖：255 条 Express 路由、260 个 OpenAPI endpoint，无缺失、重复或未文档化项；
- SP-API shadow 证据：5 个文件 / 32 个用例；发布门禁：6 个文件 / 23 个用例；
- 生产构建 smoke：`/api/health` 200、`/api/ready` 200（database ready、webAssets true）、未认证 Agent OS 数据质量接口 401；浏览器完成 Agent OS 登录、8 组数据请求、刷新、局部错误恢复和低风险动作审批/执行/验证。

工作区原有未提交 WIP 未被回退；Agent OS 变更按文件边界与其余 WIP 分离。

## 2026-08-20 PRD 增量验证

- Signal Feed 路由回归：3 个文件 / 3 个用例通过；覆盖真实 `RANK_SURGE` 映射、`PRICE_DROP`/`RANK_DROP` 排除、状态更新、研究启动、审批恢复、Action/Memory 产出和重复请求幂等。
- Agent 模板回归：Workflow template/runtime 与 API workflow 路由共 25 个用例通过；模板数已更新为 7 个。
- API `tsc --noEmit`、Web `vue-tsc --noEmit` 通过；OpenAPI 双向覆盖为 259 条 Express 路由、264 个 endpoint，无缺失、重复或未文档化项。
- 清理后的 Agent 全量构建（shared、Agent、API、Web、Desktop）已通过；真实店铺、长期 Worker、发布包和外部模型仍按上方门槛验收。
