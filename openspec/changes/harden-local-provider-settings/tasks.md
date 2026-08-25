## 1. Provider preset 安全语义

- [x] 1.1 重构 preset 应用逻辑：跨 preset 原子设置 type、URL、model、JSON mode、并发与 prompt profile，并清空旧 API key。
- [x] 1.2 保持标准 preset 下的 model 和高级参数 override，不再因编辑这些字段隐式切换为 custom。
- [x] 1.3 增加单元测试覆盖远端到本地、远端到远端、本地 model 填写、同 preset 和 custom 切换。

## 2. 设置页信息架构

- [x] 2.1 增加中英文设置分组、条件化 API key、连接测试阶段/结果与取消边界文案。
- [x] 2.2 将设置页重构为通用、AI 服务连接、高级模型设置、标签推荐、索引与批量处理、诊断与反馈六组。
- [x] 2.3 仅在 custom preset 下展示 provider type 和可编辑 base URL；标准 preset 展示只读 endpoint。
- [x] 2.4 仅在允许新标签时展示严格程度，并为高级模型设置增加默认折叠容器与摘要。
- [x] 2.5 增加设置分组、状态和响应式样式。

## 3. 长耗时 Provider 连接测试

- [x] 3.1 为连接测试服务增加阶段回调、取消检查和 cancelled 结果，不承诺中止已发请求。
- [x] 3.2 在设置 tab 实现冻结配置、single-flight、持续已用时间、取消和晚到结果隔离。
- [x] 3.3 将成功、失败和取消结果持久展示在设置页内；provider 配置变化时取消旧 job，非 provider 设置保持可交互。
- [x] 3.4 增加单元/E2E 覆盖阶段、运行中无关交互、重复提交、取消前后边界、晚到结果、成功和失败保留。

## 4. 文档与视觉证据

- [x] 4.1 更新 README.zh-CN.md 与 README.md，补齐 Ollama/Qwen3.8 安装、API 验证、插件配置、能力边界和故障排查。
- [x] 4.2 更新 CHANGELOG，记录 provider 设置安全切换、分组和长耗时连接测试。
- [x] 4.3 在真实 Obsidian 中更新无凭据的设置截图并核对中英文 README 引用。

## 5. 验证

- [x] 5.1 运行 `npm run test:unit`、`npm run test:e2e`、`npm test` 和 `npm run build`。
- [x] 5.2 运行 `npm run spec:validate -- harden-local-provider-settings`、`npm run spec:validate -- --all`、`npm audit` 和 `git diff --check`。
- [x] 5.3 使用延迟 mock 在真实 Obsidian 中验证运行反馈、无关设置交互、取消、晚到结果和失败保留并截图。
- [x] 5.4 使用本机 Ollama/Qwen3.8 验证真实连接测试完成路径，记录未能中止底层推理的边界。
