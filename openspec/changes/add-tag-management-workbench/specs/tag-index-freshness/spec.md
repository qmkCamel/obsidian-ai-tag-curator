## ADDED Requirements

### Requirement: 索引新鲜度必须显式

系统 SHALL 区分 missing、ready、stale、refreshing、error，并维护 index/vault/policy revision；加载的旧缓存 SHALL 标记 stale 而不是推定为最新。

#### Scenario: 重载已有缓存
- **WHEN** 插件加载具有标签数据但没有当前会话验证的缓存
- **THEN** 可以只读展示并标记过期
- **AND** 不能直接据此创建或应用手动写入计划

#### Scenario: 外部文件事件
- **WHEN** Markdown 创建、修改、删除、重命名或缓存变更
- **THEN** vault revision 更新并使相关预览失效
- **AND** 不因每个事件自动触发全库扫描

### Requirement: 刷新必须有界且完整提交

刷新 SHALL 最多四个并发读取，逐文件聚合并释放全文；只有完整、无失败、revision 匹配且保存成功的结果可成为 ready。

#### Scenario: 刷新期间文件变化
- **WHEN** 读取开始后库或策略 revision 改变
- **THEN** 该结果不能宣称 ready
- **AND** 不自动无限循环重扫或覆盖较新 generation

#### Scenario: 部分读取失败
- **WHEN** 一个文件读取失败
- **THEN** 旧有效快照保留并显示失败数及重试入口
- **AND** 不用缺少该文件的部分索引宣称完整扫描

### Requirement: 取消和晚到结果不覆盖状态

系统 SHALL 用 generation 使取消或已替换的刷新结果无效，并在取消后 250ms 内停止领取新文件；未完成 I/O 的返回不代表可以提交。

#### Scenario: 取消后另一次刷新完成
- **WHEN** 第一代刷新被取消，第二代刷新已完成，第一代读取随后返回
- **THEN** 第一代不能覆盖索引、错误、进度或重新打开视图
- **AND** 当前 revision 保持第二代结果

### Requirement: 排除与写入后的派生状态一致

统一索引服务 SHALL 在正文读取前应用全局排除；mutation 稳定后只触发一次刷新，索引错误不得重复写入。

#### Scenario: 被排除文件仅有旧片段
- **WHEN** 全局排除目录改变且旧索引含该目录示例
- **THEN** 示例缓存失效并从有效持久化索引移除
- **AND** 后续健康/推荐上下文不可继续使用这些片段

#### Scenario: 批量写入产生多条文件事件
- **WHEN** 一个事务写入多个文件
- **THEN** 文件事件标记过期但不触发每文件全库扫描
- **AND** 事务稳定后统一刷新一次，失败只提供刷新重试

### Requirement: 列表性能有可重复门禁

实现 SHALL 使用固定夹具记录列表筛选 p95、DOM 行数、刷新并发与取消延迟，不能把性能目标描述为未经测量的事实。

#### Scenario: 性能夹具验收
- **WHEN** 对 1,000/10,000 标签暖索引预热五次并测量三十次筛选
- **THEN** 不含 debounce 的 p95 分别小于 150ms/300ms，或作为未通过门禁记录
- **AND** 同时记录机器、宿主版本、夹具大小及分页 DOM 规模
