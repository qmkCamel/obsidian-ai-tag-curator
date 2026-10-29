# 标签关系图实现与验收记录

日期：2026-10-28。实施基线为 `main@664712386524cc7777101b7998fa9f49801d498f`（0.5.0），结果来自其未提交工作区，**尚未发布**。资产哈希用于区分基线提交与实际被测代码。使用说明见[标签关系图](../tag-relationships.zh-CN.md)，清单见[tasks](../../openspec/changes/add-tag-relationship-graph/tasks.md)。

## 实现范围

第三页签及命令、完整范围搜索、局部邻域、显式概览、共现和直接命名层级、Jaccard、双向覆盖率、共同/仅 A/仅 B 分页、零交集比较、只读带入整理均已实现。计算使用内嵌 Worker，失败时显式切换分片关系表；范围变化立即失效旧结果，同范围失败保留已应用参数和旧证据。浏览、比较与交接本身不写笔记、不创建操作、不调用 AI。

## 自动化与 FlowAssert 边界

- `npm test`：61 文件、523 测试通过。
- 浏览器：11 cases 通过，真实 Chrome 156.0.8078.49；Obsidian 适配器为合成夹具，宿主 CSS 1.12.7。无 HTTP 外发，无页面异常，20 次生命周期后资源归零。
- FlowAssert `0.1.0-alpha.2@d6b0b0f9afef0bdd8844f697f5d4df1808dba3c1`：隔离 LocalDeviceRuntime 成功导入真实 JUnit，assetId `12b5fa99-68c4-4c6e-a958-2fce4ceea43a`，导入状态 finished。
- 执行器是 Playwright；FlowAssert 接收、归档测试结果。当前 FlowAssert 原生设备执行器面向 Android/iOS，**没有把 JUnit 导入表述为 FlowAssert 原生 Obsidian 桌面执行**。

可复跑的[用例和运行说明](../../tests/flowassert/README.md)、[case](../../tests/flowassert/cases.mjs)、[真实宿主脚本](../../tests/flowassert/host.mjs)均保留在本仓库。完整运行目录为 `tests/flowassert/artifacts/`（忽略生成文件）；本次选定证据已复制到[证据目录](assets/tag-relationship-graph/)。[浏览器报告](assets/tag-relationship-graph/browser-report.json)、[JUnit](assets/tag-relationship-graph/browser-junit.xml)、[FlowAssert 导入](assets/tag-relationship-graph/browser-flowassert-import.json)保留原始测量，不覆盖失败历史。

## 性能

Apple M2 Pro / 32 GiB / macOS arm64 / Node 24.22.1。固定种子 1k/10k 标签、同数量文件，每文件 10 成员；每组预热 5 次后测量 30 次，每次重新准备 DTO，最多 200 节点/800 边。以下为毫秒 p95，各阶段分位数不能直接相加。

| 夹具 | 成员 | 准备 | 传输 | 统计 | 布局 | 总计算 | SVG 提交 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1k | 10,000 | 20.2 | 11.5 | 7.3 | 143.6 | 184.5 | 6.7 |
| 10k | 100,000 | 494.3 | 35.7 | 56.7 | 131.9 | 720.0 | 5.7 |

计算门禁为 2s/5s。35 次在途交互记录覆盖局部状态反馈、搜索输入到下一动画帧、取消返回；p95 分别为 4.1ms、5.0ms、0.2ms（100ms/250ms 门禁通过）。状态反馈是 DOM 更新测量，不等同于屏幕像素首次绘制。PerformanceObserver 未记录主线程 longtask。200 标签×1k 文件、超过百万成员、32MiB DTO、10 秒总时限分别由模型/服务测试确认有界失败，不采样后冒充精确结果。

## 发布闭包

`d3-force@3.0.0`、`d3-selection@3.0.0`、`d3-zoom@3.0.0` 精确锁定。运行依赖闭包 11 个包：dispatch、drag、ease、force、interpolate、quadtree、selection、timer、transition、zoom、color；除 d3-ease 为 BSD-3-Clause 外均 ISC。类型包为 MIT，仅开发使用。运行许可证正文通过 esbuild banner 随 main.js 保留。

基线 main.js 320,552 字节；本次 439,280 字节，增加 118,728 字节。Worker 自包含 IIFE 以字符串嵌入 main.js，不依赖 CDN、源码文件或额外 Worker 资产。三件套为 main.js、manifest.json、styles.css；测试合成安装仅把 manifest id/name 改为开发隔离名称，因此安装 manifest 哈希与发布 manifest 不同。

| 资产 | SHA-256 |
| --- | --- |
| main.js | `29d369f81a8d002e7d2449233f4c7ecc286b0e0aaf0b13c9752c6415d8f10f56` |
| manifest.json | `2d78963bb5a78c3d5ffe14f480dc6c559e4e5553c487d976e3fb189e36252824` |
| styles.css | `9180e34464f9672e29972634a9f71ac0dc6075c3a7477f061882dd02ef1482d4` |

## 真实桌面宿主

使用官方 1.8.7 与当前稳定 1.14.5 的临时应用副本，创建独立合成 vault/profile，无 API key，不访问个人库。当前版本依据 [Obsidian 1.14.5 发布记录](https://obsidian.md/changelog/2026-10-22-desktop-v1.14.5/)。运行时再次读取实际应用包与 Electron 版本。

两版本关系图核心路径已通过：主窗口 200/800、弹出窗口离线 Worker、只读比较交接、在途打开笔记/搜索/取消/失败保留、索引保存失败保留时间、360/900 深浅主题键盘、完整进程退出重启 stale、原笔记及操作日志不变。既有工作台回归的最终结果见下方补充记录；不能以关系图通过替代写入/撤销回归。

移动端只验证显式不支持分支和保留标签列表入口（DOM Platform stub）；没有进行真实移动设备验收，也不宣称支持移动图谱。

## 规格场景映射

M = `tests/tag-relationship-model.test.ts`，S = `tests/tag-graph-service.test.ts`，D = `tests/tag-management-workbench-dom.test.ts`，B = `tests/flowassert/cases.mjs`，H = `tests/flowassert/host.mjs`，W = `tests/verification/host-workbench.mjs`。下面按规格原场景分组列全；“产品验证”有单独未完成边界。

| capability / 场景 | 对应证据 |
| --- | --- |
| computation：计算期间使用其他功能；快速切换比较与证据分组；刷新或布局失败 | B GRAPH-01/04/05/07，S evidence/version，H in-progress |
| 超预算高密度输入；快照准备超限 | M dense/memberships/bytes，S deadline |
| 新查询先完成；同一索引 revision 下库变化；排除目录变化 | S replacement/vault changes，D scope，B GRAPH-03/07 |
| 过期缓存生成成功；刷新完成更新图谱 | B GRAPH-07，D stale/recovery，H restart/save-failure |
| 离线安装并弹出窗口；连续开关视图 | H offline/popout，S/B 20 cycles |
| 小型和大型固定夹具；最低支持和当前桌面宿主 | 性能报告；H 1.8.7/1.14.5 |
| graph：无 AI 打开关系图；从低频标签详情进入；没有索引 | D initial/entry，M rare，B GRAPH-01，H no-key |
| 修改阈值尚未生成；字面搜索与缩放；选择共现与层级边；切回标签管理 | B GRAPH-01/03/07，D stable container |
| 从正文比较进入整理；取消整理返回比较；整理后核对与撤销；交接期间权限或范围变化 | D handoff/source/stale/context，B GRAPH-01/02，W rename/merge/undo；独立参与者结果尚缺 |
| 过滤后根消失；所有候选均无共现 | M missing root/no-edge，D scope，B GRAPH-02 |
| 仅用键盘检查关系；窄窗口长标签 | B 4 个 layout cases；H narrow-wide-dark-light-keyboard |
| 关系证据支持人工判断 | M/B 验证统计和导航；产品任务 7.6 未完成，见协议 |
| Worker 无法启动；移动端打开图入口 | S failure，B GRAPH-04，D mobile |
| model：同文件大小写与多来源去重；范围和来源共同约束；正文来源没有被索引采集；手算夹具；非法阈值 | M hand calculation/provenance/validation，B GRAPH-02 |
| 父子标签没有共同笔记；缺失中间层级；两类关系同时存在 | M real direct parents，B GRAPH-03 |
| 候选节点和边被限制；单文件包含大量标签；稳定排序与无边节点 | M 250 tags/order/budget；H 200/800 |
| 长尾标签聚焦；根没有合格邻居 | M search-independent neighborhoods |
| 共同文件证据分页；证据文件已删除 | M paginated evidence，B GRAPH-05，H file-open |
| 使用范围包含不等于同义；差集分页与来源一致；零交集标签对；端点变化或重复 | M asymmetric coverage/compare，S evidence/version，B GRAPH-01/02 |

## 剩余产品验证

7.6 未完成：需要独立参与者与固定版本的 Tag Lens / AI Tagger Universe / TagFolder 对照环境，按[产品任务协议](../../tests/flowassert/product-tasks.md)记录时间、步骤、判断、误判和恢复结果。自动化已经验证四类任务的数学/导航基础，但不能充当用户判断质量或竞品操作成本证据。本 change 不归档，产品 TODO 的 P0-4/R-1/R-4 保留；未外联用户，未宣称优于竞品。

## 最终质量门禁

- `npm test`：61 文件 / 523 测试通过；新增回归验证刷新后返回比较不被旧证据任务取消，并明确提示已消失端点。
- `npm run build`、`npm run release:verify`：通过，三项资产哈希如上。
- `npm run spec:validate -- add-tag-relationship-graph --strict`：通过。
- `npm run spec:validate -- --all --strict`：11 项通过。
- `git diff --check`：通过；本次文档本地链接无缺失。
- 浏览器 7 张截图已检查：中英文、深浅主题、窄/宽、键盘焦点、取消后旧结果；滚动到证据时上部控件在滚动区域外是预期行为。最终复跑截图哈希与已检查版本一致。

未创建提交、推送、发布或安装到个人库。

## 真实宿主最终回归结果

最终资产上，1.8.7 与 1.14.5 各 10 个宿主检查通过（其中一项调用既有管理回归）。两版本各 15 个管理回归检查通过，包含改名、合并、保护、冲突零写入、活动编辑器一致性、重载后撤销及弹窗设置。报告：[1.8.7](assets/tag-relationship-graph/host-1.8.7-report.json)、[其管理回归](assets/tag-relationship-graph/host-1.8.7-management-report.json)、[1.14.5](assets/tag-relationship-graph/host-1.14.5-report.json)、[其管理回归](assets/tag-relationship-graph/host-1.14.5-management-report.json)。

弹窗模态框验证的限制：CDP 环境不能可靠触发原生 window focus，脚本记录后派发 focus 事件，执行 Obsidian 自身的真实焦点处理器，再用 CDP 鼠标操作。模态框 ownerDocument、取消关闭和历史均通过；**未将此计为物理鼠标/原生窗口激活验收**。报告的 `inputLimitations` 保留该限制。初期失败报告保留在本地 artifacts 与 host regression 目录。

截图复核补充：真实宿主的 360px 是窗口视口，已关闭测试打开的 Markdown 分屏再验证单工作台；图谱截图滚动到 SVG 可见区域。对应[1.8.7 截图报告](assets/tag-relationship-graph/host-1.8.7-visual-report.json)、[1.14.5 截图报告](assets/tag-relationship-graph/host-1.14.5-visual-report.json)均为最终资产，各 9 项图谱检查通过。已检查两版本概览与窄屏暗色截图；[当前宿主图谱](assets/tag-relationship-graph/host-1.14.5-overview.png)、[当前宿主窄屏比较](assets/tag-relationship-graph/host-1.14.5-360-dark.png)。这些补充运行不重复管理回归，管理回归依据上节独立报告。
