## ADDED Requirements

### Requirement: 设置页提供反馈入口

系统 SHALL 在 AI Tag Curator 设置页展示一个可识别的反馈入口，并说明该入口会打开项目的 GitHub 反馈页面。

#### Scenario: 用户查看设置页

- **WHEN** 用户打开 AI Tag Curator 设置页
- **THEN** 页面展示与当前界面语言一致的反馈名称、说明和操作按钮

### Requirement: 显式打开公开反馈渠道

系统 SHALL 仅在用户点击反馈按钮后打开项目的新建 GitHub Issue 页面。

#### Scenario: 用户点击反馈按钮

- **WHEN** 用户点击设置页中的反馈按钮
- **THEN** 系统在外部浏览上下文中打开项目的新建 GitHub Issue 页面
- **AND** 插件不自动附带 Vault 内容、API key、API 地址或模型配置
