# Obsidian 插件市场发布清单

本文档记录 AI Tag Curator 发布到 Obsidian Community Plugins 前需要完成的步骤。

## 1. 发布前检查

- 确认默认分支包含最新源码。
- 确认 `README.md` 能清楚说明插件用途、安装方式、使用流程和限制。
- 确认根目录存在 `LICENSE`。
- 确认 `manifest.json` 中的 `id`、`name`、`version`、`minAppVersion`、`description`、`author`、`authorUrl` 都准确。
- 确认 `versions.json` 中包含当前版本到最低 Obsidian 版本的映射。
- 确认 `CHANGELOG.md` 已记录当前版本的主要变化。
- 确认截图位于 `docs/images/`，并且 README 中引用的图片路径有效。

## 2. 本地构建与验证

```bash
npm install
npm test
npm run build
```

构建后根目录应包含这些发布资产：

- `main.js`
- `manifest.json`
- `styles.css`

建议在真实 Obsidian 库中至少验证：

- 插件能正常启用。
- 设置页能保存 API base URL、API key 和 model。
- `刷新标签索引` 能生成摘要。
- `为当前笔记推荐标签` 能后台运行并弹出结果。
- 推荐结果不会包含当前笔记已有标签。
- `分析标签健康度` 能打开健康报告。
- AI 增强健康分析能返回优先处理项。
- `撤销当前笔记最近标签修改` 能回退最近一次写入。

## 3. 创建 GitHub Release

1. 确认 `manifest.json` 的 `version` 是要发布的版本，例如 `0.1.0`。
2. 在 GitHub 创建同名 tag，例如 `0.1.0`。
3. 创建 release，标题可以使用 `AI Tag Curator 0.1.0`。
4. Release 说明可参考 `CHANGELOG.md`。
5. 上传这些附件：
   - `main.js`
   - `manifest.json`
   - `styles.css`

Obsidian 安装插件时会根据 `manifest.json` 中的版本号查找同名 GitHub Release。

## 4. 提交到 Obsidian Community Plugins

1. 打开 <https://community.obsidian.md>。
2. 使用 Obsidian 账号登录。
3. 绑定 GitHub 账号。
4. 进入 `Plugins`。
5. 选择 `New plugin`。
6. 填写仓库地址：`https://github.com/qmkCamel/obsidian-ai-tag-curator`。
7. 确认开发者政策和维护承诺。
8. 提交审核。

提交后，Obsidian 会读取默认分支的 `manifest.json`，并检查 GitHub Release 中是否存在同版本发布资产。

## 5. 审核反馈处理

如果审核反馈需要修改：

1. 修改源码或元信息。
2. 更新 `manifest.json`、`package.json` 和 `versions.json` 中的版本。
3. 更新 `CHANGELOG.md`。
4. 重新运行测试和构建。
5. 创建新的 GitHub Release。
6. 回到 Community Plugins 页面继续发布流程。

## 6. 后续版本发布

插件通过首次审核后，后续版本通常不需要重新提交市场审核。只需要：

1. 更新版本号。
2. 更新 `CHANGELOG.md`。
3. 构建发布资产。
4. 创建同版本 GitHub Release。

Obsidian 客户端会从 GitHub Release 拉取新版本。

## 7. 0.1.2 发布验收记录

版本信息：

- `package.json`：`0.1.2`
- `manifest.json`：`0.1.2`
- `versions.json`：包含 `0.1.2 -> 1.8.7`

发布资产：

- `main.js`
- `manifest.json`
- `styles.css`

自动验证：

- `openspec validate --all`
- `npm test`
- `npm run build`
- `git diff --check`

真实 Obsidian 库手动验收：

- 标签健康报告能展示中文总览、生成时间、索引时间、标签数、使用次数、风险分组和可执行建议数。
- AI 行动建议能展示上次分析时间、诊断说明、原因、目标标签、规则证据、注意事项、优先级、置信度和可执行状态。
- 可执行合并/重命名建议能显示 `应用`，应用后能显示 `回退`。
- `复制 Markdown 计划` 在 AI 行动层和规则证据层均可见。
- 规则证据明细能切换问题类型，并展示相关文件示例与当前标签。
- 长内容在报告内部滚动，Modal 尺寸保持稳定。
