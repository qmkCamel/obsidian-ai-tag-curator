## 1. 可信 inline occurrence 数据模型与读取

- [x] 1.1 新增 `InlineTagOccurrence`、availability、body-relative position 和稳定 occurrence id 类型，明确 UI 上下文不进入持久化记录。
- [x] 1.2 新增正文/frontmatter 分界工具，基于 `getFrontMatterInfo(content).contentStart` 返回 prefix、body 与 full/body offset 转换。
- [x] 1.3 实现 `InlineTagOccurrenceReader`，从 `CachedMetadata.tags` 保留每次出现而不是按 tag 去重。
- [x] 1.4 对每个 `TagCache.position` 校验 frontmatter 边界、`content.slice(start, end) === entry.tag`、完整 `#tag` 形态和合法 normalized tag。
- [x] 1.5 将可信 full-file offset 转换为 body-relative offset，并生成行列、最多 160 字符上下文和稳定 id。
- [x] 1.6 对 cache 缺失、slice mismatch、越界、重叠和非法条目返回明确不可用状态，不从 fallback parser 生成可执行 edit。
- [x] 1.7 扩展 `VaultReader` 的按需 occurrence 读取接口，但保持 `IndexedNote`/持久化 `TagIndex` 不保存全库位置列表或完整正文。
- [x] 1.8 增加 occurrence reader 单测，覆盖重复 tag、同一行多 tag、嵌套 tag、中文、emoji 前缀、CRLF、无 frontmatter 和普通 frontmatter。
- [x] 1.9 增加不可用位置单测，覆盖 cache undefined、stale offset、位置在 YAML 内、重叠区间、越界和 source text 不匹配。
- [x] 1.10 回归现有 fallback inventory 测试，确认只读 inline-to-frontmatter 汇总继续工作且不获得正文写权限。

## 2. 清理执行审查计划与纯选择规则

- [x] 2.1 新增 `CleanupReviewPlan`、`CleanupReviewFilePatch`、`InlineTextEdit`、hydrate result 和冲突类型。
- [x] 2.2 实现从现有 `CleanupPlanItem` 提取本地确定性 source tags/target tag 的验证，拒绝非 rename/merge、空 target 或非法 target。
- [x] 2.3 实现 `CleanupReviewPlanBuilder`，按稳定路径读取当前 item 的受影响文件并冻结完整内容 hash、beforeTags 和 beforeBodyHash。
- [x] 2.4 根据每个文件的真实 frontmatter source tags 计算可独立选择的 frontmatter before/after diff，保持无关 tags 和确定性顺序。
- [x] 2.5 根据可信 source occurrence 生成 `#source -> #target` edits，默认选择全部可信位置并保留不可执行数量/原因。
- [x] 2.6 实现 before edit 非重叠验证、after range 偏移计算和按对应 body offset 降序的纯文本变换；审查状态只重算选中 edit 集合，不保存完整正文或在 Modal 内重算 afterBodyHash。
- [x] 2.7 实现逐文件 frontmatter toggle、逐 occurrence toggle、“选择全部可信变更”和“清除全部”的不可变状态更新纯函数。
- [x] 2.8 实现选择变化后重算逐文件 patch、文件数、frontmatter 数、inline occurrence 数、剩余 source 数和 partial 状态。
- [x] 2.9 取消全部变更时从最终执行计划移除空文件，并在全部为空时返回不可应用状态。
- [x] 2.10 确保 target 已存在时只替换 source occurrence，不删除或去重正文中的已有 target occurrence。
- [x] 2.11 增加 review plan 单测，覆盖 frontmatter-only、inline-only、混合来源、重复 occurrence、target 已存在、逐位置取消和部分清理。
- [x] 2.12 增加计划安全测试，覆盖非法 action/target、重叠 edits、无可信变更、读取失败和完整正文不进入 plan 持久化形状。

## 3. 按需 hydrate 协调器与进度

- [x] 3.1 新增 `CleanupReviewPlanBuilder` 的最多 4 worker 有界读取队列和 generation id/cancellation token。
- [x] 3.2 为待读取、成功、不可用、失败和取消文件生成不可变进度快照，并保持路径稳定排序。
- [x] 3.3 用户取消后停止领取新文件，丢弃旧 generation 的晚到结果且不打开审查 Modal。
- [x] 3.4 读取失败文件保留路径和错误分类，不生成可写 patch且不显示为无需变更。
- [x] 3.5 确认 hydrate 只处理当前 cleanup item 的文件，不读取其他 item 或重新运行 AI 分析。
- [x] 3.6 增加协调器测试，覆盖并发上限、稳定进度、取消、晚到结果、局部读取失败和零写入/零操作记录。

## 4. InlineTagWriter 与最小正文 CAS

- [x] 4.1 新增 `InlineTagWriter` 接口、apply result、`contentChanged`/`tokenChanged`/`invalidPatch` 错误类型和反向 patch 生成器。
- [x] 4.2 使用 `vault.read()` 预读待修改内容并异步校验 expected SHA-256，不匹配时在 `Vault.process()` 前拒绝。
- [x] 4.3 在写入前重新解析 `contentStart`，校验全部 body-relative slice、合法 target、非重叠和预期 beforeBodyHash。
- [x] 4.4 在 `Vault.process()` callback 内精确比较 `data === preflightContent`，关闭异步 hash 预检后的竞态窗口。
- [x] 4.5 按 bodyStart 降序只替换选中 token，逐字保留 frontmatter prefix、未选正文、换行和周围标点。
- [x] 4.6 返回 Obsidian 实际写入后的完整内容 hash 和 body hash，供下一阶段 frontmatter CAS 与 operation record 使用。
- [x] 4.7 反向应用使用持久化 after ranges 并复用相同 CAS/validation 路径，不实现模糊搜索、全局替换或宽松撤销。
- [x] 4.8 增加 writer 单测，覆盖长度变化、多 occurrence、Unicode/CRLF、无 frontmatter、未选位置不变和前后正文逐字比较。
- [x] 4.9 增加 writer 冲突测试，覆盖 source hash 漂移、body hash 漂移、token slice 漂移、预检后竞态、重叠 patch 和非法 target。
- [x] 4.10 增加 writer 反向 patch 测试，确认 apply/reverse 往返得到逐字相同的原始 Markdown。

## 5. Cleanup V2 操作日志与兼容边界

- [x] 5.1 在 `OperationLog` 新增 `CleanupOperationRecordV2`、status、recoveryTarget、逐文件 body/hash/edit/recovery state 类型。
- [x] 5.2 增加显式 legacy cleanup、V2 cleanup、recommendation 和 batch type guards，禁止依赖模糊可选字段误判记录。
- [x] 5.3 实现 `addCleanupIntent()`，在第一次写入前保存 schemaVersion 2 applying 记录且一次事务只占一个日志槽位。
- [x] 5.4 实现 V2 cleanup 的状态、恢复目标、afterContentHash、逐文件 recovery state 更新方法。
- [x] 5.5 实现 `latestCleanupV2()`、`latestUnresolvedCleanup()` 和覆盖 batch/cleanup 的 `latestUnresolvedMutation()` 查询。
- [x] 5.6 保持无 schemaVersion/status 的历史 cleanup 为 frontmatter-only applied，并继续由旧 undo 分支处理。
- [x] 5.7 确认序列化记录不包含完整 Markdown、显示上下文、API key 或 AI response，并继续遵守 operation log limit。
- [x] 5.8 增加 OperationLog 测试，覆盖新 intent、状态更新、固定恢复目标、日志上限、删除和 clone 防变异。
- [x] 5.9 增加旧 plugin data 兼容测试，覆盖历史 recommendation/cleanup、batch 与新 V2 cleanup 混合加载和最新记录选择。

## 6. 混合来源 CleanupExecutor 与失败补偿

- [x] 6.1 新增 `CleanupExecutor` 依赖接口，组合 file lookup、`InlineTagWriter`、`FrontmatterWriter`、OperationLog、persist 与 refreshIndex。
- [x] 6.2 对最终选择计划实施本地安全验证，只允许合法 rename/merge、非空 target、可信 edits 和至少一个实际变更。
- [x] 6.3 在第一次写入前全量检查文件存在、完整内容 hash、beforeTags、beforeBodyHash 和全部 beforeText，汇总 missing/tagsChanged/contentChanged/tokenChanged 冲突，并在内存中计算最终 afterBodyHash。
- [x] 6.4 任一全量预检冲突时返回分类详情并证明零 Markdown 写入、零 applying intent。
- [x] 6.5 全量预检通过后保存 applying intent，按路径升序逐文件执行并在每阶段继续 CAS。
- [x] 6.6 对混合文件先写 inline edits，再用 inline afterContentHash 写 frontmatter；对 inline-only/frontmatter-only 文件跳过空阶段。
- [x] 6.7 全部成功后保存每文件 afterContentHash、更新同一记录为 applied，并只刷新一次 index/健康缓存。
- [x] 6.8 任一阶段失败后停止正向队列，按已处理文件逆序先恢复 frontmatter 再反向正文 edits。
- [x] 6.9 完全补偿成功时删除 applying intent并报告 rolledBack，不把它显示为已应用。
- [x] 6.10 补偿不完整时把同一记录设为 recoveryRequired、固定 target=before 并保存实际文件状态。
- [x] 6.11 索引刷新失败时保留 applied/recovery 记录，单独返回 indexRefreshError 而不重新执行文件写入。
- [x] 6.12 增加 executor 成功测试，覆盖 frontmatter-only、inline-only、混合单文件和混合多文件。
- [x] 6.13 增加全量预检测试，覆盖 missing、tags/content/body/token 冲突和所有冲突下零写入。
- [x] 6.14 增加故障注入测试，覆盖预检后竞态、inline 成功/frontmatter 失败、跨文件失败、补偿成功和 target=before 补偿失败。

## 7. CleanupRecoveryService、回退与全局写入门禁

- [x] 7.1 新增文件状态分类器，根据 beforeTags/afterTags 与 beforeBodyHash/afterBodyHash 返回 before、bodyChanged、after、conflict 或 missing。
- [x] 7.2 新增 `CleanupRecoveryService.reconcileInterruptedCleanup()`，处理 applying 下 all-before/all-after/混合/冲突并固定 before 目标。
- [x] 7.3 处理 undoing 下 all-before/all-after/混合/冲突并固定 after 目标，保留既有 recoveryRequired 的唯一目标。
- [x] 7.4 实现 `retryRecovery()` 的全量分类：存在 missing/conflict 时整次零写入，否则按固定目标推进每个阶段。
- [x] 7.5 实现 applied V2 cleanup 全量回退预检、第一次写入前持久化 undoing、逆序恢复 frontmatter 与 inline token。
- [x] 7.6 实现回退中途失败后的反向补偿：成功回到 applied，不完整进入 recoveryRequired(target=after)。
- [x] 7.7 完整恢复到 before 时删除记录；完整恢复到 after 时回到 applied；稳定后只刷新一次 index/健康缓存。
- [x] 7.8 在插件 onload 对账未解决 V2 cleanup，并提供不会自动覆盖 conflict/missing 的可见恢复入口。
- [x] 7.9 将当前笔记推荐、文件夹批次、健康清理及对应 undo 接入共享 unresolved mutation 写入门禁。
- [x] 7.10 保持刷新索引、查看健康报告、hydrate/审查和复制 Markdown 等只读入口在未解决操作期间可用。
- [x] 7.11 增加表驱动 recovery 测试，覆盖 applying/undoing 的 before/bodyChanged/after/conflict/missing 组合和目标不切换。
- [x] 7.12 增加回退测试，覆盖成功、用户修改正文、用户修改 tags、只修改无关 frontmatter 属性并保留、文件缺失、补偿成功和 target=after 补偿失败。
- [x] 7.13 增加全局写入门禁测试，覆盖 unresolved batch 阻断 cleanup、unresolved cleanup 阻断 recommendation/folder/cleanup 与只读能力不受阻断。

## 8. 健康清理审查 UI、结果和双语文案

- [x] 8.1 在 `src/ui/labels.ts` 增加“审查变更”、hydrate 进度、来源、位置不可用原因、部分清理、冲突、恢复状态和结果的中英文类型与文案。
- [x] 8.2 实现 `CleanupReviewProgressModal`，展示完成/失败/不可用数量、取消和零写入说明。
- [x] 8.3 新增 `CleanupReviewViewModel`，派生文件分组、选择状态、frontmatter/inline 数量、剩余 source 和应用可用性。
- [x] 8.4 实现 `CleanupReviewModal` 顶部 action/target/统计、按路径折叠文件、frontmatter diff 和 occurrence 行号/上下文/token diff。
- [x] 8.5 为可信 frontmatter/occurrence 提供键盘可用 toggle，为不可执行位置展示禁用状态和原因。
- [x] 8.6 实现逐项选择、选择全部可信变更和清除全部，并确保不可执行位置永远不能被程序化选中。
- [x] 8.7 实现应用二次确认，展示文件/frontmatter/occurrence 数；partial 时额外展示剩余 source 数和明确确认文案。
- [x] 8.8 实现 `CleanupResultModal` 或等价结果区域，区分 applied、conflict、rolledBack、recoveryRequired、index refresh failure 和部分清理。
- [x] 8.9 实现 cleanup V2 applied 回退、固定目标恢复重试和逐文件状态展示；legacy cleanup 保持原 frontmatter-only 提示。
- [x] 8.10 将健康行动卡片的直接应用按钮替换为“审查变更”，保留 evidence 摘要和复制能力。
- [x] 8.11 更新复制 Markdown 格式，说明 inline 修改需审查、target、来源摘要和不可执行数量，但不导出正文上下文。
- [x] 8.12 更新 `styles.css`，使用 Obsidian CSS 变量支持深浅主题、宽窄窗口、长路径/上下文换行、focus 和非纯颜色状态表达。
- [x] 8.13 增加 view model/DOM 测试，覆盖来源分组、默认选择、逐项取消、partial、空选择、禁用 occurrence 和二次确认统计。
- [x] 8.14 增加 Modal 布局回归测试，覆盖键盘操作、窄窗口、长路径、长 tag、中文/英文文案与深色 class 边界。

## 9. 插件编排与 E2E harness

- [x] 9.1 在 `src/main.ts` 编排“审查变更” -> hydrate progress -> review -> confirm -> executor -> result 的完整链路。
- [x] 9.2 将 health report 的 latest cleanup 状态扩展为 legacy/V2/unresolved，并在重渲染后保持正确 apply/undo/recovery 控件。
- [x] 9.3 在插件加载、保存、索引刷新和健康 AI cache 失效流程中接入 V2 cleanup，保持现有 recommendation/batch 行为兼容。
- [x] 9.4 注册或复用明确的“处理未完成标签操作”命令，使用户无需重新运行 AI 健康分析即可恢复。
- [x] 9.5 扩展 fake `TagCache` 生成真实 line/column/offset，并支持 cache 缺失、陈旧和自定义错误位置。
- [x] 9.6 扩展 fake vault 的 `read()`/`process()`、正文写入计数、阶段 interceptor、竞态和指定文件/阶段失败。
- [x] 9.7 扩展 E2E 持久化/重载 harness，支持 V2 cleanup applying/undoing/recoveryRequired 的跨插件实例对账。
- [x] 9.8 增加 E2E：健康 rename/merge 打开 occurrence 审查，来源/上下文/默认选择正确且审查期间零写入。
- [x] 9.9 增加 E2E：用户逐位置取消并确认 partial 后，只修改选中 frontmatter/inline token，周围正文逐字不变。
- [x] 9.10 增加 E2E：cache 不可用/陈旧位置禁用，fallback inventory 仍可见但不能获得正文写权限。
- [x] 9.11 增加 E2E：应用前正文/tags/文件漂移整次零写入，预检后竞态触发补偿。
- [x] 9.12 增加 E2E：混合多文件成功应用、跨重载回退、用户后续正文修改冲突和 legacy cleanup undo 兼容。
- [x] 9.13 增加 E2E：inline/frontmatter 中途失败分别得到 rolledBack、target=before recovery 和 target=after recovery。
- [x] 9.14 运行全部现有 E2E，确认当前笔记 inline-to-frontmatter 汇总、文件夹批次、健康 AI 层和历史 undo 无回归。

## 10. 文档、验证与真实 Obsidian 验收

- [x] 10.1 更新中英文 README，区分 inline-to-frontmatter 汇总与健康清理中的受审查 inline token 重写，并保留不支持动作列表。
- [x] 10.2 更新 `docs/roadmap.zh-CN.md`、中英文 product handoff 和技术设计，记录新能力、部分清理、缓存位置与恢复边界。
- [x] 10.3 更新 OpenSpec project context 的当前产品方向；如实现偏离本 design/spec，先更新 artifacts 再继续编码。
- [x] 10.4 运行 `npm run spec:validate -- support-reviewed-inline-tag-rewrites`。
- [x] 10.5 运行 `npm run spec:validate -- --all`，确认与 `cleanup-action-capabilities`、`inline-health-actions` 及 0.3 change 无冲突。
- [x] 10.6 运行相关聚焦测试、`npm test`、`npm run build` 和 `git diff --check`。
- [x] 10.7 使用 `npm run local:install-dev` 安装到专用可恢复测试库，不使用生产 vault 作为首次写入验证环境。
- [ ] 10.8 在最低支持版本与当前稳定版 Obsidian 验证 TagCache position：中文、emoji、CRLF、嵌套/重复 tag、无/有 frontmatter 和活动编辑器打开状态。
- [x] 10.9 在真实测试库 smoke 完整审查、逐位置取消、partial 确认、混合应用、内容冲突、回退、插件重载和 before/after 恢复目标。
- [ ] 10.10 验证桌面窄/宽窗口、深色/浅色、键盘焦点和长路径布局，保存必要截图或验收记录。
- [x] 10.11 明确记录自动化通过项、真实 Obsidian 证明和任何尚未验证的移动端边界，不以 build/test 代替视觉与设备验证。
