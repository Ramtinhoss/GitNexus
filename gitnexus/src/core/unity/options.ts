export type UnityResourcesMode = 'off' | 'on' | 'auto';
export type UnityHydrationMode = 'parity' | 'compact';
export type UnityEvidenceMode = 'summary' | 'focused' | 'full';
export type HydrationPolicy = 'fast' | 'balanced' | 'strict';

export function parseUnityResourcesMode(raw?: string): UnityResourcesMode {
  if (!raw) return 'off';

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'off' || normalized === 'on' || normalized === 'auto') {
    return normalized;
  }

  throw new Error('Invalid unity resources mode. Use off|on|auto.');
}

export function parseUnityHydrationMode(raw?: string): UnityHydrationMode {
  if (!raw) return 'compact';

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'parity' || normalized === 'compact') {
    return normalized;
  }

  throw new Error('Invalid unity hydration mode. Use parity|compact.');
}

export function parseUnityEvidenceMode(raw?: string): UnityEvidenceMode {
  if (!raw) return 'summary';

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'summary' || normalized === 'focused' || normalized === 'full') {
    return normalized;
  }

  throw new Error('Invalid unity evidence mode. Use summary|focused|full.');
}

export function parseHydrationPolicy(raw?: string): HydrationPolicy {
  if (!raw) return 'balanced';

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'fast' || normalized === 'balanced' || normalized === 'strict') {
    return normalized;
  }

  throw new Error('Invalid hydration policy. Use fast|balanced|strict.');
}
