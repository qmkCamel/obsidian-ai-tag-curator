## Why

当前插件已有标签索引、健康报告、位置级审查和可恢复写入，但用户仍不能从统一入口直接管理任意标签；没有配置 AI 的用户也缺少完整的日常管理流程。本变更将已有能力连接为本地优先的标签管理工作台，以可控范围、保护规则和可见历史建立信任，而不是继续扩展模型配置。

## What Changes

- 增加 Obsidian 原生工作区标签页：标签列表、相关笔记详情、范围与保护设置、操作历史；不依赖 AI、活动笔记或 API key。
- 增加独立的手动重命名/合并意图，复用已合入 dev 的 inline/frontmatter 审查、V2 执行器和恢复服务；不伪造健康问题、不放宽 AI 能力矩阵。
- 增加统一排除目录与保护标签规则；工作台范围与全局保护分离，所有前向写入入口都执行保护检查。撤销和固定目标恢复使用原操作范围，不受后来规则反向破坏。
- 增加索引过期状态、可取消的有界刷新和稳定列表；区分文件数、来源文件数与正文位置数，不把现有 count 当成实际 occurrence 数。
- 增加统一历史投影、全局最近操作撤销策略、冲突详情与恢复入口；旧记录按真实证据显示，不编造模型、时间或成功状态。
- 收紧安全公共边界：进程内写入互斥、持久化串行化、未解决记录保留、受保护及未选标签原值保留，防止新增入口放大已有隐含限制。
- 第一阶段不做删除、父子标签批量迁移、仅大小写改名、CSV/正则、自动别名、图谱、任意顺序撤销；第二阶段方向仅记录在产品方案，不作为本 change 任务。

## Capabilities

### New Capabilities

- `tag-management-workbench`: 本地工作区、列表与相关笔记、选择和交互状态。
- `manual-tag-management`: 无需健康诊断的确定性重命名/合并、显式范围、来源审查与部分处理。
- `tag-mutation-policy`: 全局目录排除、标签保护、策略快照、入口一致性与写入协调。
- `tag-index-freshness`: 索引新鲜度、刷新并发与取消、错误降级和统计口径。
- `tag-operation-history`: 历史投影、最近操作撤销、冲突恢复、旧数据兼容与容量边界。

### Modified Capabilities

- `cleanup-action-capabilities`: 明确手动意图不改变健康建议执行权限；新增公共策略与原值保护要求。此 delta 只新增要求，避免覆盖尚未归档的 inline 改写 delta。

## Impact

- 基线：`origin/dev`，提交 `9ce420ccae5a8977972bd5fe51bda14e9ea2cbd7`，已包含 `support-reviewed-inline-tag-rewrites`。不是从发布版 0.4.1 的 frontmatter-only 清理边界重新设计。
- 主要模块：`src/main.ts`、`src/index/*`、`src/cleanup/*`、`src/operations/*`、`src/obsidian/*`、`src/settings/*`、`src/batch/*`、`src/preview/*`、`src/ui/labels.ts`、`styles.css`。
- 新增小型纯逻辑模块与原生 ItemView；不引入 React、数据库、网络服务、向量索引或额外运行时依赖。
- 持久化采取可选字段、显式版本和兼容适配；不升级插件版本、不自动迁移笔记、不修改模型凭据。
- 产品设计见 `product-design.md`；技术决策见 `design.md`；可验证契约见 `specs/`；执行顺序见 `tasks.md`。
- 本 change 已按方案进入实现与验证，仍未发布。最低版本等门禁以 `docs/verification/tag-management-workbench.md` 的实际证据为准，不能用文档校验或旧功能截图替代。
