# tag-health-report-workflow Specification

## Purpose
Define the three-layer tag health report workflow: overview, AI-assisted priority actions, and local rule evidence, while keeping rule evidence as the source of truth for action safety.

## Requirements
### Requirement: 健康报告必须区分规则证据层和 AI 行动层

标签健康报告 SHALL 将规则分析展示为事实证据层，将 AI 辅助分析展示为行动建议层。

#### Scenario: 打开健康报告初始态

- **GIVEN** 规则标签健康分析已经完成
- **AND** 用户尚未运行 AI 辅助分析
- **WHEN** 打开健康报告
- **THEN** 报告展示总览统计
- **AND** 报告展示 AI 辅助分析初始态
- **AND** 报告展示规则证据明细
- **AND** 报告不展示空的优先处理项列表

#### Scenario: 规则证据始终可见

- **GIVEN** 健康报告已经打开
- **WHEN** AI 辅助分析尚未运行、正在运行或已经完成
- **THEN** 用户都可以查看规则证据明细
- **AND** 规则证据明细来自本地 `TagHealthReport.sections`

### Requirement: AI 辅助分析必须由用户显式触发

健康报告 SHALL 在初始态展示触发 AI 辅助分析的操作，而不是自动把 AI 结果混入规则报告。

#### Scenario: 用户尚未触发 AI

- **GIVEN** 健康报告处于初始态
- **WHEN** 用户查看 AI 行动层
- **THEN** UI 显示“生成 AI 辅助分析”操作
- **AND** UI 说明 AI 会合并跨规则问题、排序优先级并补充风险提示

#### Scenario: 用户触发 AI 后进入分析中态

- **GIVEN** 用户点击生成 AI 辅助分析
- **WHEN** AI 请求尚未完成
- **THEN** UI 展示非阻塞分析中状态
- **AND** UI 展示当前阶段说明
- **AND** 用户仍可查看规则证据明细

### Requirement: AI 结果必须聚合为优先处理项

AI 辅助分析完成后，健康报告 SHALL 将 AI priorities 展示为优先处理项，而不是按六类问题生成另一份平行报告。

#### Scenario: AI 返回多个 priority

- **GIVEN** AI 辅助分析返回多个 priority
- **WHEN** 渲染 AI 结果态
- **THEN** UI 展示优先处理项列表
- **AND** 每个优先处理项展示标签、优先级、置信度、诊断、建议动作和规则证据来源
- **AND** 优先处理项按优先级和置信度排序

#### Scenario: AI priority 匹配本地清理计划项

- **GIVEN** 一个 AI priority 的 issue type 和 tags 匹配本地 cleanup plan item
- **WHEN** 生成优先处理项
- **THEN** 该优先处理项继承本地 cleanup action capability
- **AND** 如果本地能力为 `executable`，UI 可以展示应用按钮

#### Scenario: AI priority 未匹配本地清理计划项

- **GIVEN** 一个 AI priority 未匹配任何本地 cleanup plan item
- **WHEN** 生成优先处理项
- **THEN** 该优先处理项不得展示应用按钮
- **AND** 该优先处理项应展示为需要人工判断

### Requirement: AI 不得改变动作可执行性

AI 辅助分析 SHALL 只能影响解释、排序、候选目标标签和风险提示，SHALL NOT 改变本地 action capability。

#### Scenario: AI 建议执行本地不可执行项

- **GIVEN** 本地 cleanup plan item 的能力为 `observeOnly` 或 `manualReview`
- **AND** AI priority 建议处理该项
- **WHEN** 渲染优先处理项
- **THEN** UI 不展示应用按钮
- **AND** UI 显示本地动作能力状态

### Requirement: 规则证据明细必须保留六类分类

规则证据明细 SHALL 继续使用本地规则分析的六个问题分类。

#### Scenario: 查看规则证据分类

- **GIVEN** 健康报告已经打开
- **WHEN** 用户查看规则证据明细
- **THEN** UI 展示低频标签、近似重复、过宽标签、过细标签、层级不一致、命名风格不一致六个分类入口
- **AND** 用户可以切换分类查看对应证据
- **AND** UI 说明规则明细只表示发现了什么，不直接表示必须处理

### Requirement: 复制报告必须反映新的信息层级

复制或导出健康报告 SHALL 先输出 AI 行动建议，再输出规则证据摘要。

#### Scenario: AI 已运行后复制报告

- **GIVEN** AI 辅助分析已经完成
- **WHEN** 用户复制健康报告或清理计划
- **THEN** Markdown 内容先包含优先处理项
- **AND** Markdown 内容包含每个优先处理项的规则证据来源
- **AND** Markdown 内容再包含规则证据摘要

#### Scenario: AI 未运行时复制报告

- **GIVEN** AI 辅助分析尚未运行
- **WHEN** 用户复制健康报告或清理计划
- **THEN** Markdown 内容说明 AI 辅助分析尚未运行
- **AND** Markdown 内容包含规则证据摘要
