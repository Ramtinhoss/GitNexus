import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeRuleLabSlice } from './analyze.js';

describe('rule-lab analyze', () => {
  it('writes candidates.jsonl with anchor-backed candidates', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-analyze-'));
    const runRoot = path.join(repoRoot, '.gitnexus', 'rules', 'lab', 'runs', 'run-x');
    const sliceDir = path.join(runRoot, 'slices', 'slice-a');
    await fs.mkdir(sliceDir, { recursive: true });
    const here = path.dirname(fileURLToPath(import.meta.url));
    const fixturePath = path.join(here, '__fixtures__', 'rule-lab-slice-input.json');
    const fixtureRaw = await fs.readFile(fixturePath, 'utf-8');
    await fs.writeFile(path.join(sliceDir, 'slice.json'), fixtureRaw, 'utf-8');

    const result = await analyzeRuleLabSlice({ repoPath: repoRoot, runId: 'run-x', sliceId: 'slice-a' });
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0].evidence.hops[0].anchor).toMatch(/:\d+$/);

    const persisted = await fs.readFile(result.paths.candidatesPath, 'utf-8');
    expect(persisted.trim().length).toBeGreaterThan(0);

    await fs.rm(repoRoot, { recursive: true, force: true });
  });
});
