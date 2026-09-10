## MODIFIED Requirements

### Requirement: 可执行动作必须具备预览、日志和撤销

可执行动作 SHALL 只在具备文件级及来源级预览、非空目标标签、操作日志、冲突检测和撤销/恢复路径时展示审查控件；确定性 rename/merge 可以修改用户明确选择且位置可信的 frontmatter 与正文 inline tag，其他正文位置保持不可执行。

#### Scenario: 渲染可执行计划项

- **GIVEN** 一个可用性为 `executable` 的 rename/merge 清理计划项
- **WHEN** 渲染该计划项
- **THEN** UI 展示“审查变更”控件而不是立即写入控件
- **AND** UI 展示受影响文件和 frontmatter/inline 来源摘要
- **AND** UI 说明正文改写只针对进入专用审查后由用户选择的可信 tag occurrence

#### Scenario: 审查可执行计划项

- **GIVEN** 一个可用性为 `executable` 且目标标签非空的计划项
- **WHEN** 用户点击审查变更
- **THEN** 系统读取该计划项的受影响文件并生成位置级预览
- **AND** UI 区分 frontmatter diff、可信 inline occurrence 和不可执行正文来源
- **AND** 生成、展示、切换选择或取消审查都不修改 Markdown

#### Scenario: 应用可执行计划项

- **GIVEN** 用户已经审查并选择至少一个可信 frontmatter 或 inline 变更
- **AND** 用户完成二次确认
- **WHEN** 插件写入标签变更
- **THEN** 插件只修改当前计划项中明确选择的文件和 tag occurrence
- **AND** 插件记录每个写入文件的写入前后 tags、正文状态 hash 和最小 inline patch
- **AND** 插件不修改任何未选位置或周围正文
- **AND** 插件在稳定状态后刷新标签索引

#### Scenario: 正文位置不可信时降级

- **GIVEN** 一个相关 inline tag 只有 fallback parser 证据或 cache position 与正文不匹配
- **WHEN** 系统计算该位置的执行能力
- **THEN** 该位置只能展示为人工处理且不能被选择
- **AND** AI 分析不得把该位置升级为可执行

#### Scenario: 应用范围包含未选或不可执行位置

- **GIVEN** 用户留下至少一个 source occurrence 未处理
- **WHEN** 用户确认其余选择
- **THEN** UI 必须把结果标记为部分清理并展示剩余数量
- **AND** 系统不得声称该 source tag 已经在所有受影响位置完成替换

#### Scenario: 回退最近一次新清理操作

- **GIVEN** 已经应用一个 schemaVersion 2 清理操作
- **AND** 所有目标文件仍匹配记录中的写入后 tags 和正文状态
- **WHEN** 用户点击回退
- **THEN** 插件恢复选择范围内每个文件的写入前 tags 和 inline token
- **AND** 插件移除对应操作日志
- **AND** 插件刷新标签索引

#### Scenario: 回退历史 frontmatter-only 清理操作

- **GIVEN** 最新记录是没有 schemaVersion 的历史 cleanup 记录
- **WHEN** 用户点击回退
- **THEN** 插件沿用历史行为只恢复 frontmatter tags
- **AND** 插件不得推断或改写任何正文位置

#### Scenario: 回退时检测到用户后续修改

- **GIVEN** 已经应用一个清理计划项
- **AND** 用户随后手动修改了同一文件的 frontmatter tags 或正文
- **WHEN** 用户点击回退
- **THEN** 插件不得覆盖用户后续修改
- **AND** 整次回退保持零写入并展示冲突文件

#### Scenario: 未解决操作阻断新写入

- **GIVEN** 存在 applying、undoing 或 recoveryRequired 的 cleanup 或 folder batch 记录
- **WHEN** 用户尝试执行新的清理、推荐或批次写入
- **THEN** 插件不得开始新的写入
- **AND** UI 引导用户先处理唯一固定目标的恢复操作
