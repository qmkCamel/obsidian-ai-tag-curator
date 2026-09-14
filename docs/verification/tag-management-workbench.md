# 标签管理工作台验证记录

更新日期：2026-09-14，Asia/Shanghai。实现位于 `feat/tag-management-workbench`，基于 dev `959429f9e0d3509aaaaa255a86f78f589be2a313`；包含未提交文件，基线 SHA 不能单独复现本轮代码。本记录区分 Node、浏览器模拟和真实宿主，不表示已经发布。

## 1. 环境与交付范围

| 项目 | 本次实测 |
| --- | --- |
| 工作目录 | `/Users/edge/side/tag_curator-tag-management-workbench` |
| 机器 / 系统 | Apple M2 Pro，darwin arm64，macOS 26.6.2 build 25G83 |
| 测试运行时 | Node v26.7.0，Vitest 4.1.10 |
| 浏览器视觉 | Chrome + Playwright；生产 View/Modal/CSS，合成 Obsidian API 和数据 |
| 真实宿主 | 本机安装的 Obsidian 1.13.7；不据此宣称它是全网最新稳定版 |
| 最低支持版本 | manifest 声明 1.8.7，本机没有该版本，未验证 |
| 宿主测试库 | `/tmp/tag-curator-workbench-Y7AbTM/vault`，独立 profile、并排开发插件 |
| 未执行 | 生产库安装、版本变更、commit、push、release、归档 |

本轮完成原生工作台、精确改名/合并、范围/保护策略、原值 patch、统一事务协调与持久化、跨类型历史和撤销。未增加图谱、批量删除、大小写美化、子标签级联或移动端原生模型桥接。

## 2. 自动化回归

实际执行：

```bash
npm test
npm run build
npm run spec:validate -- add-tag-management-workbench --strict
npm run spec:validate -- --all --strict
git diff --check
```

2026-09-14 17:16:49、17:17:36 CST 连续两轮全量测试均为 59 文件、492/492 通过，总时长分别 4.02s、3.72s。构建、单 change 严格校验、全量 10 个 specs/change 严格校验及 diff 检查通过；另检查未跟踪文本文件，无尾随空白。单元和 harness E2E 不等于真实 Obsidian 的文件系统、编辑器或 YAML 实现。

旧 E2E 中“第一笔 Markdown 写入可见就继续发起命令”的等待条件已收紧为结果完成或 lease 释放，避免把仍在日志持久化/刷新阶段的 busy 拒绝误报为数据错误；没有移除原有内容断言。

重点回归包括原值大小写/重复项/顺序/CRLF/非 BMP、全文 CAS、可信完整 inline token、预检后竞态、intent-before-write、补偿失败及跨重载撤销；全局最新操作资格、旧卡片 recordId、legacy 只读降级、未知日志门禁、未解决记录保留和 UTF-8 预算；精确 source-only 文件集合、200 文件上限、分页、无 key/无活动文件、保护源/目标，以及保存失败、取消/策略 revision、scope-only 保存和失效目录。

## 3. Node 性能与有界性

命令于 2026-09-14 16:58:04 CST 运行，49/49 通过，总时长 615ms；未隔离系统其他负载。

```bash
npm test -- tests/tag-index-service.test.ts tests/tag-management-view-model.test.ts --reporter=verbose --silent=false --no-file-parallelism
```

暖查询夹具为 N 个不同标签、各一个文件，`tag-00000` 编号，inline 来源；同一 ViewModel 预热 5 次、采样 30 次，搜索匹配全部标签但仅投影首页 100 行。缓存聚合/排序已预热，`performance.now()` 只包围 query，不包含 DOM、paint、I/O 或 provider。p95 取排序后第 29 个样本，不删除离群值。

| 标签/文件数 | 最小 ms | p95 ms | 最大 ms | 返回行 |
| --- | --- | --- | --- | --- |
| 1,000 | 0.039875 | 0.094041 | 1.647500 | 100 |
| 10,000 | 0.257041 | 0.301541 | 0.309167 | 100 |

流式刷新夹具每文件即时生成 1,024 字节 ASCII 正文，经 microtask 返回；每文件关联专属标签、shared 和一个 group，共 N+11 个标签。persist 为内存 no-op，不包含真实 hash、YAML、metadataCache、磁盘或 saveData；每规模只测一次，不能称为 p95。

| 文件数 | 单次刷新 ms | readNote 次数 | persist 次数 | 读取峰值 | 每标签示例上限 |
| --- | --- | --- | --- | --- | --- |
| 1,000 | 30.833333 | 1,000 | 1 | 4 | 3 |
| 10,000 | 256.538958 | 10,000 | 1 | 4 | 3 |

挂起四个读取时，cancel 到 refresh 返回的受控单次延迟为 0.015667ms。旧代 I/O 继续占用槽位，晚到结果不覆盖新代；若四个读取永久挂起，新代也须等槽位。未测 peak heap/RSS 或真实宿主忙碌线程下的取消保证。

## 4. 浏览器视觉与交互

脚本：`tests/verification/workbench-screenshots.mjs`；[结构化报告](assets/workbench-ui-2026-09-14T09-00-01-480Z-layout-report.json)及同前缀 84 张 PNG。使用生产 UI 与本机 Obsidian app.css，但宿主 API/数据/执行为合成实现，不属于真实 vault E2E。

覆盖 900px/360px、深浅主题、长中文标签/路径、空/忙/错误/过期状态、分页选择、规则跳过、部分处理、冲突、恢复详情和键盘焦点。标签 DOM 上限 100 行，相关文件首/次页 50/3 行。

| 宽度 / 主题 | 1k input 到同步 DOM p95 ms | 10k p95 ms |
| --- | --- | --- |
| 900 / 浅 | 5.2 | 5.2 |
| 900 / 深 | 5.0 | 3.9 |
| 360 / 浅 | 2.9 | 4.6 |
| 360 / 深 | 2.9 | 4.7 |

每组预热 5 次、采样 30 次。不含 paint、服务刷新、vault I/O 和持久化，不代表宿主交互延迟。DOM 单测另有 53/53 通过。

截图后仅修正英文单数 `1 files` 为 `1 file`，未重跑截图；View、Modal、CSS 和夹具不变。`managementLabels.ts` 截图时 SHA-256 为 `2b47e19669ae48632c698f9844b336ca374e0a21dc17743c0ef91275977cf3aa`，修正后为 `cb349535db02582814ebf809c4ca9232576c77ff40f72cc7c34400c53ff38ce7`。旧截图可能仍显示该单数文案，不能声称所有截图与最终源码字节完全一致。

## 5. 持久化审查与修复

9 月 10 日曾发现共享保存队头没有重验 generation、保存前提前发布候选索引。本轮已修复：

- `PluginDataStore.save(beforeSnapshot, transformSnapshot)` 在队头执行 guard，再用最新完整状态投影 detached payload，不捕获旧 operations/policy 覆盖新事务。
- main 不在保存前赋值候选，只订阅 TagIndexService 已提交快照。失败保留旧索引及 sticky 只读错误门禁。
- 已开始的 saveData 无法取消；若取消发生在磁盘写入期间，后续排队恢复派生索引，仍基于最新事务状态。取消不等于磁盘完全没有变化。
- 策略更新使用 `setPolicy(next)` 传入最新排除列表；仅改工作台 scope 不清索引、不递增 policy revision，但使旧审查失效。
- MutationCoordinator 和订阅通知隔离观察者异常，UI 报错不能打断真实事务释放或改变写入结果。
- OperationLog 每次更新、finalize 和保存失败回退均递增内存 revision；历史缓存跟随该 revision，避免错误通知期间缓存的临时 receipt 掩盖恢复记录。有订阅视图的故障注入覆盖此路径。
- 批次撤销在调用 writer 前登记所有 attempted 文件；写入已生效后抛错时重新分类并补偿，不能漏掉报错文件后宣布 applied。补偿失败保留 `recoveryRequired/target=after`；六个新增用例覆盖单/多文件、post-write rejection、补偿失败与重载恢复。

`tag-index-service.test.ts` 保留三个旧 adapter/API 陷阱的诊断复现。它们断言旧错误能被复现，绿色不是修复证明；当前 main 接入的回归位于 `tests/e2e/tag-management-workbench.e2e.test.ts`，以真实插件 adapter 和受控保存队列验证。

## 6. 真实 Obsidian 验收

脚本：`tests/verification/host-workbench.mjs`；[宿主报告](assets/host-workbench-report.json)，17 张关键态为 `assets/host-*.png`。运行前核验测试库路径、版本、开发插件 ID；没有访问生产笔记库。

Obsidian 1.13.7 完整验收 16/16 通过：无 key/无活动文件打开与复用、刷新排除、混合属性/正文改名、合并既有目标、插件重载后历史与撤销、保护源/目标零写入、审查后修改冲突零插件写入、活动编辑器改名与撤销，以及浮出窗口中的工作台/策略弹窗/历史切换/关闭。截图捕获全部成功，测试后未完成操作为 0。

捕获到的外部请求为 0，限于脚本观察时间窗。宿主 YAML 探针覆盖普通数组、多行字符串、嵌套对象、锚点、非 tags 属性，语义往返通过。混合改写恢复原始 tags 值和正文；YAML 引号/排版仍可能改变，不承诺字节级恢复整个 frontmatter。

最终修复后的构建另做 [独立冒烟](assets/host-final-smoke-report.json)：8/8 通过、7 张截图成功，覆盖 reload、浮窗、跨 reload 撤销、监听器异常隔离与订阅释放。15 篇既有合成笔记未变，未完成操作为 0。原完整报告及 17 张截图保持不变；最终冒烟没有重复 P1/P2 磁盘故障注入，这两项由自动化回归证明。

最终冒烟安装的 `main.js` SHA-256 为 `cc2e609443e5e481efd1fe74ae840266700a748be6138f40c06a27eef6863d63`，与当前构建一致；`styles.css` 为 `5f90069d131151033bd7719b551dc7455cd41962bebc9b4ec2e2daf9f07fe72f`。完整 16 项验收使用更早构建，其哈希在原报告中保留，不声称它与最终产物一致。

## 7. 未关闭的发布门禁

- **Obsidian 1.8.7 未运行**：最低版本的位置缓存、混合写入、活动编辑器、浮出窗口与跨重载恢复仍须专门验证。本机无该版本，下载查询遇到 HTTP 403，没有降级系统安装。
- iOS/Android 未验证；360px Chrome 截图不等于移动端 Obsidian 验收。
- 真实宿主只做开发插件重载，未做整个应用重启；部分 I/O 失败/补偿后的恢复由 harness 故障注入覆盖，未在真实宿主故意破坏磁盘写入。
- 浏览器输入指标不覆盖 paint、冷启动、复杂范围/高扇出或真实磁盘性能；宿主截图也不是全设备测试。
- 历史 [inline 验收](../acceptance/reviewed-inline-tag-rewrites-acceptance.zh-CN.md) 的最低版本未完成项继续保留，不用本轮桌面结果替代。

tasks 9.5 保持未完成。代码回归、视觉证据和已安装宿主验收可以分别完成，但不得因此归档整个 change 或宣布发布门禁全绿。版本、生产安装、提交与发布等待用户明确请求。
