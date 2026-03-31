import {
  DEFAULT_UNITY_LIFECYCLE_SYNTHETIC_CONFIG,
  type UnityLifecycleSyntheticConfig,
} from './unity-lifecycle-synthetic-calls.js';

const TRUE_VALUES = new Set(['1', 'true', 'on', 'yes']);

const parsePositiveInt = (raw: string | undefined, fallback: number): number => {
  const value = Number.parseInt(String(raw || '').trim(), 10);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
};

const parseBool = (raw: string | undefined): boolean => {
  const normalized = String(raw || '').trim().toLowerCase();
  return TRUE_VALUES.has(normalized);
};

export interface UnityLifecycleConfig extends UnityLifecycleSyntheticConfig {}

export const resolveUnityLifecycleConfig = (env: NodeJS.ProcessEnv): UnityLifecycleConfig => {
  const enabled = parseBool(env.GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS);
  const maxSyntheticEdgesPerClass = parsePositiveInt(
    env.GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_MAX_PER_CLASS,
    DEFAULT_UNITY_LIFECYCLE_SYNTHETIC_CONFIG.maxSyntheticEdgesPerClass,
  );
  const maxSyntheticEdgesTotal = parsePositiveInt(
    env.GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_MAX_TOTAL,
    DEFAULT_UNITY_LIFECYCLE_SYNTHETIC_CONFIG.maxSyntheticEdgesTotal,
  );

  return {
    ...DEFAULT_UNITY_LIFECYCLE_SYNTHETIC_CONFIG,
    enabled,
    maxSyntheticEdgesPerClass,
    maxSyntheticEdgesTotal,
  };
};
