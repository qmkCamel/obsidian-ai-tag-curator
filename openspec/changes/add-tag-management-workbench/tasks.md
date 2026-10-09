## 1. 基线与安全输入契约

- [x] 1.1 复核 dev 与本方案基线的差异，记录实际编码基线；保留已有 inline 宿主验收未完成项。
- [x] 1.2 增加 ManualTagIntent、独立输入校验、精确 tagKey/目标字面量与来源类型；覆盖非法输入、纯数字、空层级、同身份和 target-in-sources。
- [x] 1.3 增加 TagScope 与全局 TagMutationPolicy 的纯类型/默认值/持久化读取，旧数据缺字段时使用空策略。
- [x] 1.4 实现路径段范围与 exact/subtree 保护评估；覆盖根目录、递归、重叠包含、同名前缀、排除优先、失效路径。
- [x] 1.5 定义跳过原因和 ReviewContext revision 快照；区分不可精确计数的范围外位置与可信位置数量。

## 2. 原值 patch 与安全属性写入

- [x] 2.1 增加 TagValueSnapshot/TagValuePatch，捕获 absent/list/scalar 原值，不复用 normalized 列表当作原值。
- [x] 2.2 对宿主 parseYaml/stringifyYaml 编写探针和单测：普通数组、多行字符串、嵌套对象、锚点、非 tags 属性；无法安全往返的结构明确只读。
- [x] 2.3 实现仅替换 source 的属性 patch：保持未选原值/重复项/相对顺序，已有目标优先保留；覆盖 source 与目标在同一列表的各种顺序。
- [x] 2.4 实现仅追加已选新标签的 raw patch，接入推荐/文件夹计划；旧标量和混合类型前向写入明确不可执行。
- [x] 2.5 收紧 FrontmatterWriter 新路径到 Vault.process callback 全文比较，修改唯一 tags 字段，正文逐字和非 tags 属性语义保持不变。
- [x] 2.6 扩展计划、记录、clone/serialize 与类型守卫的可选 raw patch/tagValueVersion 字段；新前向计划必须提供，旧记录不伪造。
- [x] 2.7 扩展 cleanup/batch/推荐撤销的原值比较与恢复，原值有变化不能被规范身份相同掩盖。
- [x] 2.8 回归中文、非 BMP 前缀、CRLF、无 frontmatter、混合写入、预检后竞态、未选/保护标签字面量不变。

## 3. 写入协调与持久化基础

- [x] 3.1 实现共享 MutationCoordinator tryAcquire/lease；双视图和不同命令并发提交时第二个返回 busy，不排队执行旧意图。
- [x] 3.2 将新旧前向执行、undo、recovery 接入 lease；关闭视图不结束任务，未解决记录阻断新事务。
- [x] 3.3 实现 PluginDataStore 串行保存最新状态，所有 settings/index/cache/operations 保存统一入口；队列拒绝后可恢复。
- [x] 3.4 覆盖 intent 保存失败、执行后保存失败、索引保存交错、不确定落盘结果，保留只读恢复门禁。
- [x] 3.5 加入未知 schema/损坏 operations/多个未解决记录的只读错误态，不重置用户数据。
- [x] 3.6 实现未解决日志固定保留、完成记录限额、receipt 上限和 20 MiB UTF-8 预算；超限前零 Markdown 写入。

## 4. 策略全入口接入

- [x] 4.1 为当前笔记推荐在读正文/调用 provider 前检查排除；被保护候选不可新增，已有保护值保持不变。
- [x] 4.2 为文件夹批次在读取前过滤排除路径、重算数量；生成/应用都检查策略 revision 和实际差异。
- [x] 4.3 为健康诊断与 AI 上下文过滤排除文件/片段；健康清理原 capability 与保护条件同时满足才可执行。
- [x] 4.4 对所有 writer-bound patch 验证未选/保护标签原值不变，拒绝编程调用绕过 UI 保护。
- [x] 4.5 策略保存使预览、索引片段和 AI 缓存失效；旧请求晚到结果不得应用或复活缓存。
- [x] 4.6 活跃 lease 期间拒绝策略保存；新增规则后撤销/恢复使用 recordId 限定例外并展示告知。
- [x] 4.7 增加表驱动测试：当前笔记、folder、health、manual、undo、recovery 的范围/保护/冲突行为矩阵。

## 5. 索引服务与查询投影

- [x] 5.1 实现 missing/ready/stale/refreshing/error 和 revision/generation；旧持久化索引启动为 stale。
- [x] 5.2 注册宿主文件与 metadata cache 事件并正确卸载；只标脏不每事件全库重扫，覆盖目录 rename/delete。
- [x] 5.3 实现四 worker 逐文件聚合刷新与全局排除，释放全文且保持每标签代表片段上限。
- [x] 5.4 实现临时快照提交、取消、晚到丢弃、部分失败保留旧结果、保存失败不宣布 ready。
- [x] 5.5 将 main.ts 的工作台/健康/推荐索引访问统一到服务；事务后一次刷新，失败不得重新写笔记。
- [x] 5.6 实现 tagKey 投影、去重文件数/来源文件数、稳定排序和子串过滤；不使用 count 冒充 token 数。
- [x] 5.7 实现标签 100 项/相关文件 50 项分页、跨页选择与过滤后清空；精确文件列表不混入子标签。

## 6. 本地工作台与设置 UI

- [x] 6.1 注册原生 ItemView、命令与 ribbon，复用已有视图；不要求活动笔记/provider，不增加外部请求。
- [x] 6.2 实现标签/历史页签、状态栏、搜索/来源/排序/翻页、标签详情与打开笔记。
- [x] 6.3 实现范围与保护 Modal，分开工作台 scope 与全局策略；展示排除优先、失效目录、规则例外和保存错误。
- [x] 6.4 实现全部空态、扫描进度、取消、过期重试、未解决操作入口与只读错误态。
- [x] 6.5 使用原生图标/tooltip、ownerDocument/窗口对象与生命周期清理，避免私有 Tags view patch。
- [x] 6.6 补齐中文/英文 labels，900px 分栏切换与 360px 窄屏、长标签/路径、焦点返回和 aria-live。
- [x] 6.7 增加 DOM/E2E：无 key 无活动笔记、重复打开、关闭重开、分页选择、空态、键盘和深浅主题。

## 7. 手动意图与现有审查执行闭环

- [x] 7.1 提取 DeterministicCleanupInput hydrate 核心，保留健康 adapter 与原 capability 检查；不伪造健康问题。
- [x] 7.2 实现 ManualTagPlanBuilder 的 source-only 文件集合、精确标签语义、200 文件上限及范围确认。
- [x] 7.3 增加单标签改名/多标签合并输入，目标已存在提示、子标签不传播提示及支持字符边界。
- [x] 7.4 把目标字面量、context 和 raw patch 贯穿 review/selection/executor，验证器不静默小写化用户目标。
- [x] 7.5 复用逐位置审查、取消、partial 二次确认，分开 protected/untrusted/readFailed/unselected/scopeExcluded 统计。
- [x] 7.6 提交时在 lease 内重验 vault/index/policy revision、候选路径和内容；变化要求重审而非自动重算执行。
- [x] 7.7 接入 V2 来源与结果，覆盖成功、预检零写入、回滚、固定目标恢复、索引失败和重复点击。
- [x] 7.8 E2E 覆盖正文-only、属性-only、混合、target-only 排除、缓存不可信、执行前新增/移动源笔记、跨重载撤销。

## 8. 历史投影与全局撤销

- [x] 8.1 实现推荐/legacy cleanup/V2 cleanup/batch/receipt 的统一投影、未知值显示和按操作序列排序。
- [x] 8.2 实现 activity/receipt 去重与撤销/回滚 finalize，正常路径和启动对账都在同次保存中更新记录。
- [x] 8.3 实现历史列表筛选、详情路径/标签变化/最小 token 差异、未解决记录置顶与恢复入口。
- [x] 8.4 实现全局最新记录资格、recordId 重验和类型路由；过滤不能改变资格，旧卡片不能撤销新记录。
- [x] 8.5 将旧当前笔记/folder/health 回退命令接入统一资格；legacy 多文件 cleanup 所有入口只读并解释。
- [x] 8.6 完成新 raw 值和旧记录的真实恢复能力说明；不从当前设置推断历史模型、不从 id 编造时间。
- [x] 8.7 覆盖不同类型交错、较新操作不同文件、同 id 晚到、冲突预检零写入、撤销补偿、回滚 receipt 和重载。
- [x] 8.8 检查序列化仅含必要字段，禁止 API key/全文/AI 响应/UI 上下文/搜索词进入历史。

## 9. 集成回归、性能与宿主验收

- [x] 9.1 跑相关单测、现有推荐/批次/inline E2E，以及新增工作台/策略/历史 E2E，记录实际测试数量。
- [x] 9.2 运行 npm test、npm run build、单 change 严格校验、全量严格校验和 git diff --check。
- [x] 9.3 建立 1k/10k 标签与 10k 笔记固定性能夹具，记录 5 次预热、30 次测量、p95、DOM 数、取消延迟和并发峰值。
- [x] 9.4 只在专用可恢复合成 vault 安装开发版；无 key 完成浏览/改名/合并/历史/撤销，并检查零网络请求。
- [x] 9.5 在最低支持版本与当前稳定版验证位置缓存、活动编辑器、正文/属性混合写入、浮出窗口及跨重载恢复。
- [x] 9.6 保存宽/窄、深/浅、长路径、键盘焦点、部分处理、规则跳过、冲突和恢复截图；未验证设备单列。
- [x] 9.7 回归历史 legacy 数据、默认空策略、索引迁移、日志预算和降级告知；不得清空用户 data.json。

## 10. 文档与交付边界

- [x] 10.1 更新中英文 README 与 handoff，写清本地零配置、精确标签、子标签/删除/大小写限制和历史顺序收紧。
- [x] 10.2 更新 roadmap 与 release checklist，保留 inline 最低版本/视觉验收未完成项，不把设计校验写成实现通过。
- [x] 10.3 增加本 change 的独立验收记录，区分单测、harness、真实宿主、性能与未验证边界。
- [x] 10.4 核对 specs/product/design/tasks 一致，完成后再归档；版本更新、生产安装、commit/push/release 等待明确请求。

2026-09-14：9.3 的暖查询/输入采样为 5 次预热、30 次测量，刷新/取消为受控单次样本；9.6 的全矩阵为合成浏览器，真实 Obsidian 1.13.7 的关键态另列。9.5 保留最低版本、应用完整重启及真实故障恢复缺口，不归档。详见 `docs/verification/tag-management-workbench.md`。

2026-10-09：9.5 已补验。macOS 上官方 Obsidian 1.8.7 与 1.14.4 各通过完整主流程 16/16、故障准备 3/3、完整应用重启恢复 3/3；详见 `docs/verification/0.5.0-release-acceptance.zh-CN.md`。真实移动端、Windows/Linux 与突然断电不在本轮证明范围内。
