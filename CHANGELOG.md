# Changelog

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
