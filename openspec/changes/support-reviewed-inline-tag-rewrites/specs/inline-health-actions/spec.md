## MODIFIED Requirements

### Requirement: 应用前展示影响预览

系统 SHALL 在允许用户应用动作前先展示健康卡片内的影响摘要，再通过专用审查界面展示所有选中文件的 frontmatter diff、inline occurrence diff、不可执行位置和最终选择汇总。

#### Scenario: 用户在健康卡片查看影响摘要

- **WHEN** 某个清理动作会影响一个或多个文件
- **THEN** 内联动作面板展示受影响文件数量和来源摘要
- **AND** 面板提供“审查变更”入口
- **AND** 点击入口前没有 Markdown 文件被修改

#### Scenario: 用户审查受影响文件

- **GIVEN** 系统已经 hydrate 当前动作的受影响文件
- **WHEN** 专用审查界面打开
- **THEN** UI 按文件展示当前与建议后的 frontmatter tags
- **AND** UI 逐位置展示可信 inline tag 的行号、上下文和 token diff
- **AND** UI 展示读取失败、位置不可信或用户未选的剩余来源

#### Scenario: 审查期间切换选择

- **WHEN** 用户选择或取消 frontmatter/inline 变更
- **THEN** UI 重新计算将修改的文件和 occurrence 数
- **AND** 审查期保持零写入且不创建 operation record

### Requirement: 显式且限定范围的应用

当用户从某个健康问题进入专用审查并完成二次确认时，系统 SHALL 只应用当前问题中用户明确选择且通过快照验证的变更，并准确说明完整或部分清理结果。

#### Scenario: 应用单个问题的全部可信变更

- **GIVEN** 用户保留当前问题的全部可信 frontmatter 和 inline 变更
- **WHEN** 用户完成最终确认并且全量预检通过
- **THEN** 只有该问题动作中包含的选中文件和 occurrence 被修改
- **AND** 无关健康问题保持未应用状态
- **AND** 操作结果展示修改文件数和 occurrence 数

#### Scenario: 应用单个问题的部分变更

- **GIVEN** 用户取消部分 occurrence 或存在不可执行位置
- **WHEN** 用户确认其余选择
- **THEN** 系统只应用其余可信选择
- **AND** 结果明确标记为部分清理并保留剩余数量

#### Scenario: 应用前发生快照冲突

- **GIVEN** 任一选中文件在审查后发生内容、tags 或存在性变化
- **WHEN** 用户确认应用
- **THEN** 整个当前问题动作保持零写入
- **AND** UI 展示分类冲突并要求重新审查

### Requirement: 清理回退

系统 SHALL 支持回退最近一次已应用的清理动作，并在正文或 frontmatter 已变化、进程中断或补偿不完整时提供冲突安全且目标固定的恢复入口。

#### Scenario: 应用后可回退

- **WHEN** 某个清理动作已经稳定应用
- **THEN** 弹窗展示最近一次清理动作的回退入口
- **AND** UI 说明回退会恢复该操作选择过的 frontmatter 和 inline token

#### Scenario: 回退恢复原标签与正文 token

- **GIVEN** 所有目标文件仍匹配操作记录中的 after 状态
- **WHEN** 用户确认回退最近一次清理动作
- **THEN** 系统将受影响文件恢复到记录中的 before tags 和 before inline token
- **AND** 未被原操作修改的正文保持不变

#### Scenario: 回退存在冲突

- **GIVEN** 任一目标文件在应用后被删除或修改
- **WHEN** 用户尝试回退
- **THEN** 整次回退保持零写入
- **AND** UI 展示 missing 或 conflict 文件而不覆盖用户修改

#### Scenario: 展示未解决恢复

- **GIVEN** cleanup 记录处于 applying、undoing 或 recoveryRequired
- **WHEN** 用户打开恢复入口
- **THEN** UI 展示每个文件的 before、bodyChanged、after、conflict 或 missing 状态
- **AND** UI 只允许重试记录中固定的 before/after 恢复目标
- **AND** 用户不能临时改变恢复方向
