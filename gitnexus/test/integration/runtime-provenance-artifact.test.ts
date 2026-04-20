import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { benchmarkCommand } from '../../src/cli/benchmark.js';

describe('runtime provenance artifact', () => {
  it('emits provenance artifact without online verifier dependency', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-provenance-artifact-'));
    const recordsPath = path.join(tempRoot, 'records.json');
    await fs.writeFile(
      recordsPath,
      JSON.stringify([
        {
          scenario_id: 'reload-gungraph',
          query_text: 'Reload GunGraph chain',
          symbol_name: 'GunGraph',
          resource_seed_path: 'Assets/NEON/DataAssets/Powerups/weapon.asset',
          mapped_seed_targets: ['Assets/NEON/Graphs/PlayerGun/Gungraph_use/weapon_graph.asset'],
          runtime_claim: {
            status: 'verified_full',
            evidence_level: 'verified_chain',
            hops_count: 2,
            gaps_count: 0,
          },
        },
      ], null, 2),
      'utf-8',
    );

    const reportDir = path.join(tempRoot, 'reports');
    const out = await benchmarkCommand('runtime-poc', {
      repo: 'neonspark-core',
      reportDir,
      recordsPath,
    });

    const artifactRaw = await fs.readFile(out.artifactPath, 'utf-8');
    const artifact = JSON.parse(artifactRaw);
    expect(artifact.repo).toBe('neonspark-core');
    expect(artifact.mode).toBe('offline_provenance_only');
    expect(Array.isArray(artifact.records)).toBe(true);
    expect(artifact.records[0]?.runtime_claim?.status).toBe('verified_full');

    const indexRaw = await fs.readFile(out.indexPath, 'utf-8');
    const index = JSON.parse(indexRaw);
    expect(Array.isArray(index.entries)).toBe(true);
    expect(index.entries[0]?.artifact_path).toBe(out.artifactPath);
    expect(typeof index.entries[0]?.sha256).toBe('string');

    await fs.rm(tempRoot, { recursive: true, force: true });
  });
});
