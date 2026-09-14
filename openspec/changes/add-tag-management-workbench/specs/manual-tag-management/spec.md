## ADDED Requirements

### Requirement: 手动意图使用独立权限来源

系统 SHALL 支持手动指定一个源标签重命名或多个源标签合并到一个目标；该意图 SHALL 通过本地验证独立进入审查，SHALL NOT 伪造健康问题或改变健康建议能力矩阵。

#### Scenario: 没有健康问题仍可改名
- **WHEN** 用户为合法存在的标签明确指定不同身份的合法目标
- **THEN** 系统生成手动来源计划且不要求 AI/健康问题
- **AND** 计划只能通过专用审查和二次确认执行

#### Scenario: AI 人工判断项不升级
- **WHEN** 健康报告的低频观察或过宽拆分项存在候选目标
- **THEN** 该项仍不可执行
- **AND** 手动入口存在不改变其 availability

### Requirement: 精确标签和目标输入边界

系统 SHALL 只改写 source 精确身份，保留目标字面量；SHALL 拒绝空值、空层级、非法空格、纯数字、未支持字符、同身份目标与无实际 source 的操作。

#### Scenario: 父标签改名
- **WHEN** 用户将 project 改为 work
- **THEN** project/active 不自动迁移
- **AND** UI 展示精确标签范围和子标签提示

#### Scenario: 大小写或无效输入
- **WHEN** 用户将 Tag 改为 TAG，或输入 123、a//b、a b
- **THEN** 系统分别提示同一身份或非法输入，不生成写入计划
- **AND** 不静默替换空格、不展平层级后直接应用

#### Scenario: 合并到已存在目标
- **WHEN** 合并源集合包含目标本身且还存在其他 source
- **THEN** 目标从 source 中移除，目标专属文件不被 hydrate
- **AND** 原有正文目标 token 保留，属性不新增重复目标

### Requirement: 候选范围与读取上限必须显式

系统 SHALL 在每次手动操作审查前确认包含目录/递归并应用全局排除和保护；候选文件上限为 200，超过 SHALL 阻断而不是截断或自动分批。

#### Scenario: 超过候选文件上限
- **WHEN** 有 201 个有效 source 文件
- **THEN** 系统在 hydrate 正文之前要求缩小范围
- **AND** 不读取前 200 个并声称覆盖全部

#### Scenario: 取消 hydrate
- **WHEN** 用户取消四 worker 的预览准备任务
- **THEN** 停止领取新工作，晚到结果不能打开审查或写入
- **AND** 没有 operation intent 被保存

### Requirement: 审查只授权可信且被选中的差异

系统 SHALL 展示属性前后原值、正文位置与 token diff、不可执行原因；只有明确选中的可信差异可写，正文 fallback SHALL NOT 获得执行权限。

#### Scenario: 缺失位置缓存
- **WHEN** source 仅有 fallback 证据或位置切片不匹配
- **THEN** 该正文位置只读且不可程序化勾选
- **AND** 可信属性变更可以独立审查

#### Scenario: 部分选择与规则跳过
- **WHEN** 用户取消部分位置且存在保护或读取失败文件
- **THEN** 二次确认分别显示将修改数、未选择数及跳过原因
- **AND** 结果只描述本次范围，不宣称全库源标签清除

### Requirement: 陈旧计划与应用结果必须精确

系统 SHALL 将计划绑定到 vault/index/policy revision、候选路径与内容快照；应用前漂移 SHALL 要求重新审查，不能自动重算后执行。

#### Scenario: 预览后新增或移动源笔记
- **WHEN** 确认前候选范围或库 revision 已变化
- **THEN** 新操作整次零 Markdown 写入且无 applying intent
- **AND** 用户需重新生成审查

#### Scenario: 写入后索引失败
- **WHEN** 标签写入完成但索引刷新失败
- **THEN** 保留 applied 记录并显示索引失败
- **AND** 重试只刷新索引，不再次执行旧计划

#### Scenario: 提交后关闭视图
- **WHEN** 用户在写入后关闭工作台或重复点击应用
- **THEN** 同一事务只执行一次，关闭只隐藏 UI
- **AND** 执行失败按现有补偿/固定目标恢复处理
