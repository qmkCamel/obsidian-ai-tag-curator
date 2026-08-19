## ADDED Requirements

### Requirement: 系统必须只把可信的 Obsidian tag occurrence 变成可执行正文位置

系统 SHALL 从与当前 Markdown 内容精确匹配的 Obsidian `TagCache.position` 构建 inline tag occurrence；正则 fallback 或无法验证的位置 SHALL NOT 进入正文写入计划。

#### Scenario: metadata position 与正文精确匹配

- **GIVEN** Obsidian metadata cache 返回一个 `tag = #topic/ai` 及其 start/end position
- **AND** 对应 Markdown 区间逐字等于 `#topic/ai`
- **AND** 该区间位于 frontmatter 结束位置之后
- **WHEN** 系统 hydrate 一个健康清理项
- **THEN** 系统生成一个 availability 为 `trusted` 的 occurrence
- **AND** occurrence 包含稳定 id、规范化 tag、完整 source text、正文相对起止位置、行列和截断上下文

#### Scenario: 同一标签重复出现

- **GIVEN** 同一篇正文在三个不同位置出现 `#old`
- **WHEN** metadata cache 返回三个有效位置
- **THEN** 系统保留三个独立 occurrence
- **AND** occurrence 不得按 tag 名称去重

#### Scenario: metadata cache 不可用

- **GIVEN** 只读 inventory 通过 fallback parser 识别到 `#old`
- **AND** metadata cache 没有提供对应 `TagCache.position`
- **WHEN** 系统构建执行审查计划
- **THEN** 系统把该正文来源标记为不可执行且需人工处理
- **AND** 系统不得从 fallback parser 结果生成 `InlineTextEdit`

#### Scenario: metadata position 已陈旧

- **GIVEN** metadata cache 声称某区间是 `#old`
- **AND** 当前 Markdown 的相同区间不再逐字等于 `#old`
- **WHEN** 系统校验 occurrence
- **THEN** 系统将该位置标记为 `positionMismatch`
- **AND** 对应位置不提供选择控件或写入能力

#### Scenario: position 位于 frontmatter 内

- **GIVEN** 一个 cache position 位于 `getFrontMatterInfo(content).contentStart` 之前
- **WHEN** 系统构建正文 occurrence
- **THEN** 系统不得把它作为 inline occurrence
- **AND** frontmatter tag 仍只通过结构化 frontmatter 路径处理

#### Scenario: Unicode 与 CRLF 位置

- **GIVEN** Markdown 在 tag 前包含中文、非 BMP emoji 或 CRLF 换行
- **WHEN** cache position 的 JavaScript 字符串切片逐字匹配 source tag
- **THEN** 系统按该切片对应位置生成可信 occurrence
- **AND** 不得用字节长度替代 Obsidian/JavaScript 字符位置

### Requirement: 系统必须按需生成独立的清理执行审查计划

系统 SHALL 保持初始健康报告和 cleanup plan 为只读索引视图，并只在用户选择审查某个可执行 rename/merge item 后读取该 item 的受影响文件、生成内容快照和位置级 patch。

#### Scenario: 打开健康报告

- **WHEN** 系统生成初始健康报告和 cleanup plan
- **THEN** 系统继续使用已有 TagIndex 生成文件证据摘要
- **AND** 系统不为了 inline 写入位置再次扫描受影响文件

#### Scenario: 用户点击审查变更

- **GIVEN** 一个本地 capability 为 executable 且 target tag 非空的 rename/merge item
- **WHEN** 用户点击“审查变更”
- **THEN** 系统按稳定路径 hydrate 该 item 的受影响文件
- **AND** 系统展示读取进度并允许取消
- **AND** 系统不 hydrate 其他 cleanup item 的文件

#### Scenario: 用户取消 hydrate

- **WHEN** 用户在位置读取完成前取消
- **THEN** 系统停止领取新的文件读取任务并关闭进度
- **AND** 系统不创建操作记录
- **AND** 系统不修改任何 Markdown 文件

#### Scenario: 受影响文件读取失败

- **GIVEN** 至少一个受影响文件不存在或无法读取
- **WHEN** hydrate 完成
- **THEN** 审查计划明确列出失败文件及原因
- **AND** 失败文件没有可选择 patch
- **AND** 系统不得把读取失败显示为无需变更

#### Scenario: 不持久化完整正文

- **WHEN** 系统生成审查计划和预览上下文
- **THEN** Modal 内存只保留必要 hash、tags、相关 occurrence、截断上下文和 patch
- **AND** operation log 不保存完整 Markdown 或显示上下文

### Requirement: 审查界面必须区分 frontmatter 变更和每个 inline occurrence

系统 SHALL 在任何正文写入前展示专用审查界面，分别呈现 frontmatter diff、可信 inline token diff、不可执行位置和当前选择汇总。

#### Scenario: 文件同时包含 frontmatter 和 inline source

- **GIVEN** 一篇文件的 frontmatter 包含 source tag
- **AND** 正文包含两个可信 source occurrence
- **WHEN** 用户打开清理审查
- **THEN** 文件卡片分别展示一个 frontmatter before/after diff 和两个 occurrence diff
- **AND** 每个 occurrence 展示行号、上下文、before token 和 after token
- **AND** 三类可执行变更都有独立的选择状态

#### Scenario: 默认选择可信变更

- **WHEN** 审查计划包含可信 frontmatter 或 inline 变更
- **THEN** 系统默认选择所有可信变更
- **AND** 用户可以逐文件取消 frontmatter 变更或逐 occurrence 取消 inline 变更

#### Scenario: 不可信 occurrence 禁止选择

- **GIVEN** 一个相关 inline 来源没有可信 position
- **WHEN** 用户查看文件卡片
- **THEN** UI 展示不可执行原因和人工处理状态
- **AND** UI 不为该位置提供可启用的选择控件

#### Scenario: 用户留下 source tag

- **GIVEN** 用户取消至少一个可信 occurrence 或存在至少一个不可执行 occurrence
- **WHEN** 系统计算选择汇总
- **THEN** UI 标记本次为部分清理
- **AND** UI 展示将保留的 source occurrence 数量
- **AND** 最终确认再次说明不会完成全量替换

#### Scenario: 用户取消全部变更

- **WHEN** 所有 frontmatter 和 inline 变更都未选择
- **THEN** 应用按钮禁用
- **AND** 系统不得创建空操作记录

#### Scenario: 应用前二次确认

- **GIVEN** 至少一个可信变更已选择
- **WHEN** 用户点击应用
- **THEN** 系统显示将修改的文件数、frontmatter 变更数和 inline occurrence 数
- **AND** 用户再次确认后才可以进入写入阶段

### Requirement: 正文写入必须是最小且确定性的完整 token 替换

系统 SHALL 只把用户选中的完整 `#source` token 替换为 `#target`，并逐字保留所有未选位置和周围 Markdown 内容。

#### Scenario: 重命名一个 occurrence

- **GIVEN** 用户选择把正文中的 `#Old_Tag` 重命名为 target `new-tag`
- **WHEN** 系统生成并应用正文 patch
- **THEN** edit 的 beforeText 为完整 `#Old_Tag`
- **AND** edit 的 afterText 为完整 `#new-tag`
- **AND** token 前后的空格、标点和正文保持不变

#### Scenario: 多个 edit 按降序应用

- **GIVEN** 同一正文包含多个长度可能变化的选中 occurrence
- **WHEN** 系统应用 patch
- **THEN** 系统按正文起始位置降序替换
- **AND** 前一个替换不得改变尚未处理 edit 的定位

#### Scenario: source 与 target 同时存在

- **GIVEN** 正文已经包含 `#target`
- **AND** 另一个选中位置包含 `#source`
- **WHEN** 系统执行 merge
- **THEN** 系统只把选中的 `#source` 改为 `#target`
- **AND** 系统不删除、移动或合并任何已有 `#target` occurrence

#### Scenario: 用户未选择某个 occurrence

- **GIVEN** 同一文件有两个 source occurrence 且用户只选择一个
- **WHEN** 系统应用 patch
- **THEN** 只修改选中的 occurrence
- **AND** 未选 occurrence 及其位置逐字保持不变

#### Scenario: 非目标正文保持不变

- **WHEN** 系统完成 inline rename/merge
- **THEN** 除选中 token 和经结构化 API 修改的 frontmatter tags 外，Markdown 其他内容逐字不变
- **AND** 系统不新增、删除、移动、去重或拆分正文标签

### Requirement: 应用前必须对完整选择范围执行零写入预检

系统 SHALL 在第一次写入前验证所有选中文件存在、完整 Markdown hash 匹配、frontmatter tags 匹配且每个 token slice 匹配；任一冲突 SHALL 使本次操作保持零写入。

#### Scenario: 全部快照匹配

- **GIVEN** 所有选中文件仍等于审查计划的完整内容 hash 和 beforeTags
- **AND** 每个选中正文区间仍等于 beforeText
- **WHEN** executor 执行全量预检
- **THEN** 系统可以持久化 applying intent 并开始写入

#### Scenario: 任一正文内容变化

- **GIVEN** 用户在打开审查后修改了任一目标文件的正文
- **WHEN** executor 执行全量预检
- **THEN** 整次清理保持零写入
- **AND** UI 报告对应文件为 contentChanged 并要求重新审查

#### Scenario: 任一 frontmatter tags 变化

- **GIVEN** 用户在打开审查后修改了任一目标文件的 tags
- **WHEN** executor 执行全量预检
- **THEN** 整次清理保持零写入
- **AND** UI 报告对应文件为 tagsChanged

#### Scenario: 文件缺失

- **GIVEN** 任一选中文件在应用前已经缺失
- **WHEN** executor 执行全量预检
- **THEN** 整次清理保持零写入
- **AND** UI 报告 missing 文件路径

#### Scenario: 预检后发生竞态

- **GIVEN** 全量预检已经通过
- **AND** 文件在进入 `Vault.process()` callback 前发生变化
- **WHEN** callback 比较当前 data 与刚预读内容
- **THEN** writer 拒绝该文件写入
- **AND** executor 进入补偿或恢复流程而不是覆盖新内容

### Requirement: 混合 frontmatter 与正文改写必须作为可恢复事务执行

系统 SHALL 在第一次写入前持久化版本化 cleanup intent，并按稳定顺序执行逐文件、逐阶段 CAS；失败时 SHALL 尝试回到固定的批次前状态。

#### Scenario: 混合文件成功应用

- **GIVEN** 一个文件同时有选中的 inline edits 和 frontmatter diff
- **WHEN** executor 应用该文件
- **THEN** 系统先通过 `Vault.process()` 应用正文 token edits
- **AND** 系统再以更新后的内容 hash 通过 `processFrontMatter()` 应用 frontmatter tags
- **AND** 全部文件完成后同一 cleanup 记录状态变为 applied

#### Scenario: inline-only 文件成功应用

- **GIVEN** 一个文件只有选中的 inline edits
- **WHEN** executor 应用该文件
- **THEN** 系统不创建或改写该文件的 frontmatter tags
- **AND** operation record 仍保存 before/after body hash 供恢复和回退

#### Scenario: frontmatter-only 文件成功应用

- **GIVEN** 一个文件只有 frontmatter diff
- **WHEN** executor 应用该文件
- **THEN** 系统沿用结构化 frontmatter writer
- **AND** 正文 body hash 保持不变

#### Scenario: 中途失败且补偿成功

- **GIVEN** executor 已经修改一个或多个文件
- **AND** 后续正文或 frontmatter 阶段失败
- **WHEN** 系统按逆序补偿所有已处理阶段
- **THEN** 所有文件恢复到 beforeTags + beforeBodyHash
- **AND** 系统删除 applying intent
- **AND** UI 报告本次未应用

#### Scenario: 中途失败且补偿不完整

- **GIVEN** 写入失败后的逆序补偿也有文件失败
- **WHEN** executor 无法把全部文件恢复到 before
- **THEN** 同一 cleanup 记录变为 recoveryRequired
- **AND** recoveryTarget 固定为 before
- **AND** 记录保存每个文件的实际恢复状态

#### Scenario: 正文已写但 frontmatter 尚未写时进程中断

- **GIVEN** 文件处于 beforeTags + afterBodyHash 的中间状态
- **AND** 插件在 frontmatter 阶段前重载
- **WHEN** recovery service 对账 applying 记录
- **THEN** 系统把该文件分类为 bodyChanged 而非用户冲突
- **AND** 混合状态固定进入 target=before 的恢复流程

### Requirement: 清理回退和中断恢复必须保护用户后续修改

系统 SHALL 只在文件语义状态与 operation record 的 before/bodyChanged/after 状态精确匹配时推进回退或恢复，不得猜测或覆盖 conflict/missing 文件。

#### Scenario: 成功回退 applied cleanup

- **GIVEN** 所有目标文件仍处于记录中的 afterTags + afterBodyHash
- **WHEN** 用户确认回退
- **THEN** 系统在第一次回退写入前把记录持久化为 undoing
- **AND** 系统恢复 beforeTags 和每个选中 occurrence 的 beforeText
- **AND** 完成后删除 cleanup 记录并刷新索引

#### Scenario: 用户修改了正文

- **GIVEN** cleanup 应用后用户修改了任一目标文件正文
- **WHEN** 用户尝试回退
- **THEN** 全量回退保持零写入
- **AND** 系统把文件标记为 conflict
- **AND** 系统不得搜索并猜测旧 tag 的新位置

#### Scenario: 用户修改了 frontmatter tags

- **GIVEN** cleanup 应用后用户修改了任一目标文件 tags
- **WHEN** 用户尝试回退
- **THEN** 全量回退保持零写入
- **AND** 系统不得覆盖用户的新 tags

#### Scenario: 用户只修改了无关 frontmatter 属性

- **GIVEN** cleanup 应用后用户修改了 aliases、status 或其他非 tags frontmatter 属性
- **AND** 目标文件的 tags 与正文仍精确匹配记录中的 after 状态
- **WHEN** 用户执行回退
- **THEN** 系统允许恢复记录中的 beforeTags 和 inline token
- **AND** 系统逐字或按 Obsidian frontmatter API 语义保留用户新增或修改的无关 frontmatter 属性

#### Scenario: undoing 中途失败但补偿成功

- **GIVEN** 回退已经修改部分文件后发生失败
- **WHEN** 系统成功把已回退部分补偿回 after
- **THEN** cleanup 记录恢复为 applied
- **AND** 用户可以修复冲突后重新回退

#### Scenario: undoing 补偿不完整

- **GIVEN** 回退失败后的补偿无法恢复全部 after 状态
- **WHEN** 系统保存恢复意图
- **THEN** cleanup 记录变为 recoveryRequired
- **AND** recoveryTarget 固定为 after

#### Scenario: 重试恢复存在 missing 或 conflict

- **GIVEN** recoveryRequired 记录中的任一文件为 missing 或 conflict
- **WHEN** 用户点击重试恢复
- **THEN** 整次重试保持零写入
- **AND** 系统保留原 recoveryTarget 和精确文件状态

### Requirement: 未解决的可恢复操作必须阻断新的标签写入

系统 SHALL 在存在 `applying`、`undoing` 或 `recoveryRequired` 的 folder batch 或 cleanup 记录时阻止所有新的插件标签写入，同时保持只读能力可用。

#### Scenario: cleanup 恢复未解决时启动当前笔记推荐写入

- **GIVEN** 存在未解决 cleanup V2 记录
- **WHEN** 用户尝试应用当前笔记推荐
- **THEN** 系统阻止写入并引导用户先完成恢复
- **AND** 未解决记录保持不变

#### Scenario: batch 恢复未解决时启动 health cleanup

- **GIVEN** 存在未解决 folder batch 记录
- **WHEN** 用户尝试应用健康清理
- **THEN** 系统阻止写入并展示现有恢复入口

#### Scenario: 未解决操作存在时使用只读功能

- **GIVEN** 存在未解决写入记录
- **WHEN** 用户刷新索引、查看健康报告、审查计划或复制 Markdown
- **THEN** 这些只读操作保持可用
- **AND** 不得改变未解决记录的目标或文件状态

### Requirement: 新 cleanup 记录必须版本化且不得保存完整正文

系统 SHALL 用显式 `schemaVersion = 2` 区分可恢复 inline cleanup 与历史 frontmatter-only cleanup，并只保存执行和恢复所需的最小数据。

#### Scenario: 保存新的 cleanup intent

- **WHEN** 用户确认一个包含可信变更的审查计划
- **THEN** operation log 在第一次文件写入前保存一条 schemaVersion 2 cleanup 记录
- **AND** 记录包含状态、固定 action/target、逐文件 tags、body hash、内容 hash和最小 inline edits
- **AND** 一次 cleanup 事务只占一个日志槽位

#### Scenario: 不保存敏感或大体积内容

- **WHEN** 系统序列化 cleanup V2 记录
- **THEN** 记录不包含完整 Markdown、显示上下文、API key 或 AI response
- **AND** hash 不可用于还原正文

#### Scenario: 加载历史 cleanup 记录

- **GIVEN** plugin data 包含没有 schemaVersion/status 的旧 cleanup 记录
- **WHEN** OperationLog 加载数据
- **THEN** 系统将它识别为 legacy frontmatter-only applied 记录
- **AND** 旧记录继续使用原有 frontmatter undo
- **AND** 系统不为旧记录猜测正文 edits 或 recovery 状态

### Requirement: 稳定写入状态后系统必须刷新索引且保留恢复证据

系统 SHALL 在应用、补偿、恢复或回退到稳定状态后只刷新一次标签索引并使健康 AI cache 失效；索引刷新失败 SHALL NOT 删除仍需回退或恢复的 operation record。

#### Scenario: 应用成功后刷新索引

- **WHEN** cleanup V2 状态稳定为 applied
- **THEN** 系统刷新标签索引一次
- **AND** 新 target tag 的 frontmatter/inline 来源进入新索引
- **AND** 旧 source tag 只在仍有未选或不可执行 occurrence 时保留

#### Scenario: 索引刷新失败

- **GIVEN** 文件事务已经稳定完成
- **AND** 随后的索引刷新失败
- **WHEN** 系统展示结果
- **THEN** UI 分别报告文件状态与索引刷新错误
- **AND** applied 或 recoveryRequired 记录不得因此被删除
