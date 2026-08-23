## 背景

当前插件的 AI 抽象是 `AiProvider.completeJson(messages)`，实际实现只有 `OpenAICompatibleProvider`。它固定向 `${apiBaseUrl}/chat/completions` 发送请求，并固定带 `Authorization: Bearer <apiKey>` 与 `response_format: { type: "json_object" }`。`main.ts` 中当前笔记推荐、标签健康 AI 分析和文件夹批量推荐都直接 `new OpenAICompatibleProvider(...)`，入口也把 `apiKey.trim()` 为空视为不可运行。

这对 OpenAI、DeepSeek 等远端 provider 合理，但不适合端上/本地模型：

- Ollama、LM Studio、LiteRT-LM CLI `serve` 等本机 endpoint 通常不需要 API key；
- 一些本地 OpenAI-compatible 服务不支持 `response_format`，但仍可以通过 prompt 和本地 parser 返回 JSON；
- 端上小模型上下文窗口更小，当前“笔记最多 10000 字符 + top 100 tags”的 prompt 对 Apple `SystemLanguageModel` 这类 4096 token 级别模型过重；
- 文件夹批次最多 2 并发适合远端 provider，但可能让本地 GPU/CPU 模型性能和交互体验明显下降；
- 用户需要知道内容是否只发给 `127.0.0.1`，还是会发给局域网、公网或云端 provider。

调研结论见 `docs/on-device-model-support-research.zh-CN.md`。本变更先解决本地 OpenAI-compatible endpoint 这条最短路径。Apple Foundation Models、Android Gemini Nano/AICore、Chrome Prompt API、LiteRT-LM JS/WebGPU 都不直接进入插件 runtime。

## 目标与非目标

**目标：**

- 让用户可以明确选择本地 OpenAI-compatible provider，并在不配置 API key 的情况下使用本机 endpoint；
- 保持现有远端 OpenAI-compatible provider 兼容；
- 统一当前笔记、健康报告和文件夹批次的 provider 创建和配置前置逻辑；
- 用 provider capability 控制 JSON mode、默认并发和 prompt profile；
- 为端上小模型提供收窄上下文的 `edge-small` prompt profile；
- 在设置页和批次范围确认中展示具体隐私边界和发送内容说明；
- 增加连接测试，帮助用户区分 endpoint 不可达、模型名错误、鉴权错误、JSON mode 不支持和返回非 JSON；
- 不持久化 API key 到批次快照、操作日志或导出的 Markdown。

**非目标：**

- 不自动安装、启动、下载或管理 Ollama、LM Studio、LiteRT-LM、Apple helper 或任何模型文件；
- 不把 Apple Foundation Models、Android AICore、ML Kit GenAI、Chrome Prompt API 或 LiteRT-LM JS runtime 直接打包进 Obsidian 插件；
- 不在本次变更中实现 macOS Swift helper、Android 伴生 app、Chrome extension 或 WebGPU 模型加载器；
- 不随插件分发 GB 级模型文件；
- 不改变 AI 只提供解释、排序和候选标签的产品边界；动作可执行性仍由本地规则和预览/确认/回退链路决定；
- 不引入遥测、后台自动请求或静默云端 fallback。

## 决策

### 1. Provider 类型、预设和能力分离

扩展 `TagCuratorSettings`：

```ts
type AiProviderType = "openai-compatible" | "local-openai-compatible";
type AiProviderPreset = "openai" | "deepseek" | "ollama" | "lm-studio" | "litert-lm" | "custom";
type AiPromptProfile = "default" | "edge-small";

interface TagCuratorSettings {
  providerType: AiProviderType;
  providerPreset: AiProviderPreset;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  supportsJsonMode: boolean;
  providerConcurrency: 1 | 2;
  promptProfile: AiPromptProfile;
  // existing settings...
}
```

默认值保持远端 OpenAI-compatible：

- `providerType = "openai-compatible"`
- `providerPreset = "openai"`
- `apiBaseUrl = "https://api.openai.com/v1"`
- `model = "gpt-4o-mini"`
- `supportsJsonMode = true`
- `providerConcurrency = 2`
- `promptProfile = "default"`

本地 preset 建议值：

| Preset | Type | Base URL | API key | JSON mode 默认 | 并发默认 | Prompt profile 默认 |
| --- | --- | --- | --- | --- | --- | --- |
| OpenAI | `openai-compatible` | `https://api.openai.com/v1` | 必填 | true | 2 | default |
| DeepSeek | `openai-compatible` | `https://api.deepseek.com` | 必填 | true | 2 | default |
| LiteRT-LM CLI | `local-openai-compatible` | `http://127.0.0.1:9379/v1` | 可空 | false | 1 | edge-small |
| Ollama | `local-openai-compatible` | `http://127.0.0.1:11434/v1` | 可空 | false | 1 | edge-small |
| LM Studio | `local-openai-compatible` | 用户填写 | 可空 | false | 1 | edge-small |
| Custom | 用户选择 | 用户填写 | 按类型判断 | 用户选择 | 用户选择 | 用户选择 |

预设只填充设置，不代表插件负责启动服务。切换 preset 时，设置页应显示即将覆盖 base URL、JSON mode、并发和 prompt profile 的明确状态；是否保留现有 model 由实现决定，但必须避免静默清空用户已填模型。

### 2. Provider factory 统一入口

新增 `AiProviderFactory` 或等价模块，提供：

- `createAiProvider(settings): AiProvider`
- `validateProviderSettings(settings): ProviderConfigState`
- `getProviderCapabilities(settings): ProviderCapabilities`
- `testProviderConnection(settings): Promise<ProviderTestResult>`

所有 AI 入口必须经过 factory：

- 当前笔记推荐；
- 标签健康 AI 分析；
- 文件夹批量推荐；
- 文件夹失败项重试。

入口前置检查从“API key 是否为空”改为“当前 provider 配置是否满足运行要求”：

- 远端 provider：API key 必填；
- 本地 provider：API key 可空；
- base URL 和 model 对所有 provider 必填；
- base URL 必须是 http/https URL；
- 本地 provider 如果不是 loopback host，应显示隐私警告，但不强行禁止，因为用户可能有明确的局域网模型服务。

`OpenAICompatibleProvider` 扩展为 capability 驱动：

- 只在 `apiKey.trim()` 非空时发送 `Authorization` header；
- 只有 `supportsJsonMode` 为 true 时发送 `response_format`；
- 对 HTTP 状态码、空响应、非 JSON body、choices 缺失和 content 为空给出可读错误；
- 不把 API key 拼入错误信息。

备选方案：

- 继续在 `main.ts` 中按 provider 类型分支：短期简单，但会让三条 AI 入口和重试路径漂移，拒绝采用；
- 新增完全独立本地 provider 协议：会绕开现有 Chat Completions 兼容路径，第一阶段成本过高，拒绝采用；
- 对本地 provider 自动补一个假 API key：能绕过当前校验，但会把配置语义做错，拒绝采用。

### 3. 连接测试验证真实行为而非只保存配置

设置页新增“测试 provider”操作。测试流程：

1. 验证本地配置字段；
2. 优先请求 `GET /models` 或 `GET /v1/models`，如果 provider 不支持该 endpoint，不直接判失败；
3. 发送一个最小 Chat Completions 请求，要求返回固定小 JSON，例如 `{"ok": true}`；
4. 如果 `supportsJsonMode = true`，测试应覆盖 `response_format`；
5. 如果返回非 JSON 或 parser 失败，提示用户关闭 JSON mode 或更换模型/prompt profile；
6. 测试结果只显示 endpoint、模型、provider 类型和错误类别，不显示 API key。

测试请求必须由用户点击触发；打开设置页不得自动发请求。

### 4. Prompt profile 明确收窄端上上下文

新增 `AiPromptProfile`：

- `default`：保持现有云端 prompt 行为；
- `edge-small`：为端上/本地小模型减少上下文和输出长度。

`edge-small` 建议限制：

- 当前笔记正文最多 2500-4000 字符；
- vault tags 最多 30-50 个；
- 每个 tag 示例最多 1 个，snippet 更短；
- 健康报告 risk groups 最多 8-12 个；
- 输出 reason 限制为短句；
- 系统提示明确“只返回 JSON，不要解释 JSON 之外的文本”。

如果本地 provider 不支持 JSON mode，仍依赖 prompt 和现有 parser 验证结果；解析失败不写入任何 Markdown，并显示清晰错误。

`edge-small` 不改变安全边界：

- AI 仍不能决定动作可执行性；
- 文件夹批次仍只允许选中、预览、确认后的 frontmatter tags 写入；
- 健康报告 AI 仍只影响解释、排序、候选目标和风险提示。

### 5. 本地 provider 的批次并发默认降为 1

文件夹批量 runner 的并发由 provider capability 决定：

- 远端 provider 默认 2；
- 本地 provider 默认 1；
- 用户可在设置中显式调整到 1 或 2，但必须受现有有界并发限制；
- 批次开始时把 provider 类型、模型、prompt profile、并发和 JSON mode 冻结到设置快照，但不得保存 API key。

取消语义保持现有边界：已经发出的本地请求不一定能被 provider 中止；插件只保证取消后不再领取新任务，并丢弃晚到结果。

### 6. 隐私文案必须区分“本机”“局域网/自定义”“远端”

设置页和文件夹范围确认中的 provider 提示至少说明：

- 当前笔记推荐会发送当前笔记内容片段、已有标签和标签索引摘要；
- 文件夹批次会按每篇笔记向 provider 发送内容片段和标签索引摘要；
- 标签健康 AI 分析会发送本地规则发现的问题、标签统计和有限示例；
- API key 保存在本地插件数据中，但不会进入批次快照或操作日志；
- `127.0.0.1` / `localhost` 可以描述为本机 endpoint；
- 局域网 IP、公网域名或非 loopback host 不能描述为“数据不出设备”，需要提示内容会发送到该地址；
- 远端 provider 需要用户自行信任其服务条款和数据处理方式。

### 7. Apple/Google 原生端上能力作为后续桥接

本次 spec 不实现原生 SDK，但为后续留出兼容路径：

- Apple Foundation Models helper 可以暴露 loopback OpenAI-compatible endpoint 或 `/complete-json`，插件侧作为本地 provider preset 接入；
- Android AICore / Gemini Nano 需要 Obsidian 官方 native bridge 或伴生 app，不进入当前插件 JS runtime；
- Chrome Prompt API 只在 Chrome 页面/扩展环境可用，不作为 Obsidian provider 主路径；
- LiteRT-LM JS/WebGPU 需要模型管理、WebGPU 兼容和内存预算设计，另行 POC。

### 8. 当前笔记推荐使用持续可见的单请求任务面板

真实 Ollama/Qwen3.8 验收中，当前笔记推荐耗时达到分钟级。短暂 Notice 会在请求完成前消失，因此当前笔记推荐需要独立于全屏 modal 的持续任务状态：

- 任务面板固定在工作区右下角，移除遮罩并允许用户继续切换、阅读和编辑其他笔记；
- 面板展示“读取笔记”“准备标签索引”“请求 AI”三个阶段、模型名和从用户启动动作开始计算的已用时间；
- 用户可以最小化面板，但最小化后仍保留可见的状态行、已用时间和展开入口；
- 当前笔记推荐采用 single-flight 状态。同一任务尚未结束时，再次运行命令不会发送第二个 provider 请求，而是提示已有任务正在运行；
- 用户取消后，面板立即进入取消状态，禁用取消按钮，并继续说明已发出的 provider 请求可能仍在运行；
- `requestUrl` 不保证支持中止已发出的请求，因此取消边界与文件夹批次一致：插件丢弃晚到结果，不打开结果 modal、不写 Markdown、不更新操作日志；
- 为避免两个本地模型请求同时占用资源，取消后的任务在底层请求 settle 前仍占用 single-flight 槽位。settle 后关闭面板并允许新任务；
- 正常完成关闭进度面板并打开原始目标笔记的推荐结果，即使用户期间已切换到其他笔记；失败仍保留本地确定的 inline 同步项。

备选方案：

- 只延长 Notice：无法提供取消、阶段或重复提交保护，拒绝采用；
- 取消后立即允许重试：已发请求无法可靠中止，可能让本地 provider 并发过载，拒绝采用；
- 阻塞整个工作区直到完成：会破坏后台生成与无关交互能力，拒绝采用。

## 风险与取舍

- **本地不等于安全。** 用户可能配置局域网或公网 endpoint，因此 UI 必须按 host 明确提示。
- **JSON mode 兼容性分裂。** 通过 capability 和连接测试处理，不把 `response_format` 作为所有 provider 的硬要求。
- **端上模型质量波动。** 使用 `edge-small` profile 和 parser 防线降低失败面；不保证所有本地模型都能稳定完成健康分析。
- **模型服务不可控。** 插件不管理服务进程，只负责配置、测试、调用和错误呈现。
- **移动端边界。** 当前 manifest 仍支持移动端，所有 desktop/helper 相关文档和未来能力必须 gate，不得引入顶层 Node/Electron/native 依赖。
- **用户期望自动化。** 本变更不做自动模型安装或一键启动，避免扩大权限和发布复杂度。
