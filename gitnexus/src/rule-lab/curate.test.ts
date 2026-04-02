import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { curateRuleLabSlice } from './curate.js';

describe('rule-lab curate', () => {
  it('rejects curation input with empty confirmed_chain.steps', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-curate-'));
    const inputPath = path.join(repoRoot, 'curation-input.json');

    await fs.writeFile(
      inputPath,
      JSON.stringify({
        run_id: 'run-x',
        slice_id: 'slice-a',
        curated: [
          {
            id: 'candidate-1',
            title: 'reload rule',
            confirmed_chain: { steps: [] },
            guarantees: ['can verify reload trigger'],
            non_guarantees: ['does not prove runtime ordering'],
          },
        ],
      }),
      'utf-8',
    );

    await expect(
      curateRuleLabSlice({ repoPath: repoRoot, runId: 'run-x', sliceId: 'slice-a', inputPath }),
    ).rejects.toThrow(/confirmed_chain\.steps/i);

    await fs.rm(repoRoot, { recursive: true, force: true });
  });
});
