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
- 文件夹流程始终不改写正文和 inline tag 原位置。

**库级标签健康报告**
- 按“总览、AI 优先处理项、规则证据明细”三层组织库级标签健康报告。
- 识别低频标签、近似重复标签、层级不一致、过宽标签、过细标签和命名风格漂移等问题。
- 规则分析负责提供事实证据和动作安全边界；AI 辅助分析负责合并问题、解释原因、排序优先级和补充风险提示。
- AI 行动建议会展示面向用户的优先级、置信度、可执行状态、诊断、原因、目标标签、规则证据和注意事项。
- 按当前标签索引缓存 AI 增强分析，重新打开报告时展示上次分析时间。
- 可执行的确定性合并/重命名建议会先按文件读取 frontmatter diff 和每个正文 `#tag` occurrence；只有 Obsidian `TagCache.position` 与当前文本精确匹配的位置可勾选写入。
- 用户可分别取消 frontmatter 或任一正文位置；部分清理会明确显示剩余 source 数并要求二次确认。
- 应用使用完整内容/body hash、token slice 和 `Vault.process` 回调内 CAS；frontmatter 与正文作为一条 V2 事务整体补偿、恢复和回退。
- 低频观察、过宽拆分、废弃/移除类建议，以及缓存缺失或陈旧的正文位置，保持只读或人工判断。
- 支持把 AI 行动建议和清理建议复制为 Markdown，方便外部审查。
- 健康报告中的标签支持点击复制并搜索。
- 长报告会在稳定的 Modal 布局内部滚动，避免内容导致窗口尺寸跳动。
![AI 行动建议](docs/images/tag-health-report-ai-actions.png)
![AI 建议应用后回退](docs/images/tag-health-report-ai-actions-applied.png)
![规则证据明细](docs/images/tag-health-report-rule-evidence.png)


**设置**
![设置](docs/images/settings.png)
- 支持 DeepSeek、OpenAI 等 OpenAI-compatible provider。
- 支持中文、英文和跟随 Obsidian 当前语言的 `Auto` 模式。
- 开发模式支持展示标签推荐和 AI 增强分析的总耗时与阶段耗时。
- 可配置 1–200 的单批完整文件上限。

## Provider 配置

在插件设置中配置：

- `API base URL`
- `API key`
- `Model`

常见 OpenAI-compatible 配置示例：

| Provider | API base URL | Model 示例 |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com` | `deepseek-v4-flash` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |

API key 会保存在本地 Obsidian 插件数据中。

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
npm run local:install
```

如果要和插件市场版本并排安装，使用 dev 版本：

```bash
npm run local:install-dev
```

默认会安装到 `/Users/edge/personal/edge-notes`。如需换库，可以设置 `OBSIDIAN_VAULT_PATH=/path/to/vault`。

## 使用流程

1. 配置 OpenAI-compatible API base URL、API key 和 model。
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

- 当前笔记推荐和文件夹批次仍只写 frontmatter `tags`；它们可以把已审查 inline tags 同步进 frontmatter，但不改正文。
- 唯一的正文写入入口是健康报告中的确定性合并/重命名审查：只替换用户勾选且缓存位置精确匹配的完整 `#tag` token，不做模糊搜索、全局替换、添加、删除、拆分或 AI 生成的正文写入。
- 两个 AI 入口都要求已配置 API key；未配置时，文件夹入口不会降级为独立的本地同步模式。
- 文件夹批次必须在当前配置的 1–200 篇完整上限内；超过上限会阻断，而不是截取前 N 篇。
- 取消无法撤回已经发给 provider 的请求，因此在途请求仍可能计费，但其晚到结果会被丢弃。
- 文件夹批次只允许新增标签；删除、替换、合并和正文改写仍在文件夹工作流边界之外。
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
