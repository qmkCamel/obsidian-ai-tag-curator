# README 编写原则与本次调整

参考日期：2026-10-29。本文记录 README 的组织依据，供后续维护时使用；用户入口是仓库根目录的中英文 README。

## 参考了什么

| 项目或文档 | 值得借鉴的做法 | 在本项目中的应用 |
| --- | --- | --- |
| [uv](https://github.com/astral-sh/uv/blob/main/README.md) | 开头说明工具定位，突出主要能力，提供明确安装入口，再链接详细指南 | 首屏交代本地标签管理与可选 AI；普通安装使用发布附件 |
| [ripgrep](https://github.com/BurntSushi/ripgrep/blob/master/README.md) | 提供截图和快速文档入口，将使用指南与 FAQ 分流，并说明适用边界 | 保留真实工作台截图，详细操作迁到使用指南，首页保留会影响用户决策的限制 |
| [FastAPI](https://github.com/fastapi/fastapi/blob/master/README.md) | 用可执行的最小示例连接安装与实际使用 | 给出安装后第一次本地管理操作，以及改名/合并的具体例子 |
| [Obsidian Dataview](https://github.com/blacksmithgu/obsidian-dataview/blob/master/README.md) | 把实际示例和结果截图配对，提供完整参考文档与贡献入口 | 用 Obsidian 的命令名称描述流程，展示真实界面，补齐反馈和贡献路径 |
| [GitHub README 官方说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes) | 回答项目做什么、为什么有用、如何开始、在哪里求助、谁参与维护；仓库内使用相对链接 | 按首次访问者的阅读顺序组织内容，提供 Issues、维护者和许可证入口 |

这些项目的篇幅和受众不同，不需要照搬赞助区、性能榜单或徽章数量。这里借鉴的是信息组织方式，没有复制它们的宣传文案。

## 好的 README 应该回答的问题

1. **这是什么，适合谁？** 标题后用一两句话说明用途和关键差异，让用户判断是否值得继续阅读。
2. **实际能做成什么？** 用真实截图、最小示例和任务导向的能力说明，展示结果。
3. **怎样最快用起来？** 区分普通安装与源码开发，写清依赖、安装步骤、首次操作和预期结果。
4. **使用有什么前提和代价？** 清楚说明平台、API key、数据发送范围、费用、可撤销性和重要限制；不把未验证能力写成承诺。
5. **下一步去哪里？** 为详细配置、升级、排错、反馈和贡献提供直接入口。

README 是入口，完整参数、实现机制和验收证据各有合适的文档位置。功能变动时先更新详细指南，再检查首页摘要和两种语言是否仍然一致。

## 本次结构

```text
项目定位与快速导航
真实工作台截图
任务与能力表
发布附件安装
无需 AI 的首次操作
可选 AI 配置
数据与修改边界
文档导航
反馈与贡献
许可证
```

- [英文 README](../README.md) 与 [中文 README](../README.zh-CN.md) 使用一致的章节和能力边界。
- [英文指南](guide.md) 与 [中文指南](guide.zh-CN.md) 承接原 README 的详细配置、截图、命令、升级/降级、事务限制及开发流程。
- 安装步骤依据已发布的 [0.5.0 Release](https://github.com/qmkCamel/obsidian-ai-tag-curator/releases/tag/0.5.0) 及其 `main.js`、`manifest.json`、`styles.css` 附件。
- 数据发送范围核对了 `src/ai/PromptBuilder.ts` 与 `src/health/TagHealthAiPromptBuilder.ts`；服务预设和命令核对了当前源码。
- 平台验证采用已有的 [0.5.0 发布验收](verification/0.5.0-release-acceptance.zh-CN.md)，明确日期和范围，不将历史验收表述为本轮重测。

## 后续维护检查

- 首次使用是否仍能只读 README 完成？安装入口是否指向可下载的同版本资产？
- 命令和设置名称是否与界面一致？示例是否有明确的操作结果？
- 关键限制是否仍在首页可见？完整指南是否保留边界和故障处理方法？
- 中英文是否同步？截图、相对链接、目录锚点是否有效？
- 新的性能、平台或安全声明是否有相应证据？没有证据时保留未验证状态。
