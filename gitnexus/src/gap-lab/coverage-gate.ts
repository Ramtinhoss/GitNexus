import fs from 'node:fs/promises';
import path from 'node:path';
import type { CandidateAuditResult } from './candidate-audit.js';
import { ensureBalancedSlimArtifacts } from './slim-artifacts.js';

export interface CoverageGateInput {
  repoPath: string;
  runId: string;
  sliceId: string;
}

export interface CoverageGateResult {
  enforced: boolean;
  blocked: boolean;
  userRawMatches: number;
  processedUserMatches: number;
  reason?: 'coverage_incomplete';
  slicePath?: string;
  candidateAudit?: CandidateAuditResult;
}

interface GapLabSliceDoc {
  status?: string;
  coverage_gate?: {
    required?: boolean;
    user_raw_matches?: number;
    processed_user_matches?: number;
    status?: string;
    reason?: string;
    checked_at?: string;
  };
  [key: string]: unknown;
}

function numberOrZero(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function enforceCoverageGate(input: CoverageGateInput): Promise<CoverageGateResult> {
  await ensureBalancedSlimArtifacts({
    repoPath: input.repoPath,
    runId: input.runId,
    sliceId: input.sliceId,
  });

  const slicePath = path.join(
    path.resolve(input.repoPath),
    '.gitnexus',
    'gap-lab',
    'runs',
    input.runId,
    'slices',
    `${input.sliceId}.json`,
  );

  let rawSlice: string;
  try {
    rawSlice = await fs.readFile(slicePath, 'utf-8');
  } catch {
    return {
      enforced: false,
      blocked: false,
      userRawMatches: 0,
      processedUserMatches: 0,
      slicePath,
    };
  }

  const now = new Date().toISOString();
  const slice = JSON.parse(rawSlice) as GapLabSliceDoc;
  const userRawMatches = numberOrZero(slice.coverage_gate?.user_raw_matches);
  const processedUserMatches = numberOrZero(slice.coverage_gate?.processed_user_matches);
  const hasGateData = userRawMatches > 0 || processedUserMatches > 0 || slice.coverage_gate?.required === true;

  if (!hasGateData) {
    return {
      enforced: false,
      blocked: false,
      userRawMatches,
      processedUserMatches,
      slicePath,
    };
  }

  const blocked = processedUserMatches < userRawMatches;
  slice.coverage_gate = {
    ...slice.coverage_gate,
    required: true,
    user_raw_matches: userRawMatches,
    processed_user_matches: processedUserMatches,
    status: blocked ? 'blocked' : 'passed',
    reason: blocked ? 'coverage_incomplete' : undefined,
    checked_at: now,
  };

  if (blocked) {
    slice.status = 'blocked';
  }

  await fs.writeFile(slicePath, `${JSON.stringify(slice, null, 2)}\n`, 'utf-8');

  return {
    enforced: true,
    blocked,
    userRawMatches,
    processedUserMatches,
    reason: blocked ? 'coverage_incomplete' : undefined,
    slicePath,
  };
}
