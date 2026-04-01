export function resolveUnityRuntimeChainVerifyEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = String(env.GITNEXUS_UNITY_RUNTIME_CHAIN_VERIFY || '').trim().toLowerCase();
  if (!raw) return true;
  if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') return false;
  if (raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes') return true;
  return true;
}
