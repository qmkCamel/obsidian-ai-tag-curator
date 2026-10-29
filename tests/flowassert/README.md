# 标签关系测试 case

本目录保留实际可执行的 case，使用合成数据，不读取个人 vault、浏览器配置或 FlowAssert 归档。

- `cases.mjs`：局部入口、交差集、只读交接、零交集、来源、真实 Worker/SVG、缩放/点击、慢任务、取消/失败、版本刷新与 20 次生命周期。
- `graph-fixture.ts`：生产工作台/关系模块配合合成 Obsidian 适配器；固定种子 1k/10k、受控慢 Worker、资源和性能测量。
- `run.mjs`：真实 Chrome 执行、深浅主题与 360/900px 键盘场景、JUnit、截图及 FlowAssert 导入。
- `host.mjs`：官方 Obsidian 1.8.7 / 1.14.5 的全新隔离 vault/profile；安装三件套、断网路由、主/弹出窗口、笔记证据、故障、重启及原管理回归。

## 执行方式

使用 Node 24（FlowAssert 要求 Node ^22.19 或 >=24）、本地 Playwright 1.62.1、Chrome，以及已构建的 FlowAssert 源码。脚本不会安装或升级这些工具。`CODEX_BROWSER_PACKAGES` 可指向含 Playwright/lucide 的绝对 node_modules 目录；`CHROME_EXECUTABLE` 可覆盖浏览器路径。

```sh
npm test
npm run build
npm run test:graph:browser
FLOWASSERT_ROOT=/absolute/path/to/flowassert npm run test:graph:flowassert

# 应用必须是 /private/tmp/tag-curator-graph-hosts/ 下的官方独立副本。
npm run test:graph:host -- 1.8.7 /private/tmp/tag-curator-graph-hosts/minimum/Obsidian.app/Contents/MacOS/Obsidian --regression
npm run test:graph:host -- 1.14.5 /private/tmp/tag-curator-graph-hosts/current/Obsidian.app/Contents/MacOS/Obsidian --regression
```

每轮证据保存在 `artifacts/<时间>/`，包括实际 case 结果、JUnit、截图与摘要、版本/硬件、5 次预热 + 30 次测量的各阶段数据。准备缓存会在每次性能样本前失效；单对比较不运行全图。失败材料保留，重跑建立新目录。生成、交互、取消、主线程长任务有实际阈值断言；截图必须另行查看，不能因文件存在而判视觉通过。

FlowAssert 0.1.0-alpha.2 的原生执行器针对 Android/iOS，其 Web 自检只针对登记的 Viewer 场景。这里的执行器是 **Playwright / 真实 Obsidian**；`--flowassert` 启动独立 FlowAssert runtime，把本次真实 JUnit 经官方 CLI 导入，验证最终 `phase=finished` 并保存 assetId。它不是 FlowAssert 原生桌面执行，也不是把 Mock 手机 case 冒充 Obsidian 测试。外部 `reported-pass` 与真实宿主验收分别记录。

完整结果和剩余门禁见[验收记录](../../docs/verification/tag-relationship-graph.md)。产品任务对照见[实测协议](product-tasks.md)。
