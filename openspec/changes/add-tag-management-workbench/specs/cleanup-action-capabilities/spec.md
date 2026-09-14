## ADDED Requirements

### Requirement: 手动管理不得改变健康诊断权限

独立手动重命名/合并入口 SHALL 以明确的用户意图验证执行资格，健康报告入口 SHALL 继续使用原动作能力矩阵；系统 SHALL NOT 通过伪造健康问题或修改 availability 复用执行器。

#### Scenario: 手动意图复用审查
- **WHEN** 用户明确选择一个标签及新目标
- **THEN** 系统通过独立 manual adapter 生成确定性输入
- **AND** 复用位置审查与 V2 执行，不创建虚假 nearDuplicates 问题

#### Scenario: AI 输出声称可以删除
- **WHEN** AI 对 observeOnly/manualReview 项提出自动删除或拆分
- **THEN** 健康卡片仍不展示执行控件
- **AND** 工作台存在手动入口不能提升该 AI 项权限

### Requirement: 新旧清理入口共享前向策略与原值约束

确定性健康清理与手动清理 SHALL 同时满足公共 scope/policy、lease、原值保护、预览与恢复要求；已有 inline occurrence 的可信位置边界 SHALL 保持不变。

#### Scenario: 健康卡片命中保护 source
- **WHEN** 用户从旧健康卡片尝试清理保护标签
- **THEN** 审查和执行都阻止受保护差异并显示原因
- **AND** 不因该卡片原本 executable 而绕过策略

#### Scenario: 未选属性和正文保持不变
- **WHEN** 清理包含选中属性 source 与正文 token
- **THEN** 只改变明确选择的值，保护/未选属性字面量保持不变
- **AND** 不可信正文位置继续只读，AI 不得升级其资格
