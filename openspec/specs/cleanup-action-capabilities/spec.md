# cleanup-action-capabilities Specification

## Purpose
Define the local action capability model for tag cleanup suggestions, including which suggestions are executable, preview-only, observe-only, or manual-review, and the safety constraints required before any Markdown write is allowed.

## Requirements
### Requirement: 清理建议必须暴露明确的动作能力

每个由标签健康问题生成的清理计划项 SHALL 包含 action capability 对象，用于区分诊断文案和执行资格。

#### Scenario: 近似重复合并建议

- **GIVEN** 一个类型为 `nearDuplicates` 且建议为 `merge` 的标签健康问题
- **WHEN** 生成清理计划项
- **THEN** 该计划项包含动作类型 `mergeTags`
- **AND** 该计划项包含可用性 `executable`
- **AND** 该计划项必须要求受影响文件预览
- **AND** 该计划项必须要求目标标签

#### Scenario: 低频观察建议

- **GIVEN** 一个类型为 `lowFrequency` 且建议为 `observe` 的标签健康问题
- **WHEN** 生成清理计划项
- **THEN** 该计划项包含动作类型 `observeOnly`
- **AND** 该计划项包含可用性 `observeOnly`
- **AND** 该计划项不可执行

### Requirement: 不可执行动作永远不能展示应用控件

清理计划 UI SHALL 阻止仅观察和仅人工判断动作展示任何应用、执行或一键处理控件。

#### Scenario: 渲染仅观察计划项

- **GIVEN** 一个可用性为 `observeOnly` 的清理计划项
- **WHEN** 渲染该计划项
- **THEN** UI 展示仅观察状态标签
- **AND** UI 不展示应用按钮
- **AND** 复制和导出控件仍然可用

#### Scenario: 渲染仅人工判断计划项

- **GIVEN** 一个可用性为 `manualReview` 的清理计划项
- **WHEN** 渲染该计划项
- **THEN** UI 展示人工判断状态标签
- **AND** UI 不展示应用按钮
- **AND** 复制和导出控件仍然可用

### Requirement: 可执行动作必须具备预览、日志和撤销

可执行动作 SHALL 只在具备文件预览、目标标签、操作日志和撤销路径时展示应用控件。

#### Scenario: 渲染可执行计划项

- **GIVEN** 一个可用性为 `executable` 的清理计划项
- **WHEN** 渲染该计划项
- **THEN** UI 展示应用按钮
- **AND** UI 展示受影响文件预览
- **AND** UI 说明当前只写入 frontmatter tags

#### Scenario: 应用可执行计划项

- **GIVEN** 一个可用性为 `executable` 的清理计划项
- **AND** 用户点击应用
- **WHEN** 插件写入标签变更
- **THEN** 插件只修改受影响文件的 frontmatter tags
- **AND** 插件记录每个写入文件的写入前 tags 和写入后 tags
- **AND** 插件刷新标签索引

#### Scenario: 回退最近一次清理操作

- **GIVEN** 已经应用一个清理计划项
- **WHEN** 用户点击回退
- **THEN** 插件根据操作日志恢复每个文件的写入前 tags
- **AND** 插件移除对应操作日志
- **AND** 插件刷新标签索引

#### Scenario: 回退时检测到用户后续修改

- **GIVEN** 已经应用一个清理计划项
- **AND** 用户随后手动修改了同一文件的 frontmatter tags
- **WHEN** 用户点击回退
- **THEN** 插件不得覆盖用户后续修改
- **AND** 插件提示回退失败

### Requirement: 仅预览动作保持只读

仅预览动作 SHALL 展示计划影响和可导出的审查详情，但 SHALL NOT 修改 Markdown 文件。

#### Scenario: 仅预览计划项被纳入 Markdown 导出

- **GIVEN** 一个可用性为 `previewOnly` 的清理计划项
- **WHEN** 用户导出或复制清理计划
- **THEN** 导出的计划包含动作类型、可用性、风险等级、目标标签要求和受影响文件预览详情
- **AND** 没有 Markdown 文件被修改

### Requirement: AI 增强分析不能提升动作可执行性

AI 增强分析 SHALL 只能为清理计划提供解释、排序、候选目标标签和风险提示，SHALL NOT 修改 action availability 或绕过本地动作能力矩阵。

#### Scenario: AI 建议处理低频标签

- **GIVEN** 一个本地动作能力为 `observeOnly` 的低频标签计划项
- **AND** AI 增强分析建议优先处理该标签
- **WHEN** 合并 AI 辅助信息到清理计划
- **THEN** 该计划项仍然保持 `observeOnly`
- **AND** UI 不展示应用按钮
- **AND** AI 建议只能作为说明或优先级提示展示

#### Scenario: AI 为人工判断项提供目标标签

- **GIVEN** 一个本地动作能力为 `manualReview` 的过宽标签计划项
- **AND** AI 增强分析提供了候选目标标签
- **WHEN** 合并 AI 辅助信息到清理计划
- **THEN** 该计划项仍然保持 `manualReview`
- **AND** 候选目标标签只能作为 AI 辅助建议展示
- **AND** 不能进入变更预览或执行路径

#### Scenario: AI 与本地动作矩阵冲突

- **GIVEN** AI 输出声称某个 `observeOnly` 或 `manualReview` 项可以执行
- **WHEN** 系统解析 AI 输出
- **THEN** 系统必须忽略该执行性判断
- **AND** 以本地动作能力矩阵为准
