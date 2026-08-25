## Context

`support-local-on-device-models` 已把 Ollama、LM Studio、LiteRT-LM CLI 和自定义 OpenAI-compatible endpoint 接入当前笔记推荐、标签健康 AI 分析与文件夹批次。当前设置页按持久化字段顺序平铺所有配置，并同时暴露 provider type 与 preset。`applyProviderPresetSettings()` 会保留任意非空 model 和 API key，因此从 DeepSeek/OpenAI 切到本地 preset 时可能形成无效模型组合，并把旧远端凭据作为 Authorization header 发给新的 endpoint。

Provider 连接测试会探测 `/models` 并发送最小 chat completion。真实 `qwen3.8:27b` 可能运行数分钟，而当前 UI 只有测试按钮的临时禁用文字和 Notice；没有阶段、已用时间、取消边界或持久结果。Obsidian `requestUrl` 不提供本 change 可依赖的请求中断能力，所以取消只能停止后续阶段并隔离晚到结果。

## Goals / Non-Goals

**Goals:**

- 让标准 preset 成为唯一主要 provider 入口，并保证跨 provider 切换是安全、完整且可预测的状态变更。
- 把设置页按用户任务分组，隐藏不相关字段，将连接必填项与高级模型调优分离。
- 让分钟级连接测试满足局部 busy、持续进度、可取消、晚到结果隔离、失败保留和其他设置可交互的用户操作契约。
- 提供可重复自动化和真实 Obsidian/Ollama 验证，并让 README、CHANGELOG 与截图反映真实 UI。

**Non-Goals:**

- 不安装、启动、停止、下载或删除任何本地模型/runtime。
- 不新增 streaming、embeddings、vision、speech、tools/agent 或原生 Apple/Google 模型桥接。
- 不声称 UI 取消能够终止已经发送给 provider 的 HTTP 请求或底层推理。
- 不建立多 provider 凭据库；插件仍只保存当前激活 provider 的一组连接设置。

## Decisions

### 1. Preset 表示 provider 身份，不表示所有字段必须等于默认值

设置页先选择 OpenAI、DeepSeek、Ollama、LM Studio、LiteRT-LM CLI 或自定义。标准 preset 派生 provider type 和 base URL；只有“自定义”展示 provider type 与可编辑 base URL。Model 和高级参数可以在标准 preset 下调整而不把 preset 隐式改成 `custom`。

选择不同 preset 时执行原子切换：设置匹配的 type、base URL、JSON mode、并发和 prompt profile；标准远端 preset 使用其默认 model，本地 preset 清空 model 以强制选择本机已安装模型。任何跨 preset 切换都清空当前 API key，避免把 provider A 的凭据发送给 provider B。再次选择同一 preset 不产生额外重置。

备选方案是继续同时展示 type 和 preset，并在每次字段修改后推断是否为 custom。该方案会产生矛盾组合且难以向用户解释，因此不采用。

### 2. 设置页按任务分组并条件显示

设置页使用以下顺序：

1. 通用：界面语言。
2. AI 服务连接：preset、自定义 type、base URL、model、条件化 API key、隐私边界、连接测试。
3. 高级模型设置：JSON mode、prompt profile、provider concurrency；使用可折叠容器，默认收起。
4. 标签推荐：推荐数量、允许新标签、条件化严格程度。
5. 索引与批量处理：单批文件上限、读取 inline tags、启动刷新索引。
6. 诊断与反馈：开发模式、反馈入口。

条件字段重新渲染时必须保留已保存设置和连接测试状态。分组只改变信息架构，不改变已有非 provider 默认值。

### 3. 连接测试使用单实例任务状态和冻结配置

设置 tab 保存一个 provider test job：唯一 token、冻结设置快照、开始时间、阶段和取消标记。测试阶段为配置校验、模型列表探测、最小 chat completion。测试按钮在运行期间防重复提交；取消只标记当前 job，不发送后续阶段，并在已发请求 settle 前保持 single-flight。

状态区域持续显示模型、阶段和已用时间。完成后内联保留成功或可恢复失败结果；失败不得清空或修改最后保存的 provider 配置。用户在测试期间仍可修改非 provider 设置。若 provider 配置发生变化，当前 job 视为取消且晚到结果不得覆盖新配置状态。

备选方案是只用 Notice 或全设置页 loading。前者在分钟级等待中不可见，后者会阻塞无关操作，均不采用。

### 4. Provider 测试服务暴露阶段回调和取消检查，但不伪造网络中断

`testProviderConnection()` 接受可选 hooks：`onStage` 与 `isCancelled`。它在配置校验、`/models` 后和 chat completion 前检查取消；chat 已发送后只能等待 settle，再由设置页丢弃结果。返回类型增加 `cancelled` 错误类别用于“在进入下一阶段前取消”的确定性结果。

### 5. 文档区分插件能力与 runtime 能力

README 明确插件只使用文本 Chat Completions/结构化 JSON，不等同于 LocalAI/Ollama runtime 的全部多模态能力。中文和英文文档提供 Ollama 安装、模型拉取、服务/API 检查、插件设置、连接测试和常见故障排查；设置截图必须来自当前真实界面且不包含凭据。

## Risks / Trade-offs

- [切换 preset 会清空用户当前 key 和 model] → 只在 preset 实际变化时重置，并在文案中说明跨 provider 需要重新填写凭据；安全优先于隐式复用。
- [本地 preset 无法自动列出所有可用模型] → 本 change 保持手填 model；连接测试通过 `/models` 辅助诊断，不新增模型选择器。
- [取消后底层推理继续占用资源] → UI 明确取消边界，在请求 settle 前阻止重复测试，丢弃所有晚到结果。
- [设置 tab 重渲染导致 DOM 引用失效] → job 状态保存在 tab 实例，渲染函数只绑定当前状态节点；计时器更新前检查节点仍连接。
- [高级设置折叠降低可发现性] → 标题显示当前 profile/并发摘要，连接失败若与 JSON mode 相关则提示展开高级设置。

## Migration Plan

旧设置继续通过 `mergeSettings()` 兼容加载，不做磁盘级迁移。首次显示保持旧 provider 配置；只有用户主动选择不同 preset 时才应用新的原子重置规则。回滚可恢复旧插件构建和原 `data.json`，本 change 不改变操作日志或标签索引结构。

## Open Questions

无。模型自动发现/选择和多 provider 凭据管理留给后续 change。
