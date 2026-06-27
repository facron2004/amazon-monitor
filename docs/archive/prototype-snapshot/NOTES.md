# Action Center Prototype — 选型观察

## 状态
- 3 个 variants 全部就绪,可在 `?variant=A | B | C` 之间切换
- 浮动底栏 + 键盘 ← → 切换
- 共用同一份 store 数据,无 mock

## 选型问题
在 Action Center 这个密度下,哪类信息架构让"扫描 → 判断 → 跟进"最顺?

## 三个 variant 的结构差异

| 维度 | A — 紧凑扫描 | B — 三栏 status | C — Master-detail 停靠 |
|------|--------------|------------------|------------------------|
| 信息架构 | event-centric,无详情 | status-centric,看漏斗 | event-centric,常驻详情 |
| 行高 | ~52px 表格式 | ~46px 极简 | ~80px 中等密度 |
| 详情位置 | inline 推一行 | 列内底部 strip 60% 高 | 右侧 docked 面板 |
| KPI 形状 | 2 排 (4+3) | 单排 5 (全 status) | 单排 5 (severity+status) |
| 复盘队列 | 横排 strip 贴 KPI 下 | 拆分到中列 | 不显示(详情在 docked) |
| 抽屉 | 无 | 仅"打开完整"按钮触发 | 小屏 fallback |

## 选完后请填

**胜出方案**:[A / B / C]

**关键原因**:
1. 
2. 
3. 

**次选中的具体偷的部分**(从其他 variants 拿过来的设计元素):
- 

## 收尾 TODO(胜出后)
1. 删 `apps/web/src/components/action-center/prototype/` 整个目录
2. `App.vue` 恢复 4 行变更(line 14 减 4 行、line 163 恢复原状)
3. 把胜出方案**用 production 标准**重写回 `ActionCenterPanel.vue`(不复用 prototype 文件)
4. 跑 `npm run test` + `npm run build` 全绿
5. 写 commit message,ADR 或者 issue
