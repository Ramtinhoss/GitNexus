# Specification Delta

## Capability 对齐（已确认）

- Capability: `truth-source-line-calibration`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: modified
- 用户确认摘要: 真源文档行号全面漂移，需要校准

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## MODIFIED Requirements

### Requirement: code-line-references-accuracy
真源文档 `docs/unity-runtime-process-source-of-truth.md` 中所有 `文件名:行号` 引用 SHALL 与当前代码库实际行号一致。

校准清单（ SHALL 逐项修正）：

| 真源文档描述 | 当前引用 | 校准目标 |
|-------------|---------|---------|
| `processUnityResources` 调用 | `pipeline.ts:441` | `pipeline.ts:498` |
| Unity 自动检测（`resolveUnityConfig`） | `pipeline.ts:444` | `pipeline.ts:502` |
| Lifecycle 持久化控制 | `pipeline.ts:446` | `pipeline.ts:505` |
| `processProcesses` 调用 | `pipeline.ts:490-525` | `pipeline.ts:534-580` |
| Phase 1 已落地 schema 引用 | `schema.ts:254` | `gitnexus/src/core/lbug/schema.ts`（无特定行号；REL_TYPES 定义在 :40-42） |
| HAS_METHOD→STEP_IN_PROCESS 合并 | `local-backend.ts:763-793` | `local-backend.ts:736-748` |
| context 侧投影逻辑 | `local-backend.ts:1460-1483` | 需根据 context handler 中的实际 STEP_IN_PROCESS 查询位置校准 |
| 证据模式合并 | `process-evidence.ts:46-114` | `process-evidence.ts:45-103`（文件仅 104 行） |
| lifecycle 回调注入 | `unity-lifecycle-synthetic-calls.ts:52-107` | `unity-lifecycle-synthetic-calls.ts:52-103` |
| 配置接口定义 | `unity-config.ts:4-18` | `unity-config.ts:1-13` |
| 配置默认值 | `unity-config.ts:26-40` | `unity-config.ts:26-40`（实际行号匹配，但内容需增加新参数） |

#### Scenario: line-number-audit
- **WHEN** 开发者阅读真源文档中的任意 `文件名:行号` 引用
- **THEN** 在对应源码文件中定位到该行时，SHALL 看到引用描述匹配的代码

### Requirement: config-parameter-completeness
真源文档 §5.2 调优参数表 SHALL 包含 `unity-config.ts` 中 `UnityConfig` 接口的全部字段及其默认值。

#### Scenario: missing-params-added
- **WHEN** `unity-config.ts` 的 `UnityConfig` 接口包含 `paritySeedCacheIdleMs`、`paritySeedCacheMaxEntries`、`parityCacheMaxEntries` 三个字段
- **THEN** 真源文档 §5.2 参数表 SHALL 包含以下行：

| 参数 | 默认值 | 作用 |
|------|--------|------|
| `paritySeedCacheIdleMs` | 60000 | parity seed 缓存条目空闲过期时间（ms） |
| `paritySeedCacheMaxEntries` | 100 | parity seed 缓存最大条目数 |
| `parityCacheMaxEntries` | 500 | parity 结果缓存最大条目数 |

#### Scenario: code-reference-updated
- **WHEN** 参数表补充完毕
- **THEN** 底部代码依据引用 SHALL 更新为 `gitnexus/src/core/config/unity-config.ts:1-16,26-41`
