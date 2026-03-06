export type UnityResourcesMode = 'off' | 'on' | 'auto';

export function parseUnityResourcesMode(raw?: string): UnityResourcesMode {
  if (!raw) return 'off';

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'off' || normalized === 'on' || normalized === 'auto') {
    return normalized;
  }

  throw new Error('Invalid unity resources mode. Use off|on|auto.');
}
