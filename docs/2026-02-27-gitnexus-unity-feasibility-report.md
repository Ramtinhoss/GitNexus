# GitNexus 用于 Unity 巨型 Monorepo 的可行性报告

- 报告日期: 2026-02-27
- 评估对象: GitNexus（在 GitNexus 自身仓库中实测）
- 评估目标: 判断是否能满足“为 agent 高效构建与索引 Unity 代码”的需求

## 1. 结论摘要

GitNexus 对你的目标是“可用但不够开箱即用”。

它已经具备你真正需要的底座能力:
- 能把代码库转成结构化知识图谱（symbol、调用关系、流程、影响范围）
- 能通过 MCP/CLI 给 agent 提供 query/context/impact 等检索接口
- 支持 C# 语法解析，且有面向大仓库的内存与并行优化

但对 Unity monorepo 的关键语义，目前没有专门建模:
- 没有 Unity 生命周期入口识别（Awake/Start/Update/LateUpdate 等）
- 没有 Scene/Prefab/.meta/asmdef 的资源依赖图
- C# import/namespace 解析没有 Unity 约定层增强

因此结论是:
- 对“纯 C# 代码关系”场景: 可直接产生价值
- 对“Unity 运行时行为 + 资源依赖 + 场景装配”场景: 只能部分覆盖，需要定制

## 2. 工作原理（How It Works）

GitNexus 的核心是“离线索引 + 在线查询”。

离线索引阶段（`npx -y @veewo/gitnexus@latest analyze`）大致做 6 件事:
1. 扫描文件系统，建立文件结构图
2. 用 Tree-sitter 解析源码，提取函数/类/方法等符号
3. 解析 import 与调用，建立 `IMPORTS`、`CALLS`、`DEFINES` 等关系
4. 做社区聚类（clusters），形成功能区块
5. 做流程检测（processes），从入口点向下追踪调用链
6. 写入 Kuzu 图数据库，并建立全文检索索引

在线查询阶段通过 MCP/CLI 暴露:
- `query`: 按语义检索相关流程
- `context`: 单符号 360 度上下文
- `impact`: 改动影响面（blast radius）
- `detect_changes`: 按 git diff 做影响分析
- `cypher`: 原始图查询

本质上，GitNexus不是运行时代码执行器，而是“静态代码图谱系统 + 检索接口层”。

## 3. 基本结构（Architecture）

从组件看，可以拆成 5 层:

1. 采集与解析层
- 文件扫描、语言识别、Tree-sitter 解析、symbol/call/import/heritage 提取

2. 图构建层
- 统一节点类型（File/Function/Class/Method/Interface/Community/Process）
- 统一边类型（CALLS/IMPORTS/DEFINES/MEMBER_OF/STEP_IN_PROCESS 等）

3. 图存储与检索层
- Kuzu 本地图数据库
- FTS 索引（可选 embeddings）

4. 工具接口层
- CLI（analyze/status/list/query/context/impact...）
- MCP Server（给 Cursor/Claude/OpenCode 等 agent 工具链）

5. Agent 集成层
- 自动生成 AGENTS.md/CLAUDE.md
- 安装 skills 与 hooks，驱动 agent 在检索前先走图谱上下文

## 4. 工作流程（Workflow）

标准流程如下:

1. `setup`（一次性）
- 配置编辑器 MCP 与技能

2. `analyze`（每仓库）
- 生成 `.gitnexus/` 本地索引
- 更新全局 registry（`~/.gitnexus/registry.json`）
- 刷新 AGENTS/CLAUDE 上下文

3. `status`
- 检查当前仓库索引是否与当前 commit 一致

4. `query/context/impact`
- 在开发、调试、重构时给 agent 提供“流程 + 依赖 + 风险”证据

5. 代码演进后重复 `analyze`
- 保持索引新鲜，避免 stale graph

## 5. 实测效果（本次会话）

### 5.1 实测数据

在仓库 `/Volumes/Shuttle/projects/agentic/GitNexus` 的实测结果:

- `analyze --force` 成功完成
- 索引统计:
  - files: 210
  - symbols(nodes): 1411
  - edges: 3658
  - clusters: 94
  - processes: 109
- CLI 显示索引阶段耗时约 `3.9s`（该仓库规模较小）
- `status`: `✅ up-to-date`

### 5.2 工具输出质量观察

1. `query "ingestion pipeline"`
- 能返回流程集合与符号列表，支持从“概念”映射到“执行流”

2. `impact "runPipelineFromRepo" --depth 2`
- 能输出深度分层影响（byDepth）、受影响流程与模块
- 本例风险评估为 LOW，说明影响分析链路可工作

3. `context runPipelineFromRepo`
- 能给出 incoming/outgoing 调用关系
- 但出现同名符号跨子工程串联（`gitnexus` 与 `gitnexus-web` 混入）
- 这提示: 在 monorepo 内同名符号较多时，歧义和误连需要额外治理

### 5.3 运行与环境层观察

- 直接 `npx` 曾遇到 npm cache 权限问题，改用 `npm_config_cache=/tmp/.npm-cache` 后可工作
- 初次分析时因无法写 `~/.gitnexus` 导致 registry 缺失，提升权限后修复
- 结论: 工具本身可跑，但在企业/devbox 环境中需要提前做权限与缓存策略固化

## 6. 对 Unity 项目的效果预测

## 6.1 我认为会有效的部分

1. C# 脚本层代码关系
- 类/方法/调用的静态图谱可建立
- 对“某功能链路在哪些脚本里”这类问题会明显提速

2. agent 的改动风险控制
- `impact` 能在改脚本前给出依赖面
- 对重构、批量改名、拆分模块有直接价值

3. 结构混乱仓库的可探索性
- cluster + process 的组合能快速给出“功能域视图”

## 6.2 我认为会不足的部分

1. Unity 生命周期入口缺失
- Entry point scoring 目前没有 Unity 语义（Awake/Start/Update/OnEnable 等）
- 这会导致“流程检测”偏离真实运行入口

2. 资源图缺失
- Scene/Prefab/.meta/Addressables/asmdef 引用关系未建模
- 对实际游戏运行链路的解释力不够

3. Unity 特有动态调用问题
- 反射、SendMessage、序列化字段绑定、Inspector 注入等
- 静态 CALLS 图会天然漏边

4. 单仓多子域同名冲突
- 你的“巨型且结构混乱”场景下同名符号冲突概率更高
- 若不加强消歧，context/impact 结果可能有噪声

## 6.3 预测评分（基于当前能力）

- 代码索引覆盖（C#）: 7/10
- Unity 运行语义贴合: 4/10
- 资源依赖覆盖: 2/10
- 对 agent 开发效率提升（仅脚本层）: 7/10
- 对 agent 做端到端行为推理（含资源/场景）: 4/10

综合判断: 当前版本可作为 Unity monorepo 的“代码图谱底座”，但还不足以单独承担“完整 Unity 工程语义索引”。

## 7. 建议落地策略

建议采用“先可用、后增强”的两阶段路线:

第一阶段（低风险快速验证）
- 在你的 Unity 仓库先只覆盖核心 C# 脚本目录
- 验证 query/context/impact 对日常改动是否显著提效

第二阶段（针对 Unity 定制）
- 增加 Unity 入口点规则（生命周期 + 常见系统入口）
- 增加 Unity 目录与文件忽略策略（降低无效扫描）
- 增加 asmdef/scene/prefab/meta 的依赖解析插件
- 增加 monorepo 命名空间与模块级消歧策略

如果你愿意继续，我可以下一步给出“Unity 定制改造清单（按优先级 + 预估收益 + 实施成本）”。
