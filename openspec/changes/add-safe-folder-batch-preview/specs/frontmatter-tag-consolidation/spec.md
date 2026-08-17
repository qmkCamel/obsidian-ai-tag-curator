## ADDED Requirements

### Requirement: 系统必须构建可追溯的整篇笔记标签清单

系统 SHALL 为当前笔记推荐和文件夹批次构建同一份标签清单，分别保留 frontmatter tags、正文 inline tags 及两者规范化后的并集。

#### Scenario: 笔记同时包含两种标签

- **GIVEN** 一篇笔记的 frontmatter 包含 `project` 和 `status/todo`
- **AND** 正文包含 `#project` 和 `#topic/ai`
- **WHEN** 系统读取该笔记的标签清单
- **THEN** `frontmatterTags` 包含 `project` 和 `status/todo`
- **AND** `inlineTags` 包含 `project` 和 `topic/ai`
- **AND** `allTags` 包含去重后的 `project`、`status/todo` 和 `topic/ai`
- **AND** 系统保留每个 tag 的来源信息供预览使用

#### Scenario: Obsidian metadata cache 暂不可用

- **GIVEN** 系统无法从 Obsidian metadata cache 取得正文 tag 位置
- **WHEN** 系统读取 Markdown 内容
- **THEN** 系统使用本地 inline tag 解析器构建 `inlineTags`
- **AND** 当前笔记推荐与文件夹批次得到一致的标签清单

#### Scenario: 排除非标签井号文本

- **GIVEN** 正文包含 fenced code block、inline code、Markdown 标题或 URL fragment 中的井号文本
- **WHEN** 系统构建 `inlineTags`
- **THEN** 系统不得把这些井号文本识别为正文标签
- **AND** 只有符合 Obsidian 标签语义的正文 tag 进入 `inlineTags` 和 `allTags`

### Requirement: AI 推荐必须过滤笔记任意位置已有的标签

系统 SHALL 把 `allTags` 作为笔记已有标签提供给推荐提示和确定性结果过滤器，不得把 frontmatter 或正文中已经存在的 tag 再显示为 AI 新建议。

#### Scenario: AI 返回 frontmatter 已有标签

- **GIVEN** `project` 已存在于笔记 frontmatter
- **WHEN** AI 返回 `project` 作为推荐标签
- **THEN** 确定性结果过滤器移除该建议
- **AND** 预览不得把它显示为 AI 新增项

#### Scenario: AI 返回正文已有标签

- **GIVEN** `topic/ai` 只存在于正文 inline tags
- **WHEN** AI 返回 `topic/ai` 作为推荐标签
- **THEN** 确定性结果过滤器移除该 AI 建议
- **AND** 系统只把它显示为本地生成的 inline 同步项

### Requirement: 推荐入口必须保持明确的 provider 前置条件

系统 SHALL 在当前笔记推荐和文件夹批次入口使用相同的 API key 配置边界；0.3 不得把本地标签汇总静默降级成无 provider 的第二种运行模式。

#### Scenario: 当前笔记推荐未配置 API key

- **GIVEN** 当前活动文件是 Markdown 笔记
- **AND** `apiKey.trim()` 为空
- **WHEN** 用户运行当前笔记标签推荐
- **THEN** 系统提示用户先配置 API key
- **AND** 系统不读取笔记、不构建索引、不发起 AI 请求或打开汇总预览

#### Scenario: 文件夹批次未配置 API key

- **GIVEN** 当前活动文件是 Markdown 笔记
- **AND** `apiKey.trim()` 为空
- **WHEN** 用户运行文件夹批次标签推荐
- **THEN** 系统使用相同的配置提示和零请求边界
- **AND** 系统不得仅执行 inline-to-frontmatter 汇总

### Requirement: 预览必须展示整篇标签及来源

系统 SHALL 在当前笔记推荐和文件夹批次预览中区分 frontmatter 既有标签、正文 inline 同步项和 AI 建议，并根据当前选择展示最终 frontmatter tags。

#### Scenario: 查看包含三种来源的预览

- **GIVEN** 一篇笔记同时有 frontmatter tags、尚未同步的 inline tags 和有效 AI 建议
- **WHEN** 用户打开当前笔记或文件夹批次预览
- **THEN** UI 分别标识 `frontmatter`、`inline` 和 `AI` 来源
- **AND** UI 展示当前 frontmatter tags
- **AND** UI 展示正文识别到的全部 inline tags
- **AND** UI 展示根据当前选择计算的最终 frontmatter tags

#### Scenario: 默认选择正文同步项

- **GIVEN** 一个正文 tag 尚不存在于 frontmatter
- **WHEN** 系统创建预览候选项
- **THEN** 系统把该项标记为确定性低风险 `syncInlineTag`
- **AND** 该项默认选中
- **AND** 用户可以在应用前取消该项

#### Scenario: AI 没有返回建议但存在未同步正文标签

- **GIVEN** AI 没有返回有效标签建议
- **AND** 笔记存在至少一个尚未写入 frontmatter 的 inline tag
- **WHEN** 系统完成推荐处理
- **THEN** 系统仍打开包含 inline 同步项的预览
- **AND** 系统不得把该笔记标记为“无需变更”

#### Scenario: AI 请求失败但本地同步项可用

- **GIVEN** 当前笔记或批次项已经成功构建至少一个 inline 同步项
- **AND** provider 请求或 AI 结构化解析失败
- **WHEN** 系统准备展示结果
- **THEN** 系统保留本地同步项及其选择状态
- **AND** 预览明确标记 AI 建议失败且本次仅包含本地确定性同步项
- **AND** 用户可以直接审查/应用本地同步项或重试 AI 阶段

#### Scenario: 笔记读取失败

- **GIVEN** 当前笔记或批次项无法读取完整 Markdown
- **WHEN** 系统尝试构建标签清单
- **THEN** 系统不得生成 inline 同步项、AI 建议或可写计划
- **AND** UI 展示读取失败而不是“无需变更”

### Requirement: 预览必须绑定到完整 Markdown 内容快照

系统 SHALL 为每个当前笔记或批次变更计划保存完整原始 Markdown 的 SHA-256，并在应用前拒绝内容已经变化的陈旧计划。

#### Scenario: 创建内容快照

- **GIVEN** 系统通过 `cachedRead()` 成功读取完整 Markdown
- **WHEN** 系统构建当前笔记或批次变更计划
- **THEN** 系统按 UTF-8 计算 SHA-256 小写十六进制 `sourceContentHash`
- **AND** 计划同时保存 `beforeTags` 与 `sourceContentHash`
- **AND** 系统不得因此在操作日志中保存完整正文

#### Scenario: 当前笔记在预览后发生变化

- **GIVEN** 用户已经打开当前笔记汇总预览
- **AND** 应用前完整 Markdown SHA-256 不再等于 `sourceContentHash`
- **WHEN** 用户确认应用
- **THEN** writer 拒绝写入
- **AND** UI 提示笔记内容已经变化并要求重新生成预览
- **AND** 系统不得仅因 frontmatter tags 仍相等而写入陈旧计划

#### Scenario: 文件夹批次任一文件发生变化

- **GIVEN** 批次任一目标文件的完整 Markdown SHA-256 或 frontmatter tags 与计划快照不一致
- **WHEN** executor 执行第一次写入前全量预检
- **THEN** 整个批次保持零写入
- **AND** UI 区分内容变化、tags 变化和文件缺失

### Requirement: 应用必须把选中标签汇总到 frontmatter 且不改写正文

系统 SHALL 只把原有 frontmatter tags、用户选中的 inline 同步项和用户选中的 AI 建议去重合并后写入 frontmatter，不得修改正文内容。

#### Scenario: 应用当前笔记预览

- **GIVEN** 当前笔记 frontmatter 包含 `project`
- **AND** 用户保留选中的 inline 同步项 `topic/ai`
- **AND** 用户选择 AI 建议 `status/todo`
- **WHEN** 用户确认应用
- **THEN** frontmatter tags 包含 `project`、`topic/ai` 和 `status/todo`
- **AND** 变更计划分别记录 `syncedInlineTags` 与 `aiAddedTags`
- **AND** 正文内容逐字保持不变

#### Scenario: 应用文件夹批次预览

- **GIVEN** 文件夹批次包含一个或多个选中的 inline 同步项或 AI 建议
- **WHEN** 用户确认应用且所有目标文件通过冲突预检
- **THEN** 每篇目标笔记按与当前笔记相同的合并规则更新 frontmatter tags
- **AND** 未选中的 inline 同步项或 AI 建议不进入 frontmatter
- **AND** 所有目标笔记正文内容保持不变

#### Scenario: 用户取消全部同步和建议

- **GIVEN** 用户取消一篇笔记的全部 inline 同步项和 AI 建议
- **WHEN** 系统重新计算变更计划
- **THEN** 该笔记没有可写变更
- **AND** 系统不得改写该笔记的 frontmatter 或正文

### Requirement: 标签汇总必须可解释且可逆

系统 SHALL 在操作记录中保留应用前后 frontmatter tags，并区分同步的 inline tags 与采用的 AI tags；回退只恢复 frontmatter，不得改写正文。

#### Scenario: 保存标签来源

- **WHEN** 当前笔记或文件夹批次成功应用标签汇总
- **THEN** 操作记录包含 `beforeTags` 和 `afterTags`
- **AND** 操作记录可区分 `syncedInlineTags` 与 `aiAddedTags`
- **AND** 操作记录不得保存完整正文
- **AND** 操作记录可以保存不可逆的 `sourceContentHash` 以解释应用快照

#### Scenario: 回退标签汇总

- **GIVEN** 目标笔记当前 frontmatter tags 仍等于操作记录中的 `afterTags`
- **WHEN** 用户执行对应回退
- **THEN** 系统把 frontmatter tags 恢复为 `beforeTags`
- **AND** 正文 inline tags 及其原位置保持不变
