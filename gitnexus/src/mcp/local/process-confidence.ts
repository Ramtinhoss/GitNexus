export type ProcessEvidenceMode = 'direct_step' | 'method_projected';
export type ProcessConfidence = 'high' | 'medium' | 'low';

export interface VerificationHint {
  action: 'rerun_parity_hydration' | 'manual_asset_meta_verification';
  target: string;
  next_command: string;
}

export interface DeriveConfidenceInput {
  evidenceMode: ProcessEvidenceMode;
  processSubtype?: string;
}

export interface BuildVerificationHintInput {
  confidence: ProcessConfidence;
  needsParityRetry?: boolean;
  target?: string;
}

export function deriveConfidence(input: DeriveConfidenceInput): ProcessConfidence {
  if (input.evidenceMode === 'method_projected') {
    return 'medium';
  }
  if (String(input.processSubtype || '').toLowerCase() === 'unity_lifecycle') {
    return 'medium';
  }
  return 'high';
}

export function buildVerificationHint(input: BuildVerificationHintInput): VerificationHint | undefined {
  if (input.confidence !== 'low') return undefined;

  const target = String(input.target || '').trim() || 'unity-runtime-chain';
  if (input.needsParityRetry) {
    return {
      action: 'rerun_parity_hydration',
      target,
      next_command: 'gitnexus query --unity-resources on --unity-hydration parity "<symbol-or-query>"',
    };
  }

  return {
    action: 'manual_asset_meta_verification',
    target,
    next_command: 'Inspect asset + .meta linkage for this target, then rerun query/context with --unity-resources on --unity-hydration parity',
  };
}
