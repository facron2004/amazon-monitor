# ADR-0006: Action Center 信息架构选型 — Variant B（三栏 status）

- 状态: Accepted
- 日期: 2026-06-27
- 范围: `apps/web/src/components/ActionCenterPanel.vue`
- 取代: `apps/web/src/components/action-center/prototype/`（已删除）

## 背景

Action Center 之前用单列表 + 行内展开详情（pre-0.3.0）。当事件密度上来（5-20 条/天，跨 status / severity / 来源），用户扫读成本高、判断入口分散，跟进动作（review / watch / setStatus）藏在 row 内部菜单里，操作链路长。

为了在落地 production 前验证信息架构，做了三个 prototype variants 放在 `action-center/prototype/` 下，用 `?variant=A|B|C` URL 参数切换跑了一轮内部使用。

## 三个 Variant 的差异

| 维度 | A — 紧凑扫描 | B — 三栏 status | C — Master-detail 停靠 |
|------|--------------|------------------|------------------------|
| 信息架构 | event-centric,无详情 | status-centric,看漏斗 | event-centric,常驻详情 |
| 行高 | ~52px 表格式 | ~46px 极简 | ~80px 中等密度 |
| 详情位置 | inline 推一行 | 列内底部 strip 60% 高 | 右侧 docked 面板 |
| KPI 形状 | 2 排 (4+3) | 单排 5（全 status） | 单排 5（severity+status） |
| 复盘队列 | 横排 strip 贴 KPI 下 | 拆分到中列 | 不显示（详情在 docked） |
| 抽屉 | 无 | 仅"打开完整"按钮触发 | 小屏 fallback |

## 决策

**胜出方案: B — 三栏 status**

**关键原因**:

1. **状态闭环可视化** — TODO / Watching+ReviewPending / Followed+Reviewed+Ignored 三栏让用户一眼看清"待办漏斗"深度，避免在长列表里滚动找"今天还有几件没处理"。Insight 流程本质是漏斗，三栏比单列表忠实于这个心智模型。
2. **扫描 → 判断 → 跟进 路径最短** — 卡片直接列在所属 status 下方，点开 → 详情抽屉 → setStatus/watch/review 三个 action 都在抽屉里。Variant A 详情 inline 推一行会顶开上下文，Variant C 常驻 docked 让小屏 fallback 痛苦。
3. **KPI 行直接反映状态分布** — 5 个 KPI 全是 status 计数（TODO / P0 / Review Due / Confirmed / Risk），和列首的"todoColumn.length"等 computed 共用同一份数据源，没有重复计算。

**次选中的偷的部分**:

- **Variant C 的抽屉动画/键盘交互细节** —— 点开卡片后抽屉从右侧滑入，Esc 关闭、上下方向键切换同列卡片，已并入 production `InsightEventDrawer.vue`。
- **Variant A 的 2 排 KPI 排布** —— 移动端窄屏 fallback 时降级成 2 排（5+0 改成 3+2），参考自 Variant A 的"主+次"分组。

## 落地

- 删除 `apps/web/src/components/action-center/prototype/` 整目录（10 文件, ~75KB），包括 3 个 variants / shared 工具 / PrototypeSwitcher / usePrototypeVariant / NOTES。
- `App.vue` 移除 `?variant=` 分支，恢复单 `<ActionCenterPanel>` 渲染。
- `ActionCenterPanel.vue` 用 production 标准重写：去掉 prototype-only 的 switcher / 三选一 mount，引入 3 个 status computed + 单一抽屉 + filter 草稿缓存。文件长度从 prototype 单 variant 的 ~400 行 → production 634 行（多出：filter 草稿、column 切换、drawer 状态机、KPI 卡片、retry/refresh 按钮）。
- 相关 store 字段迁移：`useInsightEventsStore` 增加 `brandPlaybook` / `selectedPriceHistory` / `filters` 草稿协同。

## 收尾

- ✅ 测试 715 全过（80 文件）
- ✅ `npm run build` 通过（ActionCenterPanel 25.5 kB gzip 8.7 kB）
- ✅ `App.vue` 移除 prototype 分支
- ✅ production `ActionCenterPanel.vue` 重写完成
- ✅ `action-center/prototype/` 已永久物理删除（v0.4.0）

## 参考

- 早期 prototype 选型笔记：`apps/web/src/components/action-center/prototype/NOTES.md`（已随目录删除，决策保留在本 ADR）
- `useCategoryDailyBriefing.ts:179` 的 lane 分桶注释：原本引用 "prototype VariantC" 的描述已在 prototype 删除后改为脱离 prototype 命名的版本（"三栏右抽屉"）。