# inline-health-actions Specification

## Purpose
Define how tag health report issue cards expose cleanup actions inline, including affected-file previews, single-item scoped application, and undo for the latest cleanup action.

## Requirements
### Requirement: 问题内联动作

系统 SHALL 在产生清理建议的健康问题卡片内部展示可执行的清理控件。

#### Scenario: 在诊断后展示动作

- **WHEN** 某个健康问题包含可执行的清理建议
- **THEN** 该问题卡片先展示分析详情，再展示内联动作面板

#### Scenario: 不需要独立清理区块

- **WHEN** 标签健康报告弹窗渲染可执行问题
- **THEN** 用户无需依赖单独的“清理审查计划”区块即可理解或应用该动作

### Requirement: 应用前展示影响预览

系统 SHALL 在允许用户应用动作前展示受影响文件数量，以及标签写入前后的预览。

#### Scenario: 用户审查受影响文件

- **WHEN** 某个清理动作会影响一个或多个文件
- **THEN** 内联动作面板展示受影响文件数量
- **AND** 面板展示受影响文件的当前标签和建议后标签

### Requirement: 显式且限定范围的应用

当用户点击某个问题的应用按钮时，系统 SHALL 只应用当前已审查问题对应的动作。

#### Scenario: 应用单个问题

- **WHEN** 用户应用某个问题的内联动作
- **THEN** 只有该问题动作中包含的文件会被修改
- **AND** 无关的健康问题保持未应用状态

### Requirement: 清理回退

系统 SHALL 支持回退最近一次已应用的清理动作。

#### Scenario: 应用后可回退

- **WHEN** 某个清理动作已被应用
- **THEN** 弹窗展示最近一次清理动作的回退入口

#### Scenario: 回退恢复原标签

- **WHEN** 用户确认回退最近一次清理动作
- **THEN** 系统将受影响文件恢复到记录中的前一标签状态
