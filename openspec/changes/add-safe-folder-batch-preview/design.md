## Context

`0.1.2` 已有两条可复用的安全链路：

- 当前笔记推荐由 `src/main.ts` 读取活动 Markdown、准备 `TagIndex`、调用 `TagRecommendationService.recommendForNote()`，再由 `RecommendationModal` 基于用户选择创建单个 `ChangePlan`；
- 健康报告清理由本地规则生成文件预览，`FrontmatterWriter.replaceTagsIfCurrent()` 在回退时校验当前 tags，`OperationLog` 持久化 recommendation/cleanup 两类记录。

文件夹批次不是简单地在 `main.ts` 外层加一层循环。它会同时引入范围确认、多次付费 AI 请求、部分失败、生成期取消、多文件快照漂移、多文件写入补偿、进程中断恢复和批次级回退。Obsidian 没有跨 Markdown 文件事务，因此必须在插件层建立显式状态机和可恢复操作记录。

当前相关限制：

- `VaultReader` 只支持活动笔记或全库读取，没有文件夹范围 API；
- `VaultReader.readNote()` 没有显式区分 frontmatter tags 与正文 inline tags，预览无法说明标签来源；
- `PromptBuilder` 与 `RecommendationParser` 只把 frontmatter tags 当作确定性已有标签，AI 返回正文已经存在的 tag 时仍可能被写入 frontmatter；
- `ChangePlan` 不能区分“同步正文已有标签”和“采用 AI 新建议”，单篇推荐也没有统一的整篇标签汇总语义；
- `TagRecommendationService` 的输入输出是单篇笔记，适合复用，但没有队列、进度或取消语义；
- `RecommendationModal` 默认选择所有建议，不符合批次中“新增标签默认不选”的风险边界；
- `FrontmatterWriter.applyChangePlan()` 是无条件写入，不能用于批量乐观并发控制；
- 当前预览只冻结 tags，没有冻结完整 Markdown 内容；正文或其他 frontmatter 在审查期间变化时，AI 建议与 inline 同步项可能已经陈旧；
- `OperationLog` 没有批次状态，也无法表达 `applying`、`undoing`、`recoveryRequired` 或失败补偿应回到 `before`/`after` 的目标方向；
- `LoadingModal` 只有最小化/展开，没有文件级进度、失败重试和取消能力。

主要用户是希望整理一个明确文件夹、但不愿让插件静默批量改写个人 Markdown 资产的 Obsidian 用户。实施者需要同时维护简体中文和英文 UI；当前笔记推荐与文件夹批次共享新的 frontmatter 标签汇总语义，健康报告和既有回退行为保持兼容。

## Goals / Non-Goals

**Goals:**

- 默认以当前 Markdown 笔记的父文件夹为入口，同时允许选择库内任意文件夹或根目录，明确确认直接文件或完整子树范围，并允许用户配置单批安全上限；
- 用同一个标签索引和设置快照为范围内笔记生成独立建议，并提供有界并发、进度、取消和失败重试；
- 冻结每篇笔记的完整 Markdown SHA-256 快照，并在全量预检和每文件写入前阻止陈旧计划；
- 为当前笔记和文件夹批次构建共享的 `NoteTagInventory`，在预览中完整展示 frontmatter、inline 和 AI 标签来源；
- 将正文已有但 frontmatter 缺少的 tag 作为默认选中的确定性同步项，应用后让 frontmatter 汇总用户选中的整篇标签；
- 组合逐笔记 `ChangePlan`，提供批次总览、逐笔记/逐标签预览和风险分层选择；
- 仅批量新增经过审查的 frontmatter tags，默认只选择复用已有标签的低风险建议；
- 在多文件写入和回退中实现全量预检、逐文件 compare-and-swap、失败补偿和进程中断恢复；
- 为失败补偿持久化唯一恢复目标，保证应用失败回到批次前、回退失败回到批次后；
- 将一次批次作为一个持久化操作记录，并提供结果页与独立命令两条回退入口；
- 通过纯函数单测、执行器故障注入测试、E2E 和真实库 smoke test 验证安全边界。

**Non-Goals:**

- 不修改、移动或删除正文 inline tag 文本；将其复制汇总到 frontmatter 不属于正文改写；
- 不在文件夹批次中执行标签替换、合并、删除或健康报告的高风险清理动作；
- 不做全库静默处理、后台定时任务或跨设备批次同步；
- 不在 0.3 提供完整操作历史列表，只有最近一次文件夹批次的可见回退和恢复入口；
- 不持久化尚未应用的普通预览草稿，也不支持关闭 Obsidian 后继续未完成的 AI 生成队列；
- 不在 0.3 提供无需 API key 的独立“仅汇总已有标签”模式；
- 不引入新的运行时依赖、数据库或任务队列基础设施。

## Decisions

### 1. 默认范围由当前笔记父文件夹派生，同时支持选择任意库内文件夹

新增 `VaultReader.listMarkdownFilesInFolder(folderPath, includeSubfolders)`：先调用 `vault.getMarkdownFiles()`，再按完整路径段过滤并稳定排序。活动文件父路径来自 `TFile.parent?.path`，作为每次打开范围确认时的默认选择；根目录使用空字符串表示。

新增 `FolderSuggestModal`，基于 Obsidian `FuzzySuggestModal<TFolder>` 展示当前 vault 内的文件夹，并补充一个代表库根目录的选项。用户从 `FolderBatchScopeModal` 点击“选择文件夹”后打开该选择器；选择完成后返回范围确认页并立即重新计算文件列表、Markdown 文件数、预计 AI 请求数和安全上限状态。选择文件夹本身不发起 AI 请求。

`FolderBatchScopeModal` 展示：

- 当前文件夹路径和“选择文件夹”入口；
- “包含子文件夹”开关，默认开启；
- Markdown 文件数；
- 预计 AI 请求数；
- 当前设置的 `maxFolderBatchFiles`，默认 50、允许 1–200；
- 内容将发送给当前 provider 的提示。

`TagCuratorSettings` 新增 `maxFolderBatchFiles`，`DEFAULT_SETTINGS` 取 50，`mergeSettings()` 将旧数据或越界值限制在 1–200。设置页使用整数 slider 展示“单批文件数量上限”，范围确认只读取该值，不提供绕过绝对上限 200 的临时输入。

范围文件数超过当前设置上限时禁用开始按钮，不做“只取路径排序后的前 N 篇”的静默截断。用户可以在设置页提高上限，或在范围页关闭递归、选择更小的文件夹；返回后重新计算整个范围。这里的上限是“完整批次能否启动”的安全阈值，不是截断数量。

范围包含 0 篇 Markdown 时，范围确认保留打开并展示文件数/请求数均为 0、禁用开始按钮和双语空范围提示；不创建计划或操作记录。用户改变文件夹或递归开关后立即重新计算。

命令前置检查顺序与当前笔记推荐保持一致：先验证存在活动 Markdown 笔记，再将 `apiKey.trim()` 为空视为未配置。API key 未配置时显示设置提示，不打开范围确认、不读取范围笔记、不构建索引、不发起请求。0.3 不把 inline 本地同步暴露为绕过该检查的独立模式；API key 仍不得进入批次设置快照、计划或操作日志。

备选方案：

- 只允许当前笔记父文件夹：入口简单，但无法处理其他明确范围，拒绝采用；
- 记住上次选择并作为默认值：可能让用户误处理与当前上下文无关的目录；每次仍以当前笔记父文件夹为默认值；
- 直接处理全库：成本和误操作范围不可控，不符合 0.3 的“明确子集”定位；
- 固定 50 且不可配置：安全但会把规模不同的 vault 都强制到同一阈值，拒绝采用；
- 不设上限：会把 provider 限流、成本和长时间等待问题全部暴露给第一版，拒绝采用。
- 空范围仍允许开始：只会产生无意义状态和空记录，拒绝采用；
- 未配置 API key 时退化为本地汇总：会改变现有推荐命令入口语义并引入第二种运行模式，留待独立能力设计。

### 2. 批次使用不可变上下文和显式状态机

新增 `src/batch/FolderBatchPlan.ts`，核心数据结构如下：

```ts
type FolderBatchPlanStatus = "generating" | "ready" | "partial";
type FolderBatchRisk = "low" | "medium" | "high";
type FolderBatchSourceStatus = "pending" | "ready" | "failed" | "cancelled";
type FolderBatchAiStatus = "notStarted" | "pending" | "ready" | "failed" | "cancelled";
type FolderBatchItemPlanStatus = "pending" | "ready" | "noChange" | "unavailable";

interface FolderBatchSettingsSnapshot {
  model: string;
  maxRecommendations: number;
  maxFolderBatchFiles: number;
  allowNewTags: boolean;
  newTagStrictness: TagCuratorSettings["newTagStrictness"];
  uiLanguage: UiLanguage;
}

interface FolderBatchCandidate {
  id: string;
  tag: string;
  action: "syncInlineTag" | "addTag";
  source: "inline" | "ai";
  type?: RecommendationType;
  confidence?: RecommendationConfidence;
  reason: string;
  risk: FolderBatchRisk;
  selected: boolean;
}

interface FolderBatchPlanItem {
  notePath: string;
  beforeTags?: string[];
  sourceContentHash?: string;
  inventory?: NoteTagInventory;
  sourceStatus: FolderBatchSourceStatus;
  aiStatus: FolderBatchAiStatus;
  planStatus: FolderBatchItemPlanStatus;
  candidates: FolderBatchCandidate[];
  sourceError?: string;
  aiError?: string;
  conflict?: "missing" | "tagsChanged" | "contentChanged";
}

interface FolderBatchPlan {
  id: string;
  folderPath: string;
  includeSubfolders: boolean;
  filePaths: string[];
  indexUpdatedAt: string;
  settings: FolderBatchSettingsSnapshot;
  createdAt: string;
  status: FolderBatchPlanStatus;
  items: FolderBatchPlanItem[];
}
```

计划创建后不再读取实时设置；每个最终 `ChangePlan` 都由纯函数根据 `beforeTags`、`sourceContentHash` 和当前选中的 candidate 重新计算。`sourceContentHash` 是 `cachedRead()` 返回的完整原始 Markdown 按 UTF-8 编码计算的 SHA-256 小写十六进制字符串，使用运行环境内建 Web Crypto，不增加运行时依赖。预览草稿只保存在 Modal/协调器内存中，不写入插件数据，也不保存完整正文。

读取、AI 和计划状态必须正交表达：读取失败时 `sourceStatus = failed`、`aiStatus = notStarted`、`planStatus = unavailable`；读取成功但 AI 失败时仍可根据 inline 同步项得到 `planStatus = ready`，没有本地可写项时为 `unavailable` 而非“无需变更”；只有读取和 AI 都成功且没有任何候选项时才是 `noChange`。任一读取/AI 失败或取消都会使批次整体为 `partial`。

状态流：

```text
scoping -> generating -> ready | partial
ready | partial -> applying -> applied | recoveryRequired
applied -> undoing -> removed | applied | recoveryRequired
applying --reload/reconcile--> removed | applied | recoveryRequired(target=before)
undoing --reload/reconcile--> removed | applied | recoveryRequired(target=after)
```

备选方案：

- 生成每篇建议时读取最新设置/索引：会让同一批次内部标准漂移，拒绝采用；
- 立即把预览草稿持久化：需要草稿迁移、过期和恢复产品设计，超出 0.3；
- 只保存最终 `afterTags`：无法解释风险和选择来源，也不利于重新计算预览。

### 3. 用协调器复用单篇推荐服务，而不是增加批量 AI 协议

新增 `FolderBatchRecommendationRunner`，为每个文件调用现有 `VaultReader.readNote()` 与 `TagRecommendationService.recommendForNote()`。批次使用同一个 provider、service、冻结 `TagIndex` 和设置快照。

Runner 使用最多 2 个并发 worker：

- 每个 worker 从稳定路径顺序队列取下一篇；
- 先读取笔记、构建 `NoteTagInventory`、`sourceContentHash` 和本地 `syncInlineTag` candidates，再启动该笔记的 AI 请求；
- 每个读取、AI 和计划状态变化后发出不可变进度快照；
- 笔记读取失败时不启动 AI、不产生本地计划；provider 或结构化解析失败只设置 `aiStatus = failed`，保留已经生成的 inline 同步项；
- 用户取消后立即设置带 generation id 的 cancellation token，worker 不再取新任务；未开始读取的文件标记为 source/AI cancelled；
- 取消瞬间已经完成的 AI 结果保留；当时仍在途的请求无法真正中止，返回后必须由 generation id 丢弃且不得再更新计划、计数或打开 UI。已完成本地读取的文件可保留 inline 同步项，但 UI 必须标记该文件的 AI 已取消；
- 只要存在读取/AI 失败或取消，批次标记为 `partial`；如果取消时所有文件都已经完成，则保持 `ready`；
- 用户显式点击“仅重试失败项”时，只重新运行失败的读取或 AI 阶段，不重试 cancelled 项、不重新请求已成功项。AI 重试保留 inline 选择状态，并继续使用冻结索引、设置和原笔记内容快照；读取失败重试成功时才建立新的内容快照；
- 不自动重试，避免隐藏额外费用。取消提示必须说明 provider 可能仍完成并计费已经发出的请求，但其结果不会被采用。

使用三个分离视图：

1. `FolderBatchScopeModal`：范围与成本确认；
2. `FolderBatchProgressModal`：进度、最小化、取消和失败统计；
3. `FolderBatchPreviewModal`：总览、筛选、逐项选择、确认应用、恢复和回退。

备选方案：

- 修改 AI prompt，一次请求传入整个文件夹：上下文容易超限、单篇失败不可隔离、结构化输出更脆弱，拒绝采用；
- `Promise.all` 无界并发：容易触发 provider 限流并冻结 UI，拒绝采用；
- 自动重试：可能产生用户不知道的额外调用和费用，第一版不采用；
- 等待所有在途请求后才完成取消：现有 provider 没有可依赖的超时或 AbortSignal，可能让取消永久停留，拒绝采用；
- 取消后接受晚到结果：用户已经明确停止生成，晚到回调会让预览范围不可预测，拒绝采用；
- AI 失败时丢弃本地 inline 同步项：把本地确定性能力错误绑定到外部服务可用性，拒绝采用。

### 4. 使用共享标签清单把整篇标签汇总到 frontmatter

为读取后的每篇笔记构建以下纯数据结构，当前笔记推荐和文件夹批次必须复用同一实现：

```ts
interface NoteTagInventory {
  frontmatterTags: string[];
  inlineTags: string[];
  allTags: string[];
}
```

`frontmatterTags` 来自现有 frontmatter 解析；`inlineTags` 优先读取 Obsidian metadata cache 的正文 tag 位置，缓存不可用时回退到 `parseInlineTags(content)`。两类标签分别规范化、去重，`allTags` 是保持稳定顺序的并集。代码块、inline code、Markdown 标题和 URL fragment 不得误识别为标签。

`PromptBuilder` 向模型提供 `allTags` 作为笔记已有标签，`RecommendationParser` 也必须基于 `allTags` 做确定性过滤，确保 AI 不会把笔记任意位置已存在的 tag 再当作 AI 建议。对于每个存在于 `inlineTags` 但不存在于 `frontmatterTags` 的 tag，系统本地生成 `syncInlineTag` candidate；它不依赖 AI 响应，属于低风险并默认选中。

共享纯函数根据原始 frontmatter、用户选中的 `syncInlineTag` 和 `addTag` candidates 创建 `ChangePlan`：

- `afterTags = frontmatterTags + selectedInlineTags + selectedAiTags`，按规范化值去重并保持确定性顺序；
- `sourceContentHash` 随计划保存，使当前笔记和批次执行器都能拒绝基于旧正文生成的计划；
- `syncedInlineTags` 与 `aiAddedTags` 分开记录，供预览、操作日志和回退解释来源；
- 应用只替换 frontmatter tags 字段，正文内容和 inline tag 原位置保持不变；
- 即使 AI 没有返回建议，只要仍有未同步的 inline tag，当前笔记和批次项都必须进入预览，不能被标记为“无需变更”；
- 用户可以取消单个 `syncInlineTag`，因此“整篇标签汇总”是默认安全行为，而不是绕过预览的强制写入。

备选方案：

- 只在 UI 展示 inline tags、不写入 frontmatter：无法满足 frontmatter 汇总整篇标签的目标，拒绝采用；
- 从正文删除 inline tag 再迁移到 frontmatter：会改变文章语义和可读性，且扩大写入面，拒绝采用；
- 继续只用 frontmatter 过滤 AI 结果：会把正文已有标签误标为 AI 新增，来源和风险都不准确，拒绝采用；
- 强制同步所有 inline tags 且不允许取消：削弱逐项审查能力，拒绝采用。

provider 请求或结构化解析失败不等于“AI 没有建议”。前者在预览中显示明确警告并保留本地 `syncInlineTag` candidates；后者表示 AI 成功完成但返回空数组，只要存在本地候选项就正常进入预览。当前笔记与文件夹批次必须复用这一分支规则。

### 5. 风险完全由本地规则决定

新增纯函数 `classifyFolderBatchCandidate()`：

- `syncInlineTag` -> `low`，默认选中；
- `addTag + existing` -> `low`，默认选中；
- `addTag + new` -> `medium`，默认不选；如果快照禁止新标签则直接过滤；
- 任何删除、替换、合并或正文 inline tag 文本改写 -> `high` 且 `executable = false`。

虽然当前 `RecommendationResult` 只有新增标签候选，执行器仍必须验证生成后的每个 `ChangePlan` 满足：

- `afterTags` 是 `beforeTags` 的超集；
- `addedTags` 全部来自当前明确选择的 `syncInlineTag` 或 `addTag` candidate；
- 没有删除、替换或正文变更。

这样可以防止未来 schema 扩展或错误构造绕过 0.3 边界。AI 的 `type`、`confidence` 和 reason 只提供候选信息，不能直接决定批量可执行性。

备选方案：

- 把高置信度视为低风险：置信度是模型自评，不能代替动作类型边界；
- 默认选择新标签：跨多文件制造新 taxonomy 的风险过高；
- 同时做替换/合并：已有健康报告只对本地确定性动作开放，不能把 AI 批次建议升级成写权限。

### 6. 预览由纯选择状态派生，不在审查期触碰文件

`FolderBatchPreviewModal` 持有 candidate id 的选择集合，通过纯函数计算：

- 批次完成/失败/取消/无需变更数量；
- 低/中/高风险数量；
- 当前选中的文件数、标签数；
- 每篇笔记的 `frontmatterTags`、`inlineTags`、`afterTags` 和逐标签来源/解释；
- 最终选中 `ChangePlan[]`。

支持逐标签 toggle、“选择全部低风险”和“清除全部”，但不提供“选择全部中风险”。高风险项没有 toggle。任何选择变化只重算 view model。

备选方案：

- 默认把每篇推荐的所有候选合并成一个不可拆分计划：无法逐标签审批；
- 用户点击 toggle 时立即写文件：破坏总览和显式确认原则；
- 复用单篇 `RecommendationModal` 逐个弹出：无法形成批次总览，用户要经历大量 Modal。

### 7. 批次执行使用全量预检、逐文件 CAS 和逆序补偿

新增 `FolderBatchExecutor`，输入只有最终选中的 `ChangePlan[]`。写入顺序按路径稳定排序，流程为：

1. 验证所有计划只新增用户选中的 frontmatter tags，且不会修改正文；
2. 对每个目标 `TFile` 执行全量预检：重新 `cachedRead()` 完整 Markdown、计算 SHA-256 并读取当前 frontmatter tags，同时与 `sourceContentHash`、`beforeTags` 比较；任一文件缺失、内容变化或 tags 冲突都在第一次写入前整体失败；
3. 持久化一条状态为 `applying` 的 `BatchOperationRecord`，包含全部目标前后快照；
4. 对每个文件调用 `replaceTagsIfSnapshotMatches()`：紧邻写入前再次读取完整 Markdown，只有内容 hash 与 `sourceContentHash` 相同且当前 tags 等于 `beforeTags` 才替换为 `afterTags`；
5. 全部成功后把同一记录更新为 `applied`；
6. 任一失败后停止队列，对本次已写文件按逆序调用 compare-and-swap，将 `afterTags` 恢复为 `beforeTags`；
7. 补偿全部成功则删除 `applying` 记录；补偿不完整则更新为 `recoveryRequired`、持久化 `recoveryTarget = "before"`，并保存每个文件的实际状态。

`FrontmatterWriter` 增加只读快照检查和 `replaceTagsIfSnapshotMatches(file, { beforeTags, sourceContentHash }, afterTags)`；现有 `replaceTagsIfCurrent()` 可成为只校验 tags 的兼容包装。写入只调用 Obsidian frontmatter API 更新 tags；测试必须对比写入前后的正文片段逐字相等。即使全量预检后发生竞态，每文件二次校验仍会发现，随后由补偿路径恢复已经写入的文件。

任何 `applying`、`undoing` 或 `recoveryRequired` 记录存在时，新的文件夹批量写入入口禁用。插件加载时调用 `reconcileInterruptedBatch()`：逐文件对比 `beforeTags` / `afterTags` / 其他状态，把中断记录转成可解释的恢复视图，而不是猜测操作已成功。

备选方案：

- 只比较 frontmatter tags：正文可能已删除或改变作为同步/AI 输入的标签，仍会写入陈旧计划，拒绝采用；
- 只在每次写入前检查当前文件：后面的冲突会在部分写入后才发现，仍需补偿；全量预检能提前挡住大多数冲突；
- 遇错后保留“部分成功”作为正常结果：用户难以判断 taxonomy 当前状态，不符合安全定位；
- 不持久化 `applying`：Obsidian 关闭或插件崩溃后无法恢复写入意图；
- 并行写文件：补偿顺序和故障定位更复杂，文件写入阶段采用顺序执行。

### 8. 批次操作记录是现有 OperationLog 的向后兼容联合类型

扩展 `OperationRecord`：

```ts
type BatchOperationStatus = "applying" | "applied" | "undoing" | "recoveryRequired";
type BatchRecoveryTarget = "before" | "after";

interface BatchFileChange {
  notePath: string;
  beforeTags: string[];
  afterTags: string[];
  syncedInlineTags: string[];
  aiAddedTags: string[];
  recoveryState?: "before" | "after" | "conflict";
}

interface BatchOperationRecord {
  id: string;
  type: "batch";
  status: BatchOperationStatus;
  recoveryTarget?: BatchRecoveryTarget;
  folderPath: string;
  includeSubfolders: boolean;
  indexUpdatedAt: string;
  settings: FolderBatchSettingsSnapshot;
  createdAt: string;
  files: BatchFileChange[];
}
```

新增 `addBatchIntent()`、`updateBatchStatus()`、`setBatchRecoveryTarget()`、`latestBatch()`、`latestUnresolvedBatch()`。一条批次在 `operationLogLimit` 中只占一个槽位。设置快照不包含 API key，也不保存完整笔记内容或 provider 原始响应；计划或推荐记录可以保存不可逆的 SHA-256，但不得保存原始正文。

老的 recommendation 记录允许缺少 `type`；cleanup 结构不变。运行时 type guard 必须显式识别 `batch`，防止旧的“非 cleanup 且有 plan”逻辑误判。无需一次性数据迁移。

备选方案：

- 每个文件保存一条 recommendation 记录：日志上限会截断同一批次，无法整体回退；
- 单独新增第二份持久化存储：会产生排序、清理和兼容的双重逻辑；
- 保存 API key 方便复现：不必要且违反敏感信息最小化原则。

### 9. 批次回退与应用使用对称事务

新增命令“撤销最近一次文件夹批量标签操作”，结果 Modal 也展示同一动作。只选择最近一条 `status = applied` 的 batch 记录，不影响当前笔记和健康清理记录。

回退流程：

1. 全量预检所有文件仍等于记录 `afterTags`；任一冲突则零写入并保留记录；
2. 将记录持久化为 `undoing`；
3. 按路径逆序 compare-and-swap 到 `beforeTags`；
4. 全部成功后删除记录；
5. 中途失败时，把本次已经恢复的文件重新 compare-and-swap 到 `afterTags`；
6. 补偿成功则恢复记录状态为 `applied`；补偿失败则进入 `recoveryRequired` 并持久化 `recoveryTarget = "after"`。

应用失败或 `applying` 中断的补偿目标固定为 `before`；回退失败或 `undoing` 中断的补偿目标固定为 `after`。插件加载时按以下规则对账：

| 原状态 | 全部文件状态 | 对账结果 |
| --- | --- | --- |
| `applying` | 全部等于 `beforeTags` | 删除意图记录，批次视为未应用 |
| `applying` | 全部等于 `afterTags` | 更新为 `applied` |
| `applying` | before/after 混合或包含第三种状态 | `recoveryRequired`，目标 `before` |
| `undoing` | 全部等于 `beforeTags` | 回退完成，删除记录 |
| `undoing` | 全部等于 `afterTags` | 恢复为 `applied` |
| `undoing` | before/after 混合或包含第三种状态 | `recoveryRequired`，目标 `after` |

“重试恢复”必须先全量分类全部文件，不自动选择新方向：

- 当前等于目标快照：不写入；
- 当前等于另一合法快照：可通过 compare-and-swap 写到目标快照；
- 当前两者都不等或文件缺失：标记冲突，整次重试零写入，要求用户先手工处理；
- 全部恢复到 `before` 后删除记录并报告原批次未应用/已回退；全部恢复到 `after` 后将记录恢复为 `applied`。

备选方案：

- 只回退仍匹配的文件并跳过冲突：会产生用户未明确接受的部分回退；
- 强制写回 `beforeTags`：会覆盖用户在批次后的手工修改；
- 在恢复界面让用户临时选择 before/after：会把故障补偿变成新的批量写入决策，0.3 拒绝采用；
- 等 0.4 操作历史再支持回退：不满足任何批量写入必须可逆的项目约束。

### 10. 索引与缓存只在文件状态稳定后刷新一次

批次生成沿用冻结索引，不因单篇完成而刷新。应用完整成功、回退完整成功，或补偿不完整导致实际状态需要重新确认时，调用现有 `buildAndSaveTagIndex()` 一次；该方法同时使 `healthAiAnalysisCache` 失效。

成功写入后先持久化批次记录状态，再刷新索引。即使索引重建失败，操作记录仍可用于回退；UI 提示索引刷新失败，但不得把文件写入误报为失败或删除记录。

备选方案：

- 每写一篇刷新索引：重复扫描全库，且中途索引会代表不稳定状态；
- 应用后不刷新：后续推荐会基于过期 taxonomy；
- 索引失败时自动回退文件：索引属于派生缓存，不应反向决定已确认写入是否保留。

### 11. 验证按纯函数、执行故障和完整工作流三层覆盖

单元测试覆盖：

- 文件夹路径边界、递归开关、空范围、API key 前置检查、稳定排序、默认 50、1–200 设置范围和禁止截断；
- frontmatter/inline 来源识别、规范化去重、解析排除项和 metadata cache 回退；
- 完整 Markdown SHA-256 的稳定构建、全量内容漂移预检和每文件二次校验；
- `allTags` prompt 输入和确定性已有标签过滤；
- inline 同步 candidate 的默认选择、可取消、无 AI 建议时仍进入预览，以及共享 `ChangePlan` 的来源拆分；
- 设置快照与 API key 排除；
- 风险分类、默认选择、禁止新标签过滤和高风险拒绝；
- 批次读取/AI/计划正交状态、AI 失败保留本地计划、立即取消与晚到结果丢弃，以及 `ChangePlan` 派生；
- OperationLog 新旧记录兼容、批次状态迁移、`recoveryTarget` 和 limit 行为；
- Executor 预检、竞态、写入失败、补偿成功/失败、应用中断对账；
- 回退冲突、回退失败、回退补偿和中断对账。

E2E harness 增加父文件夹/子文件夹模型、可注入的逐文件写入失败和插件重载数据。端到端至少覆盖：

- 未配置 API key、空范围和范围确认前均无 AI 请求；
- 多篇生成、立即取消、晚到结果丢弃、AI 失败时保留本地同步和失败重试；
- frontmatter、inline 和 AI 来源在当前笔记与批次预览中均可辨识；
- inline 同步与已有标签建议默认选择，新标签建议手动选择；
- 应用后 frontmatter 是原有 tags、选中 inline 同步项和选中 AI 建议的并集，正文保持逐字不变；
- 最近批次跨插件重载仍可回退；
- tags 或正文内容漂移时零写入；
- 中途失败进入已恢复或带唯一 `before`/`after` 目标的 `recoveryRequired` 状态。

真实 Obsidian smoke test 使用专用测试库和可恢复副本，验证宽/窄 Modal、深色主题、键盘操作、最小化生成、取消、应用、重载后回退和冲突提示。不得把自动化测试描述成真实设备/真实库视觉证明。

## Risks / Trade-offs

- [风险] 每篇笔记一次 AI 请求会产生明显成本和 provider 限流，用户可能把上限调得过高。→ 范围确认展示请求数，默认上限 50、绝对上限 200、并发上限 2，失败项不自动重试。
- [风险] 生成时间较长，用户可能误以为 Obsidian 卡死。→ 独立进度 Modal、持续计数、最小化和立即取消；晚到响应通过 generation id 丢弃，不在主线程进行同步重计算。
- [风险] 批次期间用户或其他插件修改文件。→ 冻结完整 Markdown SHA-256、全量预检、每文件内容/tags 二次校验和失败补偿。
- [风险] Obsidian 在多文件写入中途退出。→ 第一次写入前持久化 `applying`，重载时对账并进入恢复流程。
- [风险] 补偿本身也可能失败。→ 持久化 `recoveryRequired` 和唯一恢复目标，禁止新批次写入；重试前全量分类，存在第三种状态时零写入。
- [风险] 高上限下每篇多条建议会让 Modal 很长。→ 总览优先、按文件折叠、风险筛选；以 200 篇做 DOM 压力测试，必要时在实现阶段增加分段渲染。
- [风险] 默认选中 inline 同步项和已有标签建议仍可能带来批量噪音。→ 预览明确标注来源且允许逐项取消，写入仅新增 frontmatter tags 并可整体回退；真实库 smoke 必须重点验证默认选择质量。
- [权衡] 0.3 支持库内文件夹选择，但不支持高风险替换/合并。→ 文件夹范围保持灵活，同时维持健康报告动作能力边界不被批量 AI 建议绕过。

## Migration Plan

1. 先增加共享 `NoteTagInventory`、完整 Markdown SHA-256、inline 来源识别、整篇已有标签过滤和 frontmatter 汇总 `ChangePlan`，同步更新当前笔记预览与回归测试。
2. 增加批次正交状态模型、风险分类、带 `recoveryTarget` 的 OperationLog 联合类型和向后兼容测试，不注册用户命令。
3. 增加文件夹范围读取、API key/空范围前置条件、冻结上下文和 recommendation runner，完成取消、晚到响应和 AI 失败保留本地计划的单测。
4. 增加三个 Modal 与中英文文案，保持应用入口关闭，完成预览 E2E。
5. 增加批次 executor、`applying`/`recoveryRequired` 持久化和故障注入测试。
6. 增加批次回退与中断对账，完成完整 E2E 后再注册命令。
7. 运行 `openspec validate --all`、`npm test`、`npm run build`、`git diff --check`，再安装到专用测试库 smoke。

回滚代码时，旧版本会忽略不能识别的 `type: "batch"` 记录并继续保存在插件数据数组中；它不会把 batch 误当成 recommendation 或 cleanup。若发布后存在 `applying`、`undoing` 或 `recoveryRequired` 记录，必须先用新版本完成恢复，再降级，避免失去恢复 UI。

## Open Questions

- 1–200 的可配置区间是否需要在后续版本调整，应由真实批次耗时、provider 限流和用户反馈决定；0.3 不允许超过绝对上限 200。
- provider 层未来是否支持真正的 `AbortSignal` 取消由多 Provider 设计统一决定；0.3 已固定为取消后不再启动新请求并丢弃当时仍在途的晚到结果。
- 预览草稿跨重载恢复和完整批次历史属于后续产品决策，不阻塞本 change 实施。
