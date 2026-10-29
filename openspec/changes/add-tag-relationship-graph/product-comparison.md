# 标签关系探索：同类产品对比

调研日期：2026-10-28（Asia/Shanghai）。本项目基线：0.5.0 / `6647123`，图谱仍为提案。

本轮补充上一轮偏重原生 Graph 与渲染技术的调研。依据为作者仓库 README、官方文档及两个直接对标的关键源码；没有安装或实际操作这些产品，也没有同库性能或可用性对测。因此，下文描述其文档中的产品能力，交互成本与定位差异是本项目判断；没有在资料中找到的能力不等于产品不存在该能力。

## 1. 结论

已有插件直接覆盖“标签网络”“共现强度”“Jaccard”“点击查看共同笔记”。本项目不能把这些能力或“本地运行”当作独有卖点。最直接的图谱对标是 **Tag Lens** 和 **AI Tagger Universe**；整理工作流的对标是 **Tag Wrangler**。

适合我们的方向是：把关系探索接到现有标签管理工作台，支持从关系证据形成整理判断，再通过既有审查、修改、历史与恢复流程执行。用户已采纳此方向，P0 修订已同步至本 change 的 proposal/design/specs/tasks；后续阶段见[产品 TODO](../../../docs/product-todo.zh-CN.md)。这个集成价值仍是待验证的产品假设，不是已经赢过竞品的结论。

## 2. Obsidian 插件

| 产品与一手来源 | 产品形态 | 主要解决的问题 | 与我们提案的关系 |
| --- | --- | --- | --- |
| [AI Tagger Universe](https://github.com/Agents365-ai/obsidian-ai-tagger-universe/blob/main/README.md) | AI 标签生成/批处理工具，附独立标签网络视图；可搜索、调斥力/距离、点节点看笔记、随标签变化刷新 | 少花时间打标签，并浏览生成或已有标签之间的连接 | “节点连线 + 标签频率 + 关联笔记”已重合。我们拟强调精确来源、共同文件证据、只读图与已有受审查治理衔接 |
| [Tag Lens](https://github.com/laximgqozaZZZYT/tag-lens/blob/main/README.md) | 共现热力图、交集格、BubbleSets、图标画廊；统一过滤/笔记/显示/Insight 面板，支持保存 Lens | 理解多重标签归属、复杂交集及知识连接，降低单一力导向图的混乱 | 最直接。已提供本地运行、属性/正文标签、Jaccard 和点击共同笔记；我们首版的分析/视图广度较小，优势只能来自具体治理流程整合 |
| [TagFolder](https://github.com/vrtmrz/obsidian-tagfolder/blob/main/README.md) | 左侧标签文件夹树、组合下钻、搜索和笔记列表 | 不移动实际文件，也能按多标签逐步缩小查找范围 | 同样消费标签成员关系，但优先找笔记。启发是关系浏览不必始终用图，列表与渐进筛选应有完整价值 |
| [Tag Wrangler](https://github.com/pjeby/tag-wrangler/blob/master/README.md) | 原生标签视图/正文右键菜单、拖动重组、Tag Page、重命名 | 用户已有整理意图时，快速改名、重组层级或把标签变成有说明的页面 | 更接近治理动作。其 README 明示合并不可简单撤销，父标签改名连带后代；我们的 0.5.0 是精确标签审查、来源/位置选择及历史恢复，不能只比较“都有改名” |
| [ExcaliBrain](https://github.com/zsviczian/excalibrain/blob/master/README.md) | 依赖 Excalidraw/Dataview 的结构化局部思维图，按父/子/朋友/兄弟等关系导航 | 看懂当前笔记的上下文和显式或推断的笔记关系 | 核心节点是笔记，语义来源是链接/字段。可借鉴局部焦点和明确关系类型，不能把其“父子”与标签 `/` 层级等同 |
| [Extended Graph](https://github.com/ElsaTam/obsidian-extended-graph/blob/main/README.md) | 增强原生 Graph 的图像、形状、过滤、保存视图、聚焦、固定节点及 SVG 导出 | 把现有图变成可定制的浏览和展示工具 | 强在图的表现与控制。作者说明核心 Graph 缺少 API/文档，有实验性兼容问题；支持我们继续使用独立公开 ItemView 集成 |
| [Juggl](https://juggl.io/juggl.html?mark=plugin) | 可保存图工作区，展开/折叠/隐藏/固定节点，多布局和 Breadcrumbs 层级集成 | 保留一个主题相关的笔记子图，持续导航与工作 | 对标探索状态和渐进展开，不是标签治理工具；其当前宿主兼容性本轮未实测，不依据旧文档断言维护状况 |

### 直接对标的源码核实

- **AI Tagger Universe**：[tagNetworkUtils.ts](https://github.com/Agents365-ai/obsidian-ai-tagger-universe/blob/main/src/utils/tagNetworkUtils.ts) 的 `buildTagNetwork` 遍历文件中的 frontmatter tags，对同文件标签两两累积连接；本轮查看的这个构图路径没有读取正文 inline tags。[TagNetworkView.ts](https://github.com/Agents365-ai/obsidian-ai-tagger-universe/blob/main/src/ui/views/TagNetworkView.ts) 为 D3 ItemView，提供搜索、斥力、距离和刷新控件。这是已查看路径的源码结论，不是对整个产品所有版本的断言。
- **Tag Lens**：[heatmap-layout.ts](https://github.com/laximgqozaZZZYT/tag-lens/blob/main/src/layout/heatmap-layout.ts) 构建对称标签交集计数矩阵；[heatmap-detail.ts](https://github.com/laximgqozaZZZYT/tag-lens/blob/main/src/interaction/heatmap-detail.ts) 对点击单元格返回去重共同笔记。因此“共同笔记下钻”有源码支持，不能仅把它当成营销表述。

复查指纹（文件 blob SHA，不是 release 或仓库 commit）：AI Tagger Universe `tagNetworkUtils.ts`=`165b37162eba177b2822c279493d28c04e49b3d9`；Tag Lens `heatmap-layout.ts`=`2d9c67b0afa84430be60052f649c171bd6b025b2`、`heatmap-detail.ts`=`e5eb53e14cd6feadcf577b2b9e209695f650a280`。

## 3. Obsidian 之外的产品

| 产品与官方来源 | 产品形态 | 主要解决的问题 | 可借鉴与边界 |
| --- | --- | --- | --- |
| [Heptabase：基本元素](https://wiki.heptabase.com/fundamental-elements)、[组织方法](https://wiki.heptabase.com/organize-knowledge-and-projects) | 卡片、白板、分区、子白板、卡片链接；标签也可作为带属性的记录表 | 围绕学习/研究主题整理材料，通过空间位置与上下文建立理解 | 借鉴按主题组织和保留上下文；它的“卡片在白板的位置”是用户组织，不是我们的统计关系。首版不应扩展成白板编辑器 |
| [TheBrain](https://www.thebrain.com/blog/enabling-ubiquitous-non-linear-visual-knowledge) | 围绕当前 Thought 的关系导航，父/子/兄弟/jump 及图文切换 | 在多维知识结构中找到当前对象、相邻上下文和下一步入口 | 借鉴局部中心、关系类型及图/列表等价入口；无需为了浏览局部关系先展示整个知识库 |
| [InfraNodus](https://infranodus.com/use-case/text-mining)、[分析方法](https://infranodus.com/docs/text-network-analysis) | 输入文本/材料/hashtags 后生成网络，分析主题、重要概念、结构缺口并回看相关原文 | 帮助研究者发现文本主题及尚未建立的连接，形成研究或写作线索 | 借鉴“图用于回答什么问题”和返回证据；其文本窗口共现与本项目整篇笔记的 tag 共现口径不同。官方也支持 hashtag 节点与共现边，所以该模型并不独有 |

这些产品覆盖知识创作、上下文导航和研究发现，与“维护 Obsidian 标签体系”的工作不同。没有足够证据直接比较付费价值、使用留存或性能，本轮不做这些推断。

## 4. 与当前方案的具体比较

| 维度 | 同类已经覆盖什么 | 我们现有/拟交付什么 | 评价 |
| --- | --- | --- | --- |
| 标签共现图 | AI Tagger Universe 已有 | 首版拟提供 | 基础能力重合，不是独有价值 |
| 共同笔记与交并比 | Tag Lens 已有 | 首版拟提供 | 应当具备，但不构成单独差异化 |
| 本地运行、属性和正文标签 | Tag Lens 文档已明确 | 我们已有索引并计划复用 | 基础条件，不能笼统宣称比竞品更隐私或更全面 |
| 复杂关系分析 | Tag Lens 多视图和 Insight；InfraNodus 主题/结构分析 | 首版共现与显式层级、图/表 | 我们分析广度较小；这是范围选择，不应包装为已经更易用 |
| 日常找笔记 | TagFolder 的树与逐步筛选 | 现有列表 + 拟增加关系证据 | 必须证明图能缩短具体任务，而非只增加入口 |
| 关系到整理执行 | Tag Wrangler 快速操作；AI Tagger Universe 标签生成和管理 | 已有精确审查/改名/合并/历史恢复；修订方案增加标签对比较及只读上下文交接 | 待验证能否减少重新查找和误判；导航不预选写入、不传递授权 |
| 分析可解释性 | Tag Lens 已支持交集；不同产品关系语义不同 | 规格明确来源、去重、层级分离、新鲜度和截断 | 边界清晰是目标，尚未实现和实测，不能当作已赢得的优势 |
| 视觉能力和持续使用 | 保存视图/工作区、多布局、固定节点、导出等在多款产品出现 | 首版不保存布局、不导出、静态有界图 | 交付较聚焦，但缺乏持续回访同一主题的便利性 |

本项目旧 `docs/product-handoff.md` 中“重合 70%–85%”没有特征权重和量化方法，本轮不沿用该比例；以具体任务和能力逐项比较。

## 5. 已采纳的方案修订与后续边界

2026-10-28 用户采纳下列修订，已同步到 proposal/design/三项 specs/tasks；这里只记录决策及来源，实现任务仍全部待做。

| 决策 | 产品依据 | 落点 |
| --- | --- | --- |
| 默认从标签搜索或当前标签邻域进入，概览为显式可选入口 | TagFolder 的逐步筛选；TheBrain/ExcaliBrain 的局部导航 | design D4/D5；`tag-relationship-graph` 入口场景 |
| 比较共同/仅 A/仅 B、交并比和双向覆盖率 | Tag Lens 的交集证据；补足本产品整理判断所需的差集 | design D2；`tag-relationship-model` 标签对比较场景 |
| 无共现或未进入图的两个标签也可比较 | 同义标签可能被交替使用，零交集不能排除重复 | design D2/D4；独立比较，不伪造图边 |
| 保留 A/B 查询上下文进入现有审查，取消可返回 | Tag Wrangler 的动作可达性与本项目已有审查/恢复能力 | design D1/D5/D7；`tag-relationship-graph` 只读交接场景 |
| 以任务完成效果验证产品价值 | InfraNodus 的问题导向；Extended Graph 的性能和状态反馈 | design D9；tasks 7.6；产品 TODO P0-4 |

A 有 100 篇、B 有 10 篇、共同 10 篇时，B 的覆盖率为 100%，A 为 10%。这只能说明当前查询的使用范围包含，不能证明应合并或存在语义父子。现有健康报告的名称/规则证据与关系使用证据互补；任何修改仍须重新表达意图和审查。

会话内取消返回纳入 P0；跨重启保存查询、稠密关系热力图、增量索引和可解释的 AI 辅助调查分入后续 TODO。异步、预算及宿主门禁继续保留；没有同库实测前，不把它们描述成已优于竞品。

## 6. 建议的下一轮实操对测

使用同一合成库而非个人库，先跑 AI Tagger Universe、Tag Lens、TagFolder 与我们的原型，核对以下任务；本轮尚未执行：

| 任务 | 判断标准 |
| --- | --- |
| 找到与一个低频标签经常一起出现的标签 | 能否找到被概览频率截断的标签；完成步骤/时间 |
| 解释一条连接为什么存在 | 能否找到具体共同笔记；能否理解来源和统计口径 |
| 判断 A/B 是使用范围包含还是近似重复 | 是否误把共现当同义；是否能检查差集和各自上下文 |
| 关系过密时继续完成判断 | 图/表/热力图哪种呈现更有效；不只记录帧率 |
| 从判断进入一次可审查整理并撤销 | 上下文是否保留；操作意图与证据是否一致；按实际能力记录不支持项 |

官方资料支持的是能力存在；这些对测才能验证我们是否降低认知负担、缩短任务路径或提高整理判断的可靠性。

## 7. 公开规模与维护快照

核查日：2026-10-28。六个月窗口：2026-04-28 至 2026-10-28。插件遍历 GitHub Releases 的 `published_at`（UTC），正式版与 prerelease 分列，按独立版本计数；TagFolder 已检查第二页为空。最早 Release 是现存可核实发布记录，不是仓库创建日，也不保证等于社区上架日。下载量沿用官方社区页的展示约数，不代表去重安装/独立用户/活跃用户；Stars 来自同日 GitHub 仓库 API。未查到不是 0。

| 产品 / 发布记录 | 最早公开发布 | 六个月正式版本数 | 最近版本 / 日期 | 累计下载量 / 来源 | 公开用户数 | GitHub Stars / 仓库 |
| --- | --- | --- | --- | --- | --- | --- |
| [AI Tagger Universe](https://github.com/Agents365-ai/obsidian-ai-tagger-universe/releases) | 2025-02-13 | 3 | 1.0.20 / 2026-09-07 | [约 1.6 万](https://community.obsidian.md/plugins/ai-tagger-universe) | 未查到 | [111](https://github.com/Agents365-ai/obsidian-ai-tagger-universe) |
| [Tag Lens](https://github.com/laximgqozaZZZYT/tag-lens/releases) | 2026-05-28 | 35，含首发（更新 34 次） | 0.3.32 / 2026-06-28 | [682](https://community.obsidian.md/plugins/tag-lens)，索引快照 | 未查到 | [0](https://github.com/laximgqozaZZZYT/tag-lens) |
| [TagFolder](https://github.com/vrtmrz/obsidian-tagfolder/releases) | 2021-12-09 | 10；另 4 个预览版 | 0.18.23 / 2026-10-17 | [约 27.1 万](https://community.obsidian.md/plugins/obsidian-tagfolder) | 未查到 | [352](https://github.com/vrtmrz/obsidian-tagfolder) |
| [Tag Wrangler](https://github.com/pjeby/tag-wrangler/releases) | 2021-02-01 | 1 | 0.6.5 / 2026-08-13 | [约 110 万](https://community.obsidian.md/plugins/tag-wrangler) | 未查到 | [935](https://github.com/pjeby/tag-wrangler) |
| [ExcaliBrain](https://github.com/zsviczian/excalibrain/releases) | 2022-05-01 | 2；另 1 个预览版 | 0.2.19 / 2026-09-29 | [约 35.6 万](https://community.obsidian.md/plugins/excalibrain) | 未查到 | [1,006](https://github.com/zsviczian/excalibrain) |
| [Extended Graph](https://github.com/ElsaTam/obsidian-extended-graph/releases) | 2024-12-19 | **0** | 2.7.7 / **2025-10-17** | [约 7.9 万](https://community.obsidian.md/plugins/extended-graph) | 未查到 | [241](https://github.com/ElsaTam/obsidian-extended-graph) |
| [InfraNodus Obsidian 插件](https://github.com/noduslabs/infranodus-obsidian-plugin/releases) | 2024-08-11 | 7 | 0.10.0 / 2026-08-04 | [约 3.2 万](https://community.obsidian.md/plugins/infranodus-graph-view) | 未查到 | [175](https://github.com/noduslabs/infranodus-obsidian-plugin) |
| [Heptabase](https://wiki.heptabase.com/changelog) | [2022 年公测](https://medium.com/heptabase/to-heptabase-users-2022-recap-82b1e188ef8c) | 主端至少 49；另移动端 22 | 1.114.0 / 2026-10-27 | 未查到 | 未查到 | 未用发行包/CLI 仓库代替主产品源码统计 |
| [TheBrain](https://forums.thebrain.com/software-releases-and-updates-92430) | [1998 年](https://www.thebrain.com/km/slip-box) | 至少 50，公开版本号下限 | 15.0.647 / 2026-10-24 | [1,000 万+](https://www.thebrain.com/) | 未查到 | 未见主产品公开源码仓库 |

统计边界：

- Tag Lens 下载量来自上月抓取的官方页搜索快照，可能滞后；35 个 Release 全部集中在 5—6 月，不能由半年总数推断最近仍高频更新。
- Heptabase 官方日志列出窗口内主端 45 个版本、移动端 22 个；[公开 Releases](https://github.com/heptameta/project-meta/releases)另确认 `v1.108.2`、`v1.108.0`、`v1.105.1`、`v1.101.0`，去重后主端至少 49。CLI、ChatGPT/Claude 插件不混计。
- TheBrain 官方[发布列表](https://forums.thebrain.com/software-releases-and-updates-92430)和[较早一页](https://forums.thebrain.com/?forum=92430&trail=50)已确认超过 50 个窗口内版本号；包括平台专属号，分页快照不完整，保留为下限，不把版本号差值当发布次数。
- InfraNodus 的日期、下载和 Stars 均针对 Obsidian 插件；[旧版开源应用](https://github.com/noduslabs/infranodus)同日为 47 Stars，README 明示是旧版，不能混充当前 SaaS。
- Juggl 保留为产品形态参考，本轮未核实同口径规模/维护数据，不记为 0，也不据此判断停更。

## 8. 维护信号、用户问题与产品机会

优先调查条件是“六个月无正式发布，且有尚未解决的用户问题”；同时检查作者回应、近期提交、问题版本和复现条件。不因 Issue 开放、Stars 较低或发布少就断言弃维护。所有反馈以下均为公开报告，不是本项目已复现的结果。

| 对象 | 公开证据 | 判断 / 对我们的启发 |
| --- | --- | --- |
| Extended Graph：性能 | [#177](https://github.com/ElsaTam/obsidian-extended-graph/issues/177) 报告增加局部深度后约 220 节点冻结；作者于 2026-08-20 回复复杂样式/较多节点有性能限制 | 符合重点调查条件；优先局部导航、可控预算、关系表与有界失败，需要同夹具复现后才能比较性能 |
| Extended Graph：状态保存 | [#192](https://github.com/ElsaTam/obsidian-extended-graph/issues/192) 于 2026-08-19 报告默认视图不能保留文件夹开关，自定义状态可以，核查时开放 | P0 保留会话上下文；P1 保存查询时覆盖默认/自定义、重启、范围变化和失效恢复 |
| Extended Graph：发行质量 | [#185](https://github.com/ElsaTam/obsidian-extended-graph/issues/185) 报告 2.7.7 包内 manifest 仍为 2.7.6，核查时开放 | 发布号/manifest/安装后版本应一致，作为现有 release gate 的回归关注项 |
| Tag Lens | 半年 35 个 Release，但最后发布距核查日约四个月 | 未达到半年无发布阈值；借鉴能力，不用短期发布密度推断成熟度或留存 |
| Tag Wrangler | 半年 1 次正式发布，最近为 2026-08-13，累计下载较多 | 成熟窄工具发布少并不等于维护失败，优先研究动作效率与能力边界 |

Extended Graph 默认分支最近提交记录为 2026-02-13，但作者 8 月仍回复 Issue，因此标为“长期未发布、有未解决反馈、仍有作者回应”，不标为弃维护。后续能力选择以真实任务收益为准；这些信号尚不能证明用户愿意迁移或付费。
