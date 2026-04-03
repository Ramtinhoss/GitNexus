import { describe, expect, it } from 'vitest';
import { buildNextHops, pickRetrievalRuleHintFromBundle } from '../../src/mcp/local/local-backend.js';

describe('buildNextHops command templates', () => {
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
});
