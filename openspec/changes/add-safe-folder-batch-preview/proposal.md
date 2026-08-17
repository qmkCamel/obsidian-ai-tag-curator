## Why

当前插件已经证明了单篇笔记推荐和确定性清理动作的预览、确认、日志与回退闭环，但用户仍需逐篇处理同一文件夹中的笔记。下一阶段需要把既有安全模型扩展到明确的文件夹子树，同时控制 AI 请求成本、批量误写和撤销冲突风险。

## What Changes

- 新增“为文件夹批量生成标签建议”命令，默认选择当前 Markdown 笔记的父文件夹，同时允许用户选择库内任意文件夹或根目录；开始前展示最终文件夹、是否包含子文件夹、Markdown 文件数量、AI 请求数量和当前单批文件上限。用户可在设置中将单批上限从默认 50 调整为 1–200；超过当前上限时禁止启动且不静默截断。
- 空范围或未配置 API key 时禁止启动且不读取笔记、不构建索引、不发起 AI 请求；0.3 不提供绕过 AI 配置的独立本地汇总模式。
- 使用批次开始时冻结的标签索引、设置与逐笔记完整 Markdown SHA-256 快照，为范围内每篇笔记生成独立建议；生成过程展示进度、失败项和取消入口。取消后不再发起新请求，取消瞬间仍在途的结果返回后必须丢弃。
- 为当前笔记和文件夹批次建立共享的整篇标签清单，明确区分 frontmatter、正文 inline 和 AI 建议来源；AI 推荐必须过滤笔记任意位置已经存在的 tag。
- 笔记读取成功但 AI 请求或结构化解析失败时，仍允许审查本地确定性 inline 同步项，并明确标记 AI 结果缺失；笔记读取失败时不产生任何可写计划。
- 新增文件夹批次计划与逐笔记 `ChangePlan` 组合模型，按文件、标签来源和风险等级展示当前 tags、建议后 tags、推荐理由与置信度。
- 正文 inline tags 保持原位不改；缺少于 frontmatter 的 inline tags 作为确定性低风险同步项显示并默认选中。新增库中已有标签同样归为低风险并默认选中；新增标签归为中风险并默认不选中；替换、合并、删除等高风险动作保持不可批量执行。
- 只有用户完成批次总览、逐笔记/逐标签审查并显式确认后，才允许写入选中的 frontmatter tags；应用前与每文件写入前必须同时校验 frontmatter tags 和完整 Markdown 内容快照，任一正文或 frontmatter 漂移都阻止陈旧计划写入。
- 将一次成功应用保存为单条批量操作记录，记录设置/索引快照和每个文件的前后 tags，并提供持久化的“撤销最近一次文件夹批量操作”入口。
- 批量应用或回退中途失败时停止后续写入、按持久化的 `before` 或 `after` 恢复目标尝试恢复已修改文件，并清楚报告仍需人工恢复的文件，不得静默留下未知的部分完成状态。
- 增加中英文文案、Obsidian 原生预览界面、纯函数单元测试、端到端批量应用/回退测试和真实库 smoke test 要求。

## Capabilities

### New Capabilities

- `folder-batch-preview`: 定义默认范围、文件夹选择、批次建议生成、风险分层、逐项审查、安全应用、失败恢复和批次回退的完整行为契约。
- `frontmatter-tag-consolidation`: 定义当前笔记与文件夹批次共享的整篇标签识别、来源展示、既有标签过滤和 inline-to-frontmatter 汇总行为。

### Modified Capabilities

- 无。

## Impact

- 命令与编排：`src/main.ts`。
- 文件范围与读取：扩展 `src/obsidian/VaultReader.ts`、`src/obsidian/TagParser.ts` 与笔记模型，显式提供 frontmatter、inline 和整篇标签清单，并新增 Obsidian 原生文件夹选择交互。
- 推荐与批次模型：更新 `src/ai/PromptBuilder.ts`、`src/ai/RecommendationParser.ts`、`src/recommendations/TagRecommendationService.ts` 与 `src/preview/ChangePlan.ts`，新增共享 frontmatter 汇总计划、内容快照、文件夹批次计划、分离的读取/AI/计划状态、风险分类和执行服务。
- 写入与回退：扩展 `src/obsidian/FrontmatterWriter.ts`、`src/operations/OperationLog.ts`，新增批次预检、应用、补偿回退和最近批次撤销能力。
- UI 与设置：更新当前笔记推荐预览并新增文件夹范围确认、生成进度和批次审查 Modal；预览展示 frontmatter、inline、AI 标签来源；增加可配置单批文件上限，并更新 `src/settings`、`src/ui/labels.ts` 与 `styles.css`。
- 验证：扩展 Vitest 单元测试和 `tests/e2e` Obsidian harness；不引入新的运行时依赖。现有单篇推荐将采用同一套 frontmatter 汇总语义，健康报告命令保持原有行为。
