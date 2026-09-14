## ADDED Requirements

### Requirement: 路径范围采用段匹配且排除优先

系统 SHALL 分离临时操作 scope 与全局排除目录，按规范化路径段匹配；不接受绝对路径或路径穿越，目录排除 SHALL 优先于所有包含项。

#### Scenario: 同名前缀目录
- **WHEN** 包含 Project 且排除 Project/Archive
- **THEN** Project-Old 不因前缀相同被包含，Project/Archive 的所有后代被排除
- **AND** 同一文件被多个包含规则命中仍只处理一次

#### Scenario: 目录被重命名
- **WHEN** 已配置目录不再存在
- **THEN** 系统标记失效规则并使受影响预览过期
- **AND** 不自动把规则套到另一个同名或推测的新路径

### Requirement: 保护规则阻止实际标签变动

系统 SHALL 支持 exact 和 subtree 两种保护，subtree 包含自身及后代；所有前向写入 SHALL 拒绝保护标签的新增、删除、改名及已有原值变化。

#### Scenario: 子树保护
- **WHEN** 配置 status/*
- **THEN** status 与 status/active 均受保护，status-old 不受保护
- **AND** 不解释任意正则或其他 wildcard

#### Scenario: 保护目标与同文件其他标签
- **WHEN** 用户合并到保护目标，或只改某笔记中的非保护 source
- **THEN** 前者不可执行，后者仅在保护项的原值序列完全不变时可执行
- **AND** 不能借整个 tags 数组规范化改变保护项大小写或重复项

### Requirement: 所有前向入口遵守相同策略

当前笔记推荐、文件夹批次、健康清理和手动管理 SHALL 在读取/生成/写入边界执行适用策略；旧命令和编程调用 SHALL NOT 绕过。

#### Scenario: 被排除的当前笔记
- **WHEN** 用户从旧命令为排除目录内笔记请求推荐
- **THEN** 系统在读正文及发送 provider 请求前阻断
- **AND** 不因未打开工作台而忽略规则

#### Scenario: 排除变更与旧 AI 结果
- **WHEN** 目录排除策略在 AI 请求期间改变
- **THEN** 旧请求结果不再应用或写回有效缓存
- **AND** 旧索引片段与 AI 缓存失效，后续上下文不含排除文件

### Requirement: 策略版本与写入必须互斥

系统 SHALL 使策略保存令未提交预览失效，并通过共享 mutation lease 阻止并发提交；已提交事务期间 SHALL 拒绝策略保存。

#### Scenario: 双视图同时提交
- **WHEN** 两个视图或不同旧命令同时开始写入
- **THEN** 只有一个获得 lease，另一个返回 busy 而非后台排队
- **AND** 不产生两条并行 applying intent

#### Scenario: 修改保护后应用旧预览
- **WHEN** 保护规则已保存且用户应用旧预览
- **THEN** 系统返回 policyChanged，整次零写入
- **AND** 不静默丢弃新保护项后执行其余旧选择

### Requirement: 原值与正文安全是公共执行前提

新的前向写入 SHALL 带真实 tags 值快照与精确 patch，只改选中标签；writer SHALL 在 Vault.process callback 检查全文一致，保留正文和非 tags 属性语义。

#### Scenario: 同文件有未选大小写与重复标签
- **WHEN** tags 为 [Source, KeepCase, KeepCase] 且只改 Source
- **THEN** 两个 KeepCase 的字面量、数量和相对顺序不变
- **AND** 日志保存实际前后值用于精确撤销

#### Scenario: 不支持的属性值或 YAML
- **WHEN** tags 为混合类型/标量旧格式，或 YAML 无法证明安全往返
- **THEN** 新前向计划把文件设为只读并解释原因
- **AND** 不自动清洗、不丢属性、不把 normalized 列表当作原值

#### Scenario: 全文预检后的编辑竞态
- **WHEN** 用户在 hash 预检后、Vault.process callback 前编辑同一笔记
- **THEN** callback 拒绝陈旧写入
- **AND** 已处理的其他步骤进入补偿而非覆盖新内容

### Requirement: 恢复只豁免当前规则而不豁免内容冲突

撤销与固定目标恢复 SHALL 使用原操作范围，允许明确的 recordId 恢复上下文跨越后加的保护/排除，但 SHALL NOT 跳过快照或允许额外写入。

#### Scenario: 应用后再保护目标
- **WHEN** 用户保护已改写标签或排除原文件夹，再撤销该操作
- **THEN** 系统说明规则例外并检查原文件状态
- **AND** 无冲突时只恢复原记录，存在冲突则整次预检零写入

### Requirement: 持久化失败和未知恢复记录不得被忽略

系统 SHALL 串行保存最新完整 plugin data，意图保存成功前不得写 Markdown；失败、未知 schema 或多个未解决记录 SHALL 保持可见错误并阻止新写入。

#### Scenario: 索引保存与意图保存交错
- **WHEN** 刷新索引和 mutation intent 同时请求保存
- **THEN** 串行队列保存最新状态，不用旧索引快照覆盖意图
- **AND** 保存失败向调用方传播且保留恢复门禁

#### Scenario: 无法解析操作记录
- **WHEN** 插件加载未知或损坏的 operations
- **THEN** 显示只读恢复错误，不显示空历史或自动清空数据
- **AND** 阻止新的 Markdown 写入
