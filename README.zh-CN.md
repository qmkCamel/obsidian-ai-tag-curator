# Obsidian AI Tag Curator

简体中文 | [English](README.md)

面向 Obsidian 库的 AI 标签管理与治理插件。

AI Tag Curator 不是普通的“给当前笔记生成几个标签”的插件。它更像一个标签体系整理助手：优先复用已有标签，解释推荐理由，并在真正进入高风险清理前，先帮你看清整个库的标签问题。


## 当前 MVP 能力

**库标签索引**
![标签索引摘要](docs/images/tag-index-summary.png)
- 从 Obsidian metadata、frontmatter tags 和可选 inline tags 构建标签索引。
- 展示标签索引摘要，包括标签数、使用次数、文件数和高频标签。
- 推荐和健康报告会复用缓存索引，避免每次都全库扫描。

**当前笔记标签推荐**
![当前笔记标签推荐](docs/images/tag-recommendations.png)
- 为当前 Markdown 笔记推荐标签。
- 即使允许新标签，也优先复用库中已有标签。
- 将 frontmatter 与正文 inline tags 汇总成带来源的整篇标签清单，两类已有标签都不会被 AI 重复推荐。
- 正文已有但 frontmatter 缺少的标签默认作为同步项选中，让面向 formatter 的 frontmatter 可汇总整篇已审查标签；每项仍可取消。
- 为每个推荐给出理由、置信度和相近但未选标签。
- 写入前必须由用户确认。
- 支持撤销本插件对当前笔记最近一次标签修改。
- 预览绑定完整 Markdown 的 SHA-256 内容快照，应用前内容已变化时拒绝陈旧写入。
- 慢速 AI 请求后台执行，完成后再弹出结果。

**文件夹级安全批量预览**

![文件夹级安全批量预览](docs/images/folder-batch-preview.png)

- 默认从当前笔记父文件夹开始，也可选择库内其他文件夹或库根目录；默认包含子文件夹。
- 在读取正文、构建索引或请求 provider 前，先确认完整 Markdown 文件数和按每篇一次估算的请求数。
- 单批上限可配置为 1–200，默认 50；超过上限会阻止开始，不会静默截断。
- 最多并发 2 个 AI 请求；取消会立即停止领取新任务并丢弃晚到结果，同时提示已发出的在途请求仍可能计费。
- AI 失败时保留本地确定的 inline-to-frontmatter 同步项，并支持仅重试读取/AI 失败项。
- 按文件展示 frontmatter、inline 和 AI 来源；inline 同步与已有标签新增为低风险并默认选中，新标签为中风险且需逐项选择，破坏性动作不可执行。
- 二次确认后才应用；执行包含全量预检、逐文件内容/tags 快照检查、逆序补偿，以及补偿不完整时持久化唯一固定恢复目标。
- 最近一次成功文件夹批次可作为整体撤销，插件或 Obsidian 重载后仍可回退。
- 正文和 inline tag 原位置始终不改写。

**库级标签健康报告**
- 按“总览、AI 优先处理项、规则证据明细”三层组织库级标签健康报告。
- 识别低频标签、近似重复标签、层级不一致、过宽标签、过细标签和命名风格漂移等问题。
- 规则分析负责提供事实证据和动作安全边界；AI 辅助分析负责合并问题、解释原因、排序优先级和补充风险提示。
- AI 行动建议会展示面向用户的优先级、置信度、可执行状态、诊断、原因、目标标签、规则证据和注意事项。
- 按当前标签索引缓存 AI 增强分析，重新打开报告时展示上次分析时间。
- 可执行的合并/重命名建议支持查看文件预览、手动应用和回退；低频观察、过宽拆分、废弃/移除类建议保持只读或人工判断。
- 支持把 AI 行动建议和清理建议复制为 Markdown，方便外部审查。
- 健康报告中的标签支持点击复制并搜索。
- 长报告会在稳定的 Modal 布局内部滚动，避免内容导致窗口尺寸跳动。
![AI 行动建议](docs/images/tag-health-report-ai-actions.png)
![AI 建议应用后回退](docs/images/tag-health-report-ai-actions-applied.png)
![规则证据明细](docs/images/tag-health-report-rule-evidence.png)


**设置**
![设置](docs/images/settings.png)
![Provider 连接测试进度](docs/images/settings-provider-test-progress.png)
- 支持 DeepSeek、OpenAI 等远端 OpenAI-compatible provider，也支持 Ollama、LM Studio、LiteRT-LM CLI 等本地 OpenAI-compatible endpoint。
- 本地 provider 允许空 API key，可关闭 JSON mode，并默认使用更小的 `edge-small` prompt profile 与 1 并发文件夹批次。
- 设置按通用、AI 服务连接、高级模型设置、标签推荐、索引与批量处理、诊断与反馈分组；高级模型设置默认折叠。
- 设置页提供手动 provider 连接测试，持续显示阶段和已用时间，允许取消并隔离晚到结果，同时展示当前 endpoint 会接收哪些内容。
- 支持中文、英文和跟随 Obsidian 当前语言的 `Auto` 模式。
- 开发模式支持展示标签推荐和 AI 增强分析的总耗时与阶段耗时。
- 可配置 1–200 的单批完整文件上限。

## Provider 配置

在插件设置中先选择 `Provider preset`，再按需配置：

- `Provider 类型`（仅 `自定义` preset 展示）
- `API base URL`（标准 preset 只读，`自定义` preset 可编辑）
- `API key`（远端 provider 必填；本地 provider 可留空）
- `Model`
- `JSON mode`
- `Prompt profile`
- `Provider 并发`

常见 OpenAI-compatible 配置示例：

| Provider | 类型 | API base URL | API key | Model 示例 |
| --- | --- | --- | --- | --- |
| OpenAI | 远端 | `https://api.openai.com/v1` | 必填 | `gpt-4o-mini` |
| DeepSeek | 远端 | `https://api.deepseek.com` | 必填 | `deepseek-chat` |
| Ollama | 本地 | `http://127.0.0.1:11434/v1` | 可空 | `qwen3.8:27b` |
| LM Studio | 本地 | `http://127.0.0.1:1234/v1` | 可空 | 本地已加载模型名 |
| LiteRT-LM CLI | 本地 | `http://127.0.0.1:9379/v1` | 可空 | `litert-lm serve` 暴露的模型名 |

API key 会保存在本地 Obsidian 插件数据中，不会进入文件夹批次快照或操作日志。插件不会自动安装、启动、下载或管理任何本地模型；如果配置的本地 endpoint 不是 `127.0.0.1` / `localhost`，设置页和文件夹范围确认会提示内容会发送到该地址。

Apple Foundation Models、Android Gemini Nano/AICore、Chrome Prompt API 和 LiteRT-LM JS 这类原生端上 SDK 不会直接打包进 Obsidian 插件运行时；本阶段只通过显式本地 OpenAI-compatible endpoint 接入。详细调研见 [端上模型支持调研](docs/on-device-model-support-research.zh-CN.md)。

### Ollama + Qwen3.8 快速开始

以下路径已在 Apple M2 Pro、32GB 统一内存上使用 Ollama `0.32.15` 和约 17GB 的 `qwen3.8:27b` 验证。其他硬件请根据可用内存选择更小模型。

1. 安装并启动 Ollama：

```bash
brew install --cask ollama-app
ollama --version
```

启动 Ollama 应用；也可以在需要手动运行服务时使用 `ollama serve`。

2. 下载并确认模型：

```bash
ollama pull qwen3.8:27b
ollama list
```

3. 验证原生接口和 OpenAI-compatible 接口：

```bash
curl -fsS http://127.0.0.1:11434/api/version
curl -fsS http://127.0.0.1:11434/v1/models
curl -fsS http://127.0.0.1:11434/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"qwen3.8:27b","messages":[{"role":"user","content":"Return exactly {\"ok\":true} as JSON."}],"stream":false}'
```

4. 在插件设置的“AI 服务连接”分组中选择：

- Provider preset：`Ollama`
- API base URL：`http://127.0.0.1:11434/v1`（由 preset 管理）
- Model：`qwen3.8:27b`
- API key：留空
- 高级模型设置：`edge-small`、并发 `1`；JSON mode 默认关闭，如模型连接测试确认支持可再开启
- 点击“测试连接”，等待设置页内的阶段、已用时间和最终结果

切换 provider 会清空旧 API key，并应用目标 provider 的安全默认值。本地模型连接测试和推荐可能耗时数分钟；取消后 UI 会丢弃晚到结果，但已经发给 Ollama 的推理请求仍可能继续运行到结束。

### 能力边界

插件当前只使用文本 `chat/completions` 并要求可解析的结构化 JSON。即使 Ollama、LocalAI 或其他 runtime 本身支持更多能力，插件目前也不会调用 vision、图像生成、语音、embeddings、tools/agent、流式输出或原生 Apple/Google 端上 SDK。

### 常见问题

- endpoint 不可达：确认 Ollama 已启动，并运行 `lsof -nP -iTCP:11434 -sTCP:LISTEN` 和 `/api/version` 检查。
- 模型 404：运行 `ollama list`，把插件中的 Model 改为完全一致的名称。
- JSON mode / `response_format` 不兼容：展开“高级模型设置”，关闭 JSON mode 后重新测试。
- 返回内容不是 JSON：保留 `edge-small`，确认模型遵循结构化输出；必要时换用指令遵循更稳定的模型。
- 推理很慢：运行 `ollama ps` 查看驻留模型；避免同时驻留多个大模型，并降低批次并发或改用更小模型。

## 本地安装

1. 安装依赖：

```bash
npm install
```

2. 构建插件：

```bash
npm run build
```

3. 在目标 Obsidian 库中创建插件目录：

```bash
mkdir -p /path/to/your-vault/.obsidian/plugins/ai-tag-curator
```

4. 复制构建产物：

```bash
cp main.js manifest.json styles.css .hotreload /path/to/your-vault/.obsidian/plugins/ai-tag-curator/
```

5. 打开 Obsidian，进入 `Settings -> Community plugins`，启用 `AI Tag Curator`。

构建产物包括：

- `main.js`
- `manifest.json`
- `styles.css`
- `.hotreload`，用于配合 [Hot Reload](https://github.com/pjeby/hot-reload) 插件进行本地开发

本地开发时，也可以直接安装到 Obsidian 库：

```bash
OBSIDIAN_VAULT_PATH=/path/to/your-vault npm run local:install
```

如果要和插件市场版本并排安装，使用 dev 版本：

```bash
OBSIDIAN_VAULT_PATH=/path/to/your-vault npm run local:install-dev
```

安装脚本要求显式设置 `OBSIDIAN_VAULT_PATH`，避免把插件写入错误或未登记的 Obsidian 库。

### 发布截图测试库

准备或重置用于真实 Obsidian smoke 与发布截图的合成测试库：

```bash
OBSIDIAN_RELEASE_VAULT_PATH=/path/to/test-vault npm run release:vault:prepare
```

必须显式设置 `OBSIDIAN_RELEASE_VAULT_PATH`，因为命令会重置合成发布笔记。脚本会安装并排的开发版插件并关闭 Obsidian Sync；未提供主题源时使用 Obsidian 默认外观。如需复用某个测试库的主题，可选设置：

```bash
OBSIDIAN_RELEASE_VAULT_PATH=/path/to/test-vault \
OBSIDIAN_THEME_SOURCE_VAULT=/path/to/theme-source \
npm run release:vault:prepare
```

脚本只会从可选主题源复制当前外观配置、对应主题目录和核心插件配置，不会复制个人笔记或凭据。

启动确定性的本地 provider 后再验证 AI 流程：

```bash
npm run release:mock
```

发布候选构建完成后，校验版本元数据并输出三个必需发布资产的大小与 SHA-256：

```bash
npm run build
npm run release:verify
```

## 使用流程

1. 配置 provider 类型、preset、API base URL、API key（本地 provider 可留空）和 model。
2. 执行 `刷新标签索引`。
3. 打开一篇 Markdown 笔记。
4. 执行 `为当前笔记推荐标签`。
5. 在推荐弹窗中检查结果，只应用想保留的标签。
6. 执行 `为文件夹批量生成标签建议`，确认范围、生成候选并在写入前审查整个批次。
7. 执行 `撤销最近一次文件夹批量标签操作`，可把最近成功批次作为整体回退。
8. 执行 `分析标签健康度` 查看库级标签问题。
9. 可在健康报告中执行 `AI 增强分析`。
10. 如需回退当前笔记最近一次标签写入，执行 `撤销当前笔记最近标签修改`。

## 插件命令

插件界面语言默认是 `Auto`，会跟随 Obsidian 当前语言。中文界面下的命令是：

- `刷新标签索引`
- `查看标签索引摘要`
- `分析标签健康度`
- `为当前笔记推荐标签`
- `为文件夹批量生成标签建议`
- `撤销当前笔记最近标签修改`
- `撤销最近一次文件夹批量标签操作`

## 开发

运行测试：

```bash
npm test
```

构建：

```bash
npm run build
```

OpenSpec 工作流：

```bash
npm run spec:list
npm run spec:status -- --change <change-name>
npm run spec:validate -- <change-name>
```

后续产品功能先创建 OpenSpec change proposal，再进入实现。

## 当前限制

- 当前笔记和文件夹工作流都只写 frontmatter `tags`。用户审查过的 inline tags 可以同步进入 frontmatter，但正文中的原始文本和位置永远不会被改写或删除。
- 远端 provider 仍要求 API key；本地 OpenAI-compatible provider 可以留空 API key，但仍必须配置 base URL 和 model。
- 插件只调用用户显式配置的 provider endpoint，不会自动安装、启动或下载任何模型，也不会静默云端 fallback。
- 文件夹批次必须在当前配置的 1–200 篇完整上限内；超过上限会阻断，而不是截取前 N 篇。
- 取消无法撤回已经发给 provider 的请求，因此在途请求仍可能计费，但其晚到结果会被丢弃。
- 文件夹批次只允许新增标签；删除、替换、合并和正文改写仍在 0.3 写入边界之外。
- 标签健康报告中的规则证据是只读诊断；可执行清理项必须经过文件预览和用户手动确认。
- AI 增强健康分析只提供总体判断和行动建议说明，不能改变本地动作能力，也不能直接执行变更。
- 清理计划会标记动作能力；可执行的合并/重命名项可以手动应用并回退，其他项保持仅预览、仅观察或需人工判断。
- AI 返回内容必须是结构化 JSON，解析失败时不会修改任何文件。

## 文档

- [更新日志](CHANGELOG.md)
- [许可证](LICENSE)
- [Obsidian 插件市场发布清单](docs/release-checklist.zh-CN.md)
- [英文产品交接文档](docs/product-handoff.md)
- [中文产品说明](docs/product-handoff.zh-CN.md)
- [中文技术方案](docs/technical-design.zh-CN.md)
- [中文路线图](docs/roadmap.zh-CN.md)
- [OpenSpec 项目上下文](openspec/project.md)
