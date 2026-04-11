import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..', '..');
const repoRoot = path.resolve(packageRoot, '..');

async function readRepoFile(relPath: string): Promise<string> {
  return fs.readFile(path.join(repoRoot, relPath), 'utf-8');
}

async function readSkills() {
  const source = await readRepoFile('gitnexus/skills/gitnexus-unity-rule-gen.md');
  const installed = await readRepoFile('.agents/skills/gitnexus/gitnexus-unity-rule-gen/SKILL.md');
  return { source, installed };
}

function expectClauses(content: string, clauses: Array<[RegExp, string]>): void {
  const missing = clauses
    .filter(([pattern]) => !pattern.test(content))
    .map(([, label]) => label);

  expect(missing, `missing clauses: ${missing.join(', ')}`).toEqual([]);
}

function extractBashBlocks(content: string): string[] {
  const blocks = content.match(/```bash[\s\S]*?```/g) ?? [];
  return blocks.map((block) =>
    block
      .replace(/^```bash\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim()
  );
}

describe('unity gap-lab skill contracts', () => {
  it('enforces Phase A/B/C/D + mandatory focus-lock + single-slice loop', async () => {
    const { source } = await readSkills();

    expectClauses(source, [
      [/##\s*Phase A\b/i, 'Phase A run init section'],
      [/##\s*Phase B\b/i, 'Phase B focus lock section'],
      [/##\s*Phase C\b/i, 'Phase C single-slice loop section'],
      [/##\s*Phase D\b/i, 'Phase D persist and stop section'],
      [/(if|如果).*(missing|未指定).*(gap_type|gap_subtype).*(ask|询问)/i, 'mandatory focus-lock prompt when gap_type/subtype missing'],
      [/(single-slice|单个\s*slice|一次只处理一个\s*slice)/i, 'single-slice execution rule'],
      [/(no implicit run all slices|禁止全量\s*slice\s*自动执行|No implicit "run all slices")/i, 'explicit no-run-all-slices guard']
    ]);

    expect(source).not.toMatch(/(auto|默认|自动).*(run all slices|全量\s*slice)/i);
    expect(source).not.toMatch(/一次录入多条规则|批量录入多条规则/i);
  });

  it('documents Phase A init, Phase B focus-lock, Phase C single-slice execution, Phase D persist-stop in order', async () => {
    const { source } = await readSkills();
    const phaseA = source.search(/##\s*Phase A\b/i);
    const phaseB = source.search(/##\s*Phase B\b/i);
    const phaseC = source.search(/##\s*Phase C\b/i);
    const phaseD = source.search(/##\s*Phase D\b/i);

    expect(phaseA).toBeGreaterThanOrEqual(0);
    expect(phaseB).toBeGreaterThan(phaseA);
    expect(phaseC).toBeGreaterThan(phaseB);
    expect(phaseD).toBeGreaterThan(phaseC);
  });

  it('documents confidence policy and confirmation thresholds', async () => {
    const { source } = await readSkills();
    expect(source).toMatch(/confidence\s*>=\s*0\.8/i);
    expect(source).toMatch(/0\.5\s*<=\s*confidence\s*<\s*0\.8/i);
    expect(source).toMatch(/confidence\s*<\s*0\.5/i);
  });

  it('requires subtype-level aggregation mode confirmation when duplicate candidates exist', async () => {
    const { source } = await readSkills();
    expect(source).toMatch(/Aggregation mode confirmation/i);
    expect(source).toMatch(/>=2.*accepted candidates.*same.*gap_subtype/i);
    expect(source).toMatch(/per_anchor_rules/i);
    expect(source).toMatch(/aggregate_single_rule/i);
    expect(source).toMatch(/decision_type:\s*"rule_aggregation_mode"/i);
    expect(source).toMatch(/candidate_ids/i);
    expect(source).toMatch(/force.*per_anchor_rules|force-split/i);
  });

  it('requires execution-readiness state before entering C1', async () => {
    const { source } = await readSkills();
    expect(source).toMatch(/Execution Readiness Gate/i);
    expect(source).toMatch(/phase_b_clues_confirmed/i);
    expect(source).toMatch(/pending\s*->\s*in_progress/i);
    expect(source).toMatch(/phase_b_ready_for_c1/i);
    expect(source).toMatch(/next_command.*alone.*never considered progress/i);
  });

  it('requires gap-lab and rules-lab artifact parity before C1\/C3', async () => {
    const { source } = await readSkills();
    expect(source).toMatch(/Run Artifact Parity Check/i);
    expect(source).toMatch(/\.gitnexus\/gap-lab\/runs\/\$RUN_ID\/slices\/\$SLICE_ID\.json/i);
    expect(source).toMatch(/\.gitnexus\/rules\/lab\/runs\/\$RUN_ID\/slices\/\$SLICE_ID\/slice\.json/i);
    expect(source).toMatch(/mark slice `blocked`.*mismatch reason/i);
  });

  it('requires exhaustive discovery sub-steps before candidate selection', async () => {
    const { source } = await readSkills();
    expect(source).toMatch(/C1a.*repo-wide lexical universe/i);
    expect(source).toMatch(/C1b.*scope classification/i);
    expect(source).toMatch(/C1c.*symbol resolution/i);
    expect(source).toMatch(/C1d.*missing-edge verification/i);
    expect(source).toMatch(/Do not rely on user clue files as exclusive search scope/i);
  });

  it('requires coverage gate before C3 and reason_code on non-accepted candidates', async () => {
    const { source } = await readSkills();
    expect(source).toMatch(/coverage gate/i);
    expect(source).toMatch(/processed_user_matches\s*==\s*user_raw_matches/i);
    expect(source).toMatch(/C3.*blocked.*coverage_incomplete/i);
    expect(source).toMatch(/reason_code/i);
    expect(source).toMatch(/rejected|deferred/i);
  });

  it('requires balanced slim artifacts without per-stage standalone files', async () => {
    const { source } = await readSkills();
    expect(source).toMatch(/balanced[- ]slim/i);
    expect(source).toMatch(/slice\.json/i);
    expect(source).toMatch(/slice\.candidates\.jsonl/i);
    expect(source).toMatch(/inventory\.jsonl/i);
    expect(source).toMatch(/decisions\.jsonl/i);
    expect(source).toMatch(/no standalone universe\/scope\/coverage artifacts/i);
  });

  it('requires .gitnexus/gap-lab persistence layout fields in skill contract', async () => {
    const { source } = await readSkills();

    expectClauses(source, [
      [/\.gitnexus\/gap-lab\/runs\//i, 'gap-lab run root path'],
      [/manifest\.json/i, 'manifest.json'],
      [/slice-plan\.json/i, 'slice-plan.json'],
      [/progress\.json/i, 'progress.json'],
      [/inventory\.jsonl/i, 'inventory.jsonl'],
      [/decisions\.jsonl/i, 'decisions.jsonl'],
      [/slices\//i, 'slices directory']
    ]);
  });

  it('keeps helper readers for source and installed skill copies', async () => {
    const { source, installed } = await readSkills();
    expect(source.length).toBeGreaterThan(0);
    expect(installed.length).toBeGreaterThan(0);
  });

  it('requires shared unity-gap-lab contract file and schema blocks', async () => {
    const sourceContract = await readRepoFile('gitnexus/skills/_shared/unity-gap-lab-contract.md');
    const installedContract = await readRepoFile('.agents/skills/gitnexus/_shared/unity-gap-lab-contract.md');

    expect(sourceContract.length).toBeGreaterThan(0);
    expect(installedContract.length).toBeGreaterThan(0);

    expectClauses(sourceContract, [
      [/gap_type/i, 'taxonomy: gap_type'],
      [/gap_subtype/i, 'taxonomy: gap_subtype'],
      [/pattern_id/i, 'taxonomy: pattern_id'],
      [/detector_version/i, 'taxonomy: detector_version'],
      [/(pending\|in_progress\|blocked\|rule_generated\|indexed\|verified\|done)/i, 'status enum contract'],
      [/\.gitnexus\/gap-lab\/runs\/<run_id>\//i, 'persistence tree root'],
      [/User-Facing Handoff Contract/i, 'phase B user handoff contract heading'],
      [/request for user clues|user clues/i, 'phase B handoff requires clue request'],
      [/quality gate/i, 'phase B handoff requires quality gate'],
      [/phase_b_clues_confirmed/i, 'execution readiness decision marker'],
      [/next_command.*alone.*not a valid phase transition/i, 'next_command-only transition forbidden'],
      [/gap-lab.*rules\/lab.*parity/i, 'cross-artifact parity requirement']
    ]);

    expect(installedContract).toContain('Unity Gap-Lab Contract');
  });

  it('keeps source and installed unity-rule-gen skill in byte-level parity', async () => {
    const { source, installed } = await readSkills();
    expect(source).toBe(installed);
  });

  it('rejects placeholder artifacts and requires concrete gap-lab paths', async () => {
    const { source } = await readSkills();
    const commandBlocks = extractBashBlocks(source).join('\n');
    expect(commandBlocks).not.toMatch(/<run_id>|<slice_id>|<path>|<repo>/i);
    expect(source).toMatch(/placeholder values are invalid/i);
  });

  it('requires non-empty closure evidence before verified/done transition', async () => {
    const { source } = await readSkills();
    expect(source).toMatch(/verified\/done.*non-empty closure evidence/i);
    expect(source).toMatch(/confirmed_chain\.steps/i);
  });

  it('requires Phase B user handoff to be user-facing and clue-driven', async () => {
    const { source } = await readSkills();
    expect(source).toMatch(/Phase B User Handoff/i);
    expect(source).toMatch(/Focus summary/i);
    expect(source).toMatch(/scope constraints/i);
    expect(source).toMatch(/Next step/i);
    expect(source).toMatch(/Required user clues/i);
    expect(source).toMatch(/Quality gate/i);
    expect(source).toMatch(/do not stop at "focus lock completed"/i);
    expect(source).toMatch(/Do not expose `checkpoint_phase`/i);
    expect(source).not.toMatch(/Current status`: `checkpoint_phase`/i);
    expect(source).not.toMatch(/Resume command`: a concrete command/i);
  });

  it('uses --repo-path in rule-lab command examples', async () => {
    const { source } = await readSkills();
    const commandBlocks = extractBashBlocks(source).join('\n');
    expect(commandBlocks).toMatch(/rule-lab discover --repo-path/i);
    expect(commandBlocks).toMatch(/rule-lab analyze --repo-path/i);
    expect(commandBlocks).toMatch(/rule-lab review-pack --repo-path/i);
    expect(commandBlocks).toMatch(/rule-lab curate --repo-path/i);
    expect(commandBlocks).toMatch(/rule-lab promote --repo-path/i);
    expect(commandBlocks).not.toMatch(/rule-lab\s+[a-z-]+\s+--repo\s/i);
  });

  it('requires executable tool evidence in live mode sections', async () => {
    const { source } = await readSkills();
    expect(source).toMatch(/Command:/);
    expect(source).toMatch(/Output summary:/);
    expect(source).toMatch(/Expected signal:/);
    expect(source).toMatch(/Decision:/);
  });

  it('tracks gap-lab workflow release notes in changelog', async () => {
    const changelog = await readRepoFile('gitnexus/CHANGELOG.md');
    expect(changelog).toMatch(/\[Unreleased\]/);
    expect(changelog).toMatch(/gap-lab slice-driven unity rule generation workflow/i);
    expect(changelog).toMatch(/shared unity gap-lab contract|gap-lab state ownership/i);
  });
});
