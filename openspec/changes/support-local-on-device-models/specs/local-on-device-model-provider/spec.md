## ADDED Requirements

### Requirement: 用户必须能够选择本地 OpenAI-compatible provider

系统 SHALL 在设置中提供本地 OpenAI-compatible provider 配置，使用户可以把本机或端上模型服务用于当前笔记推荐、标签健康 AI 分析和文件夹批量推荐。

#### Scenario: 首次加载旧配置

- **GIVEN** 用户已有旧版本插件设置
- **WHEN** 插件合并默认设置
- **THEN** provider type 默认为远端 OpenAI-compatible
- **AND** API base URL、API key 和 model 保持旧配置语义
- **AND** 当前推荐、健康分析和文件夹批次行为保持兼容

#### Scenario: 用户选择 LiteRT-LM CLI preset

- **WHEN** 用户在设置页选择 LiteRT-LM CLI provider preset
- **THEN** 系统将 provider type 设置为本地 OpenAI-compatible
- **AND** 默认 base URL 指向 `http://127.0.0.1:9379/v1`
- **AND** API key 允许为空
- **AND** 默认 prompt profile 为 `edge-small`
- **AND** 默认 provider concurrency 为 1

#### Scenario: 用户选择 Ollama preset

- **WHEN** 用户在设置页选择 Ollama provider preset
- **THEN** 系统将 provider type 设置为本地 OpenAI-compatible
- **AND** 默认 base URL 指向 `http://127.0.0.1:11434/v1`
- **AND** API key 允许为空
- **AND** 系统提示用户仍需填写可用模型名

#### Scenario: 用户配置自定义本地 endpoint

- **GIVEN** 用户选择本地 OpenAI-compatible 自定义 provider
- **WHEN** 用户保存 base URL 和 model
- **THEN** 系统允许 API key 为空
- **AND** 系统保存 provider type、base URL、model、JSON mode、prompt profile 和并发设置
- **AND** 系统不得自动启动 endpoint 或下载模型

### Requirement: Provider 配置前置检查必须按 provider 类型执行

系统 SHALL 使用 provider 配置状态判断 AI 入口是否可以运行，而不是统一要求 API key。

#### Scenario: 远端 provider 缺少 API key

- **GIVEN** provider type 是远端 OpenAI-compatible
- **AND** `apiKey.trim()` 为空
- **WHEN** 用户运行任一 AI 入口
- **THEN** 系统提示用户先配置 API key
- **AND** 系统不读取笔记、不构建索引、不发起 provider 请求

#### Scenario: 本地 provider API key 为空

- **GIVEN** provider type 是本地 OpenAI-compatible
- **AND** API key 为空
- **AND** base URL 和 model 已配置
- **WHEN** 用户运行当前笔记标签推荐
- **THEN** 系统允许继续读取笔记、准备索引并请求本地 provider

#### Scenario: 本地 provider 缺少模型名

- **GIVEN** provider type 是本地 OpenAI-compatible
- **AND** model 为空
- **WHEN** 用户运行任一 AI 入口
- **THEN** 系统提示用户配置模型名
- **AND** 系统不发起 provider 请求

#### Scenario: 本地 provider base URL 非 loopback

- **GIVEN** provider type 是本地 OpenAI-compatible
- **AND** base URL host 不是 `localhost`、`127.0.0.1` 或 `::1`
- **WHEN** 设置页展示 provider 配置
- **THEN** 系统提示内容会发送到该地址，不能描述为只留在当前设备
- **AND** 用户仍可显式保存和使用该 endpoint

### Requirement: OpenAI-compatible 请求必须遵循 provider capability

系统 SHALL 根据 provider capability 构造 OpenAI-compatible Chat Completions 请求。

#### Scenario: API key 为空的本地请求

- **GIVEN** provider type 是本地 OpenAI-compatible
- **AND** API key 为空
- **WHEN** 系统发送 Chat Completions 请求
- **THEN** 请求 headers 不包含 Authorization
- **AND** 请求 body 包含已配置的 model 和 messages

#### Scenario: API key 非空的请求

- **GIVEN** provider 配置包含非空 API key
- **WHEN** 系统发送 Chat Completions 请求
- **THEN** 请求 headers 包含 Bearer Authorization
- **AND** 错误提示和日志不得包含 API key 明文

#### Scenario: Provider 支持 JSON mode

- **GIVEN** provider capability 标记支持 JSON mode
- **WHEN** 系统发送 Chat Completions 请求
- **THEN** 请求 body 包含 `response_format: { type: "json_object" }`

#### Scenario: Provider 不支持 JSON mode

- **GIVEN** provider capability 标记不支持 JSON mode
- **WHEN** 系统发送 Chat Completions 请求
- **THEN** 请求 body 不包含 `response_format`
- **AND** 系统仍要求 prompt 返回结构化 JSON
- **AND** 返回内容必须通过现有 parser 校验后才能展示或进入写入预览

### Requirement: 设置页必须提供显式连接测试

系统 SHALL 在设置页提供由用户显式触发的 provider 连接测试，并显示可操作的测试结果。

#### Scenario: 用户测试可用 provider

- **GIVEN** provider 配置完整
- **WHEN** 用户点击测试 provider
- **THEN** 系统发送最小测试请求
- **AND** 测试成功时显示 provider 可用、模型名和 JSON 输出能力状态

#### Scenario: Endpoint 不可达

- **GIVEN** provider base URL 指向不可连接地址
- **WHEN** 用户点击测试 provider
- **THEN** 系统显示 endpoint 不可达或网络失败
- **AND** 系统不修改用户已保存配置

#### Scenario: JSON mode 不兼容

- **GIVEN** provider capability 标记支持 JSON mode
- **AND** provider 返回 JSON mode 不支持错误
- **WHEN** 用户点击测试 provider
- **THEN** 系统提示关闭 JSON mode 或更换 provider/preset
- **AND** 系统不得把该错误泛化为 API key 错误

#### Scenario: 测试返回非 JSON 内容

- **GIVEN** provider 请求成功但返回内容不是可解析 JSON
- **WHEN** 用户点击测试 provider
- **THEN** 系统提示模型未按要求返回结构化 JSON
- **AND** 系统建议切换 prompt profile、模型或 JSON mode 设置

### Requirement: 端上小模型必须支持收窄上下文的 prompt profile

系统 SHALL 提供 `edge-small` prompt profile，用于降低端上或本地小模型的上下文压力。

#### Scenario: 当前笔记推荐使用默认 profile

- **GIVEN** prompt profile 为 `default`
- **WHEN** 系统构建当前笔记推荐 prompt
- **THEN** 系统保持现有内容截断和标签索引摘要规模

#### Scenario: 当前笔记推荐使用 edge-small profile

- **GIVEN** prompt profile 为 `edge-small`
- **WHEN** 系统构建当前笔记推荐 prompt
- **THEN** 当前笔记正文片段短于默认 profile
- **AND** vault tags 数量少于默认 profile
- **AND** 每个 tag 的示例数量少于或等于默认 profile
- **AND** prompt 明确要求只返回 JSON

#### Scenario: 健康报告 AI 分析使用 edge-small profile

- **GIVEN** prompt profile 为 `edge-small`
- **WHEN** 系统构建标签健康 AI 分析 prompt
- **THEN** risk groups、top tags 和 tag details 数量均少于或等于默认 profile
- **AND** 系统仍保留规则证据作为动作可执行性的来源

#### Scenario: edge-small provider 返回解析失败

- **GIVEN** 本地 provider 使用 `edge-small` profile
- **AND** provider 返回内容无法通过结构化 parser
- **WHEN** 系统处理 AI 结果
- **THEN** 系统不得修改 Markdown 文件
- **AND** 当前笔记或批次预览只能保留本地确定性项
- **AND** UI 显示 AI 结构化结果解析失败

### Requirement: 文件夹批次必须按 provider capability 控制并发和快照

系统 SHALL 在文件夹批次开始时冻结 provider 相关非敏感设置，并按 provider capability 控制 AI 请求并发。

#### Scenario: 本地 provider 启动文件夹批次

- **GIVEN** provider type 是本地 OpenAI-compatible
- **WHEN** 用户确认文件夹批次范围
- **THEN** 批次默认最多同时发起 1 个 provider 请求
- **AND** 批次设置快照包含 provider type、preset、model、prompt profile、JSON mode 和并发
- **AND** 批次设置快照不得包含 API key

#### Scenario: 远端 provider 启动文件夹批次

- **GIVEN** provider type 是远端 OpenAI-compatible
- **WHEN** 用户确认文件夹批次范围
- **THEN** 批次默认最多同时发起 2 个 provider 请求
- **AND** 仍受实现定义的有界并发上限保护

#### Scenario: 用户调整 provider 并发

- **GIVEN** 用户在设置中将 provider concurrency 设置为 1 或 2
- **WHEN** 新文件夹批次开始
- **THEN** 新批次使用该并发值
- **AND** 已开始的批次继续使用其冻结的并发快照

#### Scenario: 批次取消后本地请求晚到

- **GIVEN** 文件夹批次正在使用本地 provider 生成建议
- **AND** 用户取消批次
- **WHEN** 已发出的 provider 请求稍后返回
- **THEN** 系统丢弃晚到结果
- **AND** 不更新计划、进度、通知或 UI

### Requirement: UI 必须展示 provider 隐私边界

系统 SHALL 在设置页和 AI 请求前的关键确认界面展示 provider 会接收的内容和 endpoint 边界。

#### Scenario: 设置页展示发送内容说明

- **WHEN** 用户打开设置页
- **THEN** 系统说明当前笔记推荐会发送当前笔记内容片段、已有标签和标签索引摘要
- **AND** 系统说明标签健康 AI 分析会发送本地规则证据、标签统计和有限示例
- **AND** 系统说明文件夹批次会按每篇笔记向 provider 发送内容片段和标签索引摘要

#### Scenario: 文件夹范围确认展示本机 provider

- **GIVEN** provider base URL host 是 loopback 地址
- **WHEN** 用户打开文件夹范围确认
- **THEN** UI 可以将 provider 描述为本机 endpoint
- **AND** UI 仍展示预计请求数和发送内容类型

#### Scenario: 文件夹范围确认展示远端 provider

- **GIVEN** provider type 是远端 OpenAI-compatible
- **WHEN** 用户打开文件夹范围确认
- **THEN** UI 提示每篇笔记会请求当前远端 provider
- **AND** UI 不得暗示内容只留在本机

### Requirement: 原生端上 SDK 不得直接进入插件运行时

系统 SHALL 将 Apple、Android 和 Chrome 原生端上模型能力视为后续桥接或伴生应用范围，本次能力只通过 OpenAI-compatible 本地 endpoint 接入。

#### Scenario: Apple Foundation Models helper

- **GIVEN** 用户希望使用 Apple Foundation Models
- **WHEN** 本次能力交付
- **THEN** 插件只支持用户配置一个显式本地 endpoint 或后续 helper preset
- **AND** 插件不直接 import FoundationModels 或打包 Swift 代码

#### Scenario: Android Gemini Nano / AICore

- **GIVEN** 用户在 Obsidian Android 上使用插件
- **WHEN** 本次能力交付
- **THEN** 插件不得假设可以直接调用 AICore、ML Kit GenAI 或 Gemini Nano
- **AND** 没有原生桥接时，本地 provider 能力不得承诺 Android 端上模型可用

#### Scenario: Chrome Prompt API

- **GIVEN** 运行环境不是 Chrome 页面或 Chrome extension
- **WHEN** 本次能力交付
- **THEN** 插件不得依赖 Chrome Prompt API
- **AND** 不得把 Chrome Gemini Nano 描述为 Obsidian 插件内置 provider
