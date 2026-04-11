import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ruleLabAnalyzeCommand } from '../../src/cli/rule-lab.js';

const tempDirs: string[] = [];

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

async function createRunFixture(input: {
  runId: string;
  sliceId: string;
  coverage: { required?: boolean; userRaw: number; processed: number };
}): Promise<{ repoPath: string; gapSlicePath: string; candidatesPath: string }> {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'gap-lab-cov-gate-'));
  tempDirs.push(repoPath);

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

  await writeJson(rulesSlicePath, {
    id: input.sliceId,
    trigger_family: 'event_delegate',
    resource_types: ['syncvar_hook'],
    host_base_type: ['network_behaviour'],
    required_hops: ['code_runtime'],
  });
  await writeJson(gapSlicePath, {
    slice_id: input.sliceId,
    status: 'in_progress',
    coverage_gate: {
      required: input.coverage.required ?? true,
      user_raw_matches: input.coverage.userRaw,
      processed_user_matches: input.coverage.processed,
    },
  });

  return { repoPath, gapSlicePath, candidatesPath };
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('gap-lab exhaustive discovery coverage gate', () => {
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

  it('allows analyze command when coverage is complete', async () => {
    const runId = 'run-gap-cov-2';
    const sliceId = 'event_delegate_gap.mirror_syncvar_hook';
    const { repoPath, gapSlicePath, candidatesPath } = await createRunFixture({
      runId,
      sliceId,
      coverage: { userRaw: 2, processed: 2 },
    });

    await expect(
      ruleLabAnalyzeCommand({ repoPath, runId, sliceId }),
    ).resolves.toBeUndefined();

    const updated = JSON.parse(await fs.readFile(gapSlicePath, 'utf-8')) as any;
    expect(updated.coverage_gate?.status).toBe('passed');
    await expect(fs.readFile(candidatesPath, 'utf-8')).resolves.toContain('rule_hint');
  });
});
