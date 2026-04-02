import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promoteCuratedRules } from './promote.js';

describe('rule-lab promote', () => {
  it('promotes curated candidate into approved yaml and catalog entry', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-promote-'));
    const rulesRoot = path.join(repoRoot, '.gitnexus', 'rules');
    const sliceDir = path.join(rulesRoot, 'lab', 'runs', 'run-x', 'slices', 'slice-a');
    await fs.mkdir(path.join(rulesRoot, 'approved'), { recursive: true });
    await fs.mkdir(sliceDir, { recursive: true });
    await fs.writeFile(path.join(rulesRoot, 'catalog.json'), JSON.stringify({ version: 1, rules: [] }, null, 2), 'utf-8');

    await fs.writeFile(
      path.join(sliceDir, 'curated.json'),
      JSON.stringify({
        run_id: 'run-x',
        slice_id: 'slice-a',
        curated: [
          {
            id: 'candidate-1',
            rule_id: 'demo.rule.v1',
            title: 'demo rule',
            confirmed_chain: {
              steps: [{ hop_type: 'resource', anchor: 'Assets/Demo.prefab:12', snippet: 'Reload' }],
            },
            guarantees: ['can verify startup graph trigger'],
            non_guarantees: ['does not prove all runtime states'],
          },
        ],
      }, null, 2),
      'utf-8',
    );

    const out = await promoteCuratedRules({ repoPath: repoRoot, runId: 'run-x', sliceId: 'slice-a' });
    expect(out.catalog.rules.some((r) => r.id === 'demo.rule.v1')).toBe(true);
    expect(out.promotedFiles[0]).toMatch(/rules\/approved\/.*\.yaml$/);

    await fs.rm(repoRoot, { recursive: true, force: true });
  });
});
