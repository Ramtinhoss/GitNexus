import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildReviewPack } from './review-pack.js';

describe('rule-lab review-pack', () => {
  it('splits cards to keep token budget <= 6000', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-review-pack-'));
    const sliceDir = path.join(repoRoot, '.gitnexus', 'rules', 'lab', 'runs', 'run-x', 'slices', 'slice-a');
    await fs.mkdir(sliceDir, { recursive: true });

    const candidate = {
      id: 'cand-1',
      title: 'reload candidate',
      evidence: {
        hops: [
          { hop_type: 'resource', anchor: 'Assets/Example.prefab:42', snippet: 'ReloadGraph' },
        ],
      },
    };
    const lines = Array.from({ length: 12 }).map((_, i) => JSON.stringify({ ...candidate, id: `cand-${i}` }));
    await fs.writeFile(path.join(sliceDir, 'candidates.jsonl'), `${lines.join('\n')}\n`, 'utf-8');

    const out = await buildReviewPack({ repoPath: repoRoot, runId: 'run-x', sliceId: 'slice-a', maxTokens: 6000 });
    expect(out.meta.token_budget_estimate).toBeLessThanOrEqual(6000);
    expect(out.meta.truncated || out.cards.length > 0).toBe(true);

    const persisted = await fs.readFile(out.paths.reviewCardsPath, 'utf-8');
    expect(persisted).toContain('token_budget_estimate');

    await fs.rm(repoRoot, { recursive: true, force: true });
  });
});
