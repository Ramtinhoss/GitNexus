import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ruleLabAnalyzeCommand } from '../../src/cli/rule-lab.js';
import { scanLexicalUniverse } from '../../src/gap-lab/exhaustive-scanner.js';
import { classifyScopePath } from '../../src/gap-lab/scope-classifier.js';
import { resolveLexicalCandidates } from '../../src/gap-lab/candidate-resolver.js';
import { verifyMissingEdges } from '../../src/gap-lab/missing-edge-verifier.js';

const tempDirs: string[] = [];
const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '..', 'fixtures', 'gap-lab-exhaustive');

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

async function copyDir(source: string, target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await copyDir(sourcePath, targetPath);
      continue;
    }
    if (entry.isFile()) {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

async function createRepoFromFixture(): Promise<string> {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'gap-lab-fixture-'));
  tempDirs.push(repoPath);
  await copyDir(fixtureRoot, repoPath);
  return repoPath;
}

async function createRunFixture(input: {
  runId: string;
  sliceId: string;
  coverage: { required?: boolean; userRaw: number; processed: number; status?: string };
  withRedundantArtifacts?: boolean;
  withRulesSlice?: boolean;
  withGapSlice?: boolean;
}): Promise<{
  repoPath: string;
  gapSlicePath: string;
  candidatesPath: string;
  runRoot: string;
}> {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'gap-lab-cov-gate-'));
  tempDirs.push(repoPath);
  const runRoot = path.join(repoPath, '.gitnexus', 'gap-lab', 'runs', input.runId);

  const rulesSlicePath = path.join(
    repoPath,
    '.gitnexus',
    'rules',
    'lab',
    'runs',
    input.runId,
    'slices',
    input.sliceId,
    'slice.json',
  );
  const gapSlicePath = path.join(
    repoPath,
    '.gitnexus',
    'gap-lab',
    'runs',
    input.runId,
    'slices',
    `${input.sliceId}.json`,
  );
  const candidatesPath = path.join(
    repoPath,
    '.gitnexus',
    'rules',
    'lab',
    'runs',
    input.runId,
    'slices',
    input.sliceId,
    'candidates.jsonl',
  );

  if (input.withRulesSlice !== false) {
    await writeJson(rulesSlicePath, {
      id: input.sliceId,
      trigger_family: 'event_delegate',
      resource_types: ['syncvar_hook'],
      host_base_type: ['network_behaviour'],
      required_hops: ['code_runtime'],
    });
  }

  if (input.withGapSlice !== false) {
    await writeJson(gapSlicePath, {
      slice_id: input.sliceId,
      status: 'in_progress',
      coverage_gate: {
        required: input.coverage.required ?? true,
        user_raw_matches: input.coverage.userRaw,
        processed_user_matches: input.coverage.processed,
        status: input.coverage.status,
      },
    });
  }

  if (input.withRedundantArtifacts) {
    await writeJson(path.join(runRoot, 'slices', `${input.sliceId}.universe.json`), { stage: 'universe' });
    await writeJson(path.join(runRoot, 'slices', `${input.sliceId}.scope.json`), { stage: 'scope' });
    await writeJson(path.join(runRoot, 'slices', `${input.sliceId}.coverage.json`), { stage: 'coverage' });
  }

  return { repoPath, gapSlicePath, candidatesPath, runRoot };
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('gap-lab exhaustive discovery', () => {
  it('builds repo-wide lexical universe', async () => {
    const repoPath = await createRepoFromFixture();
    const callback = await scanLexicalUniverse({
      repoPath,
      gapSubtype: 'mirror_syncdictionary_callback',
    });
    const hook = await scanLexicalUniverse({
      repoPath,
      gapSubtype: 'mirror_syncvar_hook',
    });

    const userRaw = callback.matches.filter((row) => classifyScopePath(row.file).scopeClass === 'user_code').length;
    const thirdPartyRaw = hook.matches.filter((row) => classifyScopePath(row.file).scopeClass === 'third_party').length;

    expect(callback.matches.length).toBeGreaterThanOrEqual(2);
    expect(userRaw).toBeGreaterThan(0);
    expect(thirdPartyRaw).toBeGreaterThan(0);
  });

  it('records reason_code for non-accepted candidates', async () => {
    const resolved = await resolveLexicalCandidates({
      matches: [
        {
          gapSubtype: 'mirror_synclist_callback',
          patternId: 'event_delegate.mirror_synclist_callback.v1',
          file: 'Assets/NEON/Code/NetworkCode/NetPlayer.PlayerState.cs',
          line: 10,
          text: 'PlayerStates.Callback += handlers[index]',
        },
        {
          gapSubtype: 'mirror_synclist_callback',
          patternId: 'event_delegate.mirror_synclist_callback.v1',
          file: 'Assets/NEON/Code/NetworkCode/NetPlayer.PlayerState.cs',
          line: 11,
          text: 'PlayerStates.Callback += OnPlayerStateChange;',
        },
      ],
    });
    const verified = await verifyMissingEdges({
      candidates: resolved,
      edgeLookup: async ({ handlerSymbol }) => handlerSymbol === 'OnPlayerStateChange',
    });

    const nonAccepted = verified.filter((row) => row.status !== 'verified_missing');
    expect(nonAccepted.length).toBeGreaterThan(0);
    expect(nonAccepted.every((row) => !!row.reasonCode)).toBe(true);
  });

  it('enforces run artifact parity gate', async () => {
    const runId = 'run-gap-parity-1';
    const sliceId = 'event_delegate_gap.mirror_syncvar_hook';
    const { repoPath, gapSlicePath, candidatesPath } = await createRunFixture({
      runId,
      sliceId,
      coverage: { userRaw: 1, processed: 1 },
      withRulesSlice: false,
    });

    await expect(ruleLabAnalyzeCommand({ repoPath, runId, sliceId })).rejects.toThrow(/artifact_parity_mismatch/i);
    const updated = JSON.parse(await fs.readFile(gapSlicePath, 'utf-8')) as any;
    expect(updated.status).toBe('blocked');
    expect(updated.parity_status?.reason).toBe('parity_missing_rules_slice');
    await expect(fs.access(candidatesPath)).rejects.toBeTruthy();
  });

  it('blocks c3 when coverage incomplete', async () => {
    const runId = 'run-gap-cov-1';
    const sliceId = 'event_delegate_gap.mirror_syncvar_hook';
    const { repoPath, gapSlicePath, candidatesPath } = await createRunFixture({
      runId,
      sliceId,
      coverage: { userRaw: 2, processed: 1 },
    });

    await expect(
      ruleLabAnalyzeCommand({ repoPath, runId, sliceId }),
    ).rejects.toThrow(/C3 blocked: coverage_incomplete/i);

    const updated = JSON.parse(await fs.readFile(gapSlicePath, 'utf-8')) as any;
    expect(updated.status).toBe('blocked');
    expect(updated.coverage_gate?.reason).toBe('coverage_incomplete');
    await expect(fs.access(candidatesPath)).rejects.toBeTruthy();
  });

  it('blocks semantic gate bypass when status is prefilled as passed', async () => {
    const runId = 'run-gap-cov-bypass-1';
    const sliceId = 'event_delegate_gap.mirror_syncvar_hook';
    const { repoPath, gapSlicePath } = await createRunFixture({
      runId,
      sliceId,
      coverage: { userRaw: 3, processed: 1, status: 'passed' },
    });

    await expect(ruleLabAnalyzeCommand({ repoPath, runId, sliceId })).rejects.toThrow(/coverage_incomplete/i);
    const updated = JSON.parse(await fs.readFile(gapSlicePath, 'utf-8')) as any;
    expect(updated.coverage_gate?.status).toBe('blocked');
    expect(updated.coverage_gate?.processed_user_matches).toBe(1);
    expect(updated.coverage_gate?.user_raw_matches).toBe(3);
  });

  it('writes slim artifacts', async () => {
    const runId = 'run-gap-slim-1';
    const sliceId = 'event_delegate_gap.mirror_syncvar_hook';
    const { repoPath, runRoot } = await createRunFixture({
      runId,
      sliceId,
      coverage: { userRaw: 1, processed: 1 },
      withRedundantArtifacts: true,
    });

    await expect(ruleLabAnalyzeCommand({ repoPath, runId, sliceId })).resolves.toBeUndefined();

    const required = [
      path.join(runRoot, 'inventory.jsonl'),
      path.join(runRoot, 'decisions.jsonl'),
      path.join(runRoot, 'slices', `${sliceId}.json`),
      path.join(runRoot, 'slices', `${sliceId}.candidates.jsonl`),
    ];
    for (const filePath of required) {
      await expect(fs.access(filePath)).resolves.toBeUndefined();
    }

    const removed = [
      path.join(runRoot, 'slices', `${sliceId}.universe.json`),
      path.join(runRoot, 'slices', `${sliceId}.scope.json`),
      path.join(runRoot, 'slices', `${sliceId}.coverage.json`),
    ];
    for (const filePath of removed) {
      await expect(fs.access(filePath)).rejects.toBeTruthy();
    }
  });

  it('rejects placeholder leakage in run and slice ids', async () => {
    await expect(
      ruleLabAnalyzeCommand({
        repoPath: '/tmp',
        runId: '<run_id>',
        sliceId: 'event_delegate_gap.mirror_syncvar_hook',
      }),
    ).rejects.toThrow(/placeholder values are not allowed/i);
  });
});

