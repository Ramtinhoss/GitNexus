import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promoteCuratedRules } from '../../src/rule-lab/promote.js';
import { loadRuleRegistry } from '../../src/mcp/local/runtime-claim-rule-registry.js';
import { runRuleLabRegress } from '../../src/rule-lab/regress.js';

async function setupCuratedSlice(repoRoot: string, sliceId: string, ruleId: string, trigger = 'reload'): Promise<void> {
  const rulesRoot = path.join(repoRoot, '.gitnexus', 'rules');
  const sliceDir = path.join(rulesRoot, 'lab', 'runs', 'run-x', 'slices', sliceId);
  await fs.mkdir(path.join(rulesRoot, 'approved'), { recursive: true });
  await fs.mkdir(sliceDir, { recursive: true });
  await fs.writeFile(path.join(rulesRoot, 'catalog.json'), JSON.stringify({ version: 1, rules: [] }, null, 2), 'utf-8');
  await fs.writeFile(
    path.join(sliceDir, 'curated.json'),
    JSON.stringify({
      run_id: 'run-x',
      slice_id: sliceId,
      curated: [
        {
          id: `${ruleId}-candidate`,
          rule_id: ruleId,
          title: `${trigger} rule`,
          match: {
            trigger_tokens: [trigger],
            resource_types: ['asset'],
            host_base_type: ['ReloadBase'],
          },
          topology: [
            { hop: 'resource', from: { entity: 'resource' }, to: { entity: 'script' }, edge: { kind: 'binds_script' } },
          ],
          closure: {
            required_hops: ['resource'],
            failure_map: { missing_evidence: 'rule_matched_but_evidence_missing' },
          },
          claims: {
            guarantees: [`${trigger}_chain_closed`],
            non_guarantees: ['no_runtime_execution'],
            next_action: `gitnexus query "${trigger}"`,
          },
          confirmed_chain: {
            steps: [{ hop_type: 'resource', anchor: 'Assets/Demo.prefab:12', snippet: trigger }],
          },
          guarantees: [`${trigger}_chain_closed`],
          non_guarantees: ['no_runtime_execution'],
        },
      ],
    }, null, 2),
    'utf-8',
  );
}

describe('rule-lab M1 guards', () => {
  it('preserves previously promoted compiled rules when promoting a new slice', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-lab-m1-'));
    try {
      await setupCuratedSlice(repoRoot, 'slice-a', 'demo.reload.rule.v2', 'reload');
      await promoteCuratedRules({ repoPath: repoRoot, runId: 'run-x', sliceId: 'slice-a', version: '2.0.0' });

      await setupCuratedSlice(repoRoot, 'slice-b', 'demo.energy.rule.v2', 'energy');
      await promoteCuratedRules({ repoPath: repoRoot, runId: 'run-x', sliceId: 'slice-b', version: '2.0.0' });

      const registry = await loadRuleRegistry(repoRoot);
      const ids = registry.activeRules.map((rule) => rule.id).sort();
      expect(ids).toEqual(['demo.energy.rule.v2', 'demo.reload.rule.v2']);
    } finally {
      await fs.rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('fails regress when anchor/holdout/negative buckets are not all present', async () => {
    const out = await runRuleLabRegress({
      precision: 0.95,
      coverage: 0.95,
      probes: [
        {
          id: 'anchor-1',
          bucket: 'anchor',
          pass: true,
          replay_command: 'gitnexus query "anchor"',
          key_resource_hit: true,
          next_hop_usable: true,
          hint_drift: false,
          false_positive_anchor_leak: false,
        },
      ],
    } as any);

    expect(out.pass).toBe(false);
    expect(out.failures).toContain('holdout_bucket_missing');
    expect(out.failures).toContain('negative_bucket_missing');
    expect(out.threshold_checks.anchor_pass).toBe(true);
    expect(out.threshold_checks.holdout_pass).toBe(false);
    expect(out.threshold_checks.negative_pass).toBe(false);
  });
});
