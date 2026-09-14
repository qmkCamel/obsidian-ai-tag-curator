## Context

### 基线与已存在的实现

开发基线为 `origin/dev@9ce420ccae5a8977972bd5fe51bda14e9ea2cbd7`。独立 worktree 为 `tag_curator-tag-management-workbench`，分支为 `feat/tag-management-workbench`。

实现前已快进至 `959429f`，保留新增的 writer/recovery 风险修复、OperationLog.runMutation 互斥与 removeAndPersist 恢复行为。下文协调器在该日志互斥之外管理策略和 UI lease，不替换或绕过已有日志锁。

| 现有模块 | 可复用内容 | 不能直接假定的能力 |
| --- | --- | --- |
| `TagIndex` / `TagIndexBuilder` | 标签到文件及来源的索引、代表片段 | count 不是精确 token 次数；没有 freshness/revision |
| `VaultReader` | Markdown 文件枚举、按目录段过滤、可信 occurrence 读取 | 全库读取当前是 Promise.all；缓存不是执行授权 |
| `CleanupReviewPlanBuilder` | 四 worker、取消、来源与位置级审查 | 输入耦合 CleanupPlanItem，不能伪造健康问题以复用 |
| `CleanupExecutor` / `CleanupRecoveryService` | V2 意图、CAS、补偿、固定 before/after 恢复 | 缺少手动来源、公共策略与进程级操作互斥 |
| `FrontmatterWriter` | 预检、标签检查、宿主属性写入 | 当前把 nextTags 全量规范化，不能保证保护项原值不变；属性回调只有 tags 检查，不是全文 CAS |
| `OperationLog` | 四类旧/新记录、未完成写入门禁 | 成功撤销删除记录；全局历史、容量保护与乱序撤销规则尚无 |
| `main.ts` | 命令、状态加载、模型及写入编排 | 各类型最新撤销、并发 saveData 和入口检查不能当作统一协调器 |

源规范尚未归档 inline change。有效基线是 `openspec/specs` 加已合入 dev 的 `support-reviewed-inline-tag-rewrites` delta；本 change 不重复覆盖这些 MODIFIED 要求。

既有 inline 验收见 `docs/acceptance/reviewed-inline-tag-rewrites-acceptance.zh-CN.md`。本 change 已实现，新工作台证据与未验证门禁见 `docs/verification/tag-management-workbench.md`，不继承历史测试数字作为新功能证明。

## Goals / Non-Goals

**Goals:**

- 本地工作台与手动意图独立于 provider，所有写入仍经过同一安全约束。
- 显式区分浏览过滤、操作范围、全局策略、预览快照和恢复记录。
- 不让标签管理扩大到原始正文替换、任意历史回放或不透明的自动整理。
- 保留旧数据可读性，同时让新记录具备原值、来源、策略快照和可解释历史。
- 提供足以编写单测、E2E 和宿主验收的确定性契约。

**Non-Goals:**

- 不新增 provider、网络服务、数据库、React 或运行时大依赖。
- 不一次性重构所有业务为通用任务引擎；协调器只承担写入串行化和门禁。
- 不实现真正增量索引、乱序撤销、redo、跨设备分布式事务或 YAML 原始排版完全保留。
- 不自动发布、生产安装、提交或推送；开发验证只使用独立合成 vault。

## Decisions

### D1. 原生 ItemView 与轻量视图模型

使用 `registerView` 注册 `tag-curator-management`。插件持有 `TagManagementService`，视图只订阅快照和发送命令，不创建 writer/provider 实例。服务拥有缓存历史投影与状态快照；`ManualTagPlanBuilder` 冻结纯本地候选，已有插件命令层负责 Modal 和执行/恢复服务生命周期。

历史缓存以 `OperationLog.revision` 和策略 revision 为键。日志更新、finalize、保存失败后的记录/receipt 回退都递增内存 revision，避免视图在错误通知期间缓存临时完成状态；该 revision 不作为持久化操作顺序号。

建议模块边界：

```text
src/management/
  TagManagementView.ts          原生 ItemView、页签、焦点和窗口布局
  TagManagementViewModel.ts     过滤、排序、分页、选择、按钮资格
  TagManagementService.ts       索引/手动意图/历史的薄编排
  ManualTagIntent.ts            手动输入验证和类型
  ManualTagPlanBuilder.ts       意图 -> 候选文件 -> 复用审查 builder
  TagScope.ts                  路径段匹配、范围快照
src/policy/
  TagMutationPolicy.ts          纯规则评估
  MutationCoordinator.ts        写入 lease、规则版本、恢复门禁
src/index/
  TagIndexService.ts            freshness、generation、有界刷新
src/operations/
  OperationHistory.ts           记录投影、receipt、撤销资格
  PluginDataStore.ts            串行、失败隔离的 plugin data 保存
```

已有 cleanup/operations 模块继续拥有执行和恢复，不另建第二套事务逻辑。文件名是建议边界，允许实现时合并过薄文件，但不能把所有逻辑写进 ItemView 或 main.ts。

替代方案：继续扩大 Modal。拒绝原因是反复浏览、跨页选择和历史查询需要持久工作区；审查与设置仍复用 Modal，避免全面 UI 改写。

视图用 `createEl/createDiv/setIcon`，取容器 ownerDocument/所属窗口处理焦点与计时；使用公开 API，不 patch 核心 Tags view。第一阶段不依赖 Tag Wrangler 私有上下文事件。同一插件实例只有一个前台工作台；多窗口仍共享服务与 mutation lease。

### D2. 身份、字面量与计数分离

`tagKey` 是用于匹配的规范身份，`tagText` 是实际字面量。合法标签的 key 沿用现有大小写不敏感比较；不得对非法输入调用 normalizeTag 后当作用户确认过的合法目标。

手动目标先 trim、去一个 #，再验证支持子集：非空、无空格、无空路径段、字母/数字/_/- 与 /、至少一个非数字字符。既有 emoji/符号标签可以展示，不能被当前执行器安全表达的输入只读。仅改变大小写视为同一身份并拒绝本阶段操作。

保留目标字面量并在审查明确展示。不能用 normalizeTag 的小写结果偷偷覆盖用户输入。source 以 key 匹配精确标签；不展开子树。所有未选标签的字面量和相对顺序保持不变。

工作台投影按 key 合并兼容索引中的同身份项目，以 Set(path) 去重；文件数、属性文件数、正文文件数分别统计。`count` 继续作为 legacy 数据，不改既有健康阈值定义。本阶段不把它显示为 occurrence count。精确正文数量只来自 hydrate 后可信/不可用 occurrence 的独立计数。

替代方案：直接把当前摘要扩成无限列表。拒绝原因是 count 和大小写已丢失部分信息，需要明确只读投影，而不是用现有数值制造精确感。

### D3. 分层范围与全局保护

```ts
interface TagScope {
  include: Array<{ path: string; recursive: boolean }>;
}
interface TagMutationPolicy {
  schemaVersion: 1;
  revision: number;
  excludedFolders: string[];
  protectedTags: Array<{ tag: string; mode: "exact" | "subtree" }>;
}
interface ReviewContext {
  origin: "manual" | "health";
  indexRevision: number;
  vaultRevision: number;
  policyRevision: number;
  scope: TagScope;
  candidatePaths: string[];
}
```

目录由宿主 normalizePath 规范化，拒绝绝对路径、..、无效目录；比较保留宿主路径大小写语义，按完整路径段匹配。根目录用空串表达。排除优先于包含，多个包含目录取并集并去重。目录重命名不隐式修改规则，展示失效路径并要求用户修订。

工作台临时 scope 不修改旧命令的目标。全局 excludedFolders 则进入所有前向读取/写入路径：当前笔记被排除时在读正文前阻断；文件夹批次先过滤后计数；健康报告和 AI 上下文不包含排除文件及其片段。保护标签不禁止读取，但禁止产生其任何新写入变动，包括添加到新笔记和作为合并目标。

子树保护 `status/*` 编译为 key === status 或 key.startsWith("status/")。不接受其他 wildcard/regex。规则默认空集，升级不改变原用户范围。

保护在三个位置检查：构建候选、生成实际差异、进入写入前；最终依据实际 raw tag value 和 inline edit 的 before/after 而非只看按钮 source。全局策略变更使未提交计划全部失效；提交后的 mutation lease 期间禁用策略保存。单独调整浏览 scope 不改策略 revision，但其待审查计划立即作废。

排除目录变更后立即失效并清除持久化索引示例及 AI 健康缓存，经串行保存成功后生效；不允许旧 provider 请求的晚到结果重新放回缓存。历史最小恢复数据保留，UI 必须区分“以后不读取/发送”与“删除历史数据”。

恢复采用原 operation 的路径与目标，不重新跑当下 scope。提供仅针对该 recordId 的 `recovery` lease；不能把豁免上下文传给新推荐或手动操作。

### D4. 独立手动意图接入审查，不伪造诊断

```ts
type ManualTagIntent =
  | { kind: "rename"; source: string; target: string; scope: TagScope }
  | { kind: "merge"; sources: string[]; target: string; scope: TagScope };
interface DeterministicCleanupInput {
  id: string;
  title: string;
  action: "rename" | "merge";
  sourceTags: string[];
  targetTag: string;
  candidatePaths: string[];
  context: ReviewContext;
}
```

从 CleanupReviewPlanBuilder 提取共用 hydrate 核心接收 `DeterministicCleanupInput`；保留 `build(CleanupPlanItem)` 健康适配器，继续检查原 capability。手动 adapter 验证显式 source/target 后才能调用核心；不能构造虚假 nearDuplicates 或把 `manualReview` 改成 executable。

候选文件必须满足 source 身份真实存在、目录范围、全局规则。目标专属文件排除。source 集合移除 target 身份后为空时拒绝。文件数超过 200 时在读取正文前阻断。一个事务只表达一个目标，不支持多映射循环、自动分批或无限全库计划。

hydrate 仍最多四 worker，generation 取消丢弃晚到结果。选择及 context 存于内存，不把预览完整内容持久化。执行前需新鲜完整索引、匹配 vault/index/policy revision 与候选路径快照；源文件新增、删除、移动后必须重新审查。

身份不等于来源：列表来源筛选不限定写入来源；审查显示并允许分别选择属性和正文。跳过原因分为 scopeExcluded、protected、untrusted、readFailed、unselected；无法精确计数的 scope 外位置只报告文件数，不伪造剩余 occurrence 数。partial 的表述限定“本次范围”，不能声称全库源标签消失。

### D5. 原值保护与全文 CAS 是扩展写入的前置工作

当前 parseFrontmatterTags/normalizeTagList 会规范化全列表，因此仅增加一个保护判断不足以履行“未选标签不变”。不能把现有 normalized beforeTags 当作原始值恢复证据。

新增显式的 `TagValueSnapshot` 与 `TagValuePatch`：

```ts
type TagValueSnapshot =
  | { kind: "absent" }
  | { kind: "list"; values: string[] }
  | { kind: "scalar"; value: string };
interface TagValuePatch {
  before: TagValueSnapshot;
  after: TagValueSnapshot;
}
```

手动/健康改写第一版只对无 tags 或字符串数组的正常 frontmatter 生成新的精确 patch；标量旧格式、混合非字符串、非法 YAML 只读，不静默修复。正常数组保留所有未命中源项的原值、重复项和相对顺序；仅移除命中 source 项，在第一个 source 位置插入一个目标；已有目标原值优先保留，目标本来存在的重复项不顺带清洗。

推荐/批次的前向添加也生成 raw patch：保留原值，仅在尾部添加经选择的新标签。protected key 的 before/after 原值序列必须相同。不能保持规则的文件在预览中明确不可执行，不在 writer 内偷偷过滤。

将 `FrontmatterWriter` 新快照写入路径收紧为宿主 `Vault.process()` 的单文件原子转换：预读并 hash，callback 比较完整 data === preflightContent，再基于该 data 的 frontmatter 解析结果检查 raw before，应用唯一的 tags patch，返回重建结果。复用 `getFrontMatterInfo` 分界和宿主 `parseYaml/stringifyYaml`，不手写 YAML 正则替换、不使用未公开 API。

解析与序列化前后必须验证非 tags 属性的结构和值一致；仅接受可安全往返的普通数据，解析失败、未知类型或无法证明等价时禁写。属性 YAML 的引号、缩进或换行可能被重排，预览说明“不保证 YAML 排版不变”；正文 body 与未选正文 token 逐字保留，非 tags 属性语义不变。验收包含多行字符串、嵌套对象、布尔/数值、锚点等复杂输入的等价或明确拒绝，不能只验证简单 tags 数组。

mixed cleanup 仍先 inline 再 frontmatter，第二阶段以第一阶段产生的 hash 为输入；每阶段失败走现有反向补偿。raw patch 加为 ChangePlan、SelectedCleanupFilePatch 与新日志记录的可选扩展字段，新前向计划要求提供，旧记录不推断补齐。`tagValueVersion: 1` 标识新精确值语义；缺失时走 legacy 适配。恢复分类对新记录增加 raw before/after 精确比较，避免同身份不同原值被误认成已恢复。

不改写 normalizeTag 的全局语义，不把产品管理功能偷换成全库规范化。该收紧会触及共享 writer，因此必须回归推荐/批次/健康/撤销全部路径。

### D6. 写入 lease 与持久化顺序

`MutationCoordinator` 提供 tryAcquire 而不是队列排队：同一插件实例内第二次提交直接返回 busy，不在背景保存一个稍后执行的旧意图。lease 覆盖前置检查、意图落盘、全部写入、补偿/恢复状态持久化；关闭视图不释放 lease。多个 workspace leaf 共享同一 coordinator。

```text
输入 -> 验证 -> 候选范围 -> hydrate -> 审查 -> 确认
                                             |
                               acquire lease + revision/policy check
                                             |
                           全量快照预检 -> persist applying intent
                                             |
                           per-file CAS -> persist applied -> 刷新索引
                                             |
                         失败 -> 逆向补偿 -> rolledBack 或 recoveryRequired
```

更新后的 forward service 都需 lease/token，UI 不能绕过。旧推荐/批次/健康命令和各类 undo 同样接入。恢复先检查唯一未解决记录，失败或未知记录不能通过换标签页解除门禁。

`PluginDataStore` 串行保存完整插件状态：排队时不能捕获旧的整个 data.json，实际写入队头读取最新状态并深拷贝；失败不吞掉也不让队列永久 rejected。apply intent 的保存 Promise 完成前禁止 Markdown 写入。后台索引保存不得覆盖较新的 intent/receipts/policy。

持久化失败可能已部分生效：保留内存中的未解决状态并阻止新写入，重新加载/验证后才释放，不假设 saveData 报错等于磁盘零变化。启动遇到未知 schema、无法解析的 operations 或同时多个未解决记录时进入只读恢复错误态，不自动丢弃记录或从中挑一个继续写。

这不是跨设备锁。Obsidian Sync 或其他插件仍可能并发改文件；文件级全文 CAS 和内容冲突检查负责拒绝陈旧写入，但不承诺跨进程原子多文件事务。

### D7. 索引生命周期与刷新

```ts
type IndexState = "missing" | "ready" | "stale" | "refreshing" | "error";
interface IndexSnapshotState {
  state: IndexState;
  revision: number;
  vaultRevision: number;
  policyRevision: number;
  generation: number;
  failedPaths: string[];
}
```

监听 vault create/modify/delete/rename 和 metadataCache changed/deleted，Markdown 相关事件递增 vaultRevision。目录 rename/delete 同样使范围失效。事件只标脏与合并 UI 通知，不自动全库扫描。宿主启动尚未证明缓存新鲜时，已有 persisted index 标记 stale；首次无索引为 missing。

刷新采用四 worker 与逐文件聚合，限制代表片段数为已有上限，释放读入的完整正文；不使用现有无界 Promise.all 储存整个库内容。构建临时快照，全部枚举完成、零失败、revision 未变化且 policy 匹配后才替换有效索引；保存成功才宣布 ready。中途事件发生时可保留新结果供只读浏览，但状态仍 stale，不自动循环重扫。

取消使 generation 失效、停止领取新文件，晚到结果不能提交；失败保留旧快照，展示失败数和可重试入口，不把部分索引宣布为完整。统一服务供工作台、健康和推荐使用，避免多套 refresh 同时覆盖缓存。

一次 mutation 提交时验证 revision，执行中的自身文件事件只标记后续索引 stale，不中途改变已冻结范围。执行后只触发一次 refresh；失败只重试索引，不重放写入。真正的增量更新留到第二阶段。

列表分页优先于虚拟滚动库：最多 100 行/页，相关文件 50 行/页。10k 标签排序投影缓存到 index/scope revision；实现使用立即本地筛选，不额外加入原先建议的 100ms debounce，避免引入旧显示/新选择的过渡状态。纯筛选不读文件或访问 provider，输入到结果的实际性能仍须按夹具测量，不能只引用纯查询耗时。

索引通过共享保存队列的 `beforeSnapshot` 校验 generation，再对最新 detached plugin data 应用 `transformSnapshot`，不提前修改公开索引。服务保存成功后才发布 ready；已经发出的磁盘写入不能撤回，取消后另排队纠正派生缓存，不覆盖操作意图或新策略。

### D8. 历史投影、receipt 与撤销资格

使用现有 operations 数组位置作为跨类型的操作顺序，不从 Date.now 字符串推断顺序。旧推荐时间取 plan.createdAt，其他取 createdAt；缺失展示未知。模型信息只有记录确实存在时显示，不能从当前设置倒推。

新的 cleanup V2 可选 `origin: "manual" | "health"`、`context`、`tagValueVersion`、raw patch；缺失 origin 的原 V2 投影为健康清理。新的其他类型记录增加 origin/策略快照/原值字段，但不改旧 type discriminator。

`HistoryReceipt` 独立保存已撤销/已回滚摘要：id、原顺序序号、时间、来源、动作、文件路径与可用的 tags 前后值、状态。不保留正文上下文、全文或已失去用途的 inline patch。活动记录与 receipt 按 operationId 去重。撤销/回滚删除活动记录与生成 receipt 必须在同一 PluginDataStore 保存中完成；启动对账也调用此 finalize 方法，避免只在按钮路径生成历史。

撤销统一入口先拿 lease，重新读取当前全局最新活动记录并对比预期 id；不支持从筛选列表或旧 Modal 直接调用各类型 latest service。然后按类型路由：

| 记录 | 第一阶段行为 |
| --- | --- |
| 推荐 | 单文件 undo，使用真实快照；旧记录不承诺原始格式还原 |
| folder batch | 现有全量预检/补偿/固定目标服务 |
| cleanup V2 | 现有 cleanup 恢复服务，扩展 raw 值判断 |
| legacy cleanup | 详情只读，无新旧 UI 绕过入口；缺少可恢复事务证据 |
| applying/undoing/recoveryRequired | 先恢复，不能作为普通 undo 或跳过 |
| 未知格式 | 只读错误，阻止新的 mutation |

相同 id、没有更新操作、全部目标匹配才执行。预检遇到 missing/conflict 整次零写入；执行中竞态走补偿而非承诺无任何瞬时写入。较新记录的文件互不相交也不在本阶段开放乱序撤销。

撤销成功可继续撤销前一条；遇到只读 legacy 记录则停在该处，不跳过。旧命令名称保留，但若其同类型/当前笔记目标不是全局最新则提示先处理最新操作。这是有意收紧旧入口行为，须同步用户文档。

### D9. 日志容量、隐私与兼容

新增 policy 默认空，scope 默认根目录递归，receipts 默认空。旧 index 可读但 stale，新 freshness 元数据缺失不阻止只读展示。设置迁移不得写笔记或修改 provider/API key。

沿用 operationLogLimit 作为已完成可撤销记录条数上限；receipts 最多 100 条。所有未解决活动记录固定保留，即使用户调小限制。序列化后的 operations + receipts 设置 20 MiB UTF-8 硬预算，意图落盘前计算；先清理旧 receipts，再按正常保留策略清理最旧完成记录，并明确历史保留说明；仍超限则阻断这次操作，要求缩小范围，不能先改 Markdown 再丢日志。未知/未解决记录不可为腾空间被清理。

不保存 API key、provider 响应、完整 Markdown、预览上下文或搜索词到历史。路径与最小 inline patch 属于恢复所需私有数据，沿用本地 plugin data 存储；UI 不宣称其被加密。

版本回退只能在没有未解决事务并完成备份后进行。旧插件无法理解本轮精确 raw 字段，不保证降级后撤销的原值精度；发布说明必须提示先完成撤销/恢复，不能将“旧字段可读”宣传为无损双向降级。

### D10. 验证分层与发布门禁

1. 纯逻辑：输入、路径段、保护、来源统计、分页选择、顺序资格、raw patch、日志预算。
2. writer/executor：全文 callback CAS、未选原值、非 tags YAML 等价、混合失败、补偿、保存失败。
3. E2E harness：无 key/无活动文件、全部入口策略一致、双视图竞争、陈旧 scope、晚到刷新、重载与未知历史。
4. 宿主验收：专用合成测试库，最低支持版本与当前稳定版；宽/窄、深/浅、键盘、浮出窗口和主动编辑器；保存关键态截图。
5. 性能：固定夹具与运行环境，记录 p95、峰值读取并发、取消延迟及 DOM 数；不使用网络 AI 延迟掩盖本地性能。

`npm test`、`npm run build`、新 change 与 `--all --strict` 校验是实现后门禁。测试数量、真实宿主版本与视觉证据以本 change 验收记录为准，不把设计校验当作实现验收。

## Risks / Trade-offs

- [工作台看似 UI，实则跨所有写入入口] -> 先交付策略/原值/互斥基础，再接按钮；否则不能发布保护承诺。
- [属性序列化改变 YAML 排版] -> 明确只保证非 tags 语义与正文逐字保留；复杂输入往返无法证明时只读。
- [历史旧数据能力不足] -> 显式 legacy 只读边界，不通过伪造 hash/模型/时间补齐。
- [全库事件频繁导致索引过期] -> 第一版选择可解释的保守失效，后续用增量索引优化，不取消写入前检验。
- [200 文件限制不满足一次性大库迁移] -> 允许缩小目录分次明确执行，不隐式切批；用性能与恢复证据决定后续上限。
- [子标签和仅大小写改名暂不支持] -> UI 明示精确标签边界，不让用户误认为已完成层级迁移。
- [用户更新 dev 时改变底层契约] -> 开发前复核差异；不把本方案直接套到旧 main 或改回 inline 能力。

## Migration Plan

1. 保持本 worktree 基于当前 dev，仅提交方案时不改功能或版本。
2. 实现按 tasks 的依赖顺序；策略和原值门禁未就绪前不开放手动写入 UI。
3. 新字段默认空/兼容读取；运行 legacy fixture 与已有 inline/folder E2E。
4. 专用测试库验收完成后再发布；生产 vault 首次使用仍提示备份。
5. 发现问题优先关闭新入口/保留历史与恢复，不删除用户 plugin data。降级前完成未解决事务。

## Open Questions

没有阻塞首阶段实现的产品选择。以下属于验证门禁而非让开发者自行选择行为：

- 宿主 parseYaml/stringifyYaml 对复杂数据的往返能力：实现前写探针与拒绝夹具，不能证明则保持该文件只读，不自动引入新解析依赖。
- 最低支持版本的真实位置缓存/浮出窗口行为：按已有最低版本和当前版本分开验收，未通过不得扩展支持声明。
- 性能目标能否达到：先按固定 200 文件上限与分页方案验证；不达标先优化，不在发布时悄悄放宽阈值。

## References

- 产品细节与状态矩阵：`product-design.md`。
- [Obsidian 标签语义](https://help.obsidian.md/tags)：大小写不敏感、嵌套搜索语义、合法字符和非纯数字要求。执行支持子集小于宿主完整标签集合，已明确降级。
- 本地锁定版本 `node_modules/obsidian/obsidian.d.ts`：ItemView/registerView、Vault.process、metadataCache changed/deleted、vault 文件事件、parseYaml/stringifyYaml。在线 API 深链本次返回 Not Found，技术契约以已核对的类型声明为准。
