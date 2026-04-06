# GitNexus Agent 安装与索引验收通用指南（任意仓库）

本指南面向“任何 coding agent”，目标是在**任意 Git 仓库**完成以下闭环：

1. 全局安装 `@veewo/gitnexus` CLI
2. 执行 `gitnexus setup`（按用户选择 `global/project` + `--agent`）
3. 按“已保存 scope 优先”策略确定索引范围（优先读取 `.gitnexus/sync-manifest.txt`）
4. 执行 `gitnexus analyze` 构建索引
5. 完成检索测试验收（`query/context/impact/cypher`）

## 版本与执行策略（必须遵守）

- `setup` 完成后，`~/.gitnexus/config.json` 是 npx 版本源的单一事实来源
- 整个会话只能有一个 CLI 版本源，禁止混用本地 `gitnexus` / 固定 `npx` 包版本 / `latest`
- 若用户在 prompt 指定版本，必须通过 `setup --cli-version` 或 `setup --cli-spec` 写入 `~/.gitnexus/config.json`
- 整个流程统一复用 `$GN`，不要在中途手写新的 npx 包版本
- `setup` 支持写入版本源：`--cli-version <version>` 或 `--cli-spec <packageSpec>`

```bash
if command -v gitnexus >/dev/null 2>&1; then
  GN="gitnexus"
else
  GITNEXUS_CLI_SPEC="$(
    node -e 'const fs=require("fs");const os=require("os");const path=require("path");
    try {
      const raw=fs.readFileSync(path.join(os.homedir(),".gitnexus","config.json"),"utf8");
      const parsed=JSON.parse(raw);
      const spec=typeof parsed.cliPackageSpec==="string" && parsed.cliPackageSpec.trim()
        ? parsed.cliPackageSpec.trim()
        : typeof parsed.cliVersion==="string" && parsed.cliVersion.trim()
          ? `@veewo/gitnexus@${parsed.cliVersion.trim()}`
          : "";
      if (spec) process.stdout.write(spec);
    } catch {}'
  )"
  if [ -z "$GITNEXUS_CLI_SPEC" ]; then
    echo "Missing GitNexus CLI package spec in ~/.gitnexus/config.json. Run gitnexus setup --cli-spec <packageSpec> first." >&2
    exit 1
  fi
  GN="npx -y ${GITNEXUS_CLI_SPEC}"
fi
```

## 一句话指令模板（给任意 agent）

把下面这句话直接发给 agent（URL 指向本文件的 raw 地址）：

```text
严格按照 https://raw.githubusercontent.com/nantas/GitNexus/refs/heads/nantas-dev/INSTALL-GUIDE.md 在当前仓库完成 GitNexus 首次安装、project 级 setup、索引构建和检索验收，不要简化步骤，也不要绕过文档里的 scope / sync-manifest / C# define 要求。
```

如果目标仓库已安装 GitNexus 且有 INSTALL-GUIDE 本地副本，可改为本地路径（替换为实际绝对路径）：

```text
严格按照 <INSTALL-GUIDE.md 的绝对路径> 在当前仓库完成 GitNexus 首次安装、project 级 setup、索引构建和检索验收，不要简化步骤，也不要绕过文档里的 scope / sync-manifest / C# define 要求。
```

> **注意**：不要使用 `/path/to/repo/INSTALL-GUIDE.md` 占位路径。必须替换为实际路径或直接使用上方 URL 版本。

## 0. 执行前必须确认（先检查，再确认）

在执行命令前，先确认这 4 项（第 3 项必须遵循“已保存 scope 优先”）：

1. `setup` 作用域：`global` 或 `project`
2. 目标 agent：`claude` / `opencode` / `codex`
3. 索引范围决策：
   - 先检查仓库内 `.gitnexus/sync-manifest.txt` 是否存在且非空
   - 若存在：默认按该 manifest 走 scoped analyze，先向用户复述“将复用已有 scope”，不再先问“全量还是 scoped”
   - 若不存在：再询问用户是全量还是新建 scoped（新建时确认包含/排除目录）
4. 验收输入：至少 2-3 个业务关键词，以及 1-2 个关键符号名（用于 `context/impact`）

## 1. 安装与版本确认

在任意仓库内可执行：

```bash
npm uninstall -g gitnexus
npm install -g "${GITNEXUS_CLI_SPEC}"

which gitnexus
gitnexus --version
npm view @veewo/gitnexus version --registry=https://registry.npmjs.org

if command -v gitnexus >/dev/null 2>&1; then
  GN="gitnexus"
else
  GITNEXUS_CLI_SPEC="$(
    node -e 'const fs=require("fs");const os=require("os");const path=require("path");
    try {
      const raw=fs.readFileSync(path.join(os.homedir(),".gitnexus","config.json"),"utf8");
      const parsed=JSON.parse(raw);
      const spec=typeof parsed.cliPackageSpec==="string" && parsed.cliPackageSpec.trim()
        ? parsed.cliPackageSpec.trim()
        : typeof parsed.cliVersion==="string" && parsed.cliVersion.trim()
          ? `@veewo/gitnexus@${parsed.cliVersion.trim()}`
          : "";
      if (spec) process.stdout.write(spec);
    } catch {}'
  )"
  if [ -z "$GITNEXUS_CLI_SPEC" ]; then
    echo "Missing GitNexus CLI package spec in ~/.gitnexus/config.json. Run gitnexus setup --cli-spec <packageSpec> first." >&2
    exit 1
  fi
  GN="npx -y ${GITNEXUS_CLI_SPEC}"
fi
```

通过标准：

- `gitnexus --version` 与 npm 最新版本一致（或符合团队指定版本）
- `which gitnexus` 指向当前有效的全局安装路径

## 2. Setup（严格按 agent 选择执行）

`setup` 必须传 `--agent <claude|opencode|codex>`。  
若用户在 prompt 指定版本，必须同时传 `--cli-version` 或 `--cli-spec`，确保 MCP 配置与当前会话一致。

**首次在仓库内接入时，默认推荐 `--scope project`。**  
原因：首次接入最常见的目标是让当前仓库马上可用，并把 `.mcp.json` / `.codex/config.toml` / `opencode.json`、repo-local skills 和 AI context 文件一并落到仓库里，减少“全局已装好但当前仓库未接线”的误判。

### 2.1 Global 示例

```bash
$GN setup --agent claude --cli-spec "$GITNEXUS_CLI_SPEC"
$GN setup --agent opencode --cli-spec "$GITNEXUS_CLI_SPEC"
$GN setup --agent codex --cli-spec "$GITNEXUS_CLI_SPEC"
```

### 2.2 Project 示例（在目标 repo 根目录）

```bash
$GN setup --scope project --agent claude --cli-spec "$GITNEXUS_CLI_SPEC"
$GN setup --scope project --agent opencode --cli-spec "$GITNEXUS_CLI_SPEC"
$GN setup --scope project --agent codex --cli-spec "$GITNEXUS_CLI_SPEC"
```

### 2.3 预期改动

- `global + claude`：提示 `claude mcp add ...`，并安装全局 skills（Claude hooks 仅在该模式处理）
- `global + opencode`：写 `~/.config/opencode/opencode.json`（存在旧文件时兼容 `config.json`）+ 全局 skills
- `global + codex`：执行 `codex mcp add ...` + 全局 skills
- `project + claude`：写 `<repo>/.mcp.json` + 项目 skills
- `project + opencode`：写 `<repo>/opencode.json` + 项目 skills
- `project + codex`：写 `<repo>/.codex/config.toml` + 项目 skills

> **提交策略建议**：`setup` 和 `analyze` 会修改/生成多个文件（`.mcp.json`、`AGENTS.md`、`CLAUDE.md`、`.agents/skills/` 等）。建议将这些工具变更单独提交（如 `chore: gitnexus setup + analyze`），与业务代码改动分开，方便 review 和回滚。

## 3. 进入目标仓库并确认 alias 策略

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
```

推荐 alias 长期模式（同一 repo + 同一 scope 长期复用），例如：

```bash
ALIAS="$(basename "$REPO_ROOT")-core"
```

## 4. Scope 决策与 manifest 处理（已保存 scope 优先）

manifest 统一放在：`.gitnexus/sync-manifest.txt`

执行顺序（必须遵守）：

1. 先检查 `.gitnexus/sync-manifest.txt` 是否存在且非空
2. 若存在：直接复用该 manifest 作为 scoped 输入，并向用户确认”本次将复用已有 scope”
3. **若不存在：必须先询问用户”全量索引还是指定 scope”，禁止默认全量执行**（新建 scoped 时需确认包含/排除目录）
4. 只有用户明确要求改 scope 时，才覆盖写 manifest

> **⚠ clean 会删除 manifest**：`gitnexus clean --force` 会删除整个 `.gitnexus/` 目录，包括 `sync-manifest.txt`。如果需要 clean 后重建索引，先备份 manifest：
> ```bash
> cp .gitnexus/sync-manifest.txt /tmp/sync-manifest-backup.txt
> $GN clean --force
> mkdir -p .gitnexus && cp /tmp/sync-manifest-backup.txt .gitnexus/sync-manifest.txt
> ```

> **⚠ scope 变更场景**：如果要修改 scope（改 manifest 内容或从全量切 scoped），必须加 `--no-reuse-options` 防止复用旧 scope：
> ```bash
> $GN analyze --repo-alias “$ALIAS” --scope-manifest .gitnexus/sync-manifest.txt --no-reuse-options
> ```

```bash
if [ -s .gitnexus/sync-manifest.txt ]; then
  echo "Using existing scope manifest: .gitnexus/sync-manifest.txt"
else
  echo "No existing scope manifest found."
fi
```

若用户选择新建或覆盖 scoped manifest：

```bash
mkdir -p .gitnexus
cat > .gitnexus/sync-manifest.txt <<'EOF'
# 一行一个路径前缀（不是 glob）
src
packages
EOF
```

**manifest 语法规则（必须遵守）：**

- 每行一个**路径前缀**，匹配该前缀下的所有文件（等价于 `startsWith`）
- 末尾 `*` 表示通配前缀（例如 `Packages/com.veewo.*` 匹配 `Packages/com.veewo.stat/...`）
- `#` 开头的行是注释，空行被忽略
- `@key=value` 形式是 analyze 指令，目前支持：
  - `@extensions=<csv>`
  - `@repoAlias=<name>`
  - `@embeddings=<true|false>`
- **不支持 glob 语法**：`Assets/**/*.cs`、`src/*.ts` 等写法无效，会导致零匹配
- `extensions` 和 `repoAlias` 优先写进 manifest，避免 scope 配置和 analyze 参数分裂成两份来源
- `--csharp-define-csproj <path>` 目前**不能**写进 manifest，仍需在 CLI 参数里显式传入

正确示例：

```text
Assets/NEON/Code
Packages/com.veewo.*
@extensions=.cs,.meta
@repoAlias=neonspark-core
```

错误示例（不要这样写）：

```text
Assets/**/*.cs        ← glob 语法，不会匹配任何文件
Assets/NEON/*.meta    ← 不支持中间通配
```

注意（必须遵守）：

- 这里的目录内容必须先由用户确认，不要直接套用固定模板
- 若已存在 manifest，默认复用；除非用户明确要求改 scope，否则不要覆盖
- 仅在“无 manifest 且用户选择全量”时，才跳过 manifest 并执行全量 analyze

### 4.1 Unity 项目首次接入（推荐做法）

如果当前仓库是 Unity 项目，**不要直接复用一个来源不明的旧 manifest 就开跑**。首次接入或怀疑 manifest 过期时，先检查并必要时创建/更新 `.gitnexus/sync-manifest.txt`，让 scope 和 analyze 关键选项落在同一个文件里。

推荐最小模板：

```bash
mkdir -p .gitnexus
cat > .gitnexus/sync-manifest.txt <<'EOF'
Assets/
Packages/
@extensions=.cs,.meta
@repoAlias=<repo-alias>
EOF
```

说明：

- `Assets/` 和 `Packages/` 是 Unity 项目首次接入时的推荐最小范围
- `@extensions=.cs,.meta` 用于启用 Unity 资源边所需的 C# 与 `.meta` 解析
- `@repoAlias` 建议一并写入 manifest，减少 analyze 命令重复传参
- 如果仓库使用条件编译，后续 analyze 仍要显式传 `--csharp-define-csproj <path-to-Assembly-CSharp.csproj>`

## 5. 执行 Analyze

### 5.1 Scoped（优先：复用已有 manifest）

```bash
$GN analyze \
  --scope-manifest .gitnexus/sync-manifest.txt
```

如果 manifest 尚未包含 `@repoAlias`，再补：

```bash
$GN analyze \
  --repo-alias "$ALIAS" \
  --scope-manifest .gitnexus/sync-manifest.txt
```

### 5.1.1 Unity 首次构建索引（推荐命令）

```bash
$GN analyze \
  --scope-manifest .gitnexus/sync-manifest.txt \
  --csharp-define-csproj <path-to-Assembly-CSharp.csproj>
```

如果 manifest 里还没写 `@repoAlias`，则补上：

```bash
$GN analyze \
  --repo-alias "$ALIAS" \
  --scope-manifest .gitnexus/sync-manifest.txt \
  --csharp-define-csproj <path-to-Assembly-CSharp.csproj>
```

规则：

- Unity 项目优先把 `Assets/`、`Packages/`、`@extensions=.cs,.meta`、`@repoAlias` 写进 manifest
- `--csharp-define-csproj` 仍需显式传入，避免第一次构建索引时丢失正确的 `DefineConstants`
- 如果所有代码都在 `Assets/` 下，也仍然建议先写 manifest，而不是只传一次性的 `--scope-prefix Assets/`

### 5.2 Full（全量）

```bash
$GN analyze --repo-alias "$ALIAS"
```

预期结果：

- 生成/更新 `<repo>/.gitnexus/`
- 生成/更新 `<repo>/AGENTS.md` 和 `<repo>/CLAUDE.md`
- skills 安装路径遵循 `setup` 作用域

## 6. 验收测试（必须执行）

> **验收以 CLI 为准**：CLI 直接读取最新索引，MCP 可能使用会话缓存。如果 CLI 验收通过但 MCP 结果不一致，先完成 CLI 验收，然后按第 9 节重启会话后再做 MCP 验收。

### 6.1 基础状态

```bash
$GN status
$GN list
```

通过标准：

- `status` 可读且状态合理（`up-to-date` 或可解释的 `stale`）
- `list` 中可看到目标 alias 与正确路径

### 6.2 Query（用用户给出的业务关键词）

> Unity 资源增强默认关闭（`unity_resources=off`）。仅在需要 Unity 资源字段时加 `--unity-resources on`。

```bash
$GN query "<keyword-1>" --repo "$ALIAS" --limit 5
$GN query "<keyword-2>" --repo "$ALIAS" --limit 5
# 如需 Unity 资源增强：
$GN query "<keyword-1>" --repo "$ALIAS" --limit 5 --unity-resources on
```

通过标准：

- 返回结果与目标业务链路相关
- 前排结果没有明显跨模块噪声

### 6.3 Context / Impact（用用户给出的关键符号）

```bash
$GN context "<symbol-1>" --repo "$ALIAS"
# 如需 Unity 资源增强：
$GN context "<symbol-1>" --repo "$ALIAS" --unity-resources on
$GN impact "<symbol-1>" --repo "$ALIAS" --depth 3
```

如果 `context` 出现同名歧义：

```bash
$GN context "<symbol-1>" --repo "$ALIAS" -f "<relative/file/path>"
# 或
$GN context --repo "$ALIAS" -u "<uid>"
```

### 6.4 Cypher 抽样

```bash
$GN cypher "MATCH (n) RETURN count(n) AS total_nodes" --repo "$ALIAS"
```

通过标准：

- 查询可执行
- `total_nodes > 0`

## 7. 交付模板（agent 输出）

```markdown
- CLI version: @veewo/gitnexus@x.y.z
- Setup scope/agent: global|project + claude|opencode|codex
- Analyze mode: scoped|full
- Repo alias: <alias>
- Manifest: .gitnexus/sync-manifest.txt（若 scoped）
- Status: PASS/FAIL
- Query: PASS/FAIL
- Context: PASS/FAIL
- Impact: PASS/FAIL
- Cypher: PASS/FAIL
- 结论: 可进入任务执行 / 需补充范围或重建索引
```

## 8. 全局注册维护（可选）

全局注册文件在 `~/.gitnexus/registry.json`，常用维护命令：

```bash
$GN analyze [path]      # 注册/更新
$GN list                # 查看（会清理失效项）
$GN clean --force       # 反注册当前仓库
$GN clean --all --force # 全量清理
```

## 9. 验收完成后的会话重启要求（必须提示用户）

当安装、`setup`、`analyze`、检索验收全部通过后，agent 必须明确提示用户：

1. 退出当前 coding agent CLI 会话
2. 在目标仓库重新启动 coding agent CLI

原因：

- MCP 配置在部分工具中只会在会话启动时加载
- 不重启会话可能导致“配置已写入但当前会话仍未连接 MCP”的假象
