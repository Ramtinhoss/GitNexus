import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyRuntimeChainOnDemand, verifyRuntimeClaimOnDemand } from './runtime-chain-verify.js';
import { promoteCuratedRules } from '../../rule-lab/promote.js';

async function makeTempRepo(): Promise<string> {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-chain-verify-'));
  await fs.mkdir(path.join(repoPath, 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb'), { recursive: true });
  await fs.mkdir(path.join(repoPath, 'Assets/NEON/Graphs/PlayerGun/Gungraph_use'), { recursive: true });
  await fs.mkdir(path.join(repoPath, 'Assets/NEON/Code/Game/Graph/Nodes/Reloads'), { recursive: true });
  await fs.writeFile(path.join(repoPath, 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset'), 'gungraph: {guid: 69199acacbf8a7e489ad4aa872efcabd}\n');
  await fs.writeFile(path.join(repoPath, 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset'), 'ResultRPM: GunOutput.RPM\n');
  await fs.writeFile(path.join(repoPath, 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/Reload.cs.meta'), 'guid: bd387039cacb475381a86f156b54bac2\n');
  await fs.mkdir(path.join(repoPath, 'Assets/NEON/Code/Game/PowerUps'), { recursive: true });
  await fs.mkdir(path.join(repoPath, 'Assets/NEON/Code/Game/Core'), { recursive: true });
  await fs.writeFile(
    path.join(repoPath, 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs'),
    'void Equip() {\n  CurGunGraph = graph;\n}\n',
  );
  await fs.writeFile(path.join(repoPath, 'Assets/NEON/Code/Game/Core/GunGraph.cs'), 'void StartRoutineWithEvents() {}\n');
  await fs.writeFile(path.join(repoPath, 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs'), 'void GetValue() {}\n');
  return repoPath;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function makeExecuteParameterized(repoPath: string): (query: string, params?: Record<string, unknown>) => Promise<any[]> {
  return async (_query, params) => {
    if (String(params?.filePathPattern || '').includes('WeaponPowerUp.cs')) {
      if (await fileExists(path.join(repoPath, 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs'))) {
        return [{ filePath: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs', startLine: 1 }];
      }
      return [];
    }
    if (String(params?.filePathPattern || '').includes('GunGraph')) {
      if (await fileExists(path.join(repoPath, 'Assets/NEON/Code/Game/Core/GunGraph.cs'))) {
        return [{ filePath: 'Assets/NEON/Code/Game/Core/GunGraph.cs', startLine: 1 }];
      }
      return [];
    }
    if (String(params?.filePathPattern || '').includes('ReloadBase.cs')) {
      if (await fileExists(path.join(repoPath, 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs'))) {
        return [{ filePath: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs', startLine: 1 }];
      }
      return [];
    }
    return [];
  };
}

function hasBalancedShellQuotes(command: string): boolean {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (const ch of String(command || '')) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (!inDouble && ch === '\'') {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && ch === '"') {
      inDouble = !inDouble;
    }
  }
  return !inSingle && !inDouble && !escaped;
}

async function writeRules(
  repoPath: string,
  ruleYamlByFile: Record<string, string>,
  rootDirName = 'rules',
): Promise<string> {
  const rulesRoot = path.join(repoPath, '.gitnexus', rootDirName);
  await fs.mkdir(path.join(rulesRoot, 'approved'), { recursive: true });
  const entries = Object.entries(ruleYamlByFile).map(([file, content]) => {
    const id = String(content.match(/^id:\s*(.+)$/m)?.[1] || '').trim();
    const version = String(content.match(/^version:\s*(.+)$/m)?.[1] || '').trim();
    return { id, version, file };
  });
  await fs.writeFile(path.join(rulesRoot, 'catalog.json'), JSON.stringify({ rules: entries }, null, 2), 'utf-8');
  for (const [file, content] of Object.entries(ruleYamlByFile)) {
    await fs.writeFile(path.join(rulesRoot, file), content, 'utf-8');
  }
  return rulesRoot;
}

describe('runtime chain verify', () => {
  it('v1 runtime chain verify on demand builds reload chain hops', async () => {
    const repoPath = await makeTempRepo();
    const out = await verifyRuntimeChainOnDemand({
      repoPath,
      queryText: 'Reload NEON.Game.Graph.Nodes.Reloads',
      executeParameterized: makeExecuteParameterized(repoPath),
      resourceBindings: [{ resourcePath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset' }],
    });
    expect(out?.evidence_level).toBe('verified_chain');
    expect(out?.hops.some((hop) => hop.hop_type === 'guid_map')).toBe(true);
    const loader = out?.hops.find((hop) => hop.hop_type === 'code_loader');
    expect(loader?.snippet || '').toMatch(/CurGunGraph\s*=/i);
  });

  it('v1 runtime chain gaps are actionable', async () => {
    const out = await verifyRuntimeChainOnDemand({
      repoPath: await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-chain-gaps-')),
      queryText: 'Reload',
      executeParameterized: async () => [],
      resourceBindings: [],
    });
    expect(out?.gaps.length).toBeGreaterThan(0);
    expect(out?.gaps.every((gap) => !!gap.next_command)).toBe(true);
  });

  it('phase2 runtime claim returns explicit rule_not_matched', async () => {
    const out = await verifyRuntimeClaimOnDemand({
      repoPath: path.resolve('.'),
      queryText: 'CompletelyUnrelatedChain',
      executeParameterized: async () => [],
      resourceBindings: [],
      rulesRoot: path.resolve('.gitnexus/rules'),
    });
    expect(out.status).toBe('failed');
    expect(out.reason).toBe('rule_not_matched');
    expect(out.next_action).toBeTruthy();
  });

  it('phase2 runtime claim maps missing catalog to rule_not_matched', async () => {
    const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-chain-missing-catalog-'));
    const out = await verifyRuntimeClaimOnDemand({
      repoPath,
      queryText: 'Reload NEON.Game.Graph.Nodes.Reloads',
      executeParameterized: async () => [],
      resourceBindings: [],
      rulesRoot: path.join(repoPath, '.gitnexus', 'rules'),
    });
    expect(out.status).toBe('failed');
    expect(out.reason).toBe('rule_not_matched');
    expect(out.next_action).toBeTruthy();
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it('phase2 runtime claim maps missing rule file to rule_not_matched', async () => {
    const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-chain-missing-rule-file-'));
    const rulesRoot = path.join(repoPath, '.gitnexus', 'rules');
    await fs.mkdir(path.join(rulesRoot, 'approved'), { recursive: true });
    await fs.writeFile(
      path.join(rulesRoot, 'catalog.json'),
      JSON.stringify({
        rules: [{ id: 'demo.reload.rule.v1', version: '1.0.0', file: 'approved/demo.reload.rule.v1.yaml' }],
      }),
      'utf-8',
    );
    const out = await verifyRuntimeClaimOnDemand({
      repoPath,
      queryText: 'Reload NEON.Game.Graph.Nodes.Reloads',
      executeParameterized: async () => [],
      resourceBindings: [],
      rulesRoot,
    });
    expect(out.status).toBe('failed');
    expect(out.reason).toBe('rule_not_matched');
    expect(out.next_action).toBeTruthy();
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it('phase2 runtime claim uses bootstrap reload rule metadata', async () => {
    const repoPath = await makeTempRepo();
    const out = await verifyRuntimeClaimOnDemand({
      repoPath,
      queryText: 'Reload NEON.Game.Graph.Nodes.Reloads',
      executeParameterized: makeExecuteParameterized(repoPath),
      resourceBindings: [{ resourcePath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset' }],
      rulesRoot: path.resolve('.gitnexus/rules'),
    });
    expect(out.rule_id).toBe('unity.gungraph.reload.output-getvalue.v1');
    expect(out.rule_version).toBe('1.0.0');
  });

  it('phase2 next_action remains shell-parsable when unmatched', async () => {
    const out = await verifyRuntimeClaimOnDemand({
      repoPath: path.resolve('.'),
      queryText: 'CompletelyUnrelatedChain',
      executeParameterized: async () => [],
      resourceBindings: [],
      rulesRoot: path.resolve('.gitnexus/rules'),
    });
    expect(out.reason).toBe('rule_not_matched');
    expect(typeof out.next_action).toBe('string');
    expect(hasBalancedShellQuotes(String(out.next_action || ''))).toBe(true);
  });

  it('phase2 runtime claim required_hops are rule-driven', async () => {
    const repoPath = await makeTempRepo();
    await fs.rm(path.join(repoPath, 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs'), { force: true });
    const strictRulesRoot = await writeRules(repoPath, {
      'approved/demo.reload.strict.v1.yaml': [
        'id: demo.reload.strict.v1',
        'version: 1.0.0',
        'trigger_family: reload',
        'resource_types:',
        '  - asset',
        'host_base_type:',
        '  - ReloadBase',
        'required_hops:',
        '  - resource',
        '  - guid_map',
        '  - code_loader',
        '  - code_runtime',
        'guarantees:',
        '  - strict_chain_closed',
        'non_guarantees:',
        '  - strict_no_runtime_execution',
        'next_action: node strict',
      ].join('\n'),
    }, 'rules-strict');
    const relaxedRulesRoot = await writeRules(repoPath, {
      'approved/demo.reload.relaxed.v1.yaml': [
        'id: demo.reload.relaxed.v1',
        'version: 1.0.0',
        'trigger_family: reload',
        'resource_types:',
        '  - asset',
        'host_base_type:',
        '  - ReloadBase',
        'required_hops:',
        '  - resource',
        '  - guid_map',
        '  - code_loader',
        'guarantees:',
        '  - relaxed_chain_closed',
        'non_guarantees:',
        '  - relaxed_no_runtime_execution',
        'next_action: node relaxed',
      ].join('\n'),
    }, 'rules-relaxed');

    const strict = await verifyRuntimeClaimOnDemand({
      repoPath,
      queryText: 'Reload NEON.Game.Graph.Nodes.Reloads',
      executeParameterized: makeExecuteParameterized(repoPath),
      resourceBindings: [{ resourcePath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset' }],
      rulesRoot: strictRulesRoot,
    });
    const relaxed = await verifyRuntimeClaimOnDemand({
      repoPath,
      queryText: 'Reload NEON.Game.Graph.Nodes.Reloads',
      executeParameterized: makeExecuteParameterized(repoPath),
      resourceBindings: [{ resourcePath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset' }],
      rulesRoot: relaxedRulesRoot,
    });

    expect(strict.status).toBe('verified_partial');
    expect(relaxed.status).toBe('verified_full');
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it('phase2 runtime claim guarantees/non_guarantees come from matched rule', async () => {
    const repoPath = await makeTempRepo();
    const rulesRoot = await writeRules(repoPath, {
      'approved/demo.reload.claim-semantics.v1.yaml': [
        'id: demo.reload.claim-semantics.v1',
        'version: 2.0.0',
        'trigger_family: reload',
        'resource_types:',
        '  - asset',
        'host_base_type:',
        '  - ReloadBase',
        'required_hops:',
        '  - resource',
        '  - guid_map',
        '  - code_loader',
        '  - code_runtime',
        'guarantees:',
        '  - custom_guarantee_from_rule',
        'non_guarantees:',
        '  - custom_non_guarantee_from_rule',
        'next_action: node claim-semantics',
      ].join('\n'),
    });
    const out = await verifyRuntimeClaimOnDemand({
      repoPath,
      queryText: 'Reload NEON.Game.Graph.Nodes.Reloads',
      executeParameterized: makeExecuteParameterized(repoPath),
      resourceBindings: [{ resourcePath: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset' }],
      rulesRoot,
    });
    expect(out.rule_id).toBe('demo.reload.claim-semantics.v1');
    expect(out.rule_version).toBe('2.0.0');
    expect(out.guarantees).toEqual(['custom_guarantee_from_rule']);
    expect(out.non_guarantees).toEqual(['custom_non_guarantee_from_rule']);
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it('phase2 non-reload trigger family executes rule-driven verifier', async () => {
    const repoPath = await makeTempRepo();
    const rulesRoot = await writeRules(repoPath, {
      'approved/demo.startup.v1.yaml': [
        'id: demo.startup.v1',
        'version: 1.0.0',
        'trigger_family: startup',
        'resource_types:',
        '  - asset',
        'host_base_type:',
        '  - StartupNode',
        'required_hops:',
        '  - resource',
        'guarantees:',
        '  - startup_chain_closed',
        'non_guarantees:',
        '  - startup_not_executed',
        'next_action: node startup',
      ].join('\n'),
    });
    const out = await verifyRuntimeClaimOnDemand({
      repoPath,
      queryText: 'Startup Graph Trigger',
      executeParameterized: makeExecuteParameterized(repoPath),
      resourceBindings: [{ resourcePath: 'Assets/Custom/Rules/startup.asset' }],
      rulesRoot,
    });
    expect(out.rule_id).toBe('demo.startup.v1');
    expect(out.status).toBe('verified_full');
    expect(out.evidence_level).toBe('verified_segment');
    expect(out.reason).toBeUndefined();
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it('phase5 rule-lab promoted rule is loadable', async () => {
    const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-chain-rule-lab-promote-'));
    const sliceDir = path.join(repoPath, '.gitnexus', 'rules', 'lab', 'runs', 'run-x', 'slices', 'slice-a');
    await fs.mkdir(sliceDir, { recursive: true });
    await fs.writeFile(
      path.join(sliceDir, 'curated.json'),
      JSON.stringify({
        run_id: 'run-x',
        slice_id: 'slice-a',
        curated: [
          {
            id: 'candidate-startup-1',
            rule_id: 'demo.startup.v1',
            title: 'startup startup graph',
            confirmed_chain: {
              steps: [{ hop_type: 'resource', anchor: 'Assets/Rules/startup.asset:1', snippet: 'Startup Graph Trigger' }],
            },
            guarantees: ['startup trigger matching is confirmed'],
            non_guarantees: ['does not prove full runtime ordering'],
          },
        ],
      }, null, 2),
      'utf-8',
    );

    await promoteCuratedRules({ repoPath, runId: 'run-x', sliceId: 'slice-a', version: '1.0.0' });

    const out = await verifyRuntimeClaimOnDemand({
      repoPath,
      queryText: 'Startup Graph Trigger',
      executeParameterized: async () => [],
      resourceBindings: [{ resourcePath: 'Assets/Rules/startup.asset' }],
    });

    expect(out.rule_id).toBe('demo.startup.v1');
    expect(out.reason).toBeUndefined();
    await fs.rm(repoPath, { recursive: true, force: true });
  });
});
