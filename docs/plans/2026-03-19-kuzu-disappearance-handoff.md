# .gitnexus/kuzu 消失问题取证 Handoff（2026-03-19）

## 1. 背景与目标
- 现象：Unity 仓库 `neonnew` 中，重建索引后一段时间再用 GitNexus CLI 时，报告 `.gitnexus/kuzu` 相关文件消失。
- 用户已确认：当前主机使用的是 fork 包 `@veewo/gitnexus@1.3.11`，不是官方 `gitnexus@1.3.11`。
- 本次目标：定位 2 个指定 session 是否执行了会导致索引目录变化的命令，并找出同时间段其它 thread 的可疑操作。

## 2. 调查范围
- 目标 session:
  - `019d0447-b33f-71a3-8594-dc6bdc65297b`
  - `019d047b-9961-7ff1-a2b1-c6a3e16eacd8`
- 取证窗口（UTC）：
  - 重点看 `2026-03-19 04:00:00 ~ 06:00:00`
- 目标仓库：
  - `/Volumes/Shuttle/unity-projects/neonnew`

## 3. 证据来源（可复查）
- Codex 结构化日志库：
  - `/Users/nantasmac/.codex/logs_1.sqlite`
- Codex 文本日志：
  - `/Users/nantasmac/.codex/log/codex-tui.log`
- Session 归档：
  - `/Users/nantasmac/.codex/sessions/2026/03/19/*.jsonl`
- 仓库侧配置与索引状态：
  - `/Volumes/Shuttle/unity-projects/neonnew/.codex/config.toml`
  - `/Volumes/Shuttle/unity-projects/neonnew/.gitnexus/meta.json`

## 4. 核心结论（先看）
1. 两个指定 session 本身没有执行 `npx -y gitnexus analyze/clean`、`rm -rf .gitnexus`、`git clean -fdx/-fdX`。
2. 同时间段存在另一个 thread 在同仓库执行了 `npx -y gitnexus analyze`：
   - `thread_id=019d005b-3d4b-77c0-a519-47cfd6412c92`
   - 时间：`2026-03-19 04:06:07 UTC`（北京时间 `2026-03-19 12:06:07`）
3. 当前最强可疑链路是：并发/前序 thread 的 analyze 重建行为导致索引形态变化，而非两个目标 session 直接删除。
4. 同时存在“包名分流风险”：工程 MCP 固定到 `@veewo/gitnexus@latest`，但可疑命令是 unscoped `npx -y gitnexus analyze`，可能命中官方 `gitnexus`。

## 5. 关键证据明细

### 5.1 目标 session 命令审计
- 对 `019d0447`、`019d047b` 的 `ToolCall` 做筛选：
  - 关键词：`npx -y gitnexus analyze|gitnexus clean|rm -rf .gitnexus|git clean -fdx|git clean -fdX|git clean -xdf`
  - 结果：两个 session 均为 `0`。

### 5.2 时间窗口内可疑命令（UTC 04:00~06:00）
- 命中条目（`/Volumes/Shuttle/unity-projects/neonnew`）：
  - `2026-03-19 04:06:07 UTC`
  - `thread_id=019d005b-3d4b-77c0-a519-47cfd6412c92`
  - 命令：`npx -y gitnexus analyze`
  - 该 thread 紧接着在 `04:07:40 UTC` 执行了 `npx -y gitnexus status`

### 5.3 与索引元数据时间对齐
- `meta.json`:
  - `indexedAt = 2026-03-19T04:07:31.866Z`
  - 与上面的 `04:06:07 analyze` 在时间上强一致。

### 5.4 当前磁盘状态快照（采样时）
- `.gitnexus` 目录内容包含：
  - `meta.json`
  - `sync-manifest.txt`
  - `unity-lazy-overlay/`
  - `unity-parity-seed.json`
- 未见 `kuzu` 文件/目录（采样时）。

### 5.5 配置与版本分流证据
- 项目 MCP 配置：
  - `/Volumes/Shuttle/unity-projects/neonnew/.codex/config.toml`
  - `args = ["-y", "@veewo/gitnexus@latest", "mcp"]`
- npm registry（采样时）：
  - `gitnexus@latest = 1.4.6`
  - `@veewo/gitnexus@latest = 1.3.11`
- 含义：unscoped `npx -y gitnexus ...` 与 scoped `npx -y @veewo/gitnexus...` 解析目标不同，存在混用风险。

## 6. 目前推断（带置信度）
- 高置信度：
  - 两个目标 session 不是直接触发源（未执行清理/重建命令）。
  - `thread 019d005b` 在中间时段执行过重建命令，并且与 `meta.indexedAt` 时间吻合。
- 中置信度：
  - 发生的“kuzu 消失”与 unscoped analyze（可能命中官方包）有关，导致索引布局/文件形态与 fork 期望不一致。

## 7. 尚未闭环的问题
1. `04:06:07` 的 `npx -y gitnexus analyze` 实际落地到哪个 npm 包（官方 or fork）？
2. 该命令执行前后 `.gitnexus` 内文件树的精确变化（缺少当时瞬时快照）。
3. 是否存在其它并发 thread 在相邻时段对同目录做过二次重建/清理。

## 8. 下一 session 建议执行清单
1. 固化命令来源：
   - 在 `neonnew` 仓库执行 `npx -y gitnexus --version` 与 `npx -y @veewo/gitnexus@1.3.11 --version` 对照。
   - 如可行，增加 wrapper/alias 日志，记录每次 analyze 的 `package name + version + argv + cwd`。
2. 做文件时间线取证：
   - 记录 `.gitnexus` 全目录 mtime/ctime 快照，并在 analyze 前后 diff。
3. 收敛执行入口：
   - 将所有文档/脚本中的 `npx -y gitnexus ...` 统一替换为 `npx -y @veewo/gitnexus@1.3.11 ...`（至少在该项目）。
4. 暂时规避并发干扰：
   - 同一仓库避免多个 Codex 线程并发执行 analyze/status/clean。

## 9. 本次取证用到的关键查询（摘要）
```bash
# 1) 两个指定 session 的 ToolCall 审计
sqlite3 ~/.codex/logs_1.sqlite "
SELECT datetime(ts,'unixepoch'), thread_id, message
FROM logs
WHERE thread_id IN ('019d0447-b33f-71a3-8594-dc6bdc65297b','019d047b-9961-7ff1-a2b1-c6a3e16eacd8')
  AND message LIKE '%ToolCall:%'
ORDER BY ts, ts_nanos;"

# 2) 时间窗口内 neonnew 的可疑命令
sqlite3 ~/.codex/logs_1.sqlite "
SELECT datetime(ts,'unixepoch'), thread_id, message
FROM logs
WHERE message LIKE '%ToolCall:%'
  AND message LIKE '%/Volumes/Shuttle/unity-projects/neonnew%'
  AND ts BETWEEN strftime('%s','2026-03-19 04:00:00') AND strftime('%s','2026-03-19 06:00:00')
  AND (message LIKE '%npx -y gitnexus analyze%'
       OR message LIKE '%gitnexus clean%'
       OR message LIKE '%rm -rf .gitnexus%'
       OR message LIKE '%git clean -fdx%'
       OR message LIKE '%git clean -fdX%'
       OR message LIKE '%git clean -xdf%')
ORDER BY ts, ts_nanos;"
```

---
交接说明：本文件用于新 session 继续定位根因与制定修复/防复发策略，重点先验证 `unscoped npx -y gitnexus` 与 `@veewo/gitnexus` 的实际执行差异。
