export type ProcessEvidenceMode = 'direct_step' | 'method_projected';
export type ProcessConfidence = 'high' | 'medium';

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

export interface MergedProcessEvidenceRow extends ProcessEvidenceRow {
  evidence_mode: ProcessEvidenceMode;
  confidence: ProcessConfidence;
}

const normalizeProcessConfidence = (
  raw: unknown,
  fallback: ProcessConfidence,
): ProcessConfidence => {
  if (raw === 'high' || raw === 'medium') return raw;
  return fallback;
};

export function mergeProcessEvidence(input: {
  directRows: ProcessEvidenceRow[];
  projectedRows: ProjectedProcessEvidenceRow[];
}): MergedProcessEvidenceRow[] {
  const byPid = new Map<string, MergedProcessEvidenceRow>();

  for (const row of input.projectedRows) {
    byPid.set(row.pid, {
      ...row,
      pid: row.pid,
      label: row.label,
      step: row.step,
      stepCount: row.stepCount,
      evidence_mode: 'method_projected',
      confidence: 'medium',
    });
  }

  for (const row of input.directRows) {
    const persistedConfidence = normalizeProcessConfidence(
      (row as any).runtimeChainConfidence ?? (row as any).runtime_chain_confidence,
      'high',
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
