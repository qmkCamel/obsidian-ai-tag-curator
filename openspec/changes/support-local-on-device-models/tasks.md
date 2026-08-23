## 1. Provider 设置与能力模型

- [x] 1.1 扩展 `TagCuratorSettings`，新增 provider type、preset、JSON mode、provider concurrency 和 prompt profile，并为旧配置提供兼容默认值。
- [x] 1.2 实现 provider preset 应用逻辑，覆盖 OpenAI、DeepSeek、LiteRT-LM CLI、Ollama、LM Studio 和自定义 provider。
- [x] 1.3 增加设置规范化与单元测试，确保并发只能为 1 或 2，prompt profile 和 provider type 旧值安全回退。
- [x] 1.4 更新中英文设置页文案，区分远端 provider、本机 endpoint 和自定义 endpoint。

## 2. Provider factory 与 OpenAI-compatible 扩展

- [x] 2.1 新增 provider factory，统一创建 AI provider、验证配置和派生 capability。
- [x] 2.2 更新 `OpenAICompatibleProvider`：空 API key 时不发送 Authorization；仅在 capability 支持时发送 `response_format`。
- [x] 2.3 所有 AI 入口改用 provider factory，包括当前笔记推荐、健康报告 AI 分析、文件夹批量生成和失败项重试。
- [x] 2.4 将 API key 前置检查替换为 provider 配置检查：远端 provider 仍要求 key，本地 provider 允许空 key。
- [x] 2.5 增加单元测试覆盖远端缺 key、本地空 key、Authorization header、JSON mode 开关和错误信息不泄露 key。

## 3. Provider 连接测试

- [x] 3.1 新增连接测试服务，覆盖模型列表探测、最小 chat completion、JSON mode 验证和非 JSON 错误分类。
- [x] 3.2 在设置页增加用户显式触发的测试按钮和测试中/成功/失败状态。
- [x] 3.3 测试结果显示 provider 类型、base URL、模型名和错误类别，不显示 API key。
- [x] 3.4 使用 mock provider/server 增加测试，覆盖 endpoint 不可达、模型错误、鉴权错误、JSON mode 不支持和返回内容解析失败。

## 4. Edge-small prompt profile

- [x] 4.1 扩展推荐 prompt builder，支持 `default` 和 `edge-small` profile。
- [x] 4.2 在 `edge-small` 下限制当前笔记内容、vault tags 数量、tag 示例和输出说明长度。
- [x] 4.3 扩展健康报告 AI prompt builder，在 `edge-small` 下限制 risk groups、top tags 和 tag details。
- [x] 4.4 增加 prompt 快照或结构测试，验证默认 profile 保持兼容、edge profile 明显收窄上下文。
- [x] 4.5 增加本地 provider 不支持 JSON mode 时的 parser 失败提示测试。

## 5. 文件夹批次并发和快照

- [x] 5.1 文件夹批次根据 provider capability 选择默认并发：本地 provider 为 1，远端 provider 为 2。
- [x] 5.2 允许用户在 1–2 范围内显式配置 provider concurrency，并在批次开始时冻结到设置快照。
- [x] 5.3 批次设置快照记录 provider type、preset、model、prompt profile、JSON mode 和并发，但不得记录 API key。
- [x] 5.4 增加 runner 或编排测试，验证本地 provider 单并发、远端 provider 双并发、取消语义和失败项重试仍保持现有边界。

## 6. 隐私提示与文档

- [x] 6.1 在设置页展示当前 provider 将接收哪些内容，并说明 API key 的本地保存边界。
- [x] 6.2 文件夹范围确认中的 provider 提示根据 endpoint host 区分本机、局域网/自定义和远端。
- [x] 6.3 更新 README.zh-CN.md、README.md、docs/roadmap.zh-CN.md 和产品交接文档，说明本地 provider 配置、端上模型边界和不自动安装模型。
- [x] 6.4 在文档中引用 `docs/on-device-model-support-research.zh-CN.md`，并明确 Apple/Google 原生端上 SDK 属于后续 helper/伴生 app POC。

## 7. 验证

- [x] 7.1 运行 `npm run spec:validate -- support-local-on-device-models`。
- [x] 7.2 运行 `npm run spec:validate -- --all`。
- [x] 7.3 运行 `npm test`。
- [x] 7.4 运行 `npm run build`。
- [x] 7.5 运行 `git diff --check`。
- [x] 7.6 使用本地 mock OpenAI-compatible provider smoke 测试：空 API key、本地 preset、JSON mode 关闭、当前笔记推荐、健康报告 AI 分析和文件夹批量推荐。

## 8. 当前笔记长耗时交互优化

- [x] 8.1 新增当前笔记推荐任务面板，持续展示阶段、模型名、已用时间、最小化/展开和取消入口，同时保持工作区可交互。
- [x] 8.2 在当前笔记推荐编排中加入 single-flight 与取消状态；阻止重复请求，并丢弃取消后的晚到结果。
- [x] 8.3 增加中英文文案和样式，明确已发 provider 请求可能继续运行的取消边界。
- [x] 8.4 增加 E2E 覆盖持续进度、无关笔记切换、重复提交、取消、晚到结果丢弃、失败保留和正常完成。

## 9. 长耗时交互验证

- [x] 9.1 运行 `npm run test:unit` 和 `npm run test:e2e`。
- [x] 9.2 运行 `npm run spec:validate -- support-local-on-device-models` 和 `npm run spec:validate -- --all`。
- [x] 9.3 运行 `npm test`、`npm run build`、`npm audit` 和 `git diff --check`。
- [x] 9.4 使用延迟 mock provider 在真实 Obsidian 中验证持续进度、无关交互、取消和完成，并保留必要截图。
- [x] 9.5 使用本机 Ollama/Qwen3.8 验证真实分钟级请求期间的持续任务状态与取消隔离。
