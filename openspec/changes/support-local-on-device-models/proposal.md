## 为什么

当前 AI Tag Curator 只支持 OpenAI-compatible 云端或远端 HTTP provider，并把 API key 作为所有 AI 入口的前置条件。用户如果希望使用 Ollama、LM Studio、Google LiteRT-LM CLI `serve` 或后续 Apple Foundation Models helper 这类端上/本地模型，需要把它们伪装成带 API key 的云端 provider，体验和隐私边界都不清楚。

端上模型的主要价值不是“换一个模型名”，而是降低笔记内容离开设备的隐私顾虑和请求成本。要安全支持它，需要同时解决本地 endpoint 配置、空 API key、provider 能力差异、上下文窗口更小、文件夹批次本地并发压力、以及用户对“哪些内容会发给谁”的可见性。

## 变更内容

- 新增本地/端上模型 provider 配置能力，支持用户在设置页选择本地 OpenAI-compatible provider preset 或自定义 endpoint。
- 本地 provider 允许空 API key；只有非本地远端 provider 继续要求 API key。
- 所有 AI 入口统一通过 provider factory 创建 provider，不再在命令入口直接实例化 `OpenAICompatibleProvider`。
- provider capability 显式记录是否支持 JSON mode、推荐并发、prompt profile 和本地/远端隐私边界。
- 支持 LiteRT-LM CLI、Ollama、LM Studio 和自定义本地 endpoint 的预设；不自动安装、启动或下载任何模型。
- 增加 provider 连接测试，验证 base URL、模型名、鉴权和 JSON 输出能力，并展示明确失败原因。
- 当前笔记推荐改为持续可见、可最小化和可取消的非阻塞任务面板；同一时刻只允许一个当前笔记推荐任务，取消后丢弃晚到结果。
- 增加 `edge-small` prompt profile，为端上小模型收窄当前笔记、标签索引和健康报告上下文。
- 文件夹批次在本地 provider 下默认使用 1 并发；远端 provider 保持现有有界并发。
- 设置页展示当前笔记内容、标签索引摘要和健康报告证据会发送给 provider 的说明；对非 loopback endpoint 提示内容可能离开当前设备。
- 不在本次变更中直接集成 Apple Foundation Models、Android AICore、Chrome Prompt API 或 LiteRT-LM JS runtime。它们后续只能通过独立 helper、伴生 app 或明确的 runtime POC 接入。

## 能力

### 新增能力

- `local-on-device-model-provider`：用户可以把本机或端上模型以明确的本地 provider 方式接入当前笔记推荐、标签健康 AI 分析和文件夹批量推荐。

### 修改能力

- 无。现有 OpenAI-compatible 远端 provider 行为保持兼容。

## 影响

- 设置与文案：`src/settings/PluginSettings.ts`、`src/settings/SettingsTab.ts`、`src/ui/labels.ts`。
- AI provider：新增 provider factory / capability 模型，扩展 `src/ai/OpenAICompatibleProvider.ts`，可能新增 provider 测试服务。
- Prompt：扩展 `src/ai/PromptBuilder.ts`、`src/health/TagHealthAiPromptBuilder.ts`，支持默认和 `edge-small` profile。
- 编排入口：更新 `src/main.ts` 和文件夹批次 runner 的 provider 创建、配置前置检查和并发选择。
- 长任务交互：新增当前笔记推荐进度面板、单请求状态和取消后的晚到结果隔离。
- 预览与批次：更新批次设置快照，确保不持久化 API key，并记录 provider 类型、模型和 prompt profile。
- 文档：更新 README、路线图、产品交接文档，并引用 `docs/on-device-model-support-research.zh-CN.md`。
- 验证：新增 provider 配置、空 key、本地 preset、prompt profile、连接测试和批次并发相关单元/E2E 测试；不新增模型运行时依赖。
