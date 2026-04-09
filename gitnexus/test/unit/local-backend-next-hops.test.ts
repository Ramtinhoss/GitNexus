import { describe, expect, it } from 'vitest';
import {
  buildNextHops,
  computeVerifierMinimumEvidenceSatisfied,
  pickRetrievalRuleHintFromBundle,
  pickVerifierSymbolAnchor,
} from '../../src/mcp/local/local-backend.js';

describe('buildNextHops command templates', () => {
  it('uses all-row conservative semantics for verifier minimum evidence gate', () => {
    const out = computeVerifierMinimumEvidenceSatisfied({
      evidenceMetaRows: [
        { verifier_minimum_evidence_satisfied: true },
        { verifier_minimum_evidence_satisfied: false },
      ],
      truncated: false,
      filterExhausted: false,
    });
    expect(out).toBe(false);
  });

  it('includes repo in generated next commands when repoName is provided', () => {
    const hops = buildNextHops({
      seedPath: 'Assets/Data/Seed.asset',
      mappedSeedTargets: ['Assets/Graph/Target.asset'],
      resourceBindings: [{ resourcePath: 'Assets/Graph/Target.asset' } as any],
      repoName: 'neonspark-core',
      symbolName: 'EnergyByAttackCount',
      queryForSymbol: 'EnergyByAttackCount',
    });

    expect(hops[0]?.next_command || '').toContain('--repo "neonspark-core"');
    const symbolHop = hops.find((hop) => hop.kind === 'symbol');
    expect(symbolHop?.next_command || '').toContain('--repo "neonspark-core"');
  });

  it('injects repo into verify hint command when command is gitnexus query/context', () => {
    const hops = buildNextHops({
      seedPath: 'Assets/Data/Seed.asset',
      mappedSeedTargets: ['Assets/Graph/Target.asset'],
      resourceBindings: [{ resourcePath: 'Assets/Graph/Target.asset' } as any],
      repoName: 'neonspark-core',
      verificationHint: {
        action: 'manual_asset_meta_verification',
        target: 'Assets/Graph/Target.asset',
        next_command: 'gitnexus query --unity-resources on "EnergyByAttackCount"',
      },
      symbolName: 'EnergyByAttackCount',
      queryForSymbol: 'EnergyByAttackCount',
    });

    const verifyHop = hops.find((hop) => hop.kind === 'verify');
    expect(verifyHop?.next_command || '').toContain('--repo "neonspark-core"');
  });

  it('keeps backward compatible command templates when repoName is omitted', () => {
    const hops = buildNextHops({
      seedPath: 'Assets/Data/Seed.asset',
      mappedSeedTargets: ['Assets/Graph/Target.asset'],
      resourceBindings: [{ resourcePath: 'Assets/Graph/Target.asset' } as any],
      symbolName: 'EnergyByAttackCount',
      queryForSymbol: 'EnergyByAttackCount',
    });

    expect(hops[0]?.next_command || '').not.toContain('--repo');
  });

  it('adds a retrieval-rule-configured verify hop ahead of generic symbol follow-up', () => {
    const hops = buildNextHops({
      seedPath: 'Assets/Data/Seed.asset',
      mappedSeedTargets: ['Assets/Graph/Target.asset'],
      resourceBindings: [{ resourcePath: 'Assets/Graph/Target.asset' } as any],
      repoName: 'neonspark-core',
      retrievalRule: {
        id: 'demo.rule.v2',
        next_action: 'gitnexus query --unity-resources on "Reload"',
      },
      symbolName: 'EnergyByAttackCount',
      queryForSymbol: 'EnergyByAttackCount',
    } as any);

    const configuredHop = hops.find((hop) => hop.kind === 'verify' && hop.why.includes('demo.rule.v2'));
    expect(configuredHop).toBeDefined();
    expect(configuredHop?.next_command || '').toContain('--repo "neonspark-core"');
  });

  it('suppresses raw resource hops when retrieval rule scope conflicts with the current symbol fallback', () => {
    const hops = buildNextHops({
      mappedSeedTargets: [],
      resourceBindings: [
        { resourcePath: 'Assets/NEON/Graphs/Monster/测试_标记.asset' } as any,
        { resourcePath: 'Assets/NEON/Graphs/PlayerGun/1_weapon_gun_tata.asset' } as any,
      ],
      repoName: 'neonspark-core',
      verificationHint: {
        action: 'manual_asset_meta_verification',
        target: 'Assets/NEON/Graphs/PlayerGun/1_weapon_gun_tata.asset',
        next_command: 'Inspect asset + .meta linkage',
      },
      retrievalRule: {
        id: 'demo.neonspark.reload.v1',
        host_base_type: ['GunGraph'],
        next_action: 'gitnexus query --unity-resources on --runtime-chain-verify on-demand "Reload GunGraph"',
      },
      symbolName: 'Reload',
      queryForSymbol: 'Reload',
    } as any);

    expect(hops[0]?.kind).toBe('verify');
    expect(hops[0]?.target).toBe('Reload');
    expect(hops.some((hop) => hop.kind === 'resource')).toBe(false);
    expect(hops.some((hop) => hop.target === 'Assets/NEON/Graphs/PlayerGun/1_weapon_gun_tata.asset')).toBe(false);
  });

  it('prioritizes the explicit seed path ahead of mapped and bound resources', () => {
    const hops = buildNextHops({
      seedPath: 'Assets/NEON/Graphs/PlayerGun/1_weapon_orb_key.asset',
      mappedSeedTargets: [
        'Assets/NEON/Graphs/PlayerGun/1_weapon_orb_key_variant.asset',
        'Assets/NEON/Graphs/PlayerGun/1_weapon_orb_key.asset',
      ],
      resourceBindings: [
        { resourcePath: 'Assets/NEON/Graphs/PlayerGun/1_weapon_orb_key_variant.asset' } as any,
        { resourcePath: 'Assets/NEON/Graphs/Elements/Poison.asset' } as any,
      ],
      repoName: 'neonspark-core',
      symbolName: 'Reload',
      queryForSymbol: 'Reload',
    });

    const firstResourceHop = hops.find((hop) => hop.kind === 'resource');
    expect(firstResourceHop?.target).toBe('Assets/NEON/Graphs/PlayerGun/1_weapon_orb_key.asset');
  });

  it('downranks noisy test-marker asset paths behind production graph resources', () => {
    const hops = buildNextHops({
      mappedSeedTargets: [],
      resourceBindings: [
        { resourcePath: 'Assets/NEON/Graphs/Monster/测试_标记.asset' } as any,
        { resourcePath: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset' } as any,
      ],
      repoName: 'neonspark-core',
      symbolName: 'Reload',
      queryForSymbol: 'ammo value computation then reload validation flow',
    });

    const resourceTargets = hops.filter((hop) => hop.kind === 'resource').map((hop) => hop.target);
    expect(resourceTargets[0]).toBe('Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset');
  });

  it('prefers the highest-signal retrieval rule instead of first substring match', () => {
    const hint = pickRetrievalRuleHintFromBundle({
      queryText: 'Reload ReloadBase asset runtime chain',
      symbolName: 'ReloadBase',
      seedPath: 'Assets/Data/Reload.asset',
      rules: [
        {
          id: 'generic.reload',
          trigger_tokens: ['reload'],
          host_base_type: ['MonoBehaviour'],
          resource_types: ['asset'],
          next_action: 'gitnexus query "generic"',
        },
        {
          id: 'specific.reloadbase',
          trigger_tokens: ['reload'],
          host_base_type: ['ReloadBase'],
          resource_types: ['asset'],
          next_action: 'gitnexus query "specific"',
        },
      ] as any,
    });

    expect(hint?.id).toBe('specific.reloadbase');
    expect(hint?.next_action).toContain('specific');
  });

  it('allows retrieval rules to match through host/resource evidence even when trigger tokens are absent', () => {
    const hint = pickRetrievalRuleHintFromBundle({
      queryText: 'ammo value computation then reload validation flow',
      symbolName: 'ReloadBase',
      seedPath: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset',
      rules: [
        {
          id: 'reload.no-trigger',
          trigger_tokens: ['triggerreloadonly'],
          host_base_type: ['ReloadBase'],
          resource_types: ['weapon_orb_key'],
          next_action: 'gitnexus query "no-trigger-supported"',
        },
      ] as any,
    });

    expect(hint?.id).toBe('reload.no-trigger');
    expect(hint?.next_action).toContain('no-trigger-supported');
  });

  it('prefers structured symbol anchors for verifier wiring over query text fallback', () => {
    const anchor = pickVerifierSymbolAnchor({
      queryText: 'completely unrelated user input',
      processSymbols: [{
        name: 'GunGraph',
        filePath: 'Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs',
      }],
      definitions: [{
        name: 'ReloadBase',
        filePath: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
      }],
    });

    expect(anchor.symbolName).toBe('GunGraph');
    expect(anchor.symbolFilePath).toBe('Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs');
  });

  it('prefers non-heuristic, non-low-confidence process symbols over resource-heuristic anchors', () => {
    const anchor = pickVerifierSymbolAnchor({
      queryText: 'reload check decided from stat getter',
      processSymbols: [
        {
          name: 'Reload',
          filePath: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/Reload.cs',
          process_evidence_mode: 'resource_heuristic',
          process_confidence: 'low',
          resourceBindings: [{ resourcePath: 'Assets/NEON/Graphs/Elements/Poison.asset' }],
        },
        {
          name: 'InitializeWeaponStats',
          filePath: 'Assets/NEON/Code/Game/Graph/Nodes/Weapons/InitializeWeaponStats.cs',
          process_evidence_mode: 'direct_step',
          process_confidence: 'high',
        },
      ],
      definitions: [],
    });

    expect(anchor.symbolName).toBe('InitializeWeaponStats');
    expect(anchor.symbolFilePath).toBe('Assets/NEON/Code/Game/Graph/Nodes/Weapons/InitializeWeaponStats.cs');
  });
});
