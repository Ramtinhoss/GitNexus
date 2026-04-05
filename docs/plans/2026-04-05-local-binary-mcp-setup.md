# Local Binary MCP Setup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `npx -y @veewo/gitnexus@<version> mcp` with `gitnexus mcp` in all MCP configs written by `setup`, remove hardcoded version strings from generated AGENTS.md/CLAUDE.md, and add a dev-workflow (npm link) section to those generated files.

**Architecture:** Three source files change (`setup.ts`, `ai-context.ts`, `analyze.ts`), one test file updates (`setup.test.ts`). `getMcpEntry` becomes a zero-argument function returning `{ command: 'gitnexus', args: ['mcp'] }`. `generateGitNexusContent` drops the `cliPackageSpec` parameter and embeds a static resolution-pattern description instead of a resolved command string. `generateAIContextFiles` drops `cliPackageSpec` from its options interface. `analyze.ts` stops passing `cliPackageSpec` to `generateAIContextFiles`. All test assertions that checked for `npx`/`-y`/package-spec in MCP entries are updated to check for `gitnexus`/`mcp`.

**Tech Stack:** TypeScript, Node.js built-in test runner (`node:test`), Vitest (unit tests), npm link for dev workflow.

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1: Update `getMcpEntry` in setup.ts | pending |
Task 2: Remove `mcpPackageSpec` threading in setup.ts | pending |
Task 3: Update `setupClaudeCode` print statement | pending |
Task 4: Remove `DEFAULT_MCP_PACKAGE_SPEC` constant | pending |
Task 5: Update `setup.test.ts` assertions | pending |
Task 6: Update `generateGitNexusContent` in ai-context.ts | pending |
Task 7: Update `generateAIContextFiles` options interface | pending |
Task 8: Update `analyze.ts` call site | pending |
Task 9: Build and run setup tests | pending |
Task 10: Run vitest unit tests | pending |
Task 11: Commit | pending |

---

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01: MCP entry uses `gitnexus mcp` not `npx -y <pkg> mcp` | critical | Task 1, Task 5 | `cd gitnexus && node --test dist/cli/setup.test.js 2>&1 \| grep -E "pass\|fail"` | `~/.cursor/mcp.json:mcpServers.gitnexus.command` = `"gitnexus"` | command is `"npx"` or args contain `-y`
DC-02: No hardcoded version in generated AGENTS.md/CLAUDE.md stale warning | critical | Task 6, Task 10 | `cd gitnexus && npx vitest run test/unit/workflow-version-guidance.test.ts` | generated content does not contain `npx -y @veewo/gitnexus@` | test output shows `toContain` failure
DC-03: Dev workflow (npm link) section present in generated content | critical | Task 6 | manual check of generated AGENTS.md after analyze | generated content contains `npm link` | section absent from generated file
DC-04: `cliPackageSpec` still persisted to `~/.gitnexus/config.json` by `saveSetupConfig` | critical | Task 2 | `cd gitnexus && node --test dist/cli/setup.test.js 2>&1 \| grep "config"` | `~/.gitnexus/config.json:cliPackageSpec` present after setup | config file missing `cliPackageSpec` key
DC-05: `--cli-version` pin still works (persists to config, does NOT affect MCP entry) | critical | Task 5 | `cd gitnexus && node --test dist/cli/setup.test.js` | `savedConfig.cliPackageSpec` = `@veewo/gitnexus@1.4.7-rc`; MCP command = `gitnexus` | MCP command is `npx` or savedConfig missing

---

## Authenticity Assertions

- `assert MCP command !== 'npx'` — catches any regression to old npx path
- `assert MCP args does not include '-y'` — catches partial regression
- `assert generated content does not contain 'npx -y @veewo/gitnexus@'` — catches version leak
- `assert savedConfig.cliPackageSpec is defined` — catches accidental removal of config persistence

---

### Task 1: Update `getMcpEntry` to return `gitnexus mcp`

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/cli/setup.ts:81-92`

**Step 1: Replace the entire `getMcpEntry` function**

Old (lines 81-92):
```typescript
function getMcpEntry(mcpPackageSpec: string): McpEntry {
  if (process.platform === 'win32') {
    return {
      command: 'cmd',
      args: ['/c', 'npx', '-y', mcpPackageSpec, 'mcp'],
    };
  }
  return {
    command: 'npx',
    args: ['-y', mcpPackageSpec, 'mcp'],
  };
}
```

New:
```typescript
function getMcpEntry(): McpEntry {
  if (process.platform === 'win32') {
    return {
      command: 'cmd',
      args: ['/c', 'gitnexus', 'mcp'],
    };
  }
  return {
    command: 'gitnexus',
    args: ['mcp'],
  };
}
```

---

### Task 2: Remove `mcpPackageSpec` threading from all setup functions

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/cli/setup.ts` (multiple sites)

**Step 1: Update `getOpenCodeMcpEntry`**

Old (lines 94-100):
```typescript
function getOpenCodeMcpEntry(mcpPackageSpec: string) {
  const entry = getMcpEntry(mcpPackageSpec);
```

New:
```typescript
function getOpenCodeMcpEntry() {
  const entry = getMcpEntry();
```

**Step 2: Update `mergeMcpConfig`**

Old (lines 106-115):
```typescript
function mergeMcpConfig(existing: any, mcpPackageSpec: string): any {
  ...
  existing.mcpServers.gitnexus = getMcpEntry(mcpPackageSpec);
```

New:
```typescript
function mergeMcpConfig(existing: any): any {
  ...
  existing.mcpServers.gitnexus = getMcpEntry();
```

**Step 3: Update `mergeOpenCodeConfig`**

Old (lines 121-130):
```typescript
function mergeOpenCodeConfig(existing: any, mcpPackageSpec: string): any {
  ...
  existing.mcp.gitnexus = getOpenCodeMcpEntry(mcpPackageSpec);
```

New:
```typescript
function mergeOpenCodeConfig(existing: any): any {
  ...
  existing.mcp.gitnexus = getOpenCodeMcpEntry();
```

**Step 4: Update `buildCodexMcpTable`**

Old (line 183):
```typescript
function buildCodexMcpTable(mcpPackageSpec: string): string {
  const entry = getMcpEntry(mcpPackageSpec);
```

New:
```typescript
function buildCodexMcpTable(): string {
  const entry = getMcpEntry();
```

**Step 5: Update `mergeCodexConfig`**

Old (line 192):
```typescript
function mergeCodexConfig(existingRaw: string, mcpPackageSpec: string): string {
  const table = buildCodexMcpTable(mcpPackageSpec);
```

New:
```typescript
function mergeCodexConfig(existingRaw: string): string {
  const table = buildCodexMcpTable();
```

**Step 6: Update `setupCursor`**

Old (line 218):
```typescript
async function setupCursor(result: SetupResult, mcpPackageSpec: string): Promise<void> {
  ...
  const updated = mergeMcpConfig(existing, mcpPackageSpec);
```

New:
```typescript
async function setupCursor(result: SetupResult): Promise<void> {
  ...
  const updated = mergeMcpConfig(existing);
```

**Step 7: Update `setupClaudeCode` signature**

Old (line 236):
```typescript
async function setupClaudeCode(result: SetupResult, mcpPackageSpec: string): Promise<void> {
```

New:
```typescript
async function setupClaudeCode(result: SetupResult): Promise<void> {
```

(Body updated in Task 3.)

**Step 8: Update `installClaudeCodeHooks` signature**

Old (line 286):
```typescript
async function installClaudeCodeHooks(result: SetupResult, mcpPackageSpec: string): Promise<void> {
```

New:
```typescript
async function installClaudeCodeHooks(result: SetupResult): Promise<void> {
```

(`mcpPackageSpec` was never used inside this function body — only in the signature.)

**Step 9: Update `setupOpenCode`**

Old (line 359):
```typescript
async function setupOpenCode(result: SetupResult, mcpPackageSpec: string): Promise<void> {
  ...
  const config = mergeOpenCodeConfig(existing, mcpPackageSpec);
```

New:
```typescript
async function setupOpenCode(result: SetupResult): Promise<void> {
  ...
  const config = mergeOpenCodeConfig(existing);
```

**Step 10: Update `setupCodex`**

Old (line 377):
```typescript
async function setupCodex(result: SetupResult, mcpPackageSpec: string): Promise<void> {
  const entry = getMcpEntry(mcpPackageSpec);
```

New:
```typescript
async function setupCodex(result: SetupResult): Promise<void> {
  const entry = getMcpEntry();
```

**Step 11: Update `setupProjectMcp`**

Old (line 396):
```typescript
async function setupProjectMcp(repoRoot: string, result: SetupResult, mcpPackageSpec: string): Promise<void> {
  ...
  const updated = mergeMcpConfig(existing, mcpPackageSpec);
```

New:
```typescript
async function setupProjectMcp(repoRoot: string, result: SetupResult): Promise<void> {
  ...
  const updated = mergeMcpConfig(existing);
```

**Step 12: Update `setupProjectCodex`**

Old (line 408):
```typescript
async function setupProjectCodex(repoRoot: string, result: SetupResult, mcpPackageSpec: string): Promise<void> {
  ...
  const merged = mergeCodexConfig(existingRaw, mcpPackageSpec);
```

New:
```typescript
async function setupProjectCodex(repoRoot: string, result: SetupResult): Promise<void> {
  ...
  const merged = mergeCodexConfig(existingRaw);
```

**Step 13: Update `setupProjectOpenCode`**

Old (line 427):
```typescript
async function setupProjectOpenCode(repoRoot: string, result: SetupResult, mcpPackageSpec: string): Promise<void> {
  ...
  const merged = mergeOpenCodeConfig(existing, mcpPackageSpec);
```

New:
```typescript
async function setupProjectOpenCode(repoRoot: string, result: SetupResult): Promise<void> {
  ...
  const merged = mergeOpenCodeConfig(existing);
```

**Step 14: Update all call sites in `setupCommand` (lines 598-632)**

Remove `mcpPackageSpec` argument from every call:
```typescript
await setupCursor(result);
await setupClaudeCode(result);
await installClaudeCodeHooks(result);
await setupOpenCode(result);
await setupCodex(result);
await setupProjectMcp(repoRoot, result);
await setupProjectCodex(repoRoot, result);
await setupProjectOpenCode(repoRoot, result);
```

`saveSetupConfig(scope, mcpPackageSpec, result)` calls stay unchanged — `mcpPackageSpec` is still the resolved spec from `resolvedCliSpec.packageSpec`, used only for config persistence.

---

### Task 3: Update `setupClaudeCode` print statement

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/cli/setup.ts:249`

**Step 1: Replace the printed command**

Old (line 249):
```typescript
console.log(`    claude mcp add gitnexus -- ${buildNpxCommand(mcpPackageSpec, 'mcp')}`);
```

New:
```typescript
console.log(`    claude mcp add gitnexus -- gitnexus mcp`);
```

---

### Task 4: Remove `DEFAULT_MCP_PACKAGE_SPEC` constant and clean up imports

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/cli/setup.ts:18,75,588`

**Step 1: Delete the constant (line 75)**

Remove:
```typescript
const DEFAULT_MCP_PACKAGE_SPEC = resolveCliSpec().packageSpec;
```

**Step 2: Simplify the mcpPackageSpec resolution (line 588)**

Old:
```typescript
const mcpPackageSpec = resolvedCliSpec.packageSpec || DEFAULT_MCP_PACKAGE_SPEC;
```

New:
```typescript
const mcpPackageSpec = resolvedCliSpec.packageSpec;
```

**Step 3: Remove `buildNpxCommand` from import (line 18)**

Old:
```typescript
import { buildNpxCommand, resolveCliSpec } from '../config/cli-spec.js';
```

New:
```typescript
import { resolveCliSpec } from '../config/cli-spec.js';
```

---

### Task 5: Update `setup.test.ts` assertions

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/cli/setup.test.ts`

**Step 1: Update legacy Cursor test (lines 44-45)**

Old:
```typescript
assert.equal(cursorMcp.mcpServers?.gitnexus?.command, 'npx');
assert.deepEqual(cursorMcp.mcpServers?.gitnexus?.args, ['-y', expectedMcpPackage, 'mcp']);
```

New:
```typescript
assert.equal(cursorMcp.mcpServers?.gitnexus?.command, 'gitnexus');
assert.deepEqual(cursorMcp.mcpServers?.gitnexus?.args, ['mcp']);
```

**Step 2: Update Codex CLI test (around lines 177-179)**

The shim captures args passed to `codex mcp add gitnexus --`. After the change, the args after `--` will be `['gitnexus', 'mcp']`. Update to:
```typescript
assert.deepEqual(parsed.args.slice(0, 4), ['mcp', 'add', 'gitnexus', '--']);
assert.ok(parsed.args.includes('gitnexus'));
assert.ok(parsed.args.includes('mcp'));
```

Remove any assertion that checks `parsed.args.includes(expectedMcpPackage)`.

**Step 3: Update OpenCode global test (line 206)**

Old:
```typescript
assert.deepEqual(opencodeConfig.mcp?.gitnexus?.command, ['npx', '-y', expectedMcpPackage, 'mcp']);
```

New:
```typescript
assert.deepEqual(opencodeConfig.mcp?.gitnexus?.command, ['gitnexus', 'mcp']);
```

**Step 4: Update `--cli-version` pin test (around line 238)**

The MCP entry no longer embeds the version. The version is only persisted to config. Update:

Old:
```typescript
assert.deepEqual(opencodeConfig.mcp?.gitnexus?.command, ['npx', '-y', '@veewo/gitnexus@1.4.7-rc', 'mcp']);
```

New:
```typescript
assert.deepEqual(opencodeConfig.mcp?.gitnexus?.command, ['gitnexus', 'mcp']);
// Version is persisted to config, not MCP entry:
assert.equal(savedConfig.cliPackageSpec, '@veewo/gitnexus@1.4.7-rc');
assert.equal(savedConfig.cliVersion, '1.4.7-rc');
```

**Step 5: Update legacy OpenCode config test (line 270)**

Old:
```typescript
assert.deepEqual(legacyConfig.mcp?.gitnexus?.command, ['npx', '-y', expectedMcpPackage, 'mcp']);
```

New:
```typescript
assert.deepEqual(legacyConfig.mcp?.gitnexus?.command, ['gitnexus', 'mcp']);
```

**Step 6: Update project Codex TOML tests**

Find the TOML assertion block (around line 349-401). Update to expect `gitnexus` not `npx`:
```typescript
assert.match(codexConfigRaw, /\[mcp_servers\.gitnexus\]/);
assert.match(codexConfigRaw, /command = "gitnexus"/);
assert.match(codexConfigRaw, /args = \["mcp"\]/);
```

For the "replace existing table" test (around line 373), the old assertion checked for `"oldpkg@latest"` being replaced. Update to check that `gitnexus` is present and `oldpkg@latest` is absent:
```typescript
assert.match(gitnexusTable, /command = "gitnexus"/);
assert.doesNotMatch(gitnexusTable, /oldpkg@latest/);
assert.match(codexConfigRaw, /^\[profiles\.default\]$/m);
```

**Step 7: Update project OpenCode test (line 487)**

Old:
```typescript
assert.deepEqual(opencodeConfig.mcp?.gitnexus?.command, ['npx', '-y', expectedMcpPackage, 'mcp']);
```

New:
```typescript
assert.deepEqual(opencodeConfig.mcp?.gitnexus?.command, ['gitnexus', 'mcp']);
```

**Step 8: Update project Claude `.mcp.json` test**

Find the assertion for project claude MCP (around line 321). Update:
```typescript
assert.equal(projectMcp.mcpServers?.gitnexus?.command, 'gitnexus');
assert.deepEqual(projectMcp.mcpServers?.gitnexus?.args, ['mcp']);
```

**Step 9: Remove `expectedMcpPackage` and `packageName` if no longer used**

After all the above changes, scan for any remaining uses of `expectedMcpPackage`. If none remain, delete:
```typescript
const packageName = JSON.parse(
  await fs.readFile(path.join(packageRoot, 'package.json'), 'utf-8'),
) as { name?: string };
const expectedMcpPackage = `${packageName.name || 'gitnexus'}@latest`;
```

---

### Task 6: Update `generateGitNexusContent` in `ai-context.ts`

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/cli/ai-context.ts`

**Step 1: Remove `cliPackageSpec` parameter from `generateGitNexusContent`**

Old signature (line 43):
```typescript
function generateGitNexusContent(
  projectName: string,
  stats: RepoStats,
  skillScope: SkillScope,
  cliPackageSpec: string,
  generatedSkills?: GeneratedSkillInfo[],
): string {
```

New:
```typescript
function generateGitNexusContent(
  projectName: string,
  stats: RepoStats,
  skillScope: SkillScope,
  generatedSkills?: GeneratedSkillInfo[],
): string {
```

**Step 2: Remove `reindexCmd` local variable (line 58)**

Delete:
```typescript
const reindexCmd = buildNpxCommand(cliPackageSpec, 'analyze');
```

**Step 3: Replace the stale-warning line (line 71)**

Old (contains `${reindexCmd}`):
```
> If step 1 warns the index is stale, ask user whether to rebuild index via \`gitnexus analyze\` when local CLI exists; otherwise resolve the pinned npx package spec from \`~/.gitnexus/config.json\` (\`cliPackageSpec\` first, then \`cliVersion\`) and run \`${reindexCmd}\` with that exact package spec (it reuses previous analyze scope/options by default; add \`--no-reuse-options\` to reset). If user declines, explicitly warn that retrieval may not reflect current codebase. For build/analyze/test commands, use a 10-30 minute timeout; on failure/timeout, report exact tool output and do not auto-retry or silently fall back to glob/grep.
```

New (static, no interpolation):
```
> If step 1 warns the index is stale, ask user whether to rebuild index via \`gitnexus analyze\` when local CLI exists; otherwise resolve the pinned npx package spec from \`~/.gitnexus/config.json\` (\`cliPackageSpec\` first, then \`cliVersion\`) and run \`npx -y <resolved-spec> analyze\` (it reuses previous analyze scope/options by default; add \`--no-reuse-options\` to reset). If user declines, explicitly warn that retrieval may not reflect current codebase. For build/analyze/test commands, use a 10-30 minute timeout; on failure/timeout, report exact tool output and do not auto-retry or silently fall back to glob/grep.
```

**Step 4: Add dev workflow section before the closing marker**

Find the line containing `${GITNEXUS_END_MARKER}` in the template string. Insert the following block immediately before it:

```typescript
\n## Dev Workflow (Source Build)\n\nTo use a locally built dist instead of the globally installed package (useful when testing unreleased changes):\n\n\`\`\`bash\ncd /path/to/GitNexus/gitnexus\nnpm run build\nnpm link   # replaces global install with symlink to local dist/cli/index.js\n\`\`\`\n\nAfter \`npm link\`, \`gitnexus\` on this machine points to the local dist. All repos using \`gitnexus mcp\` in their MCP config will pick up the new build after restarting the agent session. To restore the published package: \`npm unlink -g @veewo/gitnexus && npm install -g @veewo/gitnexus\`.\n\n
```

**Step 5: Remove `buildNpxCommand` from import (line 13)**

Old:
```typescript
import { buildNpxCommand, resolveCliSpec } from '../config/cli-spec.js';
```

New (also check if `resolveCliSpec` is still used — it is, in `generateAIContextFiles` line 258):
```typescript
import { resolveCliSpec } from '../config/cli-spec.js';
```

---

### Task 7: Update `generateAIContextFiles` options interface and call

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/cli/ai-context.ts:246-265`

**Step 1: Remove `cliPackageSpec` from options interface**

Old (lines 251-254):
```typescript
options?: {
  skillScope?: SkillScope;
  cliPackageSpec?: string;
},
```

New:
```typescript
options?: {
  skillScope?: SkillScope;
},
```

**Step 2: Remove `cliPackageSpec` resolution and update `generateGitNexusContent` call**

Old (lines 257-265):
```typescript
const skillScope: SkillScope = options?.skillScope === 'global' ? 'global' : 'project';
const cliPackageSpec = options?.cliPackageSpec || resolveCliSpec().packageSpec;
const content = generateGitNexusContent(
  projectName,
  stats,
  skillScope,
  cliPackageSpec,
  generatedSkills,
);
```

New:
```typescript
const skillScope: SkillScope = options?.skillScope === 'global' ? 'global' : 'project';
const content = generateGitNexusContent(
  projectName,
  stats,
  skillScope,
  generatedSkills,
);
```

**Step 3: Check if `resolveCliSpec` import is still needed**

After removing the `cliPackageSpec` resolution line, `resolveCliSpec` is no longer called in `ai-context.ts`. Remove it from the import (already handled in Task 6 Step 5 — confirm the import line is now just):
```typescript
// No import from cli-spec.js needed — remove the entire line
```

---

### Task 8: Update `analyze.ts` call site

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/cli/analyze.ts:449-452`

**Step 1: Remove `cliPackageSpec` from options passed to `generateAIContextFiles`**

Old (lines 449-452):
```typescript
}, {
  skillScope: (cliConfig.setupScope === 'global') ? 'global' : 'project',
  cliPackageSpec: resolveCliSpec({ config: cliConfig }).packageSpec,
}, generatedSkills);
```

New:
```typescript
}, {
  skillScope: (cliConfig.setupScope === 'global') ? 'global' : 'project',
}, generatedSkills);
```

**Step 2: Check if `resolveCliSpec` is still used elsewhere in `analyze.ts`**

Search for other uses of `resolveCliSpec` in the file. If line 451 was the only call site, remove the import of `resolveCliSpec` from `analyze.ts`. Do not remove it if it is used elsewhere.

---

### Task 9: Build and run setup tests

**User Verification: not-required**

**Step 1: Build**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus && npm run build
```

Expected: exits 0, no TypeScript errors.

**Step 2: Run setup tests**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus && node --test dist/cli/setup.test.js 2>&1
```

Expected: all tests pass. Key assertions to confirm:
- `cursorMcp.mcpServers.gitnexus.command === 'gitnexus'`
- `opencodeConfig.mcp.gitnexus.command` deep equals `['gitnexus', 'mcp']`
- `savedConfig.cliPackageSpec === '@veewo/gitnexus@1.4.7-rc'` (pin test still passes)
- TOML contains `command = "gitnexus"` not `command = "npx"`

If any test fails, fix the implementation before proceeding.

---

### Task 10: Run vitest unit tests

**User Verification: not-required**

**Step 1: Run workflow-version-guidance and scoped-cli-commands tests**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus && npx vitest run test/unit/workflow-version-guidance.test.ts test/unit/scoped-cli-commands.test.ts
```

Expected: all pass. The `workflow-version-guidance` test checks:
- Generated content does not contain `@veewo/gitnexus@latest`, `${GITNEXUS_CLI_SPEC:-@veewo/gitnexus@latest}`, or `1.4.7-rc`
- Generated content contains `.gitnexus/config.json`

If the `.gitnexus/config.json` presence test fails, verify the stale-warning text in Task 6 Step 3 still contains `~/.gitnexus/config.json`.

---

### Task 11: Commit

**User Verification: not-required**

**Step 1: Stage and commit**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus && git add \
  gitnexus/src/cli/setup.ts \
  gitnexus/src/cli/ai-context.ts \
  gitnexus/src/cli/analyze.ts \
  gitnexus/src/cli/setup.test.ts
git commit -m "feat: use local gitnexus binary for MCP entry, drop version from generated docs"
```

---

## Plan Audit Verdict

```
audit_scope: requirements 1-3 (remove hardcoded versions, change MCP entry, add dev workflow)
finding_summary: P0=0, P1=1, P2=1
critical_mismatches:
- none
major_risks:
- P1: Task 5 Step 9 — expectedMcpPackage and packageName removal is conditional on no remaining usages; if any test still references them the variable must be kept. Mitigation: plan explicitly says "scan for remaining uses before deleting". Status: accepted
anti_placeholder_checks:
- assert MCP command !== 'npx': covered by Task 5 Steps 1, 3, 4, 5, 7, 8
- assert MCP args does not include '-y': covered by Task 5 Steps 1, 3
- assert savedConfig.cliPackageSpec is defined after --cli-version: covered by Task 5 Step 4
- assert generated content does not contain 'npx -y @veewo/gitnexus@': covered by Task 10
authenticity_checks:
- DC-01 has executable verification command and concrete evidence field: pass
- DC-02 has executable verification command and concrete evidence field: pass
- DC-03 has executable verification command: pass
- DC-04 has executable verification: pass
- DC-05 has executable verification: pass
improvement_suggestions:
- P2: workflow-version-guidance.test.ts does not currently assert that generated content contains 'npm link'. The plan adds the section to the generated content but no test guards it. Not blocking since the section is purely additive documentation.
approval_decision: pass
```
