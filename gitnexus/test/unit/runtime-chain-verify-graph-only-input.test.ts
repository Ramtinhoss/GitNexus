import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyRuntimeClaimOnDemand } from '../../src/mcp/local/runtime-chain-verify.js';
import { writeCompiledRuleBundle } from '../../src/rule-lab/compiled-bundles.js';

function makeSyntheticExecutor() {
  return async (query: string) => {
    const q = String(query || '');
    if (q.includes("r.reason CONTAINS $ruleId") && q.includes("r.reason STARTS WITH 'unity-rule-'")) {
      return [{
        sourceName: 'GunGraph',
        sourceFilePath: 'Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs',
        sourceStartLine: 1,
        targetName: 'RegisterEvents',
        targetFilePath: 'Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs',
        targetStartLine: 40,
        reason: 'unity-rule-demo.graph-only-input.v1',
      }];
    }
    return [];
  };
}

describe('runtime-chain graph-only input contract', () => {
  it('does not use queryText as primary verifier match signal', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-chain-graph-only-input-'));
    try {
      await writeCompiledRuleBundle(
        path.join(repoRoot, '.gitnexus', 'rules'),
        'verification_rules',
        [
          {
            id: 'demo.graph-only-input.v1',
            version: '1.0.0',
            trigger_family: 'reload',
            trigger_tokens: ['reload'],
            resource_types: ['asset'],
            host_base_type: ['GunGraph'],
            required_hops: ['resource', 'guid_map', 'code_loader', 'code_runtime'],
            guarantees: ['topology_chain_closed'],
            non_guarantees: ['does_not_prove_runtime_execution'],
            next_action: 'gitnexus query "Reload runtime chain"',
            file_path: 'approved/demo.graph-only-input.v1.yaml',
          },
        ],
      );

      const out = await verifyRuntimeClaimOnDemand({
        repoPath: repoRoot,
        queryText: 'reload runtime chain',
        executeParameterized: makeSyntheticExecutor(),
      });

      expect(out.status).toBe('failed');
      expect(out.reason).toBe('rule_not_matched');
    } finally {
      await fs.rm(repoRoot, { recursive: true, force: true });
    }
  });
});
