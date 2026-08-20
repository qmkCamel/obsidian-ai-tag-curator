# 端上模型支持调研

调研日期：2026-08-19

基线分支：`codex/on-device-model-research`，从 `origin/main` 的 `6a0d33a` 创建。

## 结论摘要

AI Tag Curator 可以支持端上模型，但第一阶段不应该把目标定义为“在 Obsidian 插件里直接调用 Apple / Google 原生端上 AI SDK”。当前插件是 Obsidian TypeScript 插件，AI 调用边界已经收敛在 `AiProvider.completeJson()`，最可落地的路径是先把本地 OpenAI-compatible endpoint 做成一级 provider，再把 Apple / Google 原生端上能力作为需要桥接的实验能力。

推荐路线：

1. **V1：本地 OpenAI-compatible endpoint**

   支持 Ollama、LM Studio、LocalAI、Google LiteRT-LM CLI `serve` 等本地 HTTP 服务。这个路线对当前代码侵入最小，也能覆盖“数据不出设备”的核心诉求。

2. **V2：macOS Apple Foundation Models helper**

   做一个独立 Swift helper 或 localhost service，由 Obsidian 插件通过 HTTP 调用。它可以使用 Apple `SystemLanguageModel` 或 Core AI，但需要 macOS 26+/27+、Apple Intelligence 可用性判断，以及短上下文 prompt 方案。

3. **V3：Google LiteRT-LM / AICore 原生桥接**

   Android AICore / Gemini Nano、ML Kit GenAI、LiteRT-LM Kotlin/Swift 都是原生 app API，不适合 Obsidian 插件直接调用。可以在有伴生 app 或原生桥接时再推进。

4. **不建议作为主路径：Chrome Prompt API 或直接内嵌 WebGPU runtime**

   Chrome Prompt API 面向 Chrome 页面/扩展，不等于 Obsidian Electron 环境。LiteRT-LM JS / MediaPipe Web 可以在浏览器/WebGPU 里跑模型，但模型体积、WebGPU 兼容、Obsidian 插件包大小和移动端能力都会带来较高维护成本。

## 当前插件架构约束

### AI provider 边界

当前 AI 抽象很薄：

- `src/ai/AiProvider.ts` 定义 `completeJson(messages): Promise<string>`。
- `src/ai/OpenAICompatibleProvider.ts` 固定调用 `${apiBaseUrl}/chat/completions`。
- 当前请求体固定包含 `model`、`messages`、`temperature: 0.2`、`response_format: { type: "json_object" }`。
- 当前 provider 强制要求 `apiKey`，本地无鉴权服务会被入口前置校验拦住。

这说明端上模型支持不需要重写推荐、健康报告或批量预览逻辑，但需要补一层 provider factory / capability profile，而不是继续在入口处直接 `new OpenAICompatibleProvider(...)`。

### AI 入口

当前 AI 使用点有三类：

- 当前笔记推荐：`src/main.ts` 的 `suggestTagsForCurrentNote()`。
- 标签健康 AI 分析：`src/main.ts` 的 `analyzeTagHealth()` 回调。
- 文件夹批量推荐：`src/main.ts` 的 `generateFolderBatch()` 和 `FolderBatchRecommendationRunner`。

几个现状会影响端上模型：

- 当前所有 AI 入口都用 API key 作为可用性门槛；本地 provider 需要允许空 key。
- 文件夹批量 runner 固定最多 2 并发。对云端 provider 合理，但对本地小模型、Apple `LanguageModelSession` 或 GPU 资源受限设备，应该可配置为 1。
- 当前取消逻辑只能丢弃晚到结果，不能撤回已经发出的 provider 请求；本地端上模型可以继续复用这个语义。

### Prompt 上下文压力

当前 prompt 对云端小模型可接受，但对端上模型偏重：

- 当前笔记推荐会发送当前笔记内容最多 10000 字符，并附带 top 100 vault tags。
- 健康分析会发送最多 20 个 risk groups、top 100 tags、相关 tag details。
- Apple 文档明确说明系统模型上下文窗口为 4096 tokens；中文约接近一字一 token。当前 10000 字符正文很容易超限。

因此端上模型不只是换 provider，还需要新增 `edge-small` prompt profile：

- 当前笔记正文压到 2500-4000 字符，或者先用本地规则提取摘要/标题/段落头。
- vault tags 从 top 100 降到 30-50，并优先放与当前笔记已有标签、路径、标题相近的标签。
- 健康报告只送 top 8-12 risk groups。
- 文件夹批量默认并发 1，并把每篇笔记请求变短。

## Apple 端上能力评估

### Foundation Models

Apple Foundation Models 是原生 Swift API，用于访问 Apple Intelligence 使用的模型。官方文档描述它可访问 on-device 和 Private Cloud Compute 模型，支持结构化输出、tool calling、动态 profile、图像输入等能力。`SystemLanguageModel` 是端上文本 foundation model，平台可用性从 iOS/iPadOS/macOS/visionOS 26 开始。

对本项目的匹配点：

- 标签推荐、摘要、实体抽取、文本理解、文本分类、从文本生成标签，属于 Apple 文档列出的适用任务。
- `SystemLanguageModel.UseCase.contentTagging` 与本插件“标签治理/推荐”方向高度贴合。
- guided generation 能降低 JSON 格式漂移风险，但它是 Swift 类型系统能力，不能被当前 TypeScript 插件直接使用。

主要限制：

- 只能从原生 Swift 代码直接调用；Obsidian 插件不能直接 import FoundationModels。
- 必须先检查 `SystemLanguageModel.availability`，不可用原因包括 Apple Intelligence 未开启、设备不支持、模型未就绪。
- 端上系统模型上下文窗口只有 4096 tokens，不适合直接吃当前 prompt。
- Apple 系统模型会随 OS 更新升级，prompt 需要版本化和回归验证。

可行接入方式：

- macOS 桌面实验：Swift helper 监听 `127.0.0.1`，暴露 `/v1/chat/completions` 或插件自定义 `/complete-json`。
- helper 内部使用 `SystemLanguageModel.default` 或 `SystemLanguageModel(useCase: .contentTagging)`。
- 插件侧只把它当 `local-openai-compatible` 或 `apple-foundation-helper` provider。
- 如果 helper 不可用、模型不可用或上下文超限，插件显示明确 fallback，而不是静默切云端。

不建议：

- 不建议在 Obsidian 插件里直接绑定 Apple 原生 SDK。Community plugin 运行在 JS 环境，跨平台发布和移动端支持都会被破坏。
- 不建议第一阶段承诺 iOS/iPadOS Obsidian 可用。没有 Obsidian 官方原生桥接时，移动端插件无法直接使用 Foundation Models。

### Core AI / 自带模型

Apple WWDC26 提到 Core AI 是把自有模型带到 Apple 设备端上运行的框架；Foundation Models 文档也说明可以把 Core AI 模型加载进同一 `LanguageModelSession` API。官方文章要求 macOS 27、iOS 27、Xcode 27 或更高。

对本项目而言，Core AI 更适合后续高级路线：

- 适合把开源小模型随 helper/app 分发，降低 Apple Intelligence 设备限制。
- 但模型导出、bundle 体积、AOT 编译、平台差异和性能评估成本明显高于本地 HTTP endpoint。
- 不适合作为近期插件内置能力。

## Google 端上能力评估

### Android Gemini Nano / AICore / ML Kit GenAI

Google Android 文档说明，Gemini Nano 运行在 Android AICore 系统服务中，适合无网络、低成本和隐私优先场景。ML Kit GenAI API 基于 AICore，提供 Prompt、Summarization、Proofreading、Rewriting、Image Description、Speech Recognition 等高层能力。

对本项目的匹配点：

- Prompt / Summarization 能覆盖标签推荐、笔记摘要、健康问题归并。
- AICore 管理模型更新和安全能力，适合 Android 原生 app。

主要限制：

- 这是 Android app 原生 API，不是 Obsidian 插件 JS API。
- 没有 Obsidian 官方 Android native bridge 时，插件无法直接调 AICore。
- 即使通过伴生 Android app 桥接，也需要处理 app 间通信、权限、后台生命周期和本地数据传输边界。

建议：

- 不作为 AI Tag Curator 的 V1 目标。
- 只在未来明确做 Android 伴生 app 时评估。

### Chrome Prompt API / Gemini Nano in Chrome

Chrome Prompt API 使用 Chrome 内置 Gemini Nano。官方文档说明 API 内置在 Chrome，模型首次使用时下载，并要求特定硬件条件；后续使用无需网络，且使用模型时不会把数据发给 Google 或第三方。

对本项目的限制：

- 它面向 Chrome 页面或 Chrome extension，不等于 Obsidian Electron 环境。
- Obsidian 桌面是否暴露同等 Chromium built-in AI API 不可假设。
- 移动 Chrome 不支持这些生成类内置 AI API。

建议：

- 不作为 Obsidian 插件 provider 主路径。
- 除非未来做浏览器扩展版本或 Obsidian 官方切到支持该 API 的运行环境，否则只保留为背景技术观察。

### Google LiteRT-LM

LiteRT-LM 是 Google AI Edge 的跨平台 LLM runtime，支持 Android、iOS、Web、Desktop、IoT，并提供 CLI、Python、Kotlin、Swift、JavaScript、C++ 等入口。官方文档显示：

- CLI 是稳定入口。
- Kotlin 用于 Android/JVM。
- Swift 是 iOS/macOS early preview。
- JavaScript web API 是 WebGPU early preview。
- 支持 Gemma、Llama、Phi、Qwen 等模型。

对本项目最重要的是 CLI `serve`：

- `litert-lm serve` 默认在 `9379` 启动 OpenAI-compatible server。
- 支持 `GET /v1/models` 和 `POST /v1/chat/completions`。
- 这可以被当前 `OpenAICompatibleProvider` 复用，只需要允许空 API key、配置本地 preset、处理不支持 `response_format` 的情况。

这是 Apple/Google 端上模型中对当前插件最实际的接入点。

LiteRT-LM JS / WebGPU 的问题：

- JS API 仍是 early preview，当前支持有限 web-compatible 模型。
- 模型文件以 GB 级为主，不适合随 Obsidian 插件打包。
- 需要 WebGPU，Obsidian Electron 的 Chromium 版本、权限和硬件路径需要实测。
- 插件生命周期、内存占用和模型下载管理复杂。

建议：

- V1 支持 LiteRT-LM CLI `serve`，作为本地 provider preset。
- 不在插件内直接集成 LiteRT-LM JS runtime，除非后续有明确的桌面 only 版本和模型管理设计。

### MediaPipe LLM Inference

Google Web/Android/iOS LLM Inference API 仍可运行端上模型，但 2026 文档已提示 MediaPipe LLM Inference API 进入 maintenance-only，并建议迁移到 LiteRT-LM。它不应作为新能力主路径。

## 实现方案建议

### Phase 1：本地 OpenAI-compatible provider

目标：让用户能配置本机模型 endpoint，不需要 API key，也能看到隐私和上下文提示。

建议改动：

- `TagCuratorSettings` 增加：
  - `providerType: "openai-compatible" | "local-openai-compatible"`
  - `providerPreset?: "openai" | "deepseek" | "ollama" | "lm-studio" | "litert-lm" | "custom"`
  - `supportsJsonMode?: boolean`
  - `providerConcurrency?: 1 | 2`
  - `promptProfile?: "default" | "edge-small"`
- 新增 `src/ai/AiProviderFactory.ts`，入口统一从 factory 创建 provider。
- `OpenAICompatibleProvider` 改为：
  - API key 可选，只有非本地 provider 才强制。
  - `Authorization` header 只在 key 非空时发送。
  - `response_format` 由 capability 控制，避免本地服务不支持时报错。
- 设置页增加 provider preset 和连接测试按钮。
- 本地 preset 默认只建议 `127.0.0.1` / `localhost`，如果用户填 LAN/公网地址，需要提示“内容会离开当前设备或当前机器”。

推荐 preset：

| Preset | Base URL | API key | 说明 |
| --- | --- | --- | --- |
| LiteRT-LM CLI | `http://127.0.0.1:9379/v1` | 可空 | Google AI Edge 官方 OpenAI-compatible server |
| Ollama | `http://127.0.0.1:11434/v1` | 可空 | 常见本地模型服务 |
| LM Studio | 用户本地端口 | 可空 | 常见桌面本地模型服务 |
| Custom local | 用户填写 | 可空 | 只做 loopback 风险提示 |

验收标准：

- 不配置 API key 时，本地 provider 可用。
- 本地 provider 连接失败时能显示 base URL、模型名和失败原因。
- 当前笔记推荐、健康分析、文件夹批量都走同一个 provider factory。
- mock provider 和本地 no-key provider 都有单元测试覆盖。

### Phase 2：端上 prompt profile

目标：让端上小模型实际能稳定返回结果。

建议改动：

- `buildRecommendationMessages()` 增加 prompt profile 参数。
- `edge-small` 限制：
  - note content：2500-4000 字符。
  - vaultTags：30-50 个。
  - examples：每个 tag 最多 1 个、snippet 更短。
  - reason 字段限制一两句。
- `buildTagHealthAiMessages()` 在 `edge-small` 下限制 risk groups 到 8-12。
- 文件夹批量对本地 provider 默认并发 1。
- 增加 token/context 超限错误的用户提示。

验收标准：

- `edge-small` prompt 的快照测试固定。
- 对不支持 JSON mode 的 mock provider，仍能通过现有 parser 验证结构化 JSON。
- 文件夹批量本地 provider 使用 1 并发，云端 provider 仍可最多 2 并发。

### Phase 3：Apple helper POC

目标：验证 macOS Apple Foundation Models 能否通过本地 helper 服务完成标签推荐。

建议范围：

- 新建独立 `helpers/apple-foundation-models/`，不要直接塞进 Obsidian 插件包。
- Swift helper 暴露 loopback endpoint：
  - `GET /availability`
  - `POST /complete-json`
  - 可选 `/v1/chat/completions` 兼容层。
- helper 内部：
  - 检查 `SystemLanguageModel.availability`。
  - 使用 `contentTagging` use case 或默认 model。
  - 对上下文超限返回明确错误。
- 插件侧只增加 preset，不自动安装、不自动启动 helper。

验收标准：

- macOS 26+ 且 Apple Intelligence 可用时，当前笔记推荐能走 helper。
- Apple Intelligence 不可用时，设置页连接测试给出明确原因。
- 不影响 Windows/Linux/移动端。

### Phase 4：Google native bridge 观察项

短期不建议实现，除非产品明确扩展到伴生 app：

- Android AICore / ML Kit GenAI：需要 Android 原生桥接。
- LiteRT-LM Kotlin/Swift：需要原生 app 或 helper。
- LiteRT-LM JS：需要 Obsidian Electron WebGPU 实测、模型下载管理和内存预算。

## 风险和产品边界

- **“端上”需要精确定义。** 本地 HTTP endpoint 是“当前机器本地”，Apple/Gemini Nano 是“系统原生端上”，两者体验和可用性不同。
- **隐私提示必须具体。** 插件应告诉用户会发送当前笔记内容、已有标签、标签索引摘要、健康报告证据；本地 endpoint 也可能不是当前设备本地。
- **不能把 AI 可用性等同于动作可执行性。** 当前产品原则是规则决定可执行性，AI 只做解释、排序、候选目标；端上模型也不能改变这个边界。
- **不要随插件分发大模型。** 模型许可、体积、下载和设备兼容会让 Community plugin 发布复杂化。
- **移动端承诺要保守。** 当前 `manifest.json` 是 `isDesktopOnly: false`；任何 Node/Electron/native helper 能力都必须 desktop-gate，不能破坏移动端基础功能。

## 建议的近期任务拆分

1. 提案：`support-local-openai-compatible-provider`
   - provider factory
   - local preset
   - API key optional
   - response_format capability
   - connection test
   - privacy copy

2. 提案：`add-edge-small-prompt-profile`
   - prompt profile setting
   - recommendation/health prompt limits
   - local provider default concurrency
   - parser and snapshot tests

3. 实验：`apple-foundation-models-helper-poc`
   - Swift helper only
   - availability endpoint
   - compact recommendation request
   - macOS-only docs

## 官方资料

- Apple Foundation Models overview: https://developer.apple.com/documentation/foundationmodels
- Apple generating content with Foundation Models: https://developer.apple.com/documentation/foundationmodels/generating-content-and-performing-tasks-with-foundation-models
- Apple SystemLanguageModel: https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel
- Apple availability unavailable reasons: https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel/availability-swift.enum/unavailablereason
- Apple Core AI in Foundation Models session: https://developer.apple.com/documentation/foundationmodels/running-a-core-ai-model-in-a-foundation-models-session
- Apple WWDC26 Platforms State of the Union: https://developer.apple.com/videos/play/wwdc2026/112/
- Android Gemini Nano: https://developer.android.com/ai/gemini-nano
- Chrome Prompt API: https://developer.chrome.com/docs/ai/prompt-api
- Google LiteRT-LM overview: https://developers.google.com/edge/litert-lm/overview
- Google LiteRT-LM OpenAI-compatible server: https://developers.google.com/edge/litert-lm/cli/openai_server
- Google LiteRT-LM Web API: https://developers.google.com/edge/litert-lm/js
- Google MediaPipe LLM Inference Web guide: https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js
- Obsidian plugin submission requirements: https://docs.obsidian.md/community-directory/submission-requirements-for-plugins
