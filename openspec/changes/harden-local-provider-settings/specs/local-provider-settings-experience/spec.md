## ADDED Requirements

### Requirement: Provider preset 切换必须原子且不得跨 endpoint 复用凭据
系统 SHALL 将标准 provider preset 作为主要连接入口，并在 preset 实际变化时原子应用该 provider 的连接和能力默认值。

#### Scenario: 从远端 provider 切换到 Ollama
- **GIVEN** 当前设置为远端 provider，包含非空 API key 和远端 model
- **WHEN** 用户选择 Ollama preset
- **THEN** provider type 变为本地 OpenAI-compatible
- **AND** base URL 变为 `http://127.0.0.1:11434/v1`
- **AND** API key 被清空
- **AND** model 被清空并提示用户选择本机已安装模型
- **AND** JSON mode、provider concurrency 和 prompt profile 使用 Ollama 安全默认值

#### Scenario: 在标准 preset 下调整模型
- **GIVEN** 用户已选择 Ollama preset
- **WHEN** 用户填写本机模型名或修改高级模型参数
- **THEN** 系统保存这些 override
- **AND** provider preset 仍保持 Ollama

#### Scenario: 用户选择自定义 provider
- **WHEN** 用户选择自定义 preset
- **THEN** 设置页展示 provider type 和可编辑 base URL
- **AND** 系统要求用户显式完成与该 endpoint 匹配的连接设置

### Requirement: 设置页必须按用户任务分组并条件显示字段
系统 SHALL 将设置分为通用、AI 服务连接、高级模型设置、标签推荐、索引与批量处理、诊断与反馈，并只展示当前上下文需要的字段。

#### Scenario: 标准本地 preset
- **GIVEN** 用户选择 Ollama、LM Studio 或 LiteRT-LM CLI
- **WHEN** 设置页重新渲染
- **THEN** provider type 不作为独立可编辑字段展示
- **AND** base URL 展示 preset 派生值但不可编辑
- **AND** API key 标记为可选本地鉴权
- **AND** 高级模型设置默认折叠

#### Scenario: 自定义远端 provider
- **GIVEN** 用户选择自定义 preset 和远端 provider type
- **WHEN** 设置页重新渲染
- **THEN** base URL 可编辑
- **AND** API key 标记为必填
- **AND** 隐私边界显示当前 endpoint host

#### Scenario: 禁止新标签
- **GIVEN** “允许新标签”已关闭
- **WHEN** 设置页展示标签推荐分组
- **THEN** “新标签严格程度”不显示
- **AND** 已保存严格程度保持不变

### Requirement: Provider 连接测试必须提供持续且非阻塞的任务反馈
系统 SHALL 在设置页内持续展示 provider 连接测试的阶段、模型、已用时间和最终结果，并保持其他设置可交互。

#### Scenario: 长耗时连接测试运行中
- **WHEN** 用户启动 provider 连接测试且 chat completion 尚未返回
- **THEN** 测试按钮被禁用以阻止重复提交
- **AND** 状态区域持续更新阶段和已用时间
- **AND** 用户仍可修改与 provider 无关的设置
- **AND** 已保存 provider 配置保持可见

#### Scenario: 连接测试成功
- **WHEN** 模型列表探测和最小 chat completion 完成且返回有效 JSON
- **THEN** 状态区域持久展示成功、model、JSON mode 状态和完成时间
- **AND** 用户可以再次运行测试

#### Scenario: 连接测试失败
- **WHEN** endpoint、鉴权、模型、JSON mode 或返回格式验证失败
- **THEN** 状态区域持久展示可操作的错误类别和信息
- **AND** 最后保存的 provider 配置不被清空或替换

#### Scenario: 用户取消尚未进入 chat 阶段的测试
- **WHEN** 用户在模型探测完成前取消连接测试
- **THEN** 系统不得启动新的 chat completion
- **AND** 状态区域显示测试已取消

#### Scenario: 用户取消已经发送 chat 的测试
- **WHEN** 用户在 chat completion 已发送后取消连接测试
- **THEN** UI 说明底层请求可能继续运行
- **AND** 请求 settle 前系统阻止重复测试
- **AND** 晚到结果不得覆盖取消状态或新的 provider 配置

### Requirement: 文档与截图必须覆盖可复现的本地 Provider 路径
系统 SHALL 在中英文 README、CHANGELOG 和设置截图中准确说明当前本地 provider 能力、安装配置和验证边界。

#### Scenario: 用户按 Ollama 文档从零配置
- **WHEN** 用户阅读 README 的 Ollama 快速开始
- **THEN** 文档提供 runtime 安装、模型拉取、服务/API 检查、插件配置和连接测试步骤
- **AND** 文档区分文本 Chat Completions 能力与 vision、speech、embeddings、tools/agent 等未接入能力
- **AND** 文档提供 endpoint 不可达、模型名错误和 JSON mode 不兼容的故障排查

#### Scenario: 用户查看设置截图和变更记录
- **WHEN** 用户查看 README 和 CHANGELOG
- **THEN** 设置截图展示当前分组后的本地 provider 界面且不包含凭据
- **AND** CHANGELOG 记录本地 provider 设置加固和长耗时连接测试行为
