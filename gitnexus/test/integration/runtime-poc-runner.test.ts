import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runRuntimePocBenchmark } from '../../src/benchmark/runtime-poc/runner.js';

describe('runtime-poc runner', () => {
  it('produces baseline-vs-graph-only report with required metrics', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-poc-runner-'));
    const casesPath = path.join(tempRoot, 'cases.json');
    await fs.writeFile(
      casesPath,
      JSON.stringify([
        {
          case_id: 'c1',
          query_text: 'Reload GunGraph',
          symbol_name: 'GunGraph',
          resource_seed_path: 'Assets/NEON/DataAssets/weapon.asset',
          mapped_seed_targets: ['Assets/NEON/Graphs/weapon_graph.asset'],
          baseline: { status: 'failed', evidence_level: 'none', reason: 'rule_not_matched' },
          graph_only: { status: 'verified_full', evidence_level: 'verified_chain' },
        },
        {
          case_id: 'c2',
          query_text: 'Reload WeaponPowerUp',
          symbol_name: 'WeaponPowerUp',
          resource_seed_path: 'Assets/NEON/DataAssets/weapon.asset',
          mapped_seed_targets: ['Assets/NEON/Graphs/weapon_graph.asset'],
          baseline: { status: 'verified_full', evidence_level: 'verified_chain' },
          graph_only: { status: 'failed', evidence_level: 'none', reason: 'anchor_missing' },
        },
      ], null, 2),
      'utf-8',
    );

    const out = await runRuntimePocBenchmark({
      repo: 'neonspark-core',
      reportDir: path.join(tempRoot, 'reports'),
      casesPath,
    });

    const comparison = JSON.parse(await fs.readFile(out.comparisonPath, 'utf-8'));
    expect(Array.isArray(comparison.comparison_rows)).toBe(true);
    expect(comparison.comparison_rows.length).toBe(2);
    expect(comparison.summary).toHaveProperty('verified_full_false_positive_rate');
    expect(typeof comparison.summary.verified_full_false_positive_rate).toBe('number');
    const failedRows = comparison.comparison_rows.filter((row: any) => row.graph_only_status === 'failed');
    expect(failedRows.every((row: any) => String(row.failure_bucket || '').trim().length > 0)).toBe(true);

    await fs.rm(tempRoot, { recursive: true, force: true });
  });
});
