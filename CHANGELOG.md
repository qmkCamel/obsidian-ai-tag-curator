# Changelog

## 0.4.0 - 2026-08-25

中文

### 新增

- 将设置页分为通用、AI 服务连接、高级模型设置、标签推荐、索引与批量处理、诊断与反馈六组，并按 preset 和开关条件展示相关字段。
- Provider 连接测试增加设置页内持续阶段、已用时间、取消入口以及持久成功、失败和取消结果；测试期间其他设置保持可交互。
- 中英文 README 增加 Ollama/Qwen3.8 安装、API 验证、插件配置、能力边界和故障排查。

### 变更

- Provider preset 切换改为原子应用目标 endpoint、模型默认值和能力参数；跨 provider 切换会清空旧 API key，避免向新 endpoint 发送旧凭据。
- 标准 preset 下允许调整 model、JSON mode、prompt profile 和并发而不隐式切换为 custom；只有 custom preset 展示 provider type 和可编辑 base URL。
- 连接测试取消只隔离后续阶段和晚到结果；已发送请求可能继续运行，在 settle 前仍阻止重复测试。

### 验证

- 通过 35 个文件、105 个用例的单元测试，2 个文件、25 个用例的 E2E，以及 37 个文件、130 个用例的完整 Vitest 回归。
- 在真实 Obsidian 中验证持续进度、非阻塞设置交互、取消与晚到结果隔离，并在 Apple M2 Pro / 32GB 上使用 Ollama `qwen3.8:27b` 完成连接测试。

English

### Added

- Group settings into General, AI service connection, Advanced model settings, Tag recommendations, Indexing and batch processing, and Diagnostics and feedback, with conditional fields for the active preset and toggles.
- Keep provider-test stage, elapsed time, cancellation, and persistent success/failure/cancelled results inside settings while unrelated controls remain interactive.
- Add bilingual Ollama/Qwen3.8 installation, API verification, plugin configuration, capability boundaries, and troubleshooting guidance.

### Changed

- Apply destination endpoint, model defaults, and capability settings atomically when the provider preset changes; clear the previous API key so credentials cannot be sent to the new endpoint.
- Allow model, JSON mode, prompt profile, and concurrency overrides without silently changing a standard preset to Custom; show provider type and editable base URL only for Custom.
- Treat provider-test cancellation as result isolation rather than a claim that an already-sent request or inference was aborted; keep tests single-flight until the request settles.

### Verification

- Pass 35 files / 105 unit tests, 2 files / 25 E2E tests, and the complete 37 files / 130 Vitest regression suite.
- Verify persistent progress, non-blocking settings interaction, cancellation, and late-result isolation in real Obsidian, then pass the provider connection test with Ollama `qwen3.8:27b` on an Apple M2 Pro with 32GB unified memory.

## 0.3.0

中文

### 新增

- 新增文件夹级安全批量标签流程：从当前笔记父文件夹、其他库内文件夹或库根目录选择范围，并可控制是否包含子文件夹。
- 新增可配置的 1–200 篇单批完整上限（默认 50）、最多两个并发 AI 请求、立即取消、晚到结果丢弃和失败项重试。
- 新增按文件、按标签的来源与风险审查；正文同步项和库中已有标签为低风险，新标签为中风险，破坏性动作不可批量执行。
- 新增全量预检、完整 Markdown 与 frontmatter tags 快照检查、逐文件 CAS、逆序补偿、固定目标恢复和跨重载整批回退。
- 在设置页新增反馈入口，并在中英文产品介绍中展示真实文件夹批次预览。

### 变更

- 当前笔记推荐和文件夹批次统一使用包含 frontmatter 与正文 inline tags 的整篇标签清单，避免重复推荐笔记任意位置已有的标签。
- 正文已有但 frontmatter 缺少的标签会作为可取消的低风险同步项；应用只更新 frontmatter，正文文本和 inline tag 原位置保持不变。
- 当前笔记应用增加完整内容快照保护；文件夹批次预览隐藏内部成功状态枚举，并改善深浅主题、窄窗口、长路径和后台进度体验。

### 验证

- 自动发布检查覆盖 OpenSpec 严格校验、完整 Vitest 回归、生产构建、依赖审计和差异检查。
- 2026-08-07 至 2026-08-09 在隔离的真实 Obsidian 测试库中完成范围、生成、风险预览、应用、整体回退、取消、深色主题和窄窗口 smoke；故障恢复边界继续由自动化故障注入覆盖。

English

### Added

- Add a safe folder-level batch workflow that can target the active note's parent folder, another vault folder, or the vault root, with optional subfolder inclusion.
- Add a configurable complete-batch limit of 1–200 notes (default 50), at most two concurrent AI requests, immediate cancellation, late-result discard, and failed-item retry.
- Add per-file and per-tag source/risk review. Inline sync items and existing-vault additions are low risk, new tags are medium risk, and destructive actions are not batch executable.
- Add full preflight, complete Markdown and frontmatter-tag snapshot checks, per-file CAS, reverse compensation, fixed-target recovery, and whole-batch undo across reloads.
- Add a settings feedback entry and show a real folder batch preview in the bilingual product introduction.

### Changed

- Use one whole-note tag inventory across current-note recommendations and folder batches so tags already present in frontmatter or the note body are not recommended again.
- Surface body tags missing from frontmatter as deselectable low-risk sync items; applying changes updates frontmatter only and preserves all body text and inline tag positions.
- Protect current-note applies with a full-content snapshot, hide internal success-state enums from folder previews, and improve dark/light theme, narrow-window, long-path, and background-progress behavior.

### Verification

- Release automation covers strict OpenSpec validation, the full Vitest regression suite, production build, dependency audit, and diff checks.
- From 2026-08-07 through 2026-08-09, an isolated real Obsidian test vault covered scope, generation, risk review, apply, whole-batch undo, cancellation, dark theme, and narrow-window smoke; automated fault injection continues to cover recovery boundaries.

## 0.1.2

中文

### 新增

- 按标签索引时间缓存 AI 增强标签健康分析，并在重新打开报告时展示上次分析时间。
- 在 AI 行动建议中展示面向用户的优先级、置信度、可执行状态、诊断、原因、目标标签、规则证据和注意事项。
- 新增可重复的健康报告 Modal 布局回归测试，覆盖固定高度和内容滚动行为。

### 变更

- 将 AI 行动建议作为主要行动层展示，规则证据继续作为事实明细层。
- 将应用和回退控件限定在可执行的合并或重命名建议上，同时保留 Markdown 计划复制能力。
- 优化健康报告 Modal 布局，让长证据内容在报告内部滚动，避免 Modal 尺寸随内容跳动。

### 验证

- 自动发布检查：`openspec validate --all`、`npm test`、`npm run build` 和 `git diff --check`。
- 2026-05-26 在真实 Obsidian 库中手动 smoke test：验证中文健康报告总览、AI 行动建议、可执行应用/回退控件、Markdown 计划复制、规则证据标签页和相关文件示例。

English

### Added

- Cache AI-enhanced tag health analysis by tag-index timestamp and show the last analysis time when reopening the report.
- Show user-facing AI action guidance with priority, confidence, actionability, diagnosis, rationale, target tags, rule evidence, and caution notes.
- Add a repeatable modal layout regression test for stable health report height and scroll behavior.

### Changed

- Keep AI action suggestions as the primary action layer while rule evidence remains the factual detail layer.
- Scope apply and undo controls to executable merge or rename actions, with Markdown plan copy controls available for review.
- Improve the health report modal layout so long evidence sections scroll inside the report instead of resizing the modal.

### Verification

- Automated release checks: `openspec validate --all`, `npm test`, `npm run build`, and `git diff --check`.
- Manual Obsidian smoke test in a real vault on 2026-05-26: verified Chinese health report summary, AI action suggestions, executable apply/undo controls, Markdown plan copy, rule evidence tabs, and related file examples.

## 0.1.1

中文

### 修复

- 根据自动审核检查结果更新发布元信息。
- 准备新的 GitHub Release 版本，便于 Obsidian 使用新的发布资产重新运行发布检查。

English

### Fixed

- Updated release metadata after automated review checks.
- Prepared a new GitHub release version so Obsidian can re-run release checks against fresh assets.

## 0.1.0

中文

### 新增

- 从 frontmatter tags、Obsidian metadata 和可选 inline tags 构建可复用的库标签索引。
- 为当前笔记推荐标签，并展示 AI 生成的理由、置信度和相近但未选标签。
- 优先复用库中已有标签，并过滤当前笔记已经拥有的标签。
- 只有用户确认后，才把选中的标签写入 frontmatter。
- 支持撤销本插件对当前笔记最近一次标签写入。
- 生成只读的库级标签健康报告。
- 识别低频标签、近似重复标签、层级问题、过宽或过细标签和命名风格漂移。
- 可选运行 AI 增强健康分析，生成摘要和优先行动项。
- 支持中文、英文和 Auto UI 语言模式。
- 支持 DeepSeek、OpenAI 等 OpenAI-compatible provider。
- 在开发模式中展示长耗时 AI 操作的阶段耗时。

### 说明

- 标签健康报告仅用于诊断，不会修改 Markdown 文件。
- 批量清理计划、批量写入和批量撤销属于后续版本规划。

English

### Added

- Build a reusable Obsidian vault tag index from frontmatter tags, Obsidian metadata, and optional inline tags.
- Recommend tags for the current note with AI-generated reasons, confidence labels, and close alternatives.
- Prefer existing vault tags and filter tags already present on the current note.
- Apply selected tags to frontmatter only after user confirmation.
- Undo the latest tag write made by the plugin for the current note.
- Generate a read-only vault-level tag health report.
- Group low-frequency tags, near duplicates, hierarchy issues, broad or narrow tags, and naming drift.
- Run optional AI-enhanced health analysis with summary and prioritized action items.
- Support Chinese, English, and Auto UI language modes.
- Support OpenAI-compatible providers such as DeepSeek and OpenAI.
- Show dev-mode timing for long-running AI operations.

### Notes

- The health report is diagnostic only and does not modify Markdown files.
- Batch cleanup plans, batch writes, and batch undo are planned for future releases.
