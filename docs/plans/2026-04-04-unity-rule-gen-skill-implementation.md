# Unity Rule-Gen Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable YAML-as-source-of-truth for Unity analyze_rules: parse Unity fields from YAML, compile YAML→bundle, and ship a `gitnexus-unity-rule-gen` skill for interactive rule creation.

**Architecture:** Extend `parseRuleYaml` to parse `resource_bindings`/`lifecycle_overrides` from YAML. Add these fields to `StageAwareCompiledRule` and `CompiledRuntimeRule`. Add `buildRuleYaml` serialization. New `rule-lab compile` CLI command reads approved YAML → writes compiled bundle. New skill SKILL.md encodes the interactive workflow.

**Tech Stack:** TypeScript, Commander.js CLI, custom YAML parser (no library), GitNexus MCP tools

---

## Status Ledger

Task | Status | Facts
--- | --- | ---
Task 1: parseRuleYaml parsing | completed | Exported parseRuleYaml, parses resource_bindings + lifecycle_overrides, 2 tests pass
Task 2: Type fields | completed | Added Unity fields to StageAwareCompiledRule + CompiledRuntimeRule
Task 3: Pass-through | completed | toStageAwareCompiledRule + compileRule spread Unity fields
Task 4: buildRuleYaml | completed | Serializes resource_bindings + lifecycle_overrides + family to YAML
Task 5: rule-lab compile | completed | New CLI command, tested on neonspark (3 bindings + lifecycle_overrides)
Task 6: catalog family | completed | CatalogEntry.family written from compiledRule.family
Task 7: SKILL.md | completed | gitnexus-unity-rule-gen skill with Phase 0-3 workflow
Task 8: e2e-verify update | completed | Added rule-lab compile step, fixed YAML template with topology/closure/claims

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01: parseRuleYaml parses resource_bindings | critical | Task 1 | `npx vitest run --reporter=verbose -- runtime-claim-rule-registry` | parsed rule `.resource_bindings[0].kind` | `resource_bindings` is undefined or empty
DC-02: parseRuleYaml parses lifecycle_overrides | critical | Task 1 | `npx vitest run --reporter=verbose -- runtime-claim-rule-registry` | parsed rule `.lifecycle_overrides.additional_entry_points` | `lifecycle_overrides` is undefined
DC-03: StageAwareCompiledRule has Unity fields | critical | Task 2 | `npx tsc --noEmit` | type check passes | tsc error on missing property
DC-04: toStageAwareCompiledRule passes Unity fields | critical | Task 3 | `npx vitest run --reporter=verbose -- promote` | compiled rule `.resource_bindings` | field missing in output
DC-05: buildRuleYaml outputs Unity fields | critical | Task 4 | `npx vitest run --reporter=verbose -- promote` | YAML contains `resource_bindings:` | YAML missing section
DC-06: rule-lab compile command works | critical | Task 5 | `node dist/cli/index.js rule-lab compile --help` | exits 0 with usage | command not found
DC-07: catalog family field written | medium | Task 6 | `npx vitest run --reporter=verbose -- promote` | catalog entry has `family` | field missing
DC-08: skill SKILL.md exists | medium | Task 7 | `test -f .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md` | file exists | file not found

## Authenticity Assertions

- `assert resource_bindings[0].kind === 'asset_ref_loads_components'` (not placeholder)
- `assert lifecycle_overrides.scope is a string path, not undefined`
- `assert buildRuleYaml round-trips: parseRuleYaml(buildRuleYaml(rule)).resource_bindings deep-equals original`
- `assert compiled bundle JSON contains resource_bindings array`

---

### Task 1: parseRuleYaml — parse resource_bindings and lifecycle_overrides

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/mcp/local/runtime-claim-rule-registry.ts:186-226`
- Test: `gitnexus/src/mcp/local/__tests__/runtime-claim-rule-registry.test.ts` (create if absent)

**Step 1: Write failing test**

Create test file (or add to existing) with:

```typescript
import { describe, it, expect } from 'vitest';
// parseRuleYaml is not exported — test via loadRuleRegistry or extract to testable helper.
// Simplest: add a named export `parseRuleYaml` (it's already a standalone function).

// For now, test indirectly by writing a YAML file and loading via loadAnalyzeRules.
// OR: export parseRuleYaml for testing. Preferred: export it.

describe('parseRuleYaml resource_bindings', () => {
  it('parses resource_bindings array from YAML', async () => {
    const { parseRuleYaml } = await import('../runtime-claim-rule-registry.js');
    const yaml = `id: unity.test.v2
version: 2.0.0
family: analyze_rules
resource_types:
  - asset
host_base_type:
  - MonoBehaviour
match:
  trigger_tokens:
    - test
resource_bindings:
  - kind: asset_ref_loads_components
    ref_field_pattern: "graph|gungraph"
    target_entry_points:
      - OnEnable
      - Awake
  - kind: method_triggers_field_load
    host_class_pattern: "WeaponPowerUp"
    field_name: gungraph
    loader_methods:
      - Equip
lifecycle_overrides:
  additional_entry_points:
    - Init
  scope: "Assets/Code/Graph"
topology:
closure:
  required_hops:
    - resource
claims:
  guarantees:
    - resource_to_runtime_chain_closed
  non_guarantees:
    - none
`;
    const rule = parseRuleYaml(yaml, 'test.yaml');
    expect(rule.resource_bindings).toHaveLength(2);
    expect(rule.resource_bindings![0].kind).toBe('asset_ref_loads_components');
    expect(rule.resource_bindings![0].ref_field_pattern).toBe('graph|gungraph');
    expect(rule.resource_bindings![0].target_entry_points).toEqual(['OnEnable', 'Awake']);
    expect(rule.resource_bindings![1].kind).toBe('method_triggers_field_load');
    expect(rule.resource_bindings![1].loader_methods).toEqual(['Equip']);
    expect(rule.lifecycle_overrides).toBeDefined();
    expect(rule.lifecycle_overrides!.additional_entry_points).toEqual(['Init']);
    expect(rule.lifecycle_overrides!.scope).toBe('Assets/Code/Graph');
  });

  it('returns undefined when no resource_bindings present', async () => {
    const { parseRuleYaml } = await import('../runtime-claim-rule-registry.js');
    const yaml = `id: unity.simple.v2
version: 2.0.0
family: verification_rules
match:
  trigger_tokens:
    - test
topology:
closure:
  required_hops:
    - resource
claims:
  guarantees:
    - chain_closed
  non_guarantees:
    - none
`;
    const rule = parseRuleYaml(yaml, 'simple.yaml');
    expect(rule.resource_bindings).toBeUndefined();
    expect(rule.lifecycle_overrides).toBeUndefined();
  });
});
```

**Step 2: Run test — expect FAIL**

Run: `cd gitnexus && npx vitest run --reporter=verbose -- runtime-claim-rule-registry`
Expected: FAIL — `parseRuleYaml` is not exported, or `resource_bindings` is undefined.

**Step 3: Export parseRuleYaml and implement parsing**

In `runtime-claim-rule-registry.ts`, change `function parseRuleYaml` to `export function parseRuleYaml`.

Then add parsing logic at the end of `parseRuleYaml` (before the `return` statement at line 206):

```typescript
  // Parse resource_bindings (array of objects, each starting with "- kind:")
  const rbLines = readSectionLines(raw, 'resource_bindings');
  let resource_bindings: import('../../rule-lab/types.js').UnityResourceBinding[] | undefined;
  if (rbLines.length > 0) {
    resource_bindings = [];
    let current: Record<string, any> | null = null;
    for (const line of rbLines) {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('- kind:')) {
        if (current) resource_bindings.push(current as any);
        current = { kind: decodeYamlScalar(trimmed.replace(/^- kind:\s*/, '')) };
      } else if (current && /^\s+\w/.test(line)) {
        // nested scalar or list item
        const scalarMatch = trimmed.match(/^(\w[\w_]*):\s*(.+)$/);
        const listHeaderMatch = trimmed.match(/^(\w[\w_]*):\s*$/);
        if (scalarMatch) {
          current[scalarMatch[1]] = decodeYamlScalar(scalarMatch[2]);
        } else if (listHeaderMatch) {
          current[listHeaderMatch[1]] = [];
        } else if (trimmed.startsWith('- ') && current) {
          // list item — find the last array key
          const lastArrayKey = Object.keys(current).reverse().find((k) => Array.isArray(current![k]));
          if (lastArrayKey) (current[lastArrayKey] as string[]).push(decodeYamlScalar(trimmed.replace(/^- /, '')));
        }
      }
    }
    if (current) resource_bindings.push(current as any);
    if (resource_bindings.length === 0) resource_bindings = undefined;
  }

  // Parse lifecycle_overrides
  const loEntryPoints = readNestedList(raw, 'lifecycle_overrides', 'additional_entry_points');
  const loScope = readNestedScalar(raw, 'lifecycle_overrides', 'scope');
  const lifecycle_overrides = (loEntryPoints.length > 0 || loScope)
    ? { additional_entry_points: loEntryPoints.length > 0 ? loEntryPoints : undefined, scope: loScope }
    : undefined;
```

Then update the return object to include:

```typescript
  return {
    // ... existing fields ...
    resource_bindings,
    lifecycle_overrides,
  };
```

**Step 4: Run test — expect PASS**

Run: `cd gitnexus && npx vitest run --reporter=verbose -- runtime-claim-rule-registry`
Expected: PASS

**Step 5: Commit**

```bash
git add gitnexus/src/mcp/local/runtime-claim-rule-registry.ts gitnexus/src/mcp/local/__tests__/runtime-claim-rule-registry.test.ts
git commit -m "feat(rule-lab): parseRuleYaml parses resource_bindings and lifecycle_overrides"
```

---

### Task 2: StageAwareCompiledRule + CompiledRuntimeRule — add Unity fields

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/rule-lab/compiled-bundles.ts:7-23`
- Modify: `gitnexus/src/rule-lab/promote.ts:38-52`

**Step 1: Add fields to StageAwareCompiledRule**

In `compiled-bundles.ts`, add after `claims: RuleDslClaims;` (line 22):

```typescript
  resource_bindings?: import('./types.js').UnityResourceBinding[];
  lifecycle_overrides?: import('./types.js').LifecycleOverrides;
```

**Step 2: Add fields to CompiledRuntimeRule**

In `promote.ts`, add after `claims: RuleDslDraft['claims'];` (line 51):

```typescript
  resource_bindings?: import('./types.js').UnityResourceBinding[];
  lifecycle_overrides?: import('./types.js').LifecycleOverrides;
```

**Step 3: Type check**

Run: `cd gitnexus && npx tsc --noEmit`
Expected: PASS (no errors)

**Step 4: Commit**

```bash
git add gitnexus/src/rule-lab/compiled-bundles.ts gitnexus/src/rule-lab/promote.ts
git commit -m "feat(rule-lab): add resource_bindings/lifecycle_overrides to compiled rule types"
```

---

### Task 3: toStageAwareCompiledRule — pass through Unity fields

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/rule-lab/promote.ts:178-196`

**Step 1: Write failing test**

Add to promote test file:

```typescript
it('toStageAwareCompiledRule passes resource_bindings and lifecycle_overrides', () => {
  const rule = {
    // ... minimal CompiledRuntimeRule fields ...
    resource_bindings: [{ kind: 'asset_ref_loads_components' as const, ref_field_pattern: 'graph' }],
    lifecycle_overrides: { additional_entry_points: ['Init'], scope: 'Assets/Code' },
  };
  const result = toStageAwareCompiledRule(rule as any, 'test.yaml');
  expect(result.resource_bindings).toEqual(rule.resource_bindings);
  expect(result.lifecycle_overrides).toEqual(rule.lifecycle_overrides);
});
```

**Step 2: Run test — expect FAIL**

Run: `cd gitnexus && npx vitest run --reporter=verbose -- promote`

**Step 3: Add pass-through in toStageAwareCompiledRule**

In `promote.ts:178-196`, before the closing `};` of the return object, add:

```typescript
    ...(rule.resource_bindings ? { resource_bindings: rule.resource_bindings } : {}),
    ...(rule.lifecycle_overrides ? { lifecycle_overrides: rule.lifecycle_overrides } : {}),
```

**Step 4: Run test — expect PASS**

Run: `cd gitnexus && npx vitest run --reporter=verbose -- promote`

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/promote.ts
git commit -m "feat(rule-lab): toStageAwareCompiledRule passes Unity fields"
```

---

### Task 4: buildRuleYaml — serialize Unity fields

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/rule-lab/promote.ts:213-268`

**Step 1: Write failing test**

```typescript
it('buildRuleYaml outputs resource_bindings and lifecycle_overrides', () => {
  const bindings = [
    { kind: 'asset_ref_loads_components' as const, ref_field_pattern: 'graph', target_entry_points: ['OnEnable'] },
  ];
  const overrides = { additional_entry_points: ['Init'], scope: 'Assets/Code' };
  const rule = createMinimalCompiledRule({ resource_bindings: bindings, lifecycle_overrides: overrides });
  const yaml = buildRuleYaml(rule);
  expect(yaml).toContain('resource_bindings:');
  expect(yaml).toContain('kind: asset_ref_loads_components');
  expect(yaml).toContain('lifecycle_overrides:');
  // Round-trip: parse the generated YAML and verify structural equality
  const parsed = parseRuleYaml(yaml, 'roundtrip.yaml');
  expect(parsed.resource_bindings).toEqual(bindings);
  expect(parsed.lifecycle_overrides).toEqual(overrides);
});
```

**Step 2: Run test — expect FAIL**

**Step 3: Add serialization at end of buildRuleYaml**

After the `claims` section (line 266), before `return`, add:

```typescript
  if (rule.resource_bindings && rule.resource_bindings.length > 0) {
    lines.push('resource_bindings:');
    for (const binding of rule.resource_bindings) {
      lines.push(`  - kind: ${binding.kind}`);
      if (binding.ref_field_pattern) lines.push(`    ref_field_pattern: ${quoteYaml(binding.ref_field_pattern)}`);
      if (binding.target_entry_points?.length) pushList(lines, 'target_entry_points', binding.target_entry_points, '    ');
      if (binding.host_class_pattern) lines.push(`    host_class_pattern: ${quoteYaml(binding.host_class_pattern)}`);
      if (binding.field_name) lines.push(`    field_name: ${quoteYaml(binding.field_name)}`);
      if (binding.loader_methods?.length) pushList(lines, 'loader_methods', binding.loader_methods, '    ');
    }
  }

  if (rule.lifecycle_overrides) {
    lines.push('lifecycle_overrides:');
    if (rule.lifecycle_overrides.additional_entry_points?.length) {
      pushList(lines, 'additional_entry_points', rule.lifecycle_overrides.additional_entry_points, '  ');
    }
    if (rule.lifecycle_overrides.scope) {
      lines.push(`  scope: ${quoteYaml(rule.lifecycle_overrides.scope)}`);
    }
  }
```

Also add `family` field output after `version` line (line 216):

```typescript
  if ((rule as any).family) lines.push(`family: ${quoteYaml((rule as any).family)}`);
```

**Step 4: Run test — expect PASS**

**Step 5: Commit**

```bash
git add gitnexus/src/rule-lab/promote.ts
git commit -m "feat(rule-lab): buildRuleYaml serializes Unity resource_bindings and lifecycle_overrides"
```

---

### Task 5: New `rule-lab compile` CLI command

**User Verification: required**

**Files:**
- Create: `gitnexus/src/rule-lab/compile.ts`
- Modify: `gitnexus/src/cli/rule-lab.ts:39-61`

**Human Verification Checklist:**
1. `node dist/cli/index.js rule-lab compile --help` shows usage
2. `node dist/cli/index.js rule-lab compile --repo-path /path/to/neonspark` reads approved YAML and writes compiled bundle
3. Compiled bundle at `.gitnexus/rules/compiled/analyze_rules.v2.json` contains `resource_bindings`
4. Re-running compile is idempotent (same output)

**Acceptance Criteria:**
1. Help text shows `--repo-path` and `--family` options
2. Bundle written with correct rules parsed from YAML
3. `resource_bindings` and `lifecycle_overrides` present in JSON
4. Second run produces identical JSON (except `generated_at`)

**Failure Signals:**
1. "Unknown command compile" error
2. Bundle missing or empty rules array
3. `resource_bindings` field absent in JSON
4. Rules duplicated or missing on re-run

**User Decision Prompt:** "Task 5 完成。请验证 `rule-lab compile` 命令在目标仓库上的输出。通过 or 不通过？"

**Step 1: Create `compile.ts`**

```typescript
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseRuleYaml } from '../mcp/local/runtime-claim-rule-registry.js';
import { writeCompiledRuleBundle, type RuleBundleFamily } from './compiled-bundles.js';
import type { StageAwareCompiledRule } from './compiled-bundles.js';

interface CatalogEntry {
  id: string;
  version: string;
  enabled: boolean;
  file: string;
  family?: string;
}

interface CatalogShape {
  version: number;
  rules: CatalogEntry[];
}

export async function compileRules(options: {
  repoPath?: string;
  family?: RuleBundleFamily;
}): Promise<void> {
  const repoPath = path.resolve(options.repoPath || process.cwd());
  const family: RuleBundleFamily = options.family || 'analyze_rules';
  const rulesRoot = path.join(repoPath, '.gitnexus', 'rules');
  const catalogPath = path.join(rulesRoot, 'catalog.json');

  let catalog: CatalogShape;
  try {
    catalog = JSON.parse(await fs.readFile(catalogPath, 'utf-8'));
  } catch {
    console.error(`No catalog.json found at ${catalogPath}`);
    process.exitCode = 1;
    return;
  }

  const entries = catalog.rules.filter((e) => e.enabled !== false && e.family === family);
  if (entries.length === 0) {
    console.log(`No enabled ${family} rules in catalog.`);
    return;
  }

  const compiled: StageAwareCompiledRule[] = [];
  for (const entry of entries) {
    const yamlPath = path.join(rulesRoot, entry.file);
    const raw = await fs.readFile(yamlPath, 'utf-8');
    const rule = parseRuleYaml(raw, entry.file);
    compiled.push({
      id: rule.id,
      version: rule.version,
      trigger_family: rule.trigger_family,
      trigger_tokens: [...rule.match.trigger_tokens],
      resource_types: [...rule.resource_types],
      host_base_type: [...rule.host_base_type],
      required_hops: [...rule.required_hops],
      guarantees: [...rule.guarantees],
      non_guarantees: [...rule.non_guarantees],
      next_action: rule.next_action || '',
      file_path: entry.file,
      match: rule.match,
      topology: [],
      closure: { required_hops: rule.required_hops, failure_map: {} },
      claims: { guarantees: rule.guarantees, non_guarantees: rule.non_guarantees, next_action: rule.next_action || '' },
      ...(rule.resource_bindings ? { resource_bindings: rule.resource_bindings } : {}),
      ...(rule.lifecycle_overrides ? { lifecycle_overrides: rule.lifecycle_overrides } : {}),
    });
  }

  const outPath = await writeCompiledRuleBundle(rulesRoot, family, compiled);
  console.log(`Compiled ${compiled.length} ${family} rules → ${outPath}`);
}
```

**Step 2: Register CLI command in `rule-lab.ts`**

Add import at top:

```typescript
import { compileRules } from '../rule-lab/compile.js';
```

Add to `attachRuleLabCommands` after the last `root.command(...)` block:

```typescript
  root
    .command('compile')
    .description('Compile approved YAML rules into a JSON bundle')
    .option('--repo-path <path>', 'Repository path (default: cwd)')
    .option('--family <family>', 'Rule family to compile', 'analyze_rules')
    .action((options: { repoPath?: string; family?: string }) =>
      compileRules({ repoPath: options.repoPath, family: options.family as RuleBundleFamily }),
    );
```

Also add `'ruleLabCompileCommand'` to the `RuleLabHandlerName` type if it exists, or just use direct import (the `action` wrapper pattern is only needed for lazy loading — compile can be direct).

**Step 3: Build and test**

```bash
cd gitnexus && npm run build
node dist/cli/index.js rule-lab compile --help
```

Expected: Shows `--repo-path` and `--family` options.

**Step 3b: Write automated integration test**

```typescript
it('compileRules writes bundle with resource_bindings', async () => {
  // Setup: write a minimal YAML + catalog to a temp dir
  const tmpRules = path.join(os.tmpdir(), `test-rules-${Date.now()}`);
  await fs.mkdir(path.join(tmpRules, '.gitnexus', 'rules', 'approved'), { recursive: true });
  await fs.writeFile(path.join(tmpRules, '.gitnexus', 'rules', 'approved', 'test.yaml'), testYaml);
  await fs.writeFile(path.join(tmpRules, '.gitnexus', 'rules', 'catalog.json'), JSON.stringify({
    version: 1,
    rules: [{ id: 'unity.test.v2', version: '2.0.0', enabled: true, file: 'approved/test.yaml', family: 'analyze_rules' }],
  }));
  await compileRules({ repoPath: tmpRules, family: 'analyze_rules' });
  const bundle = JSON.parse(await fs.readFile(path.join(tmpRules, '.gitnexus', 'rules', 'compiled', 'analyze_rules.v2.json'), 'utf-8'));
  expect(bundle.rules).toHaveLength(1);
  expect(bundle.rules[0].resource_bindings).toBeDefined();
  expect(bundle.rules[0].resource_bindings[0].kind).toBe('asset_ref_loads_components');
});
```

**Step 4: Commit**

```bash
git add gitnexus/src/rule-lab/compile.ts gitnexus/src/cli/rule-lab.ts
git commit -m "feat(cli): add rule-lab compile command (YAML → compiled bundle)"
```

---

### Task 6: catalog.json — write `family` field on promote

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/rule-lab/promote.ts:330-335`

**Step 1: Add `family` to CatalogEntry interface**

In `promote.ts:25-29`, add:

```typescript
  family?: string;
```

**Step 2: Write family in promoteCuratedRules**

In `promote.ts:330-335`, update `nextEntry` to include family:

```typescript
    const nextEntry: CatalogEntry = {
      id: ruleId,
      version,
      enabled: true,
      file: relativeFile,
      family: draft.resource_bindings ? 'analyze_rules' : 'verification_rules',
    };
```

Better: read `family` from the parsed rule. The `parseRuleYaml` already reads `family` via `readScalar(raw, 'family')`. Pass it through `compileRule` → `CompiledRuntimeRule.family`. Then in `promoteCuratedRules`:

```typescript
    const nextEntry: CatalogEntry = {
      id: ruleId,
      version,
      enabled: true,
      file: relativeFile,
      family: compiledRule.family || 'verification_rules',
    };
```

Add a test:

```typescript
it('promoteCuratedRules writes family to catalog entry', async () => {
  // ... setup with a curated item that has family: 'analyze_rules' in its YAML ...
  const result = await promoteCuratedRules(input);
  const entry = result.catalog.rules.find((r) => r.id === ruleId);
  expect(entry?.family).toBe('analyze_rules');
});
```

**Step 3: Type check + test**

Run: `cd gitnexus && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add gitnexus/src/rule-lab/promote.ts
git commit -m "feat(rule-lab): write family field to catalog.json on promote"
```

---

### Task 7: Write `gitnexus-unity-rule-gen` SKILL.md

**User Verification: required**

**Files:**
- Create: `.agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md`

**Human Verification Checklist:**
1. SKILL.md frontmatter has correct `name` and `description`
2. Phase 0 (init) checks CLI availability and repo index
3. Phase 1 (rule entry loop) covers graph exploration, multi-path confirmation, binding type judgment
4. Phase 2 (write + compile + analyze) uses `rule-lab compile` command
5. Phase 3 (verification) has 4 verification checks with PASS/FAIL criteria
6. Failure diagnosis table covers common failure modes

**Acceptance Criteria:**
1. Frontmatter matches skill naming convention
2. Init phase has 4 prerequisite checks
3. Rule entry loop has 6 sub-steps including user confirmation
4. Phase 2 calls `rule-lab compile` (not manual bundle creation)
5. All 4 verification checks have Cypher/MCP commands and PASS conditions
6. At least 6 failure diagnosis rows

**Failure Signals:**
1. Missing frontmatter or wrong name
2. Missing prerequisite checks
3. No user interaction points in rule entry
4. Still references manual compiled bundle creation
5. Missing verification commands
6. Incomplete diagnosis table

**User Decision Prompt:** "Task 7 完成。请审阅 SKILL.md 的工作流设计。通过 or 不通过？"

**Step 1: Write SKILL.md**

Content follows the design document sections 4.0-4.4 with these key differences from the e2e-verify skill:
- Uses `rule-lab compile` instead of manual compiled bundle creation
- Includes graph exploration strategy (Cypher → context → grep fallback)
- Includes binding type judgment table
- Supports multi-rule entry loop
- References `rule-lab compile` for YAML→bundle conversion

The SKILL.md content should be adapted from the design doc `docs/plans/2026-04-04-unity-rule-gen-skill-design.md` sections 4.0-4.4, with the YAML template from section 3.3.

**Step 2: Commit**

```bash
git add .agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md
git commit -m "feat(skill): add gitnexus-unity-rule-gen interactive rule creation workflow"
```

---

### Task 8: Update `gitnexus-unity-e2e-verify` SKILL.md

**User Verification: not-required**

**Files:**
- Modify: `.agents/skills/gitnexus/gitnexus-unity-e2e-verify/SKILL.md`

**Step 1: Update Phase 1 to use `rule-lab compile`**

Replace the manual compiled bundle creation steps (section 1.3-1.5) with:

1. Write YAML to `approved/` directory
2. Update `catalog.json` with `family: "analyze_rules"`
3. Run `$GITNEXUS_CLI rule-lab compile --repo-path "$TARGET_REPO"`
4. Verify with `rule-lab discover`

Remove references to manually creating `compiled/analyze_rules.v2.json`.

**Step 2: Update YAML template**

Ensure the YAML template includes `topology:` and `closure:` sections (required by `assertDslShape` for v2).

**Step 3: Commit**

```bash
git add .agents/skills/gitnexus/gitnexus-unity-e2e-verify/SKILL.md
git commit -m "docs(skill): update e2e-verify to use rule-lab compile command"
```

---

## Plan Audit Verdict

audit_scope: Design doc DC-01 through DC-08, implementation plan Tasks 1-8, traceability matrix, authenticity assertions
finding_summary: P0=0, P1=3 (all fixed), P2=2
critical_mismatches:
- none
major_risks:
- P1-01: DC-06 compile command lacked automated bundle content assertion → fixed: added Step 3b integration test in Task 5
- P1-02: Task 6 family derivation was ambiguous → fixed: settled on reading `family` from parsed YAML, added unit test
- P1-03: Round-trip assertion was declared but not implemented → fixed: Task 4 test now calls `parseRuleYaml(buildRuleYaml(rule))` and deep-equals
anti_placeholder_checks:
- `resource_bindings[0].kind === 'asset_ref_loads_components'` in Task 1 test: PASS
- `lifecycle_overrides.scope` is real path string in Task 1 test: PASS
- compiled bundle `resource_bindings` non-empty in Task 5 Step 3b: PASS
authenticity_checks:
- Task 1: parses real YAML with two binding kinds, verifies field values: PASS
- Task 4: round-trip parse→serialize→parse equality: PASS (after fix)
- Task 5: automated integration test reads compiled JSON: PASS (after fix)
approval_decision: pass
