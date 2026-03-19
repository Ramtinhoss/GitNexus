export type UnityResourcesMode = 'off' | 'on' | 'auto';
export type UnityHydrationMode = 'parity' | 'compact';

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
