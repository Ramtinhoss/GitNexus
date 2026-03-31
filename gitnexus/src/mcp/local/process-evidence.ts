export type ProcessEvidenceMode = 'direct_step' | 'method_projected';
export type ProcessConfidence = 'high' | 'medium';

export interface ProcessEvidenceRow {
  pid: string;
  label: string;
  step: number;
  stepCount: number;
}

export interface ProjectedProcessEvidenceRow extends ProcessEvidenceRow {
  viaMethodId?: string;
}

export interface MergedProcessEvidenceRow extends ProcessEvidenceRow {
  evidence_mode: ProcessEvidenceMode;
  confidence: ProcessConfidence;
}

export function mergeProcessEvidence(input: {
  directRows: ProcessEvidenceRow[];
  projectedRows: ProjectedProcessEvidenceRow[];
}): MergedProcessEvidenceRow[] {
  const byPid = new Map<string, MergedProcessEvidenceRow>();

  for (const row of input.projectedRows) {
    byPid.set(row.pid, {
      pid: row.pid,
      label: row.label,
      step: row.step,
      stepCount: row.stepCount,
      evidence_mode: 'method_projected',
      confidence: 'medium',
    });
  }

  for (const row of input.directRows) {
    byPid.set(row.pid, {
      pid: row.pid,
      label: row.label,
      step: row.step,
      stepCount: row.stepCount,
      evidence_mode: 'direct_step',
      confidence: 'high',
    });
  }

  return [...byPid.values()];
}
