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
npm run release:verify
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

准备真实 Obsidian smoke 与截图测试库时，必须显式指定隔离目标路径：

```bash
OBSIDIAN_RELEASE_VAULT_PATH=/path/to/test-vault npm run release:vault:prepare
```

只有需要复用指定主题时才设置 `OBSIDIAN_THEME_SOURCE_VAULT`。脚本会重置合成测试笔记，因此不得把个人库作为目标路径。

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

## 8. 0.3.0 发布验收记录

发布日期：2026-08-17

版本信息：

- `package.json`：`0.3.0`
- `manifest.json`：`0.3.0`
- `versions.json`：包含 `0.3.0 -> 1.8.7`

发布资产：

- `main.js`
- `manifest.json`
- `styles.css`

本次自动验证：

- `npm ci --no-audit`：通过。
- `npm run spec:validate -- add-safe-folder-batch-preview --strict`：通过。
- `npm run spec:validate -- --all --strict`：通过，6 项全部有效。
- `npm test`：通过，35 个测试文件、103 个测试全部成功。
- `npm run build`：通过。
- `npm audit --json`：通过，生产与开发依赖均为 0 个漏洞。
- `npm audit --omit=dev --json`：通过，生产依赖为 0 个漏洞。
- `npm run release:vault:prepare`：通过，标准默认路径可以重置隔离测试库并安装 `ai-tag-curator-dev@0.3.0`。
- `git diff --check`：通过。

真实 Obsidian 验收证据：

- 2026-08-07 至 2026-08-09 在隔离测试库完成范围确认、生成进度、逐文件风险预览、应用、整体回退、立即取消、深色主题和窄窗口检查。
- 发布截图与详细边界记录见 `docs/acceptance/0.3-folder-batch-acceptance.zh-CN.md`。
- provider 失败重试、内容漂移以及 before/after 故障恢复注入尚未逐项手工执行；这些边界已由 E2E 故障注入覆盖，OpenSpec 任务 10.7 保持未完成，不把自动化结果描述为人工证明。

## 9. 0.4.0 发布验收记录

发布日期：2026-08-25

版本信息：

- `package.json`、`package-lock.json` 和 `manifest.json`：`0.4.0`
- `versions.json`：包含 `0.4.0 -> 1.8.7`
- `CHANGELOG.md`：包含 `0.4.0 - 2026-08-25` 正式版本条目

发布资产：

- `main.js`：171453 bytes，SHA-256 `fb85030813b57ed18b1c8b84f247a2a2cf19cbd2955ca82bf3de40699c427dda`
- `manifest.json`：273 bytes，SHA-256 `898c16d375a362b78aeb68158ae9d3bd49b91cd415d5a8adc781985af66187a5`
- `styles.css`：24679 bytes，SHA-256 `335cfc4d4019d7f3229806faedca4f0b67119444d055f18411f53f3bcc966e46`

本次自动验证：

- `npm ci --no-audit`：通过，基于锁文件重新安装 200 个包。
- `npm run test:unit`：通过，35 个测试文件、105 个测试全部成功。
- `npm run test:e2e`：通过，2 个测试文件、25 个测试全部成功。
- `npm test`：通过，37 个测试文件、130 个测试全部成功。
- `npm run build`：通过 TypeScript 检查与生产构建。
- `npm run release:verify`：通过版本一致性、最低 Obsidian 版本映射、Changelog 标题和三个发布资产校验，并输出上述大小与 SHA-256。
- `npm run spec:validate -- harden-local-provider-settings`：通过。
- `npm run spec:validate -- --all`：通过，8 项全部有效。
- `npm audit` 与 `npm audit --omit=dev`：通过，均为 0 个漏洞。
- `git diff --check`：通过。
- 缺少 `OBSIDIAN_RELEASE_VAULT_PATH` 时，发布测试库脚本会在写入前安全失败。
- 显式临时目标库在默认外观和可选主题源两种模式下均准备成功；安装的 `ai-tag-curator-dev` 为 `0.4.0`，本地 mock API key 为空，Obsidian Sync 与 Publish 均关闭。

真实运行验收证据：

- 在真实 Obsidian 设置页验证六组设置、provider preset 原子切换、连接测试的持续阶段/已用时间/取消入口，以及完成、失败、取消结果的持久展示；截图见 `docs/images/settings.png` 与 `docs/images/settings-provider-test-progress.png`。
- 30 秒延迟的确定性本地 mock 验证长耗时期间其他设置仍可操作、取消后晚到结果被隔离、失败信息保留且可重试。
- Apple M2 Pro / 32GB 机器上的 Ollama `0.32.15` 与 `qwen3.8:27b` 已通过服务端口、原生 API、OpenAI-compatible API 和插件连接测试。

已知边界与发布动作：

- Obsidian 的 `requestUrl` 不提供请求级中止；取消会立即结束 UI 等待并丢弃晚到结果，但已发送给本地 runtime 的推理可能继续到自然结束。
- 本记录只证明发布候选准备完成；创建 `0.4.0` tag、GitHub Release 并上传三个资产仍属于合并后的发布动作。
