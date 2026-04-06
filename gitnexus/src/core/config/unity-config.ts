import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface UnityConfig {
  maxSyntheticEdgesPerClass: number;
  maxSyntheticEdgesTotal: number;
  enableContainerNodes: boolean;
  lazyMaxPaths: number;
  lazyBatchSize: number;
  lazyMaxMs: number;
  payloadMode: 'compact' | 'full';
  persistLifecycleProcessMetadata: boolean;
  parityWarmup: boolean;
  parityWarmupMaxParallel: number;
  paritySeedCacheIdleMs: number;
  paritySeedCacheMaxEntries: number;
  parityCacheMaxEntries: number;
}

export type ConfigSourceMap = Record<keyof UnityConfig, 'cli' | 'config_file' | 'default'>;

export interface ResolvedUnityConfig {
  config: UnityConfig;
  configSource: ConfigSourceMap;
}

const DEFAULTS: UnityConfig = {
  maxSyntheticEdgesPerClass: 12,
  maxSyntheticEdgesTotal: 256,
  enableContainerNodes: false,
  lazyMaxPaths: 120,
  lazyBatchSize: 30,
  lazyMaxMs: 5000,
  payloadMode: 'compact',
  persistLifecycleProcessMetadata: false,
  parityWarmup: false,
  parityWarmupMaxParallel: 4,
  paritySeedCacheIdleMs: 60000,
  paritySeedCacheMaxEntries: 100,
  parityCacheMaxEntries: 500,
};

export function resolveUnityConfig(
  cliArgs?: Partial<UnityConfig>,
  configPath?: string,
): ResolvedUnityConfig {
  let fileValues: Partial<UnityConfig> = {};
  try {
    const path = configPath ?? join(process.cwd(), '.gitnexus', 'config.json');
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    if (raw?.unity && typeof raw.unity === 'object') {
      fileValues = raw.unity;
    }
  } catch {
    // missing or invalid config file — skip
  }

  const config = {} as UnityConfig;
  const configSource = {} as ConfigSourceMap;

  for (const key of Object.keys(DEFAULTS) as (keyof UnityConfig)[]) {
    if (cliArgs?.[key] !== undefined) {
      (config as any)[key] = cliArgs[key];
      configSource[key] = 'cli';
    } else if (fileValues[key] !== undefined) {
      (config as any)[key] = fileValues[key];
      configSource[key] = 'config_file';
    } else {
      (config as any)[key] = DEFAULTS[key];
      configSource[key] = 'default';
    }
  }

  return { config, configSource };
}
