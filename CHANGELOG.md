# Changelog

## Unreleased

中文

- 新增桌面标签关系探索：完整搜索、一跳邻域、有界概览、独立直接层级和等价关系表。
- 增加共同/双侧差集、交并比、双向覆盖率、零交集比较与只读整理交接；打开证据笔记保留关系工作台。
- 统计与静态布局在内嵌 Worker 中执行，提供资源预算、取消、版本隔离及显式分片关系表回退；不新增 AI 请求或图内写入。
- 保留浏览器/真实宿主 case、性能证据与 FlowAssert 报告导入链路。详见[验收记录](docs/verification/tag-relationship-graph.md)，不代表已发布或完成独立用户/竞品任务研究。

English

- Add desktop relationship exploration with full-scope search, one-hop neighborhoods, bounded overview, direct naming hierarchy and a keyboard-equivalent table.
- Compare shared/exclusive files, Jaccard and directional coverage, including zero-overlap pairs; preserve read-only context when navigating to reviewed management.
- Embed cancellable, budgeted statistics and static layout in a Worker with version isolation and an explicit sliced table fallback. Evidence opens beside the workbench; no new AI requests or graph mutations.
- Retain executable browser/host cases, performance evidence and a FlowAssert report-import workflow. This is unreleased; independent participant/competitor task validation remains separate.

## 0.5.0 - 2026-10-09

中文

无需 AI 管理标签，在审查后改名、合并，并通过统一历史撤销。

### 新增

- 新增原生标签管理工作台：无需 API key 或活动笔记即可搜索标签、按来源和目录筛选、分页浏览相关笔记。
- 支持精确标签改名和多标签合并；逐文件、逐正文位置审查后确认，最多处理 200 个候选文件，不静默截断。
- 新增独立浏览范围、全局排除目录和 exact/subtree 标签保护，覆盖当前笔记、文件夹、健康清理和手动管理入口。
- 新增统一操作历史、详情筛选和全局顺序撤销；未完成操作有明确恢复入口。
- 索引展示最新、过期、刷新中和失败状态，支持取消，以最多四个并发读取刷新。
- 为健康报告中的确定性合并/重命名新增 occurrence 级 inline token 审查、逐项取消、部分清理提示和二次确认。
- 新增 cleanup V2 混合事务、逆序补偿、固定 before/after 恢复、跨重载整体回退和未解决事务写入门禁。

### 修复与变更

- 精确属性修改保留未选标签的原始大小写、重复项和顺序；正文保持非目标内容不变，非 tags 属性保持语义不变。
- 统一保存队列和写入协调，修复取消扫描后的陈旧索引落盘、保存前提前发布候选和并发操作风险。
- 修复 inline 前缀误匹配、目标专属文件被纳入清理、撤销写入已生效后报错漏补偿，以及日志保存失败回退后的历史缓存不一致。
- 改善宽窄布局、深浅主题、长路径、键盘焦点和浮出窗口的工作台交互。

### 升级与安全边界

- 升级前备份库与插件数据；先完成已有未解决操作的恢复。降级前同样完成恢复并备份，旧版本不保证理解新增原值恢复字段。
- 撤销现在只允许全局最近一条活动操作，不再按当前笔记或操作类型分别取最近；历史筛选和旧命令不能越过顺序。
- 缺少 V2 恢复证据的旧多文件 cleanup 记录保持只读，不推断未保存的原值。
- 标签身份不区分大小写，但保留合法目标的输入字面量；改名不传播到子标签，不支持仅大小写改名、删除或拆分。
- YAML 引号与排版可能变化；不支持的标量/混合 tags 或无法安全往返的 YAML 保持只读。
- 本地浏览和手动管理不调用 AI；可选 AI 流程仍只访问用户配置的 provider。
- 只有当前 Obsidian `TagCache.position` 精确匹配的完整 token 可写；fallback、缓存缺失或陈旧位置保持只读。
- 当前笔记推荐和文件夹批次继续保持 frontmatter-only；不支持 inline 新增、删除、拆分、模糊/全局替换或 AI 正文写入。

### 验证与已知边界

- 工作台实现通过 59 个文件、492 个测试、生产构建及 10 项严格 OpenSpec 校验。
- 隔离 Obsidian 1.13.7 完整验收 16/16，最终代码构建冒烟 8/8；宽窄、深浅主题的合成浏览器布局检查 84/84。详见[验证记录](docs/verification/tag-management-workbench.md)，不将合成 UI 结果等同于真实宿主。
- 0.5.0 发布构建在 macOS 的 Obsidian 1.8.7 与 1.14.4 分别通过 16/16 主流程、3/3 故障准备和 3/3 完整应用重启恢复检查；原值、正文和持久化恢复回执均已核对。详见[发布验收](docs/verification/0.5.0-release-acceptance.zh-CN.md)。
- 最低支持版本保持 1.8.7。真实移动端、Windows/Linux 和突然断电尚未验证；桌面受控故障测试不代表全平台或所有存储故障。

English

Manage tags without AI, review rename/merge changes, and undo through one shared history.

### Added

- Add a native tag workbench with search, source/folder filters, and paginated related notes, without requiring an API key or active note.
- Add exact tag rename and multi-tag merge with per-file and per-occurrence review, explicit confirmation, and a hard 200-candidate-file limit instead of silent truncation.
- Add independent browsing scopes, global folder exclusions, and exact/subtree tag protection across current-note, folder, health-cleanup, and manual workflows.
- Add unified operation history, filtered details, global-order undo, and an entry for unfinished-operation recovery.
- Show current, outdated, refreshing, and failed index states; allow cancellation and cap refresh at four concurrent reads.
- Add occurrence-level inline-token review, individual deselection, partial-cleanup warnings, and second confirmation for deterministic health-report merge/rename actions.
- Add mixed-source cleanup V2 transactions, reverse compensation, fixed before/after recovery, cross-reload whole-operation undo, and a shared unresolved-mutation gate.

### Fixed and changed

- Preserve unselected property-tag spelling, duplicates, and order; preserve non-target body text and the semantics of non-tags properties.
- Unify persistence and mutation coordination; fix cancelled scans persisting stale indexes, premature candidate publication, and concurrent-operation risks.
- Fix inline prefix matching, target-only files entering cleanup, missed compensation when an undo write takes effect then rejects, and stale history after failed log finalization.
- Improve wide/narrow layouts, light/dark themes, long paths, keyboard focus, and popout-window interactions.

### Upgrade and safety boundaries

- Back up the vault and plugin data, and finish outstanding recovery before upgrading. Do the same before downgrading; older versions may not understand the new raw-value recovery fields.
- Undo now requires the globally latest active operation, not the latest record for a note or operation type. History filters and legacy commands cannot bypass that order.
- Legacy multi-file cleanup records without V2 recovery evidence remain read-only; missing original values are never inferred.
- Tag identities are case-insensitive while valid target spelling is preserved. Rename does not propagate to descendants; case-only rename, deletion, and split are unsupported.
- YAML quoting and formatting may change. Unsupported scalar/mixed tags and YAML that cannot safely round-trip remain read-only.
- Local browsing and manual management do not call AI; optional AI workflows use only the configured provider.
- Only complete tokens at exact current Obsidian `TagCache.position` ranges are writable; fallback, missing-cache, and stale-cache occurrences remain view-only.
- Current-note and folder workflows remain frontmatter-only; inline additions, deletion, split, fuzzy/global replacement, and AI-generated body writes are unsupported.

### Verification and known boundaries

- The workbench implementation passed 59 files / 492 tests, the production build, and all 10 strict OpenSpec validations.
- Isolated Obsidian 1.13.7 acceptance passed 16/16 and the final code build passed 8/8 smoke checks; synthetic-browser wide/narrow and light/dark layout checks passed 84/84. See the [verification report](docs/verification/tag-management-workbench.md); synthetic UI results are not host proof.
- The 0.5.0 release build passed 16/16 workflow checks, 3/3 fault preparation checks, and 3/3 full-application-restart recovery checks on each of Obsidian 1.8.7 and 1.14.4 on macOS. Original values, body content, and persisted recovery receipts were verified. See the [release acceptance report](docs/verification/0.5.0-release-acceptance.zh-CN.md) (Chinese).
- The minimum remains 1.8.7. Real mobile devices, Windows/Linux, and sudden power loss remain unverified; controlled desktop faults do not prove all platforms or storage-failure modes.

## 0.4.1 - 2026-08-31

中文

### 修复

- 清理 Obsidian Community Scorecard 报告的样式、全局对象、类型安全和过时依赖告警。
- 为 Obsidian 1.13 增加可搜索的声明式设置定义，同时保留 1.8.7–1.12 的旧版设置页兼容路径。
- 收紧 frontmatter 和 AI 响应解析的未知输入边界，避免非字符串标签或异常元数据进入标签处理流程。

### 验证

- 通过 37 个文件、131 个用例的完整 Vitest 回归、生产构建和 8 项 OpenSpec 校验。
- 使用 `eslint-plugin-obsidianmd` 0.4.2 扫描 `src` 和 `package.json`，结果为 0 个问题。

English

### Fixed

- Remove style, global-object, type-safety, and obsolete-dependency warnings reported by the Obsidian Community Scorecard.
- Add searchable declarative settings for Obsidian 1.13 while preserving the legacy settings path for Obsidian 1.8.7–1.12.
- Harden unknown-input boundaries for frontmatter and AI response parsing so malformed metadata cannot enter tag processing.

### Verification

- Pass the complete Vitest regression suite with 37 files and 131 tests, the production build, and all 8 OpenSpec validations.
- Scan `src` and `package.json` with `eslint-plugin-obsidianmd` 0.4.2 with 0 problems.

## 0.4.0 - 2026-08-27

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
