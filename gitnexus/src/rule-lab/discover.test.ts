import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { discoverRuleLabRun } from './discover.js';

describe('rule-lab discover', () => {
  it('writes manifest with slices and next_actions', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-discover-'));
    const rulesRoot = path.join(repoRoot, '.gitnexus', 'rules');
    await fs.mkdir(path.join(rulesRoot, 'approved'), { recursive: true });
    await fs.writeFile(
      path.join(rulesRoot, 'catalog.json'),
      JSON.stringify({
        rules: [
          {
            id: 'demo.reload.rule.v1',
            version: '1.0.0',
            file: 'approved/demo.reload.rule.v1.yaml',
          },
        ],
      }),
      'utf-8',
    );
    await fs.writeFile(
      path.join(rulesRoot, 'approved', 'demo.reload.rule.v1.yaml'),
      [
        'id: demo.reload.rule.v1',
        'version: 1.0.0',
        'trigger_family: reload',
        'resource_types:',
        '  - prefab',
        'host_base_type:',
        '  - ReloadBase',
      ].join('\n'),
      'utf-8',
    );

    const out = await discoverRuleLabRun({ repoPath: repoRoot, scope: 'full' });
    expect(out.manifest.slices.length).toBeGreaterThan(0);
    expect(out.manifest.next_actions.join(' ')).toContain('rule-lab analyze');

    const manifestOnDisk = JSON.parse(await fs.readFile(out.paths.manifestPath, 'utf-8'));
    expect(manifestOnDisk.run_id).toBe(out.manifest.run_id);
    expect(Array.isArray(manifestOnDisk.slices)).toBe(true);

    await fs.rm(repoRoot, { recursive: true, force: true });
  });
});
