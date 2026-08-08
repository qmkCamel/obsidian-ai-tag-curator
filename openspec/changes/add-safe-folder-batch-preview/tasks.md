## 1. 批次数据模型与共享标签规则

- [x] 1.1 新增 `FolderBatchPlan`、批次状态、分离的 `sourceStatus`/`aiStatus`/`planStatus`、包含 `maxFolderBatchFiles` 的设置快照和 candidate 类型，确保快照类型不包含 API key。
- [x] 1.2 实现批次 id、稳定文件顺序和设置快照构建纯函数。
- [x] 1.3 实现本地风险分类：inline-to-frontmatter 同步和已有标签新增为低风险、新标签新增为中风险，删除、替换、合并或正文改写一律高风险且不可执行。
- [x] 1.4 实现默认选择规则、选择全部低风险、清除全部和逐标签选择状态更新纯函数。
- [x] 1.5 扩展共享 `createChangePlan()`，以原 frontmatter、完整 Markdown 的 `sourceContentHash`、选中 inline 同步项和选中 AI 建议派生当前笔记及批次计划，分别记录 `syncedInlineTags` 与 `aiAddedTags`，并验证 `afterTags` 只能是 `beforeTags` 的超集。
- [x] 1.6 增加单元测试覆盖风险分类、禁止新标签过滤、默认选择、选择更新、无变更笔记、高风险计划拒绝和来源拆分。
- [x] 1.7 为笔记模型新增显式 `inlineTags` 与 `NoteTagInventory`（`frontmatterTags`、`inlineTags`、`allTags`），实现规范化、去重和稳定顺序纯函数。
- [x] 1.8 扩展 `VaultReader`：优先从 Obsidian metadata cache 取得正文 tag，缓存不可用时回退到 `parseInlineTags(content)`；增加代码块、inline code、标题、URL fragment 和嵌套 tag 测试。
- [x] 1.9 更新 `PromptBuilder`、`TagRecommendationService` 与 `RecommendationParser`，统一以 `allTags` 作为笔记已有标签，并测试 frontmatter/inline 已有标签都不会作为 AI 新建议返回。
- [x] 1.10 本地生成缺少于 frontmatter 的 `syncInlineTag` candidate，设为低风险、默认选中且可取消，不依赖 AI 是否返回建议。
- [x] 1.11 更新当前笔记推荐预览与测试：展示 frontmatter、inline、AI 来源；无 AI 建议但存在未同步 inline tag 时仍进入预览；应用和回退都不修改正文。
- [x] 1.12 使用内建 Web Crypto 实现完整原始 Markdown 的 UTF-8 SHA-256 小写十六进制工具，增加稳定性、内容变化和不保存原文测试。
- [x] 1.13 增加状态派生纯函数与测试，覆盖读取失败、AI 失败且本地计划可用、AI 失败且无本地计划、真正 noChange 和取消组合。

## 2. 文件夹范围发现与确认模型

- [x] 2.1 扩展 `VaultReader`，从当前 Markdown 文件取得父文件夹路径，并支持按路径段列出直接或递归 Markdown 文件。
- [x] 2.2 为库根目录、同名前缀文件夹、非 Markdown 文件和稳定路径排序增加范围单元测试。
- [x] 2.3 实现库内文件夹候选列表和根目录选项，确保默认范围来自当前笔记父文件夹且每次打开都重新计算。
- [x] 2.4 在 `PluginSettings` 和设置页增加 `maxFolderBatchFiles`，默认 50、允许 1–200，并规范化旧数据或越界值。
- [x] 2.5 增加范围 view model 与测试，在文件夹、递归开关或配置上限变化时重新计算文件数、预计请求数和可启动状态；确认空范围和超过上限时禁用开始、不创建计划/记录、不发起请求且不静默截断。
- [x] 2.6 增加没有活动 Markdown 文件和 `apiKey.trim()` 为空时的命令前置条件、中英文提示和零读取/零索引/零请求断言；保持当前笔记与文件夹入口一致。

## 3. 有界并发建议生成

- [x] 3.1 新增 `FolderBatchRecommendationRunner` 的队列、正交逐项状态、不可变进度快照、generation id 和立即取消接口。
- [x] 3.2 以最多 2 个 worker 复用 `TagRecommendationService.recommendForNote()`，并保证同一批次使用冻结的索引和设置快照。
- [x] 3.3 在每篇 AI 请求前完成笔记读取、`NoteTagInventory`、`sourceContentHash` 和本地同步项构建；读取失败不启动 AI，AI/provider/解析失败保留可用本地同步项，只有读取和 AI 都成功且无候选时才标记“无需变更”。
- [x] 3.4 实现取消后停止领取新任务、未开始项标记 cancelled、晚到响应通过 generation id 丢弃且不得更新任何状态；保留取消前已完成 AI 结果和已读取笔记的本地同步项，并正确派生 `partial`/`ready`。
- [x] 3.5 实现“仅重试失败项”：不重试成功或取消项；AI 重试复用冻结内容/索引/设置并保留 inline 选择，读取重试成功后建立新内容快照。
- [x] 3.6 增加 runner 单元测试覆盖并发上限、稳定队列、正交进度、立即取消、晚到响应丢弃、取消计费提示、读取失败、AI 失败保留本地计划和失败项重试。

## 4. 批次操作日志与安全写入基础

- [x] 4.1 在 `OperationLog` 中增加 `BatchOperationRecord`、`BatchOperationStatus`、`BatchRecoveryTarget` 和逐文件恢复状态联合类型，并按文件保存 `syncedInlineTags` 与 `aiAddedTags`。
- [x] 4.2 实现 `addBatchIntent()`、`updateBatchStatus()`、`setBatchRecoveryTarget()`、`latestBatch()`、`latestUnresolvedBatch()`，并保证一条批次只占一个日志槽位。
- [x] 4.3 更新 recommendation/cleanup/batch type guard，兼容历史上缺少 `type` 的 recommendation 记录且不误判 batch。
- [x] 4.4 增加 OperationLog 测试，覆盖旧数据加载、状态/恢复目标更新、日志上限、删除，以及 API key/完整正文不进入批次记录。
- [x] 4.5 扩展 `FrontmatterWriter`，提供完整 Markdown hash + 当前 tags 快照检查和 `replaceTagsIfSnapshotMatches()`，并让现有回退方法复用兼容边界。
- [x] 4.6 增加 writer 测试，覆盖 hash/tags 双匹配、内容变化、标签变化、预期快照匹配、冲突拒绝、无关 frontmatter 保留和正文逐字不变。

## 5. 批次应用与失败补偿

- [x] 5.1 新增 `FolderBatchExecutor`，在执行前验证所有计划只新增已明确选择的 frontmatter tags。
- [x] 5.2 实现全量目标文件存在性、`beforeTags` 与 `sourceContentHash` 预检，任一文件缺失、tags 变化或内容变化时保证零写入并返回分类详情。
- [x] 5.3 在第一次写入前保存状态为 `applying` 的完整批次意图记录。
- [x] 5.4 按稳定路径顺序在每文件写入前再次校验 tags + 内容 hash，再 compare-and-swap 写入；全部成功后把同一记录更新为 `applied`。
- [x] 5.5 实现中途失败后逆序补偿：完全恢复时删除意图记录并报告未应用。
- [x] 5.6 实现补偿不完整时的 `recoveryRequired` 记录，固定持久化 `recoveryTarget = "before"`，保存实际状态并阻断新批次写入。
- [x] 5.7 在操作记录状态稳定后只刷新一次标签索引并使健康分析缓存失效；索引刷新失败时保留可回退记录并单独提示。
- [x] 5.8 增加故障注入测试覆盖 tags/内容预检冲突、预检后写入竞态、完整成功、中途失败、补偿成功、before 目标补偿失败和索引刷新失败。

## 6. 中断恢复与批次回退

- [x] 6.1 实现插件加载时对 `applying`、`undoing` 和 `recoveryRequired` 记录逐文件对账：全 before/all after 直接完成相应状态，混合/第三种状态分别持久化唯一 `before`/`after` 目标。
- [x] 6.2 实现恢复 view model 和“重试恢复”服务：重试前全量分类，存在文件缺失或第三种状态时整次零写入；不得自动覆盖冲突或允许用户临时切换方向。
- [x] 6.3 实现最近 `applied` 批次的全量回退预检，任一文件缺失或改变时保持零写入和原记录不变。
- [x] 6.4 在第一次回退写入前把记录持久化为 `undoing`，再按逆序 compare-and-swap 恢复 `beforeTags`。
- [x] 6.5 实现回退中途失败后的反向补偿：成功时恢复 `applied`，不完整时转为 `recoveryRequired` 并固定持久化 `recoveryTarget = "after"`。
- [x] 6.6 完整回退成功后删除批次记录，并只刷新一次标签索引与健康分析缓存。
- [x] 6.7 增加表驱动测试覆盖 applying/undoing 下全 before、全 after、混合、第三种状态，以及 before/after 目标恢复重试、零写入冲突、回退成功和补偿成功。

## 7. 文件夹批次 UI 与双语文案

- [x] 7.1 在 `src/ui/labels.ts` 增加单批文件上限设置，以及空范围、API key 前置、文件夹批次命令、范围、进度、取消计费、AI 部分失败、风险、选择、内容冲突、恢复目标和回退的中英文类型与文案。
- [x] 7.2 实现基于 Obsidian `FuzzySuggestModal<TFolder>` 的 `FolderSuggestModal`，支持选择库内任意文件夹和根目录。
- [x] 7.3 实现 `FolderBatchScopeModal`，默认当前笔记父文件夹，并提供文件夹选择、递归开关、文件/请求数量、provider 内容提示和当前可配置上限状态。
- [x] 7.4 实现 `FolderBatchProgressModal`，支持读取/AI/计划的完成与失败统计、最小化、立即取消、晚到结果不回流和已发请求可能计费提示。
- [x] 7.5 新增批次审查 view model，计算完成状态、风险统计、选中文件/标签数，以及每篇笔记的 frontmatter、inline、AI 来源、AI 失败/取消提示和前后 tags。
- [x] 7.6 实现 `FolderBatchPreviewModal` 的总览、风险筛选、按文件折叠、来源标识、逐标签 toggle、选择全部低风险和清除全部；inline 同步项默认选中但可取消。
- [x] 7.7 实现二次应用确认，展示将修改的文件数和新增标签数，并在空选择时禁用应用。
- [x] 7.8 在结果界面展示成功批次回退入口，并为文件缺失/tags 变化/内容变化冲突和带唯一 before/after 目标的 `recoveryRequired` 展示精确文件列表与恢复操作。
- [x] 7.9 更新 `styles.css`，使用 Obsidian CSS 变量实现宽窄 Modal、深色主题、长路径换行、可读风险标签和键盘焦点样式。
- [x] 7.10 增加 UI 纯函数与 DOM 测试，确认空范围/API key 阻断、文件夹切换重算范围、读取/AI/计划状态可辨识、风险不只依赖颜色、高风险无选择控件、中风险不会被批量选择且审查期零写入。

## 8. 插件命令与工作流编排

- [x] 8.1 在 `src/main.ts` 注册“为文件夹批量生成标签建议”和“撤销最近一次文件夹批量标签操作”命令。
- [x] 8.2 编排活动 Markdown/API key 前置、范围确认、空范围阻断、标签索引准备、设置/内容快照、runner 进度和批次审查 Modal 的完整链路。
- [x] 8.3 将最终选中计划交给 `FolderBatchExecutor`，并在应用、冲突、失败恢复和回退后刷新对应 UI 状态。
- [x] 8.4 在插件加载时发现未解决批次记录并提供恢复入口，同时阻止新的文件夹批量写入。
- [x] 8.5 更新 `PluginData` 与保存/加载流程，保持现有 settings、推荐记录、cleanup 记录、tag index 和健康缓存兼容。
- [x] 8.6 将单篇推荐切换到共享 frontmatter 汇总语义和内容 hash 冲突检查，AI 失败但存在本地同步项时仍打开带警告预览；更新命令注册/回归测试，确认 API key 前置、回退恢复原 frontmatter、正文不变且健康报告行为保持不变。

## 9. E2E Harness 与完整回归

- [x] 9.1 扩展 Obsidian harness 的 `TFile`/文件夹父子关系和范围枚举，使根目录、直接子文件与嵌套文件可测试。
- [x] 9.2 扩展 AI mock，支持多笔记响应队列、在途 gate、取消后晚到响应、逐项 provider/解析失败和请求数量断言。
- [x] 9.3 扩展文件写入 mock，支持正文/其他 frontmatter/tags 漂移、指定文件失败、预检后竞态、补偿失败和插件重载后的持久化数据恢复。
- [x] 9.4 增加 E2E：活动文件/API key 前置、默认父文件夹、其他文件夹和根目录、空范围、范围确认前零请求、递归开关、默认 50、1–200 配置和禁止截断符合契约。
- [x] 9.5 增加 E2E：多篇生成展示正交进度；取消停止新请求并丢弃晚到响应；AI 失败保留本地同步；失败项可以单独重试且取消项不重试。
- [x] 9.6 增加 E2E：预览区分 frontmatter、inline 和 AI 来源；inline 同步及已有标签建议默认选中，新标签建议逐项选择，高风险不可选，并展示逐文件前后 tags。
- [x] 9.7 增加 E2E：AI 无有效建议但有未同步 inline tag 时仍可预览；应用后的 frontmatter 是原 tags、选中 inline 同步项和选中 AI 建议的并集，未选文件和正文内容保持不变。
- [x] 9.8 增加 E2E：tags 或完整 Markdown 内容漂移的预检冲突保证零写入；预检后竞态触发补偿；中途失败分别验证完整补偿和 target=before 的 `recoveryRequired`。
- [x] 9.9 增加 E2E：成功批次跨插件重载仍可回退，回退冲突零写入，完整回退恢复全部文件，回退补偿失败固定 target=after，并覆盖 applying/undoing 重载对账表。
- [x] 9.10 运行全部现有 E2E，确认当前笔记推荐、健康报告清理、缓存和错误恢复链路无回归。

## 10. 文档、验收与发布边界

- [x] 10.1 更新中英文 README，说明当前笔记与文件夹批次的 API key 前置、整篇标签来源、inline-to-frontmatter 默认同步、正文不改写、内容漂移阻断、立即取消/在途计费边界、AI 失败时的本地同步，以及文件夹入口、默认 50 且可配置为 1–200 的上限和默认风险选择。
- [x] 10.2 更新 `docs/roadmap.zh-CN.md` 与中英文产品交接文档，将 0.3 状态从待实现更新为已实现，并保持 0.4 操作历史为下一阶段。
- [x] 10.3 如技术结构与本设计发生偏差，先更新本 change 的 design/spec 再完成实现，不得让代码绕过已确认安全边界。
- [x] 10.4 运行 `npm run spec:validate -- add-safe-folder-batch-preview` 和 `npm run spec:validate -- --all`。
- [x] 10.5 运行 `npm test`、`npm run build` 和 `git diff --check`，记录实际结果。
- [x] 10.6 使用 `npm run local:install-dev` 安装到专用测试库，验证深色/浅色、宽窄窗口、键盘操作和长路径布局。
- [ ] 10.7 在可恢复的真实测试库中 smoke：API key/空范围阻断、范围确认、生成进度、立即取消、AI 失败本地同步、失败重试、默认选择、内容漂移、应用、before/after 目标恢复和重载后回退。
- [x] 10.8 保存必要的真实 UI 截图或验收记录，并明确区分自动化结果与真实 Obsidian 视觉证明。
