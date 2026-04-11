import fs from 'node:fs/promises';
import path from 'node:path';

export interface ParityGateInput {
  repoPath: string;
  runId: string;
  sliceId: string;
}

export interface ParityGateResult {
  enforced: boolean;
  blocked: boolean;
  reason?: 'parity_missing_gap_slice' | 'parity_missing_rules_slice';
  gapSlicePath: string;
  rulesSlicePath: string;
}

interface GapSliceDoc {
  status?: string;
  parity_status?: {
    status?: 'ok' | 'blocked';
    reason?: string;
    checked_at?: string;
  };
  [key: string]: unknown;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function enforceRunArtifactParity(input: ParityGateInput): Promise<ParityGateResult> {
  const repoPath = path.resolve(input.repoPath);
  const gapSlicePath = path.join(
    repoPath,
    '.gitnexus',
    'gap-lab',
    'runs',
    input.runId,
    'slices',
    `${input.sliceId}.json`,
  );
  const rulesSlicePath = path.join(
    repoPath,
    '.gitnexus',
    'rules',
    'lab',
    'runs',
    input.runId,
    'slices',
    input.sliceId,
    'slice.json',
  );

  const hasGapSlice = await pathExists(gapSlicePath);
  const hasRulesSlice = await pathExists(rulesSlicePath);

  let reason: ParityGateResult['reason'];
  if (!hasGapSlice) {
    reason = 'parity_missing_gap_slice';
  } else if (!hasRulesSlice) {
    reason = 'parity_missing_rules_slice';
  }

  if (!reason) {
    return {
      enforced: true,
      blocked: false,
      gapSlicePath,
      rulesSlicePath,
    };
  }

  if (hasGapSlice) {
    const now = new Date().toISOString();
    const raw = await fs.readFile(gapSlicePath, 'utf-8');
    const doc = JSON.parse(raw) as GapSliceDoc;
    doc.status = 'blocked';
    doc.parity_status = {
      status: 'blocked',
      reason,
      checked_at: now,
    };
    await fs.writeFile(gapSlicePath, `${JSON.stringify(doc, null, 2)}\n`, 'utf-8');
  }

  return {
    enforced: true,
    blocked: true,
    reason,
    gapSlicePath,
    rulesSlicePath,
  };
}

