# 受审查 inline tag 重写验收记录

日期：2026-08-20

OpenSpec change：`support-reviewed-inline-tag-rewrites`

分支：`codex/support-reviewed-inline-tag-rewrites`

## 结论

受审查 inline tag 重写已通过可重复自动化回归和专用 Obsidian 测试库的核心桌面流程验收。验收中发现并修复一处计划范围缺陷：target-only 文件曾被加入 hydrate，导致默认全选错误显示为 partial；现在只读取真正含 source tag 的文件，并有单测防回归。

当前稳定版 Obsidian 的核心桌面路径可以进入发布准备。最低支持版本 Obsidian 1.8.7 和移动端仍未实机验证，不能据此声称全版本、全设备验收完成。

## 可重复测试环境

- 专用测试库：`/Users/edge/work/obsidian-ai-tag-curator-test-vault`
- Obsidian：`1.13.7`
- 插件：`ai-tag-curator-dev`，版本 `0.3.0`
- 主题：从 `/Users/edge/personal/notes` 同步的 `Obsidian Nord`
- AI：`http://127.0.0.1:18765/v1` 本地确定性 mock，不依赖真实 API、凭据或生产 vault
- 隔离：测试库只含合成笔记，Obsidian Sync 与 Publish 均关闭

每轮回归从以下命令重置相同夹具：

```bash
npm ci --no-audit
npm run release:vault:prepare
npm run release:mock
```

`release:vault:prepare` 会重置文件夹批次与 inline rewrite 两组夹具并重新安装开发插件。inline 夹具固定覆盖：

- frontmatter + inline 混合来源，并保留无关 tag；
- 中文、非 BMP emoji 前缀；
- 同一行重复 occurrence 与 target 已存在；
- CRLF 正文；
- 无 frontmatter；
- 长路径与窄窗口换行；
- target-only 参考文件，用于验证不被错误纳入审查。

mock 可通过 `MOCK_PROVIDER_DELAY_MS=30000 npm run release:mock` 稳定复现长任务进度和执行中交互。

## 自动化结果

以下命令均在最终工作树实际执行并通过：

| 门禁 | 结果 |
| --- | --- |
| `npm run test:e2e` | 3 个文件，20 个测试通过 |
| `npm test` | 45 个文件，161 个测试通过 |
| `npm run build` | TypeScript 检查与生产 bundle 通过 |
| `npm run spec:validate -- support-reviewed-inline-tag-rewrites --strict` | change 严格校验通过 |
| `npm run spec:validate -- --all --strict` | 7/7 OpenSpec 项通过 |
| `npm audit --json` | 开发与生产依赖合计 0 个已知漏洞 |
| `npm audit --omit=dev --json` | 生产依赖 0 个已知漏洞 |
| `git diff --check` | 通过 |

自动化覆盖 occurrence 读取、精确切片、partial 选择、target-only 排除、全量预检零写入、CAS 竞态、补偿、before/after 固定恢复目标、跨插件实例回退、legacy 兼容和全局写入门禁。

## 真实 Obsidian 验收

在活动编辑器打开 `01 Frontmatter and inline.md` 的状态下完成以下路径：

1. 将 mock 延迟设为 30 秒，启动 AI 健康分析；按钮进入禁用的“正在分析”状态，同时仍可切换规则证据 tab、查看证据与相关文件。
2. 本地 AI 返回 `#ml_notes -> #ml-notes` 的可执行 merge；进入审查后，完整计划为 5 篇、2 组 frontmatter、6 个 inline occurrence、剩余 source 为 0。
3. 审查正确显示中文/emoji、重复 occurrence、CRLF、无 frontmatter 和长路径上下文；额外 target-only 文件未进入计划。
4. 逐位置取消一个 occurrence 后，partial 统计与二次确认正确，未选 occurrence 保持 source。
5. 在二次确认后外部修改一个文件，完整 Markdown 冲突被识别；整次零写入，其他文件未变，operation log 仍为空。
6. 重置夹具后完成 partial 混合写入；选中的 frontmatter 与正文 token 改写，无关 tag、target token 和未选 occurrence 保留，生成一条 V2 applied 操作记录。
7. 退出并重新打开 Obsidian；健康行动卡仍识别已应用操作，整体回退成功，operation log 清空。
8. CRLF 文件的正文换行在应用和回退中保持 CRLF。Obsidian 的 `processFrontMatter()` 会把 YAML 内部两行序列化为 LF；这属于 frontmatter API 语义，不影响正文逐字保留契约。

故障注入中的 inline 成功/frontmatter 失败、跨文件失败、before/after 恢复目标与补偿失败由确定性 E2E harness 覆盖；真实宿主 smoke 选择了用户可观察的内容冲突零写入路径，未人为破坏插件持久化文件。

## 截图证据

- `screenshots/inline-tag-rewrites/01-health-loading-interaction.png`：长任务期间切换证据 tab
- `screenshots/inline-tag-rewrites/02-health-action.png`：确定性 AI 行动
- `screenshots/inline-tag-rewrites/03-full-review.png`：完整审查总览与 Unicode occurrence
- `screenshots/inline-tag-rewrites/04-partial-review.png`：逐 occurrence 取消后的 partial 统计
- `screenshots/inline-tag-rewrites/05-partial-confirmation.png`：partial 二次确认
- `screenshots/inline-tag-rewrites/06-conflict-zero-write.png`：完整内容冲突与零写入结果
- `screenshots/inline-tag-rewrites/07-applied-partial.png`：partial 混合写入完成
- `screenshots/inline-tag-rewrites/08-undo-after-reload.png`：重启 Obsidian 后整体回退完成

截图来自用户当前笔记所用的 Obsidian Nord 深色主题。

## 尚未验证的边界

- Obsidian 1.8.7：本机当前只有 1.13.7，尚未安装并验证最低支持版本的真实 `TagCache.position` 行为。
- 移动端：尚未在 iOS/Android Obsidian 验证审查布局、软键盘焦点和真实写入/回退。
- 浅色/窄窗口真实截图：准备切换时 macOS 自动锁屏且 Computer Use 无法解锁；自动化 DOM/CSS 回归已覆盖浅色 class、窄窗口、长路径和 focus，但真实宿主的这两张视觉证据未生成，因此 OpenSpec 10.10 保持未完成。
- 键盘全流程：自动化 DOM 测试覆盖键盘操作与 focus 样式，真实宿主本轮以鼠标/命令面板为主，未单独保存键盘导航录像。
