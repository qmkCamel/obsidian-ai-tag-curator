## 背景

插件已经有只读标签健康报告和清理计划。健康问题目前带有 `suggestion` 字段，粗略分为 `merge`、`rename`、`observe` 和 `deprecate`。这些标签适合解释问题，但会把诊断语言和潜在执行语义混在一起。

产品方向要求任何写入流程都必须具备预览、明确确认、操作日志和撤销。本变更在动作能力模型内同时纳入这些安全边界，只允许确定性合并/重命名动作进入手动执行路径。

## 目标 / 非目标

**目标：**

- 为标签清理建议定义稳定的动作模型。
- 将“不可执行”变成明确的一等状态。
- 确保仅观察建议不会展示应用控件。
- 为确定性合并/重命名动作提供带预览、操作日志和撤销的手动执行能力。
- 约束 AI 增强分析只能作为解释和排序辅助，不能决定动作是否可执行。
- 保持高不确定性动作不可执行。

**非目标：**

- 批量自动执行清理动作。
- 修改正文 inline tags。本阶段暂不支持的原因是正文标签可能属于原文语义，也可能出现在引用、代码块、链接或模板里；安全支持需要位置级 diff 预览、位置级操作日志、回退与冲突检测。
- 对低频、过宽、废弃类动作提供一键处理。
- 使用 AI 判断动作是否可执行。
- 替换现有健康分析规则。

## 建议模型

```ts
export type TagCleanupActionKind =
  | "mergeTags"
  | "renameTag"
  | "removeTag"
  | "observeOnly"
  | "splitBroadTag"
  | "manualReview";

export type TagCleanupActionAvailability =
  | "executable"
  | "previewOnly"
  | "observeOnly"
  | "manualReview";

export interface TagCleanupActionCapability {
  kind: TagCleanupActionKind;
  availability: TagCleanupActionAvailability;
  riskLevel: "low" | "medium" | "high";
  requiresTargetTag: boolean;
  requiresFilePreview: boolean;
  supportsBatch: boolean;
  defaultSelected: boolean;
}
```

## 动作矩阵

| 健康问题 / 建议 | 动作类型 | 可用性 | 原因 |
| --- | --- | --- | --- |
| 近似重复 / 合并 | `mergeTags` | 可执行 | 有确定目标标签和文件预览，可手动应用并回退。 |
| 命名漂移 / 重命名 | `renameTag` | 可执行 | 有确定目标标签和变更前后预览，可手动应用并回退。 |
| 层级不一致 / 重命名 | `renameTag` | 可执行 | 有确定目标标签和变更前后预览，可手动应用并回退。 |
| 过细标签 / 废弃 | `removeTag` | 仅人工判断 | 移除标签可能损失检索价值，暂不提供一键处理。 |
| 低频标签 / 观察 | `observeOnly` | 仅观察 | 低频本身不足以证明应该修改。 |
| 过宽标签 / 重命名 | `splitBroadTag` | 仅人工判断 | 拆分过宽标签需要理解笔记语义，不应自动化。 |

## UI 决策

1. 清理计划卡片展示动作能力状态，而不是只展示建议文案。

   示例标签：

   - `可执行`
   - `仅预览`
   - `仅观察`
   - `需人工判断`
   - `高风险，暂不支持执行`

2. 只有 `executable` 动作展示“应用”控件。

   仅观察和人工判断卡片可以展示证据和相关文件，但不能展示类似“应用”的控件。

3. 用户点击“应用”前，卡片中必须已经展示受影响文件和变更前后标签。

   当前执行只修改 frontmatter tags；正文 inline tags 仍需人工处理。

4. Markdown 导出包含动作可用性。

   这样可以避免导出的计划看起来像一组可安全执行的命令。

## 安全规则

- `observeOnly` 永远不能渲染应用按钮。
- `manualReview` 永远不能渲染应用按钮。
- `previewOnly` 可以渲染预览和导出文本，但不能提供写入动作。
- `executable` 必须有非空目标标签、受影响文件预览、操作日志记录和撤销路径。
- AI 增强分析不能将任何动作升级为更高可执行级别。
- 如果 AI 输出与本地动作矩阵冲突，必须以本地动作矩阵为准。
- 任何会修改多个文件的动作都必须要求受影响文件预览。
- 任何带有 `requiresTargetTag` 的动作，如果没有非空目标标签，就不能变成可执行。

## 写入与撤销策略

- 应用动作时逐文件读取当前 frontmatter tags。
- 只替换清理预览中的相关标签：把 `beforeTags` 中出现的标签替换为 `afterTags`。
- 如果某个预览标签只来自正文 inline tags，frontmatter 中不存在该标签，则该文件不会被写入。
- 操作日志记录 item id、动作、标题、每个受影响文件的写入前 tags 和写入后 tags。
- 回退时要求当前 frontmatter tags 仍等于日志中的写入后 tags；如果用户后续手动改过同一文件，回退必须阻止覆盖。

## AI 增强分析配合方式

AI 增强分析可以参与“理解和排序”，但不能参与“授权执行”。也就是说，AI 输出应被看作解释层和建议层，本地 action capability model 是安全边界。

AI 可以做：

- 为健康问题补充更自然的诊断说明。
- 对清理计划项进行优先级排序建议。
- 解释为什么某个标签组值得优先处理。
- 为 `mergeTags` 或 `renameTag` 提供候选目标标签。
- 为 `manualReview` 项补充人工复核注意事项。

AI 不可以做：

- 将 `observeOnly` 改成 `previewOnly` 或 `executable`。
- 将 `manualReview` 改成 `previewOnly` 或 `executable`。
- 在没有本地文件预览的情况下声明某个动作可以执行。
- 绕过本地 action capability 对预览、操作日志和撤销的要求。

合并策略：

- 本地规则先生成 action capability。
- AI 输出只能附加 `aiReason`、`aiPriorityHint`、`aiTargetTagCandidate`、`aiRiskNote` 这类解释性字段。
- 如果 AI 建议的目标标签为空或与本地约束冲突，该建议只作为文本展示，不进入计划后的标签变更预览。
- Markdown 导出中应区分“本地动作能力”和“AI 辅助建议”，避免用户误以为 AI 建议等同于可执行命令。

## 风险 / 权衡

- [风险] 动作状态变多后 UI 可能显得更重。-> 缓解：使用紧凑 badge 和短标签。
- [风险] 用户可能以为仅预览动作可以执行。-> 缓解：明确标注“仅预览”，并保持按钮只面向复制/导出。
- [风险] 合并/重命名可能误改 frontmatter 标签。-> 缓解：仅允许手动点击应用，并要求预览、日志和撤销。
- [风险] 正文 inline tags 不会被同步修改。-> 缓解：UI 文案明确当前仅写入 frontmatter tags。
