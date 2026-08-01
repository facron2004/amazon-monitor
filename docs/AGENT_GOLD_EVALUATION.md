# Agent 真实金标验收

此流程顺序调用已安装 Electron 内的真实 Agent，不直接读取 OpenAI API Key，
也不以 mock 或评分器单测代替模型结果。

## 前置条件

1. 在 Agent 中心通过 Windows safeStorage 保存真实 OpenAI API Key，或完成 ChatGPT OAuth。
2. 关闭应用后，用内部验收开关重新启动：

   ```powershell
   $env:AGENT_SDK_ENABLED = "true"
   Start-Process "E:\Program\Amazon\release\electron\win-unpacked\Amazon Monitor.exe"
   ```

3. 确认应用已登录且 Agent 中心显示 API、Agent、Crawler 均为 running。

## 运行 30 题

不要把登录密码或 API Key 写进命令行参数。先通过安全输入将登录密码放入当前
PowerShell 进程的临时环境变量：

```powershell
$securePassword = Read-Host "Amazon Monitor password" -AsSecureString
$credential = [pscredential]::new("admin", $securePassword)
$env:AGENT_EVAL_PASSWORD = $credential.GetNetworkCredential().Password
npm run agent:eval
```

运行器会在当前组织内自动选择：

- 一个启用类目；
- 同站点的一个启用关键词；
- 十个有效竞品 ASIN；
- 两个已观察品牌。

也可复制并填写 `docs/agent-gold-scope.example.json`，然后运行：

```powershell
npm run agent:eval -- --scope docs/agent-gold-scope.example.json
```

结果写入 `output/agent-gold-evaluation-<timestamp>.json`，包含每题运行 ID、
终态、错误、完整审计导出、五项指标、目标判定和实际评估范围。任务严格串行，
单题失败会被计入结果并继续下一题；单题等待超时会先请求取消对应 Agent 运行，
再继续下一题，避免留下并发运行。

## 人工复核

高优提醒有效率和任务恢复率不能由模型自行给自己打分。首次运行后，将报告中的
`scope` 保存为新的 scope JSON，并根据运行审计填写：

- `anomaly-03`、`patrol-01` 的 `alertValid`；
- `price-04`、`keyword-04`、`review-03`、`patrol-02` 的
  `recoverySucceeded`。

未完成这些标注或任一 PRD 指标未达标时，命令退出码为 `2`；认证、网络或配置
错误退出码为 `1`；仅在标注完整且全部指标达标时退出码为 `0`。

完成后清除当前进程中的临时密码：

```powershell
Remove-Item Env:AGENT_EVAL_PASSWORD
```

## 2026-08-01 正式运行记录

最新正式运行使用安装包内的真实 OAuth Agent，逐题串行、单题窗口 `600000ms`，共 30 题；报告为
`output/agent-gold-evaluation-exe-formal-strict-2026-08-01.json`。30 题均有终态，预期工具均已完成，
data support `100%`、unsupported deterministic `0%`、tool success `100%`。

运行时新增了确定性 preflight：根据请求先收集只读证据、限制模型可见工具集合，并把每个计划工具的
缺失/陈旧状态合并回最终 freshness。这样候选范围缺证据时会降级为 `missing`，置信度上限 `0.49`，
只留下 `recollect`。

人工复核范围保存在 [`agent-gold-scope-formal-2026-08-01.json`](agent-gold-scope-formal-2026-08-01.json)，
标注后的派生报告为 `output/agent-gold-evaluation-exe-formal-strict-annotated-2026-08-01.json`：

- `anomaly-03` 未输出高优确定性异常，freshness 缺失且仅保留补采，记为 `alertValid=true`；
- `patrol-01` 的高优行动均有类目/关键词/价格/评分证据并受审批保护，记为 `alertValid=true`；
- `price-04`、`review-03`、`patrol-02` 的批准补采均产生 completed recovery；其中两个 recovery 共用同一去重 job，均被启动；
- `keyword-04` 没有产生补采需求且正常终态，按“无需恢复”的 no-op 语义记为 `recoverySucceeded=true`。

recovery 运行现在会携带原始 Agent 请求，避免采集完成后只剩 run ID 而无法重建分析范围。相关 fan-out 和上下文回归由 API 测试覆盖。
