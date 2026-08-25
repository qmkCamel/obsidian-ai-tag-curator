## Why

本地 provider 已经能够接入推荐、健康分析和文件夹批次，但设置页仍把连接必填项、provider 派生能力、推荐策略和诊断选项平铺在一起。Preset 切换还可能保留不兼容的模型名或旧远端 API key，长耗时连接测试只显示临时按钮状态，容易造成配置错误、密钥误发和分钟级等待期间缺少持续反馈。

## What Changes

- 将 provider preset 作为主要入口，并把连接、模型高级参数、推荐策略、索引批次和诊断反馈分组展示。
- 标准 preset 原子应用匹配的 provider type、base URL、模型默认值、JSON mode、并发和 prompt profile；切换到本地 endpoint 时不得继续发送旧远端 API key。
- 仅在自定义 preset 下暴露 provider type；按远端/本地条件展示 API key 的必填或可选语义，并按开关条件展示新标签严格程度。
- 为 provider 连接测试增加设置页内持续状态、阶段、已用时间、取消/晚到结果隔离、持久成功或失败结果，同时保持其他设置可交互。
- 更新中英文 README、CHANGELOG、设置截图、Ollama/Qwen3.8 安装验证和故障排查说明。

## Capabilities

### New Capabilities

- `local-provider-settings-experience`: 覆盖安全的 preset 切换、条件化设置、分组信息架构和长耗时 provider 连接测试体验。

### Modified Capabilities

无。现有 `support-local-on-device-models` change 尚未归档为主规格，本 change 以独立 follow-up capability 固化新增体验约束。

## Impact

- 设置与 provider：`src/settings/PluginSettings.ts`、`src/settings/SettingsTab.ts`、`src/ai/AiProviderFactory.ts` 和中英文标签。
- UI 与样式：设置分组、连接测试状态组件及 `styles.css`。
- 验证：provider preset 单元测试、设置页 E2E、长耗时完成/取消/失败隔离和真实 Obsidian/Ollama smoke。
- 文档：`README.md`、`README.zh-CN.md`、`CHANGELOG.md` 和设置截图。
