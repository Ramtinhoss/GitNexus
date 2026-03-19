import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GITNEXUS_PACKAGE_NAME,
  resolveCliSpec,
  buildNpxCommand,
} from '../../src/config/cli-spec.js';

describe('resolveCliSpec', () => {
  it('defaults to @latest on the package name', () => {
    const resolved = resolveCliSpec({ env: {} as NodeJS.ProcessEnv, config: {} });
    expect(resolved.packageSpec).toBe(`${resolved.packageName}@latest`);
    expect(resolved.source).toBe('default');
  });

  it('uses explicit version over all other sources', () => {
    const resolved = resolveCliSpec({
      packageName: DEFAULT_GITNEXUS_PACKAGE_NAME,
      explicitVersion: '1.4.7-rc',
      env: { GITNEXUS_CLI_VERSION: '1.3.11' } as NodeJS.ProcessEnv,
      config: { cliVersion: '1.2.0' },
    });
    expect(resolved.packageSpec).toBe('@veewo/gitnexus@1.4.7-rc');
    expect(resolved.source).toBe('explicit-version');
  });

  it('normalizes explicit package spec without version to @latest', () => {
    const resolved = resolveCliSpec({
      explicitSpec: '@veewo/gitnexus',
      env: {} as NodeJS.ProcessEnv,
      config: {},
    });
    expect(resolved.packageSpec).toBe('@veewo/gitnexus@latest');
    expect(resolved.source).toBe('explicit-spec');
  });

  it('falls back to config package spec when no explicit/env values are set', () => {
    const resolved = resolveCliSpec({
      packageName: '@veewo/gitnexus',
      env: {} as NodeJS.ProcessEnv,
      config: { cliPackageSpec: '@veewo/gitnexus@1.4.6' },
    });
    expect(resolved.packageSpec).toBe('@veewo/gitnexus@1.4.6');
    expect(resolved.source).toBe('config-spec');
  });
});

describe('buildNpxCommand', () => {
  it('builds deterministic npx command', () => {
    expect(buildNpxCommand('@veewo/gitnexus@1.4.7-rc', 'analyze')).toBe(
      'npx -y @veewo/gitnexus@1.4.7-rc analyze',
    );
  });
});
