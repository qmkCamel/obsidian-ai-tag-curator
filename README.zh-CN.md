# Obsidian AI Tag Curator

简体中文 | [English](README.md)

面向 Obsidian 库（vault）的 AI 标签管理与治理插件。

这个插件不是普通的“AI 标签生成器”，而是一个帮助用户维护标签体系的管理与治理助手。它会优先理解和复用库中已经存在的标签，而不是随意创建一批新标签。

当前第一版实现重点包括：

- 扫描库中已有标签；
- 为当前笔记推荐标签；
- 分析当前库标签健康度；
- 强烈优先复用已有标签，而不是随意创建新标签；
- 解释每个推荐标签的理由；
- 写入 frontmatter 前展示预览；
- 记录最近一次操作，方便撤销。

## 开发

安装依赖：

```bash
npm install
```

运行测试：

```bash
npm test
```

构建 Obsidian 插件包：

```bash
npm run build
```

构建产物：

- `main.js`
- `manifest.json`
- `styles.css`

## 本地安装到 Obsidian

1. 运行 `npm run build` 生成插件文件。
2. 在目标 Obsidian 库（vault）中创建插件目录：

```bash
mkdir -p /path/to/your-vault/.obsidian/plugins/ai-tag-curator
```

3. 将以下文件复制到该目录：

```bash
cp main.js manifest.json styles.css /path/to/your-vault/.obsidian/plugins/ai-tag-curator/
```

4. 打开 Obsidian，进入 `Settings -> Community plugins`。
5. 关闭安全模式后，在已安装插件列表中启用 `AI Tag Curator`。

## 使用流程

1. 在插件设置中配置 OpenAI-compatible API base URL、API key 和 model。
2. 执行 `刷新标签索引`，扫描当前库的标签体系。
3. 打开一篇 Markdown 笔记。
4. 执行 `为当前笔记推荐标签`。
5. 在预览弹窗中检查推荐标签、置信度和解释。
6. 只保留想要应用的标签，然后确认写入。
7. 如果要查看当前库的标签问题，执行 `分析标签健康度`。
8. 如果需要撤销最近一次本插件对当前笔记的标签修改，执行 `撤销当前笔记最近标签修改`。

## 插件命令

插件界面语言默认是 `Auto`，会跟随 Obsidian 当前语言。中文界面下的命令是：

- `刷新标签索引`
- `查看标签索引摘要`
- `分析标签健康度`
- `为当前笔记推荐标签`
- `撤销当前笔记最近标签修改`

## 当前限制

- 第一版只写入当前笔记的 frontmatter `tags`；
- inline tags 会被读取用于索引，但不会被自动改写；
- 标签健康报告是只读诊断，不会自动合并、重命名或废弃标签；
- 批量文件夹打标和复杂撤销日志还没有完成；
- AI 返回内容必须是结构化 JSON，解析失败时不会写入文件。

## 文档

- [英文产品交接文档](docs/product-handoff.md)
- [中文产品说明](docs/product-handoff.zh-CN.md)
- [中文技术方案](docs/technical-design.zh-CN.md)
- [中文路线图](docs/roadmap.zh-CN.md)
