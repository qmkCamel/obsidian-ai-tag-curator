# 受审查 inline tag 重写验收记录

日期：2026-08-04

OpenSpec change：`support-reviewed-inline-tag-rewrites`

## 自动化覆盖

- occurrence 读取：重复/同一行/嵌套/中文/emoji 前缀/CRLF/frontmatter 边界、cache 缺失、陈旧、越界、重叠与 fallback 只读。
- 计划与 UI：frontmatter/inline 独立选择、逐位置取消、partial、空选择、禁用位置、二次确认、中英文与窄窗口 CSS 边界。
- 写入：完整内容/body SHA-256、token slice、`Vault.process` callback CAS、变长多 occurrence 和正反向逐字往返。
- 事务：frontmatter-only、inline-only、混合单/多文件、全量预检零写入、竞态、逆序补偿、before/after 固定恢复目标和索引刷新失败隔离。
- 兼容与 E2E：legacy cleanup、recommendation、folder batch 与 cleanup V2 混合日志；健康报告审查、partial 应用、缓存不可用禁用、跨插件数据重载整体回退和全局写入门禁。

最终命令结果以本 change 的 `tasks.md` 和交付说明为准。

## 尚未完成的真实 Obsidian 证明

- 尚未运行 `npm run local:install-dev`，因为当前没有用户明确指定的专用、可恢复测试 vault；不得把生产 vault 当作首次正文写入环境。
- 尚未在最低支持版本与当前稳定版 Obsidian 实测 `TagCache.position`，也未覆盖活动编辑器打开时的缓存刷新时序。
- 尚未执行真实桌面深色/浅色、窄/宽窗口、键盘焦点视觉验收，也没有本次 change 的真实截图。
- 尚未验证移动端边界。

因此，当前结论是“代码、OpenSpec 和自动化可进入真实测试库验收”，不是“已经在真实 Obsidian/移动端完成发布验收”。
