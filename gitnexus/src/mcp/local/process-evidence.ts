import {
  buildVerificationHint,
  deriveConfidence,
  type ProcessConfidence,
  type ProcessEvidenceMode,
  type VerificationHint,
} from './process-confidence.js';

export interface ProcessEvidenceRow {
  pid: string;
  label: string;
  step: number;
  stepCount: number;
  [key: string]: unknown;
}

export interface ProjectedProcessEvidenceRow extends ProcessEvidenceRow {
  viaMethodId?: string;
}

export interface HeuristicProcessEvidenceRow extends ProcessEvidenceRow {
  processSubtype?: string;
  needsParityRetry?: boolean;
  verificationTarget?: string;
}

export interface MergedProcessEvidenceRow extends ProcessEvidenceRow {
  evidence_mode: ProcessEvidenceMode;
  confidence: ProcessConfidence;
  verification_hint?: VerificationHint;
}

const normalizeProcessConfidence = (
  raw: unknown,
  fallback: ProcessConfidence,
): ProcessConfidence => {
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw;
  return fallback;
};

export function mergeProcessEvidence(input: {
  directRows: ProcessEvidenceRow[];
  projectedRows: ProjectedProcessEvidenceRow[];
  heuristicRows?: HeuristicProcessEvidenceRow[];
}): MergedProcessEvidenceRow[] {
  const byPid = new Map<string, MergedProcessEvidenceRow>();

  for (const row of input.heuristicRows || []) {
    const confidence = deriveConfidence({
      evidenceMode: 'resource_heuristic',
      processSubtype: String((row as any).processSubtype || ''),
      hasPartialUnityEvidence: true,
    });
    byPid.set(row.pid, {
      ...row,
      pid: row.pid,
      label: row.label,
      step: row.step,
      stepCount: row.stepCount,
      evidence_mode: 'resource_heuristic',
      confidence,
      verification_hint: buildVerificationHint({
        confidence,
        needsParityRetry: Boolean(row.needsParityRetry),
        target: row.verificationTarget || row.label || row.pid,
      }),
    });
  }

  for (const row of input.projectedRows) {
    byPid.set(row.pid, {
      ...row,
      pid: row.pid,
      label: row.label,
      step: row.step,
      stepCount: row.stepCount,
      evidence_mode: 'method_projected',
      confidence: deriveConfidence({
        evidenceMode: 'method_projected',
        processSubtype: String((row as any).processSubtype || ''),
      }),
    });
  }

  for (const row of input.directRows) {
    const derivedDefault = deriveConfidence({
      evidenceMode: 'direct_step',
      processSubtype: String((row as any).processSubtype || ''),
    });
    const persistedConfidence = normalizeProcessConfidence(
      (row as any).runtimeChainConfidence ?? (row as any).runtime_chain_confidence,
      derivedDefault,
    );
    byPid.set(row.pid, {
      ...row,
      pid: row.pid,
      label: row.label,
      step: row.step,
      stepCount: row.stepCount,
      evidence_mode: 'direct_step',
      confidence: persistedConfidence,
    });
  }

  return [...byPid.values()];
}
