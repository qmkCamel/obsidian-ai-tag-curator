## ADDED Requirements

### Requirement: 文件夹批次范围必须由用户确认

系统 SHALL 默认以当前 Markdown 笔记的父文件夹为候选范围，同时允许用户选择库内任意文件夹或根目录，并在任何 AI 请求或 Markdown 写入前要求用户确认最终范围。

#### Scenario: 从当前笔记打开范围确认

- **GIVEN** 当前活动文件是一个 Markdown 笔记
- **WHEN** 用户运行“为文件夹批量生成标签建议”命令
- **THEN** 系统默认选中并展示当前笔记父文件夹路径
- **AND** 系统展示“选择文件夹”入口
- **AND** 系统展示“包含子文件夹”开关，默认开启
- **AND** 系统展示最终纳入范围的 Markdown 文件数量和预计 AI 请求数量
- **AND** 系统展示当前配置的单批文件数量上限
- **AND** 在用户确认前不发起 AI 请求

#### Scenario: 选择库内其他文件夹

- **GIVEN** 文件夹批次范围确认已经打开
- **WHEN** 用户通过“选择文件夹”选择库内另一个文件夹
- **THEN** 系统将该文件夹设为当前批次候选范围
- **AND** 系统根据当前“包含子文件夹”状态重新计算 Markdown 文件列表、文件数量和预计 AI 请求数量
- **AND** 系统重新计算是否超过安全上限
- **AND** 系统在用户最终确认前不发起 AI 请求

#### Scenario: 通过选择器选择库根目录

- **GIVEN** 文件夹选择器已经打开
- **WHEN** 用户选择库根目录
- **THEN** 系统将库根目录显示为当前批次候选范围
- **AND** 系统仍然应用递归开关、批次文件上限和最终确认要求

#### Scenario: 当前笔记位于库根目录

- **GIVEN** 当前 Markdown 笔记位于库根目录
- **WHEN** 用户打开文件夹批次范围确认
- **THEN** 系统将库根目录显示为候选范围
- **AND** 仍然应用批次文件上限和用户确认要求

#### Scenario: 关闭包含子文件夹

- **GIVEN** 范围确认中“包含子文件夹”已关闭
- **WHEN** 系统计算批次范围
- **THEN** 系统只包含当前所选文件夹的直接 Markdown 子文件
- **AND** 系统排除子文件夹中的文件和所有非 Markdown 文件

#### Scenario: 没有活动 Markdown 笔记

- **GIVEN** 当前没有活动文件或活动文件不是 Markdown
- **WHEN** 用户运行文件夹批次命令
- **THEN** 系统显示需要先打开 Markdown 笔记的提示
- **AND** 系统不打开批次范围确认
- **AND** 系统不发起 AI 请求或修改文件

#### Scenario: 未配置 API key

- **GIVEN** 当前活动文件是 Markdown 笔记
- **AND** `apiKey.trim()` 为空
- **WHEN** 用户运行文件夹批次命令
- **THEN** 系统显示需要先配置 API key 的双语提示
- **AND** 系统不打开批次范围确认
- **AND** 系统不读取范围笔记、不构建标签索引、不发起 AI 请求或创建操作记录
- **AND** 系统不得把本地 inline 汇总作为绕过 API key 检查的隐式运行模式

#### Scenario: 所选范围没有 Markdown 文件

- **GIVEN** 当前所选文件夹与递归设置得到 0 篇 Markdown
- **WHEN** 系统展示范围确认
- **THEN** UI 展示 Markdown 文件数和预计 AI 请求数均为 0
- **AND** UI 显示所选范围没有 Markdown 文件的双语提示
- **AND** 开始按钮处于禁用状态
- **AND** 系统不创建批次计划、操作记录或 AI 请求
- **AND** 用户改变文件夹或递归开关后系统立即重新计算范围

#### Scenario: 范围超过安全上限

- **GIVEN** 用户选择的范围包含的 Markdown 文件数超过当前 `maxFolderBatchFiles`
- **WHEN** 系统展示范围确认
- **THEN** 系统禁用开始生成操作
- **AND** 系统同时展示范围文件数和当前上限
- **AND** 系统提示用户提高设置上限、关闭“包含子文件夹”或选择更小的文件夹
- **AND** 系统不得静默截断文件列表

### Requirement: 用户可以配置单批文件数量上限

系统 SHALL 提供 `maxFolderBatchFiles` 设置作为完整批次能否启动的安全阈值，默认值为 50，可配置范围为 1–200；该设置不得被解释为“只处理排序后的前 N 篇”。

#### Scenario: 首次使用默认上限

- **GIVEN** 用户没有保存过 `maxFolderBatchFiles`
- **WHEN** 插件合并默认设置
- **THEN** `maxFolderBatchFiles` 等于 50

#### Scenario: 用户调整单批上限

- **GIVEN** 用户在设置页将 `maxFolderBatchFiles` 调整到 1–200 范围内的新值
- **WHEN** 设置保存且用户返回或重新打开批次范围确认
- **THEN** 范围确认使用新上限判断是否允许启动
- **AND** 文件数量不超过新上限时允许用户继续确认

#### Scenario: 持久化值超出允许范围

- **GIVEN** 旧数据或外部修改使 `maxFolderBatchFiles` 小于 1 或大于 200
- **WHEN** 插件加载并规范化设置
- **THEN** 系统将该值限制在 1–200 范围内
- **AND** 系统不得使用无界值启动批次

#### Scenario: 范围大于当前上限

- **GIVEN** 范围包含 80 篇 Markdown 且当前上限为 50
- **WHEN** 用户没有提高上限或缩小范围
- **THEN** 系统不得只处理路径排序后的前 50 篇
- **AND** 系统不得发起任何批次 AI 请求

### Requirement: 批次必须使用冻结的索引和设置上下文

系统 SHALL 在批次开始时冻结标签索引时间、文件范围、与推荐相关的非敏感设置，以及每篇成功读取笔记的完整 Markdown 内容 SHA-256，确保同一批次中的建议具有一致且可校验的上下文。

#### Scenario: 开始批次时不存在标签索引

- **GIVEN** 插件尚未保存标签索引
- **WHEN** 用户确认开始生成批次建议
- **THEN** 系统先构建并保存一次全库标签索引
- **AND** 系统使用该索引为批次内所有笔记生成建议

#### Scenario: 批次生成期间设置发生变化

- **GIVEN** 批次已经记录 `indexUpdatedAt`、模型、推荐数量、新标签开关、新标签严格程度、单批文件上限和 UI 语言快照
- **WHEN** 用户在批次生成期间修改插件设置
- **THEN** 已开始的批次继续使用开始时的设置快照
- **AND** 新设置只影响之后创建的批次

#### Scenario: 为成功读取的笔记冻结内容快照

- **GIVEN** 系统通过 `cachedRead()` 成功读取一篇范围内笔记
- **WHEN** 系统构建该笔记的标签清单和候选项
- **THEN** 系统按 UTF-8 对完整原始 Markdown 计算 SHA-256 小写十六进制 `sourceContentHash`
- **AND** 对应计划保存该 hash 与 `beforeTags`
- **AND** 系统不得为此保存第二份完整正文到操作日志

#### Scenario: 持久化批次操作记录

- **WHEN** 系统保存批次操作记录
- **THEN** 记录包含足以解释结果的标签索引时间和非敏感设置快照
- **AND** 记录 MUST NOT 包含 API key

### Requirement: 建议生成必须可观察、可取消且隔离单文件失败

系统 SHALL 通过有界并发队列生成逐笔记建议，并持续展示已完成、总数、失败数和取消状态，不得长时间阻塞 Obsidian 主界面。

#### Scenario: 生成批次建议

- **GIVEN** 用户已经确认一个有效文件夹范围
- **WHEN** 系统为范围内笔记生成建议
- **THEN** UI 展示当前完成数量、总文件数量和失败数量
- **AND** 用户仍可最小化进度界面并继续使用 Obsidian
- **AND** 系统同时进行的 AI 请求数量不得超过实现定义的有界并发值

#### Scenario: 用户取消生成

- **GIVEN** 批次仍有未开始的笔记
- **WHEN** 用户点击取消
- **THEN** 系统立即设置带 generation id 的取消状态且 worker 不再领取新笔记
- **AND** 未开始读取的笔记标记为读取和 AI 已取消
- **AND** 取消前已经完成的 AI 建议仍可进入审查界面
- **AND** 取消瞬间仍在途的请求可以在 provider 侧继续，但其晚到结果必须被丢弃且不得更新计划、进度、通知或 UI
- **AND** 已完成本地读取的笔记可以保留 inline 同步项，同时明确标记 AI 建议已取消
- **AND** 只要存在取消项，UI 明确标记该批次为 `partial`
- **AND** UI 提示已发出的请求可能仍由 provider 完成并计费

#### Scenario: 取消时所有文件已经完成

- **GIVEN** 用户点击取消时所有范围文件都已经完成读取和 AI 处理
- **WHEN** runner 处理取消事件
- **THEN** 系统不得把已完成项改为取消
- **AND** 批次保持 `ready`
- **AND** 系统不得重复打开预览或发出额外通知

#### Scenario: 单篇笔记读取失败

- **GIVEN** 批次中某篇笔记读取失败
- **WHEN** 其他笔记仍可继续处理
- **THEN** 系统将该笔记的读取状态标记为失败并记录可展示的错误原因
- **AND** 系统不得为该笔记启动 AI 请求或生成 inline 同步项
- **AND** 该笔记的计划状态为 `unavailable`
- **AND** 系统继续处理队列中的其他笔记
- **AND** 用户可以仅重试失败笔记

#### Scenario: AI 请求或结构化解析失败且存在本地同步项

- **GIVEN** 一篇笔记已经成功读取并构建至少一个 `syncInlineTag` 候选项
- **AND** 该笔记的 provider 请求或 AI 结构化解析失败
- **WHEN** 系统更新批次计划项
- **THEN** 系统将 AI 状态标记为失败并保留错误原因
- **AND** 系统保留本地 inline 同步项及其当前选择状态
- **AND** 计划状态为 `ready`，批次整体状态为 `partial`
- **AND** 预览明确提示该笔记仅包含本地同步项、AI 建议缺失
- **AND** 用户可以直接审查/应用本地同步项或仅重试该笔记的 AI 阶段

#### Scenario: AI 失败且没有本地同步项

- **GIVEN** 一篇笔记读取成功但没有未同步 inline tag
- **AND** 该笔记的 provider 请求或结构化解析失败
- **WHEN** 系统更新批次计划项
- **THEN** AI 状态为失败且计划状态为 `unavailable`
- **AND** 系统不得把该笔记标记为“无需变更”
- **AND** 该笔记不产生可写计划，但可以仅重试 AI 阶段

#### Scenario: 仅重试失败项

- **GIVEN** 批次同时包含成功、失败和取消的计划项
- **WHEN** 用户点击“仅重试失败项”
- **THEN** 系统只重试读取失败或 AI 失败的阶段
- **AND** 系统不重新请求成功项或取消项
- **AND** AI 重试继续使用冻结索引、设置和原笔记内容快照，并保留 inline 选择状态
- **AND** 读取重试成功时系统为新读取内容建立新的 `sourceContentHash`

### Requirement: 批次计划必须由独立的逐笔记变更计划组成

系统 SHALL 分离记录每篇笔记的读取状态、AI 状态和计划状态，为包含有效 AI 建议或未同步正文标签的笔记创建独立 `ChangePlan`，再组合成一个包含范围、生成状态和选择状态的文件夹批次计划。

#### Scenario: 为单篇笔记生成批次计划项

- **GIVEN** 一篇笔记包含一个或多个有效 AI 建议或未同步的正文 inline tag
- **WHEN** 系统构建文件夹批次计划
- **THEN** 对应计划项包含笔记路径、当前 frontmatter tags、正文 inline tags 和候选项来源
- **AND** AI 候选项包含建议类型、置信度和推荐理由
- **AND** inline 同步候选项明确标记为本地确定性来源
- **AND** 计划项可根据用户选择派生明确的 `afterTags`

#### Scenario: 正交表达读取、AI 和计划状态

- **WHEN** 系统更新逐笔记计划项
- **THEN** `sourceStatus` 只表达读取/本地解析状态
- **AND** `aiStatus` 只表达 AI 阶段状态
- **AND** `planStatus` 只表达当前是否存在可审查计划
- **AND** 系统不得使用单个“失败”状态丢失“AI 失败但本地计划可用”的信息

#### Scenario: 笔记没有有效建议

- **GIVEN** 一篇笔记没有有效 AI 建议
- **AND** 该笔记没有尚未同步到 frontmatter 的 inline tag
- **WHEN** 系统构建文件夹批次计划
- **THEN** 系统将该笔记标记为“无需变更”
- **AND** 该笔记不进入默认选择或写入目标

### Requirement: 标签建议必须按动作风险分层

系统 SHALL 使用本地确定性规则为每个候选标签动作计算风险和批量可执行性，AI 输出不得提升动作的执行资格。

#### Scenario: 同步正文已有标签到 frontmatter

- **GIVEN** 一个正文 inline tag 尚不存在于该笔记 frontmatter
- **WHEN** 系统为该 tag 创建 `syncInlineTag` 候选项
- **THEN** 系统将其标记为本地确定性低风险
- **AND** 该候选项默认选中
- **AND** 用户可以在应用前取消该候选项

#### Scenario: 新增库中已有标签

- **GIVEN** 一个建议只向笔记 frontmatter 新增标签索引中已经存在的标签
- **WHEN** 系统分类该建议
- **THEN** 系统将其标记为低风险
- **AND** 该建议默认选中

#### Scenario: 新增库中不存在的标签

- **GIVEN** 设置允许创建新标签
- **AND** 一个建议只向笔记 frontmatter 新增库中不存在的标签
- **WHEN** 系统分类该建议
- **THEN** 系统将其标记为中风险
- **AND** 该建议默认不选中
- **AND** 用户必须逐项明确选择后才能纳入应用计划

#### Scenario: 设置禁止创建新标签

- **GIVEN** 批次设置快照中的“允许新标签”为关闭
- **WHEN** AI 返回一个库中不存在的标签
- **THEN** 系统过滤该建议
- **AND** 该建议不得进入任何可选变更计划

#### Scenario: 出现替换、合并、删除或正文改写动作

- **GIVEN** 一个候选动作会替换、合并、删除标签或修改正文 inline tag 文本
- **WHEN** 系统验证批次计划
- **THEN** 系统将该动作标记为高风险且不可批量执行
- **AND** 0.3 的批次生成器不得创建该动作的可写 `ChangePlan`
- **AND** 即使 AI 声称该动作安全，应用服务也必须拒绝执行

### Requirement: 批次审查必须支持总览和逐项选择

系统 SHALL 在写入前提供批次总览、逐笔记和逐标签审查，并只根据当前明确选择重新计算最终变更计划。

#### Scenario: 查看批次总览

- **GIVEN** 批次生成阶段已经结束
- **WHEN** 用户打开批次审查界面
- **THEN** UI 展示范围、是否包含子文件夹、索引时间和完成/失败/取消统计
- **AND** UI 展示低、中、高风险建议数量
- **AND** UI 展示当前选中的文件数和标签变更数

#### Scenario: 查看逐笔记预览

- **WHEN** 用户展开一篇有建议的笔记
- **THEN** UI 展示该笔记当前 frontmatter tags、正文 inline tags 和根据当前选择计算的建议后 tags
- **AND** UI 以可读文本区分 frontmatter、inline 和 AI 标签来源
- **AND** UI 展示每个候选标签的动作、风险和来源，并为 AI 建议展示类型、置信度和推荐理由
- **AND** 用户可以逐标签选择或取消

#### Scenario: 批量选择低风险建议

- **WHEN** 用户选择“选择全部低风险建议”或“清除全部选择”
- **THEN** 系统只更新符合该操作范围的候选项
- **AND** 中风险建议不得因“选择全部低风险建议”而被选中
- **AND** 高风险建议始终不可选择

#### Scenario: 只生成或审查批次计划

- **WHEN** 用户生成、查看、筛选、展开、选择或取消批次建议
- **THEN** 系统不得修改任何 Markdown 文件

### Requirement: 批量应用必须经过显式确认和全量冲突预检

系统 SHALL 只在存在选中变更时允许用户确认应用，并在第一次写入前以及每文件实际写入前验证完整 Markdown 内容和 frontmatter tags 仍与预览快照一致。

#### Scenario: 没有选中变更

- **GIVEN** 用户已经清除全部选择
- **WHEN** 用户查看批次操作区
- **THEN** 应用按钮处于禁用状态
- **AND** 系统不创建空批次操作记录

#### Scenario: 用户确认应用

- **GIVEN** 批次包含一个或多个默认选中的 inline 同步项、低风险已有标签建议或明确选择的中风险新标签建议
- **WHEN** 用户点击应用
- **THEN** 系统再次展示将修改的文件数和新增标签数并要求显式确认
- **AND** 用户取消确认时不写入任何文件

#### Scenario: 应用前发现文件冲突

- **GIVEN** 任一目标文件已删除、其当前 frontmatter tags 与 `beforeTags` 不一致，或完整 Markdown SHA-256 与 `sourceContentHash` 不一致
- **WHEN** 系统执行应用前全量预检
- **THEN** 系统中止整个批次应用
- **AND** 系统不得修改任何目标文件
- **AND** UI 区分文件缺失、tags 变化和内容变化，并要求用户重新生成或刷新预览

#### Scenario: 正文在预览后发生变化

- **GIVEN** 一篇目标笔记的 frontmatter tags 仍等于 `beforeTags`
- **AND** 用户或其他插件在预览后修改了正文或其他 frontmatter 字段
- **WHEN** 系统执行全量预检
- **THEN** `sourceContentHash` 校验失败
- **AND** 整个批次保持零写入
- **AND** 系统不得把基于旧正文识别的 inline tag 或 AI 建议写入 frontmatter

#### Scenario: 全量预检后发生写入竞态

- **GIVEN** 全部目标文件已经通过全量预检
- **AND** 当前待写文件在其实际写入前发生了内容或 tags 变化
- **WHEN** writer 执行每文件二次快照校验
- **THEN** writer 拒绝该文件写入并返回具体冲突类型
- **AND** executor 停止后续文件并补偿本批次已经写入的文件

#### Scenario: 应用选中计划

- **GIVEN** 全部目标文件通过冲突预检
- **WHEN** 系统执行批次应用
- **THEN** 系统只向选中笔记的 frontmatter tags 新增选中的 inline 同步项和 AI 建议
- **AND** 系统保留每篇笔记原有的 frontmatter tags
- **AND** 系统不修改未选中笔记、未选中标签或任何正文内容
- **AND** 自动化测试验证每篇已写笔记的正文片段与写入前逐字相等

### Requirement: 批次执行失败必须停止并执行补偿恢复

系统 SHALL 在批量应用中逐文件进行原子标签快照校验；任一写入失败后必须停止后续写入，并尝试把本次已经修改的文件恢复到批次前状态。

#### Scenario: 中途写入失败且补偿成功

- **GIVEN** 批次已成功写入部分文件
- **AND** 后续文件发生冲突或写入失败
- **WHEN** 系统执行补偿恢复
- **THEN** 系统按逆序将本批次已修改文件恢复到各自 `beforeTags`
- **AND** 系统不保存成功批次操作记录
- **AND** UI 说明批次未应用且已恢复

#### Scenario: 补偿恢复未完全成功

- **GIVEN** 批次写入失败后至少一个已修改文件无法恢复
- **WHEN** 补偿流程结束
- **THEN** 系统保存状态为 `recoveryRequired` 的批次恢复记录
- **AND** 记录持久化 `recoveryTarget = "before"`
- **AND** 记录精确列出实际已修改、已恢复和仍需恢复的文件及其前后 tags
- **AND** 系统刷新标签索引以反映实际文件状态
- **AND** UI 展示仍需恢复的文件并提供重试恢复入口
- **AND** 在恢复记录解决前，系统不得开始新的文件夹批量写入

#### Scenario: 应用期间插件被中断

- **GIVEN** 系统已持久化状态为 `applying` 的批次记录
- **AND** Obsidian 在全部文件写入完成前关闭或插件被重载
- **WHEN** 插件下次加载该记录
- **THEN** 系统根据每个文件当前 tags 与记录中的 `beforeTags`、`afterTags` 对账
- **AND** 全部文件等于 `beforeTags` 时系统删除意图记录并报告批次未应用
- **AND** 全部文件等于 `afterTags` 时系统把记录更新为 `applied`
- **AND** before/after 混合或存在第三种状态时系统转为 `recoveryRequired` 并持久化 `recoveryTarget = "before"`
- **AND** UI 列出未写入、已写入和发生额外冲突的文件
- **AND** 在用户完成恢复前不得开始新的文件夹批量写入

### Requirement: 成功应用必须保存单条可逆批次操作记录

系统 SHALL 将一次完整成功的文件夹批量应用保存为单条 `batch` 操作记录，并在所有写入完成后只刷新一次标签索引。

#### Scenario: 第一次写入前持久化批次意图

- **GIVEN** 全部目标文件已经通过应用前预检
- **WHEN** 系统准备开始第一次写入
- **THEN** 系统先保存一条状态为 `applying` 的批次操作记录
- **AND** 记录包含完整的目标文件 `beforeTags` 与 `afterTags`
- **AND** 记录按文件区分 `syncedInlineTags` 与 `aiAddedTags`
- **AND** 记录不保存完整 Markdown 正文或 API key
- **AND** 后续成功、失败或恢复状态更新同一条记录，而不是创建重复记录

#### Scenario: 批次完整应用成功

- **WHEN** 所有选中计划都成功写入
- **THEN** 系统保存一条状态为 `applied` 的批次操作记录
- **AND** 记录包含批次范围、是否包含子文件夹、创建时间、索引时间、非敏感设置快照，以及每个文件的 `beforeTags`、`afterTags`、`syncedInlineTags` 与 `aiAddedTags`
- **AND** 该批次在操作日志数量限制中只占一条记录
- **AND** 系统刷新一次标签索引并使旧的健康分析缓存失效

#### Scenario: 关闭并重新打开 Obsidian

- **GIVEN** 最近一次文件夹批量操作已经成功保存
- **WHEN** 插件重新加载持久化数据
- **THEN** 系统仍可识别该批次操作记录
- **AND** 系统仍可提供最近批次回退入口

### Requirement: 最近一次成功批次必须可安全回退

系统 SHALL 在批次结果界面和独立命令中提供“撤销最近一次文件夹批量操作”，且回退前必须验证全部文件仍等于该批次写入后的标签快照。

#### Scenario: 没有可回退批次

- **WHEN** 用户运行最近批次回退命令但不存在状态为 `applied` 的批次记录
- **THEN** 系统显示没有可回退批次的提示
- **AND** 系统不修改任何文件

#### Scenario: 回退前发现文件冲突

- **GIVEN** 批次中的任一文件已删除，或其当前 frontmatter tags 不等于记录中的 `afterTags`
- **WHEN** 用户确认回退最近批次
- **THEN** 系统中止整个批次回退
- **AND** 系统不得修改任何文件
- **AND** 系统保留批次操作记录并列出冲突文件

#### Scenario: 完整回退成功

- **GIVEN** 批次中的全部文件通过回退预检
- **WHEN** 系统执行回退
- **THEN** 系统在第一次回退写入前将原记录状态持久化为 `undoing`
- **AND** 系统将每个文件恢复到记录中的 `beforeTags`
- **AND** 系统不修改任何文件的正文 inline tags
- **AND** 系统移除该批次操作记录
- **AND** 系统只刷新一次标签索引并使旧的健康分析缓存失效

#### Scenario: 回退中途失败

- **GIVEN** 系统已经恢复部分文件
- **AND** 后续文件回退失败
- **WHEN** 系统执行回退补偿
- **THEN** 系统尝试将本次已恢复文件重新写回各自 `afterTags`
- **AND** 系统保留原批次操作记录
- **AND** 如果补偿仍未完全成功，系统将记录标记为 `recoveryRequired`、持久化 `recoveryTarget = "after"` 并展示需要人工恢复的文件

#### Scenario: 回退期间插件被中断

- **GIVEN** 系统已将批次记录状态持久化为 `undoing`
- **AND** Obsidian 在全部文件回退完成前关闭或插件被重载
- **WHEN** 插件下次加载该记录
- **THEN** 系统根据每个文件当前 tags 对账
- **AND** 全部文件等于 `beforeTags` 时系统删除记录并完成回退
- **AND** 全部文件等于 `afterTags` 时系统把记录恢复为 `applied`
- **AND** before/after 混合或存在第三种状态时系统转为 `recoveryRequired` 并持久化 `recoveryTarget = "after"`
- **AND** 系统不得把混合状态批次误报为已完整回退

### Requirement: 恢复重试必须使用持久化的唯一目标

系统 SHALL 根据故障来源持久化 `before` 或 `after` 恢复目标，并在重试前全量分类文件；用户不得在恢复界面临时改变目标方向。

#### Scenario: 重试恢复前存在第三种状态

- **GIVEN** 一条 `recoveryRequired` 记录包含明确的 `recoveryTarget`
- **AND** 至少一个文件已删除或当前 tags 既不等于 `beforeTags` 也不等于 `afterTags`
- **WHEN** 用户点击重试恢复
- **THEN** 系统标记冲突文件并保持整次重试零写入
- **AND** UI 要求用户先手工处理冲突后再重试
- **AND** 系统不得覆盖第三种状态或切换恢复目标

#### Scenario: 重试恢复到 before

- **GIVEN** `recoveryTarget = "before"`
- **AND** 所有文件当前都等于 `beforeTags` 或 `afterTags`
- **WHEN** 用户点击重试恢复
- **THEN** 已等于 `beforeTags` 的文件不写入
- **AND** 等于 `afterTags` 的文件通过 compare-and-swap 恢复到 `beforeTags`
- **AND** 全部成功后系统删除批次记录并报告原批次未应用或已经回退

#### Scenario: 重试恢复到 after

- **GIVEN** `recoveryTarget = "after"`
- **AND** 所有文件当前都等于 `beforeTags` 或 `afterTags`
- **WHEN** 用户点击重试恢复
- **THEN** 已等于 `afterTags` 的文件不写入
- **AND** 等于 `beforeTags` 的文件通过 compare-and-swap 恢复到 `afterTags`
- **AND** 全部成功后系统把批次记录恢复为 `applied`

### Requirement: 批次界面必须提供双语且可辨识的安全状态

系统 SHALL 为范围、进度、风险、选择、冲突、应用、恢复和回退状态提供简体中文与英文文案，并使用 Obsidian 原生可访问交互模式。

#### Scenario: 切换界面语言

- **GIVEN** 插件 UI 语言为简体中文或英文
- **WHEN** 用户进入任一文件夹批次界面
- **THEN** 命令名、按钮、状态、错误和安全提示使用当前 UI 语言
- **AND** 标签路径、文件路径和 provider 返回的推荐理由保持原始内容

#### Scenario: 不依赖颜色表达风险

- **WHEN** UI 展示低、中、高风险或冲突状态
- **THEN** 每个状态同时包含可读文本标签
- **AND** frontmatter、inline 和 AI 标签来源也使用可读文本标识而不只依赖颜色
- **AND** 选择控件、确认控件和取消控件可通过键盘聚焦与操作
