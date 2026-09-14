# 标签管理工作台 UI 与合成 DOM 验证

日期：2026-09-14，Asia/Shanghai。目录：`/Users/edge/side/tag_curator-tag-management-workbench`，分支：`feat/tag-management-workbench`，未提交工作区。

## 证据边界

- 本轮使用独立 headless Playwright/Chrome，加载实际 `TagManagementView`、Modals、labels 和 `styles.css`，以公开 API 形状的 shim 替代 Obsidian。没有连接真实 Obsidian、用户浏览器、用户 vault、个人配置或 CUA。
- 仅从已安装应用的 `obsidian.asar` 读取静态 CSS。其 package version 为 **1.6.5**，这是 CSS 资产版本，不是运行的宿主版本，也不证明最低支持版本或当前稳定版兼容。
- Chrome **152.0.7977.83**，Node **v26.7.0**，darwin/arm64，Apple M2 Pro（12 核、32 GiB RAM），Darwin 25.6.0。未隔离其他进程负载。
- 运行中所有业务 commands 都是内存 fake。恢复冲突是注入的 UI 状态，不是文件预检/零写入/事务恢复的实际证明。没有 provider、索引服务刷新、vault I/O、持久化或真实移动设备成本。
- 本轮未手动修改 `src/main.ts`、`main.js`，未执行会写根目录 `main.js` 的 `npm run build`，未安装、commit、push 或勾选整个 OpenSpec change。其他参与者在并行更新 main/core/tests，不能把整个工作区 diff 归为本轮 UI 改动。
- 原 `tag-management-workbench.md`、6 张 `workbench-baseline-*.png` 和 baseline JSON 的 SHA-256 与本轮开始时相同，全部保留。新报告/截图使用时间戳，不覆盖旧证据。

## UI 收尾与接入契约

- 开始时 history 搜索、来源/状态筛选、本地化以及 `/[^\p{N}/]/u` 已实现，但对应 DOM 断言仍匹配旧文案。本轮修正断言，并覆盖 `123/456`、全角/阿拉伯数字层级、Unicode 数值，以及带字母/下划线/连字符的合法层级，与两个 core validator 实际比对。
- history 支持本地化字段、文件路径、原值及最小 inline token 搜索；未知来源/状态进入 unknown 筛选。窄屏改变筛选回到列表，清除后焦点回搜索框；筛选不重算撤销资格，隐藏未解决操作仍阻止前向修改。
- 历史文件详情按 50 行分页；标签列表 100 行、相关文件 50 行保持不变。补充删除保护规则后的焦点、原生 text 输入框、窄屏英文筛选标签上下排列及最小控件高度。
- `TagManagementState.invalidFolders?: string[]`：直接使用 adapter 提供的失效目录，在工作台和已打开的策略弹窗通过 `aria-live` 即时提示；无需等到保存。UI 不猜测目录 rename、不擅自迁移规则。main 的 scope/excluded 与 vault 目录比较仍由接入 owner 负责。
- `ManagementHistoryEntry.model?: string`：详情及撤销/恢复确认只显示记录值。recommendation/batch 缺失或空白时显示未知；manual/health 无 model 时省略。绝不从当前模型配置补历史。
- legacy 明确原始标签值/排版不一定保存、缺失不可恢复；非 legacy 提示有原值证据时可保留原值，但不保证 YAML 排版不变。

## 实际测试

| 命令 / 验证 | 结果 |
| --- | --- |
| `npm test -- tests/tag-management-workbench-dom.test.ts` | 最终 50/50，通过；17:00:25 CST，628ms |
| `npm test` | 最终 57 文件、466/466，通过；16:57:59 CST，3.14s |
| `npm test -- --no-file-parallelism` | 57 文件、466/466，通过；16:57:00 CST，11.13s |
| `npx --no-install tsc --noEmit --skipLibCheck` | exit 0 |
| esbuild 生产参数、`write:false` | exit 0，内存 bundle 318479 bytes；不生成/覆盖 main.js，不等同于声称跑过 npm run build |
| `npm run spec:validate -- add-tag-management-workbench --strict` | 有效，exit 0 |
| `git diff --check` | exit 0 |
| `node tests/verification/workbench-screenshots.mjs` | 最终 84/84 截图布局检查、8/8 DOM 性能组通过，0 page errors、0 外部请求尝试 |

首轮 DOM 是 22/24，2 项旧断言失配已修正。全库首轮是 461/462，`folder-batch.e2e.test.ts` 的 `keeps local inline sync review when folder or single-note AI fails` 在等待撤销标签时失败；单独复跑 1 通过/11 跳过，随后串行及默认全量都通过。并行工作区期间测试数由 462 变为 466；本轮没有修改该失败用例或 main，不将复跑通过当作已定位/修复根因。

## 视觉矩阵

最终运行：**17:00:01.480–17:00:19.987 CST**。

[完整布局与性能报告](assets/workbench-ui-2026-09-14T09-00-01-480Z-layout-report.json) 含生产入口/夹具 SHA-256、每张图路径、主题、语言、视口、DOM 行数/元素数、scrollport 尺寸、控件重叠/横向溢出/过小筛选框检测和 30 个原始性能样本。

- 900×900、360×900；每种浅色/深色主题各 17 个交互状态，合计 68 张。包括标签、长路径、history 列表/详情/筛选/无结果/legacy、policy、失效目录、恢复/注入冲突、英文 policy/manual/history 键盘状态、索引错误。
- 另有 8 组性能夹具的标签/相关文件截图，共 16 张；总计 84 张。
- 重叠以视口和所有滚动祖先裁剪后的可见矩形计算，不把滚动区域已裁掉的内容误当成底栏重叠。横向检查仍覆盖已布局的屏外行；正文和控件均检查。允许正常纵向滚动，文本输入框内部横向滚动不是路径丢失。
- 实测发现并修复了 360px 英文 history 标签与 select 互相挤压；截图复核又发现纵向 flex 使 select 高度缩小，补 `min-height:32px` 和 `flex:0 0 auto`，检测新增筛选框至少 28px 门禁。
- 已直接复核宽/窄、浅/深、长路径、model、legacy、失效规则和性能关键截图。自动测量不能替代真实 Obsidian 主题、浮出窗口、原生焦点陷阱或移动端验收。

关键图：

| 内容 | 截图 |
| --- | --- |
| 900 深色长路径 | [查看](assets/workbench-ui-2026-09-14T09-00-01-480Z-900-dark-long-path.png) |
| 360 浅色英文 history | [查看](assets/workbench-ui-2026-09-14T09-00-01-480Z-360-light-history-keyboard-en.png) |
| 360 浅色历史 model | [查看](assets/workbench-ui-2026-09-14T09-00-01-480Z-360-light-history-readonly.png) |
| 360 深色 legacy | [查看](assets/workbench-ui-2026-09-14T09-00-01-480Z-360-dark-history-legacy.png) |
| 900 浅色 policy | [查看](assets/workbench-ui-2026-09-14T09-00-01-480Z-900-light-policy.png) |
| 360 浅色失效规则弹窗 | [查看](assets/workbench-ui-2026-09-14T09-00-01-480Z-360-light-policy-invalid-folders.png) |
| 900 浅色 10k 标签 | [查看](assets/workbench-ui-2026-09-14T09-00-01-480Z-900-light-performance-10000-tags.png) |
| 360 深色 10k 相关文件 | [查看](assets/workbench-ui-2026-09-14T09-00-01-480Z-360-dark-performance-10000-files.png) |

## Task 9.3：真实浏览器 DOM/UI 筛选性能

这不是纯 Node query，也不是真实 Obsidian。计时运行在 Chrome DOM 上，调用实际生产 `TagManagementView` 的 input handler。每组固定先 mount/暖初始查询，再预热 5 次、采样 30 次；保留全部样本，p95 取升序第 `ceil(30×0.95)=29` 项，不删除慢样本。8 组按固定顺序执行，共 240 个测量样本；小于计时器分辨率的差异无解释价值。

夹具：N 个 `tag-00000` 起的五位编号标签，每标签 1 个唯一文件，首标签另有 52 个唯一文件，故总文件/关联数分别为 1052/10052；每个关联同时标记属性和正文，legacy count 为故意不可信的值。没有片段、正文、外部请求或 fake 服务耗时。索引创建与首次挂载不计时。

输入交替 `tag-0` / `TAG-0`，每次匹配所有 N 个标签但只渲染首屏 100 行。在同一个浏览器任务内，用 `performance.now()` 包围设置已有 search input 值及同步派发 `input` 事件，包含查询、整视图 DOM 重建、icon shim、焦点/光标恢复。输入查找及断言/行计数在计时外。没有 debounce，不等待 animation frame/paint；不能解读为真实打字到屏幕可见的延迟。

| 标签数 | 宽度 | 主题 | min ms | p95 ms | max ms | 标签行 | 相关文件首/次页 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1000 | 900 | 浅 | 2.9 | 5.2 | 5.3 | 100 | 50 / 3 |
| 10000 | 900 | 浅 | 3.1 | 5.2 | 5.5 | 100 | 50 / 3 |
| 1000 | 900 | 深 | 2.9 | 5.0 | 5.2 | 100 | 50 / 3 |
| 10000 | 900 | 深 | 3.0 | 3.9 | 6.1 | 100 | 50 / 3 |
| 1000 | 360 | 浅 | 2.7 | 2.9 | 3.0 | 100 | 50 / 3 |
| 10000 | 360 | 浅 | 2.9 | 4.6 | 6.1 | 100 | 50 / 3 |
| 1000 | 360 | 深 | 2.7 | 2.9 | 2.9 | 100 | 50 / 3 |
| 10000 | 360 | 深 | 2.9 | 4.7 | 5.7 | 100 | 50 / 3 |

每组测量后的工作台 DOM 共 565 个后代元素；30 次采样的 `observedTagRows` 均为 100。相关文件行数在计时后实际点击首标签、再点击下一页测得，不拿 query 返回数量替代 DOM。该合成 UI 计时均低于 150/300ms 参考预算，但没有测高扇出最坏情况、冷首次挂载、service 刷新、内存峰值、paint、真实宿主或手机性能。

owner 提供的纯 Node 1k **0.094ms** / 10k **0.302ms** 是另外一次仅 query 的测量，本轮未重测；不得与上述 UI 计时混用，不能通过相减推算服务/渲染成本。Task 9.3 的浏览器 DOM 子证据已补齐，宿主与全链路门禁仍需各自验证。

## 复跑

从本 worktree 运行 `node tests/verification/workbench-screenshots.mjs`。每次生成新时间戳的 PNG/JSON，并在末行输出报告绝对路径。依赖已有 esbuild，以及默认 `~/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules` 中的 Playwright/lucide；可用 `CODEX_BROWSER_PACKAGES` 指向可用运行时。`CHROME_EXECUTABLE`、`OBSIDIAN_ASAR` 可显式覆盖可执行文件和只读 CSS 资产路径。不使用现存浏览器 profile、CDP 或 vault。

按 owner 要求，资产目录仅保留本轮最终完整成功批次 `09-00-01-480Z`（84 张图及 1 份报告）、原有 baseline（6 张图及 1 份报告），以及其他任务生成的 23 份 `host-*` 验收资产；后者不是本轮成果，未改动。本轮旧脚本输出及三轮中间批次共 218 项已移动到 `/tmp/tag-curator-workbench-Y7AbTM/visual-archive`，未删除。归档的 `ui-archive-manifest.json` 记录移动文件与全部保留资产的 SHA-256，移动后逐项校验。旧失败和中间成功报告只供本机追溯，不作为最终验收引用；临时目录不是持久交付位置。本节全部图文链接均指向最终成功 run，无 UI 变动不再完整重跑。
