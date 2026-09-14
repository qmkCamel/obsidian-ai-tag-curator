## ADDED Requirements

### Requirement: 历史按真实来源和证据投影

系统 SHALL 展示推荐、folder batch、健康清理、手动管理及已完成 receipt，按操作序列排序；缺失时间/模型/原值 SHALL 显示未知或旧记录说明，不得用当前设置推断。

#### Scenario: 混合旧新记录
- **WHEN** 历史包含无 type 的推荐、legacy cleanup、V2 cleanup 和 batch
- **THEN** 各自按显式类型守卫正确展示，推荐时间来自 plan.createdAt
- **AND** 未记录的模型不显示为当前模型，原 V2 缺 origin 时显示健康清理

#### Scenario: 已撤销操作仍可查询
- **WHEN** 一次撤销或回滚成功
- **THEN** 在删除活动记录的同次持久化中保存轻量 receipt
- **AND** 重载后保留状态、路径和可用标签差异，不保留无用正文 patch

### Requirement: 撤销资格按全局最新活动记录判断

系统 SHALL 只允许全局最新且支持撤销的活动记录进入预检，按 recordId 在取得 lease 后重验；筛选、旧 Modal 或旧命令 SHALL NOT 跳过更晚操作。

#### Scenario: 较晚操作属于另一类型
- **WHEN** 清理 A 之后有推荐 B，用户从旧 A 卡片点击撤销
- **THEN** 系统要求先处理 B，不按最新 cleanup 类型绕过
- **AND** 即使 A 与 B 文件互不相交也不开放乱序撤销

#### Scenario: 旧推荐命令目标不是最新
- **WHEN** 当前笔记最近操作并非全局最近活动记录
- **THEN** 原撤销命令说明顺序限制且不写入
- **AND** 历史过滤不改变资格

### Requirement: 不同记录保留真实恢复能力边界

系统 SHALL 将推荐、batch 与 V2 cleanup 路由到其实际恢复服务；legacy 多文件 cleanup 在所有入口只读，未知 schema 阻断写入，不能伪造 V2 能力。

#### Scenario: 只读 legacy cleanup
- **WHEN** 最新记录是没有 V2 恢复信息的 cleanup
- **THEN** UI 展示详情和只读原因，不提供绕过按钮
- **AND** 不越过该记录撤销更旧操作

#### Scenario: 旧格式单篇推荐
- **WHEN** 推荐记录可撤销但没有原始 tags 值快照
- **THEN** 显示旧记录格式边界并执行真实的单文件冲突检查
- **AND** 不宣称恢复不存在于记录中的原始大小写/排版

### Requirement: 冲突预检与固定目标恢复不可弱化

撤销 SHALL 全量预检；missing/conflict 时预检整次零写入。执行中失败 SHALL 通过原补偿路径收敛或保留固定恢复目标，不允许跳过文件继续宣称成功。

#### Scenario: 部分文件后续编辑
- **WHEN** batch 或 V2 cleanup 任一文件发生不兼容的后续变更
- **THEN** 列出冲突文件并保持预检零写入
- **AND** 其他文件不先行撤销

#### Scenario: 撤销中断并重载
- **WHEN** 撤销已写部分文件后插件重载
- **THEN** 依据持久化 undoing 状态对账并保持既定恢复方向
- **AND** 未解决期间只读浏览可用，新写入被阻断

### Requirement: 历史容量不得破坏恢复证据

系统 SHALL 固定保留未解决记录，沿用 operationLogLimit 限制完成记录、最多 100 条 receipt，并在意图保存前执行 20 MiB UTF-8 预算；超限 SHALL 阻断而非丢弃新事务证据。

#### Scenario: 调小历史上限
- **WHEN** 存在 recoveryRequired 且用户调小 operationLogLimit
- **THEN** 未解决记录不被淘汰
- **AND** 清理仅影响允许清理的完成记录或旧 receipt

#### Scenario: 单条新意图超过预算
- **WHEN** 正常清理完成历史后新意图仍无法满足预算
- **THEN** 要求缩小范围，在 Markdown 写入前停止
- **AND** 不先写笔记再省略日志

### Requirement: 历史数据只包含恢复所需信息

操作和 receipt SHALL NOT 保存 API key、完整 Markdown、AI 响应、搜索词或 UI 正文上下文；未知记录不得自动被清空以恢复正常页面。

#### Scenario: 检查新数据序列化
- **WHEN** 手动管理、AI 推荐和撤销产生 plugin data
- **THEN** 只有明确允许的配置、路径、标签值、状态与必要最小 patch
- **AND** 历史详情不把隐藏的敏感字段渲染出来
