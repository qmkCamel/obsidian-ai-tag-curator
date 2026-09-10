## Context

最新 `dev` 已经完成 0.3 的主要实现：

- `VaultReader.readNote()` 分离 `frontmatterTags` 与 `inlineTags`，`NoteTagInventory` 提供整篇标签并集；
- inline tag 读取优先使用 `CachedMetadata.tags`，缓存缺失时回退本地正则，但当前模型只保留去重后的 tag 名称，不保留 occurrence 位置；
- 当前笔记推荐与文件夹批次使用完整 Markdown SHA-256，`FrontmatterWriter` 能按 tags + 内容快照拒绝陈旧计划；
- `FolderBatchExecutor`、`FolderBatchRecoveryService` 和 `BatchOperationRecord` 已验证全量预检、逐文件 CAS、逆序补偿、固定恢复目标和插件重载对账；
- 健康报告的 `mergeTags` / `renameTag` 仍由 `applyCleanupItem()` 逐文件直接调用 `processFrontMatter()`，计划只包含相关 tag 名称，没有正文位置、完整内容快照、应用前全量预检或中断恢复；
- 基线 spec 明确限制可执行清理只写 frontmatter，所以正文中的旧标签在清理后仍会继续进入标签索引。

这项变更只扩展标签健康清理的确定性合并/重命名。它依赖最新 `dev` 的 source-aware inventory 和内容快照，但不能直接复用只允许 frontmatter 加法的 `FolderBatchExecutor`。实现必须兼容 Obsidian `manifest.minAppVersion = 1.8.7`、桌面和移动端，不使用 Node `fs` 或私有 CodeMirror API。

## Goals / Non-Goals

**Goals:**

- 对 Obsidian metadata cache 明确认出的正文 tag occurrence 建立可信、可定位、可审查的数据模型；
- 让健康清理的确定性 rename/merge 能在同一次用户操作中更新选中的 frontmatter tag 与 inline tag token；
- 在写入前展示文件级 frontmatter diff 和 occurrence 级正文 diff，并允许用户逐文件、逐 occurrence 取消；
- 只替换完整 `#tag` token，正文其他字符、换行、空白、链接、代码、标题和 frontmatter 之外的结构逐字保留；
- 为混合 frontmatter/正文、多文件操作提供零写入预检、逐阶段 CAS、失败补偿、中断恢复和冲突安全回退；
- 不持久化完整 Markdown 或预览上下文，只持久化最小 patch、tags 和不可逆 hash；
- 兼容历史 recommendation、frontmatter-only cleanup 和 folder batch 操作记录；
- 保持 AI 只做解释和候选提示，不能决定 occurrence、选择、动作能力或执行结果。

**Non-Goals:**

- 不在当前笔记推荐或文件夹 AI 批次中写正文 inline tags；
- 不自动新增 inline tag，不提供“写到光标处”或固定正文标签区；
- 不删除、移动、去重、拆分 inline tag，也不改变 token 周围的空格、标点或段落；
- 不使 `removeTag`、`splitBroadTag`、`observeOnly` 或 `manualReview` 变为可执行；
- 不用正则 fallback 的结果直接生成可执行正文 patch；
- 不把任意 Markdown AST 重写、全库自动清理或后台定时执行引入本变更；
- 不在本变更中重写 0.3 文件夹批次执行器或交付完整操作历史列表。

## Decisions

### 1. 第一版只扩展健康清理中的确定性 rename/merge

本地 action capability 仍先决定动作是否可执行：只有 `nearDuplicates + merge` 和 `namingDrift/hierarchyInconsistency + rename` 可以进入正文审查。AI target 仍然只是说明；最终 target 必须来自本地 cleanup plan 的非空合法标签。

正文 occurrence 与 frontmatter 变更默认全选，但用户可以逐文件取消 frontmatter 变更、逐 occurrence 取消正文变更。如果存在不可执行 occurrence 或用户留下未选 source tag，UI 必须显示“部分清理”及剩余数量，并在最终确认中再次说明；系统不得把部分执行描述为全库已完成。

备选方案：

- 为所有健康动作开放正文改写：删除和拆分缺少确定的替换语义，风险不可控，拒绝采用；
- 把 inline 写入加入文件夹 AI 批次：AI 生成与 taxonomy 清理的授权来源不同，拒绝采用；
- 不允许任何逐位置取消：安全但无法处理正文语义例外，不符合审查目标。

### 2. 初始健康计划继续只用 TagIndex，点击审查后按需 hydrate 精确位置

保留 `buildCleanupPlan()` 的同步、只读和“无额外 vault scan”契约。健康报告卡片先展示索引已有的受影响文件与来源摘要；用户点击可执行项后，由新增 `CleanupReviewPlanBuilder` 按稳定路径读取该 item 的受影响文件，构建不可变的执行审查计划。

hydrate 使用最多 4 个 worker，提供文件进度和取消；它只保存 hash、tags、相关 occurrence、最多 160 个字符的显示上下文和计算后的 patch，不把完整正文保留在 Modal 状态或插件数据中。取消或读取失败不会产生操作记录或写入。

这样既不让持久化 `TagIndex` 随 occurrence 数量膨胀，也不会让打开健康报告就再次扫描全库。代价是首次点击“审查变更”需要一次本地读取阶段。

备选方案：

- 把全库所有 occurrence 位置持久化进 `TagIndex`：缓存体积、位置过期和迁移成本过高，拒绝采用；
- 打开健康报告时预读所有位置：用户可能只处理一个 item，会产生不必要工作，拒绝采用；
- 直接沿用索引 snippet 做替换：snippet 不是唯一定位信息，拒绝采用。

### 3. 可执行位置只来自校验通过的 Obsidian TagCache

新增 `InlineTagOccurrenceReader`。对于每个 `cache.tags` 条目：

1. 使用 `TagCache.position.start/end.offset` 读取完整文件区间；
2. 要求区间位于 `getFrontMatterInfo(content).contentStart` 之后；
3. 要求 `content.slice(start, end) === entry.tag` 且文本以单个 `#` 开头；
4. 去掉 `#` 后按现有 `normalizeTag()` 与清理 source tags 精确匹配；
5. 将 full-file offset 转换为 `bodyStart/bodyEnd`，相对于 `contentStart` 后的正文；
6. 用 `path + bodyStart + bodyEnd + normalizedTag` 生成稳定 occurrence id，并保留 line/column 和截断上下文用于显示。

同一 tag 的每次出现都保留，不能像 `NoteTagInventory.inlineTags` 一样去重。Unicode、中文、嵌套 tag、同一行多个 tag 和 tag 前存在 emoji 时，offset 校验必须以 JavaScript 字符串切片结果为准。

如果 `cache.tags` 不存在、任一相关条目越过 frontmatter 边界、slice 不匹配或同一区间重叠，对应文件的正文位置状态标记为 `unavailable`。正则 fallback 仍可用于只读 inventory 和健康证据，但只能产生“需人工处理”的剩余项，不能产生 `InlineTextEdit`。

备选方案：

- 用现有正则重新扫描并写入：难以覆盖 Obsidian 的完整解析语义和位置边界，拒绝采用；
- 使用 Markdown AST 第三方依赖：会增加包体、移动端兼容和与 Obsidian 语义漂移风险，拒绝采用；
- 只按字符串全局替换 `#old`：会误伤代码、URL、较长 tag 前缀和语义文本，拒绝采用。

### 4. 正文 patch 使用 body-relative offset 和最小 token edit

核心审查模型：

```ts
type InlineOccurrenceAvailability = "trusted" | "cacheUnavailable" | "positionMismatch";

interface InlineTagOccurrence {
  id: string;
  tag: string;
  normalizedTag: string;
  sourceText: string;
  bodyStart: number;
  bodyEnd: number;
  line: number;
  column: number;
  context: string;
  availability: InlineOccurrenceAvailability;
}

interface InlineTextEdit {
  occurrenceId: string;
  beforeBodyStart: number;
  beforeBodyEnd: number;
  afterBodyStart: number;
  afterBodyEnd: number;
  beforeText: string;
  afterText: string;
}

interface CleanupReviewFilePatch {
  notePath: string;
  sourceContentHash: string;
  beforeBodyHash: string;
  beforeTags: string[];
  afterTags: string[];
  frontmatterSelected: boolean;
  inlineEdits: InlineTextEdit[];
  unavailableInlineCount: number;
}
```

`beforeText` 必须等于 cache 返回的完整 `#source`，`afterText` 必须是 `#${targetTag}`。构建 plan 时先检查 before ranges 不重叠，并按起始位置升序累计更早 edit 的长度差，计算每条 edit 在 after body 中的 `afterBodyStart/afterBodyEnd`。正向预检/写入按 before range 降序应用，反向预检/写入按 after range 降序应用；不能假设不等长替换后的 offset 与 before 相同。

审查计划不保存完整 body，因此用户切换 occurrence 后只重算选择、计数和最小 edit 集合，不在 Modal 内重算整篇 `afterBodyHash`。`CleanupExecutor` 在应用前全量预检时重新读取当前内容；只有 `sourceContentHash`、`beforeBodyHash`、beforeTags 和 token slices 全部匹配，才对当前 body 应用最终选中 edits、计算确定的 `afterBodyHash` 并把它写入 applying intent。这样 operation record 在第一次写入前仍具备完整恢复信息，同时审查状态不持有全文。

body-relative offset 以 `getFrontMatterInfo(content).contentStart` 为零点，因此 `processFrontMatter()` 改变 YAML 长度后仍可用同一正文 patch 描述状态。不存在 frontmatter 时 `contentStart = 0`。正文中目标 tag 已经存在时仍只把 source token 改成 target token；不删除由此产生的重复提及。

上下文只用于 UI，不进入 operation log。最终没有 frontmatter 变更且没有选中 inline edit 的文件从写入计划中移除；全部文件均为空时禁用应用。

### 5. 专用审查界面替代健康卡片上的直接写入

健康行动卡片的可执行按钮改为“审查变更”。hydrate 完成后打开 `CleanupReviewModal`：

- 顶部展示 action、target、文件数、frontmatter 变更数、inline occurrence 数、不可执行/未选数量；
- 文件按路径稳定排序并可折叠；
- frontmatter 使用 before/after tag list 和独立选择控件；
- 每个 inline occurrence 展示行号、上下文和 `- #source / + #target`，可信位置有 toggle，不可信位置禁用并显示原因；
- 提供“选择全部可信变更”“清除全部”，不提供选择不可执行位置的方式；
- 应用按钮只在至少一个可信变更被选中且没有未解决操作阻断时可用；
- 点击应用后显示文件数、frontmatter 变更数、inline occurrence 数的二次确认；部分清理还要明确显示将保留的 source 数量；
- 审查、切换、复制和取消期间保持零写入、零 operation record。

健康卡片仍可展示现有 evidence preview，复制 Markdown 时增加“inline 正文改写需进入审查”的能力说明，但不导出完整正文上下文。

### 6. InlineTagWriter 使用异步预检 + Vault.process 内精确 CAS

新增 `InlineTagWriter.applyEditsIfSnapshotMatches()`：

1. 使用 `vault.read(file)` 取得准备修改的当前内容；
2. 异步计算 SHA-256，必须等于 plan 当前阶段的 expected full-content hash；
3. 解析 `contentStart`，再次验证每个 body-relative slice 等于 `beforeText`、edit 不重叠且 after tag 合法；
4. 调用 `vault.process(file, callback)`；callback 内先要求 `data === 刚才预检的完整内容`，否则抛出 `contentChanged`；
5. 仅替换正文区间，返回原 frontmatter prefix + 修改后的 body；
6. 对 `vault.process()` 返回内容计算 after full-content hash 和 after body hash。

预读 hash 解决 `crypto.subtle.digest()` 只能异步的问题，`Vault.process()` callback 内的精确字符串比较关闭预读到写入之间的竞态。不能使用 `vault.modify()`、Adapter 或先读后无条件写回。

反向 patch 通过交换 `beforeText/afterText` 生成，并使用相同 writer/CAS，不单独实现宽松撤销路径。

### 7. 每文件先改正文再改 frontmatter，并用语义状态支持恢复

`CleanupExecutor` 输入最终选择后的 `CleanupReviewPlan`。所有文件先全量验证：文件存在、完整内容 hash 匹配、frontmatter tags 匹配、选中的 token slice 匹配；任一冲突保证第一次写入前零写入。

通过预检后：

1. 全量预检在内存中对最终选中 edits 计算每个文件的 after body 与 `afterBodyHash`，随后持久化 `CleanupOperationRecordV2(status = applying)`，包含全部 before/after tags、before/after body hash、最小 inline edits 和恢复元数据；
2. 文件按路径升序处理；
3. 对有 inline edits 的文件先调用 `InlineTagWriter`；
4. 对有 frontmatter 变更的文件再用 inline 写入后的 full hash 调用 `FrontmatterWriter.replaceTagsIfSnapshotMatches()`；
5. 全部成功后写入每文件 `afterContentHash`，状态改为 `applied`；
6. 任一失败时停止，按已处理文件逆序恢复：先恢复 frontmatter，再反向正文 patch；
7. 完全补偿成功则删除 intent；补偿不完整则固定 `recoveryTarget = before` 并进入 `recoveryRequired`。

文件状态由 frontmatter tags 与 body hash 的组合确定：

```text
before       = beforeTags + beforeBodyHash
bodyChanged  = beforeTags + afterBodyHash
after        = afterTags  + afterBodyHash
conflict     = 其他组合、文件缺失或正文 hash 不匹配
```

frontmatter-only 文件的 before/after body hash 相同；inline-only 文件的 before/after tags 相同，所以同一分类器可以覆盖三种文件。`bodyChanged` 是可解释的中间态，重载时不能误判为用户冲突。

恢复/回退分类有意不比较完整 frontmatter hash：用户在应用后只修改 aliases、status 等无关 frontmatter 属性时，只要 tags 与 body 仍匹配 after 状态，系统可以通过 `processFrontMatter()` 恢复 tags 并保留这些无关属性。正文任意变化或 tags 变化仍然属于 conflict。

不使用一次 `Vault.process()` 手工重写 YAML 与正文，因为这会绕过 Obsidian 推荐的 `processFrontMatter()` 并可能破坏 YAML 格式；两阶段写入的中间态由持久化事务和 recovery service 处理。

### 8. CleanupRecoveryService 沿用固定恢复目标，不猜测用户意图

新 cleanup V2 状态使用与 folder batch 一致的集合：`applying | applied | undoing | recoveryRequired`，恢复目标只有 `before | after`。

插件加载时对最新未解决 cleanup 对账：

- `applying`：all-before 删除记录，all-after 标为 applied，其余固定 target=before；
- `undoing`：all-before 删除记录，all-after 恢复 applied，其余固定 target=after；
- `recoveryRequired`：保留已有唯一目标，不允许切换；
- 任一文件为 missing/conflict 时不得自动写入，只展示精确文件状态；
- 用户点击“重试恢复”后先全量分类，全部可安全推进时才按固定目标执行；中途失败继续保留相同目标。

回退 applied cleanup 前要求所有选择过的文件都处于 after；第一次回退写入前将记录持久化为 undoing。回退顺序与应用相反，并在失败时补偿回 after；不完整则固定 target=after。

只要存在未解决 folder batch 或 cleanup V2，插件所有新的 tag 写入入口（当前笔记推荐、文件夹批次、健康清理及相应 undo）都必须阻断，并引导用户先完成恢复。只读索引、健康分析、预览和导出仍可使用。

### 9. OperationLog 使用版本化联合类型兼容旧记录

不原地迁移旧 plugin data。新增 `CleanupOperationRecordV2`：

```ts
interface CleanupFilePatchRecord {
  notePath: string;
  beforeTags: string[];
  afterTags: string[];
  beforeBodyHash: string;
  afterBodyHash: string;
  sourceContentHash: string;
  afterContentHash?: string;
  inlineEdits: InlineTextEdit[];
  recoveryState?: "before" | "bodyChanged" | "after" | "conflict" | "missing";
}

interface CleanupOperationRecordV2 {
  id: string;
  type: "cleanup";
  schemaVersion: 2;
  status: "applying" | "applied" | "undoing" | "recoveryRequired";
  recoveryTarget?: "before" | "after";
  itemId: string;
  title: string;
  action: "merge" | "rename";
  targetTag: string;
  createdAt: string;
  files: CleanupFilePatchRecord[];
}
```

现有无 `schemaVersion/status` 的 cleanup 记录继续视为 legacy applied，并沿用 frontmatter-only undo；它们不进入正文 recovery。新记录不保存完整正文、上下文、API key 或 AI response。一次清理事务只占一个日志槽位，intent 必须在第一次写入前落盘。

`OperationLog` 增加明确的 legacy/v2 type guard、`addCleanupIntent()`、状态/文件更新、`latestUnresolvedMutation()` 等方法。不能用可选字段猜测 batch、recommendation 和 cleanup 版本。

### 10. 索引、缓存与 AI 在稳定事务之后更新

执行、补偿、恢复或回退到稳定状态后只刷新一次 tag index，并使健康 AI cache 失效。刷新失败不能删除 applied/recovery record，UI 单独提示“文件状态已稳定但索引刷新失败”。

计划的 occurrence 和选择完全由本地读取构建；AI analysis cache 只能把 priority 与 cleanup item 关联，不得增加、删除或更改 `InlineTextEdit`。目标标签变化必须重新 hydrate 并生成新的内容 hash/patch，不能复用旧位置计划。

### 11. Harness 和验证覆盖真实位置、竞态与重载

扩展 fake metadata cache，使 `TagCache` 包含真实 line/column/offset；扩展 fake vault 支持 `read()`、`process()`、正文写入拦截、指定阶段失败、缓存陈旧和插件重载。自动化至少覆盖：

- 中文、嵌套 tag、emoji 前缀、CRLF、无 frontmatter、同一行多 tag 和重复 occurrence；
- cache 缺失、stale offset、重叠 edit、非法 target、正文 slice 不匹配；
- frontmatter-only、inline-only、混合文件和用户逐位置取消；
- 预检冲突零写入、预检后竞态、正文成功/frontmatter 失败、跨文件失败、两种补偿结果；
- applying/undoing 的 all-before、bodyChanged、all-after、conflict、missing 重载分类；
- applied undo、用户后续正文或 tags 修改、target=before/after 恢复；
- 历史 cleanup、recommendation、batch 数据加载与全局未解决写入阻断；
- 审查 Modal 的来源标识、键盘操作、窄窗口、长路径和部分清理确认。

真实 Obsidian smoke 必须使用可恢复测试库，至少检查 metadata position 与实际内容一致、活动编辑器打开时无内容丢失、深浅主题、桌面端和移动端兼容 API 边界；自动化不能替代该项证明。

## Risks / Trade-offs

- [风险] metadata cache 可能缺失或落后于正文。→ 每个 occurrence 都做 exact-slice 校验；不可信位置禁用，应用前完整内容 hash 再阻断陈旧计划。
- [风险] `processFrontMatter()` 会改变 YAML 长度，使 full-file offset 失效。→ 所有正文 edit 转为 `contentStart` 后的 body-relative offset，并以 body hash 分类恢复状态。
- [风险] 同一文件需要两次 Obsidian 原子写入，进程可能停在中间。→ 第一次写入前持久化 intent，显式识别 `bodyChanged`，加载时固定恢复目标。
- [风险] 用户取消部分 occurrence 后旧标签仍存在。→ UI 显示剩余数量和部分清理警告，最终确认再次说明，不宣称全部完成。
- [风险] 替换后可能出现相邻或重复 target tag。→ 第一版只做 token 等长/非等长替换，不删除或合并正文文本；把去重留给人工判断。
- [风险] 大型清理项 hydrate 较慢。→ 最多 4 并发、稳定进度、可取消、只读取当前 item，不把完整正文放入长期状态。
- [风险] operation log patch 增加持久化体积。→ 只记录相关 token、body offset 与 hash，不保存上下文或全文，并继续受 operation log limit 约束。
- [风险] 活动编辑器与后台 `Vault.process()` 的交互需要真实验证。→ 保留完整内容 CAS、禁止 Adapter 写入，并把活动文件 smoke 列为发布前必做；发现内容漂移时拒绝而不是覆盖。
- [风险] 新旧 cleanup 记录的 undo 语义不同。→ 使用 `schemaVersion: 2` 明确分流，不静默改写旧记录。

## Migration Plan

1. 先增加只读 occurrence/hydration 模型、fake cache position 和单元测试，不改变现有应用按钮行为。
2. 增加 `CleanupReviewModal`，把按钮切换为“审查变更”，此阶段仍可仅生成 frontmatter patch 验证 UI 与选择状态。
3. 增加 `InlineTagWriter` 与逐文件混合 patch 测试，再引入 V2 cleanup intent/executor/recovery；新执行路径在所有冲突与补偿测试通过后接线。
4. 加载时兼容 legacy cleanup，只有新操作写 V2；不迁移、不删除历史记录。
5. 完成自动化、OpenSpec、build 和真实测试库 smoke 后再更新 README/roadmap 中“正文不改写”的范围说明。
6. 如需回滚发布，停用新审查入口并恢复 frontmatter-only executor；已经 applied 的 V2 记录仍保留 recovery/undo 代码，不能通过降级删除未解决 intent。

## Open Questions

没有阻塞开发的产品或架构问题。实现阶段仍需在最低支持版本与当前稳定版 Obsidian 中验证 `TagCache.position` 的 Unicode/CRLF offset 和活动编辑器行为；这些验证已经列入任务与发布门禁，若实际 API 行为不满足 exact-slice 契约，则对应 occurrence 必须保持不可执行，而不是放宽为正则写入。
