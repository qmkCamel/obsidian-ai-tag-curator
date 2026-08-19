## Why

当前版本已经能区分 frontmatter 与正文 inline tags，并能在文件夹批次中用完整内容快照、补偿写入和恢复状态保护 frontmatter 变更；但健康清理的合并/重命名仍只改 frontmatter，导致正文中的旧标签继续留在索引中，用户看到“已清理”却没有得到一致结果。现在适合把既有安全模型扩展到正文中的、由 Obsidian 明确认出的标签位置，同时继续拒绝任意正文重写。

## What Changes

- 为标签健康报告中的确定性 `renameTag` / `mergeTags` 动作增加正文 inline tag occurrence 级审查和改写；frontmatter 与正文中的同一清理动作在一个可恢复事务中完成。
- 点击可执行清理动作后先打开专用审查界面，逐文件展示 frontmatter diff，以及每个正文标签的行号、上下文和 token 级 diff；用户可以逐位置取消，应用前还需二次确认。
- 只信任与当前 Markdown 内容精确匹配的 Obsidian `TagCache.position`；缓存缺失、陈旧或位置不一致时，对应位置不可执行并明确降级为人工处理，不允许用 fallback 正则结果写正文。
- 使用正文相对位置、完整内容快照和 `Vault.process()` 生成最小文本 patch；正文改写只替换完整 `#tag` token，不删除、移动、去重或改写周围文本。
- 将 cleanup 操作日志升级为带 `applying` / `applied` / `undoing` / `recoveryRequired` 状态的可恢复记录，支持全量预检、逐文件 compare-and-swap、失败补偿、插件重载对账和冲突安全回退。
- 保持 AI 只提供解释和候选目标：动作资格、可信位置、最终选择、写入和恢复均由本地确定性规则控制。
- 正文标签新增、删除、拆分、AI 自由改写、文件夹 AI 批次中的 inline 写入，以及自动迁移 inline tags 均保持不支持。

## Capabilities

### New Capabilities

- `reviewed-inline-tag-rewrites`: 定义可信 inline tag occurrence、逐位置预览与选择、最小正文 patch、跨 frontmatter/正文事务、冲突检测、恢复和回退契约。

### Modified Capabilities

- `cleanup-action-capabilities`: 将确定性合并/重命名从“只写 frontmatter”扩展为可审查地更新所有已选择且可信的 frontmatter/inline 来源，并增加不可恢复状态下的全局写入阻断。
- `inline-health-actions`: 将可执行清理项的直接应用入口改为先进入专用变更审查，再二次确认所选文件和 occurrence。

## Impact

- 读取与索引：`src/obsidian/VaultReader.ts`、`src/obsidian/TagParser.ts`、`src/index/TagIndex.ts`、`src/index/TagIndexBuilder.ts`、`src/tags/NoteTagInventory.ts` 需要补充可信 occurrence 与缓存可用性，但不得把完整正文持久化到标签索引。
- 计划与 UI：`src/cleanup/`、`src/preview/TagHealthReportModal.ts`、新增清理审查 Modal/view model、`src/ui/labels.ts` 和 `styles.css` 需要支持来源级/位置级 diff、选择和阻断原因。
- 写入与恢复：新增正文 patch writer、cleanup executor/recovery service，并扩展 `src/operations/OperationLog.ts`、`src/main.ts`；现有 recommendation、folder batch 和历史 cleanup 记录必须保持兼容。
- 测试：扩展 Obsidian harness 的 `TagCache.position`、`Vault.process()`、正文漂移、进程中断和故障注入；增加单元、DOM、E2E 与真实 Obsidian smoke 验证。
- 依赖：以最新 `dev` 已实现的 `NoteTagInventory`、SHA-256 内容快照和文件夹批次恢复状态机为基础，不增加运行时依赖，不扩大 `manifest.json` 的平台范围。
