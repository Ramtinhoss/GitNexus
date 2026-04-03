import { describe, expect, it } from 'vitest';
import { buildNextHops } from '../../src/mcp/local/local-backend.js';

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
});
