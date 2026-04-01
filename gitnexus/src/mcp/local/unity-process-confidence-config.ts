export function resolveUnityProcessConfidenceFieldsEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = String(env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}
