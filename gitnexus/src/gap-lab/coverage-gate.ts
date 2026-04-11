import fs from 'node:fs/promises';
import type { CandidateAuditResult, CandidateAuditRow, DiscoveryScopeMode } from './candidate-audit.js';
import { auditCandidateRows } from './candidate-audit.js';
import { ensureBalancedSlimArtifacts, getGapLabSliceArtifactPaths } from './slim-artifacts.js';

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
  reason?: 'coverage_incomplete' | 'candidate_audit_drift';
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
  discovery_scope?: { mode?: string } | string;
  [key: string]: unknown;
}

function numberOrZero(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseCandidateRows(raw: string): CandidateAuditRow[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CandidateAuditRow);
}

function resolveDiscoveryScopeMode(slice: GapLabSliceDoc): DiscoveryScopeMode {
  const mode = typeof slice.discovery_scope === 'string'
    ? slice.discovery_scope
    : slice.discovery_scope?.mode;

  if (mode === 'path_prefix_override' || mode === 'module_override' || mode === 'full_user_code') {
    return mode;
  }

  return 'full_user_code';
}

export async function enforceCoverageGate(input: CoverageGateInput): Promise<CoverageGateResult> {
  await ensureBalancedSlimArtifacts({
    repoPath: input.repoPath,
    runId: input.runId,
    sliceId: input.sliceId,
  });

  const { slicePath, candidatesPath } = getGapLabSliceArtifactPaths(input);

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
  const summaryUserRawMatches = numberOrZero(slice.coverage_gate?.user_raw_matches);
  const summaryProcessedUserMatches = numberOrZero(slice.coverage_gate?.processed_user_matches);

  let rawCandidates = '';
  try {
    rawCandidates = await fs.readFile(candidatesPath, 'utf-8');
  } catch {
    rawCandidates = '';
  }

  const candidateRows = parseCandidateRows(rawCandidates);
  const hasCandidateRows = candidateRows.length > 0;
  const candidateAudit = hasCandidateRows
    ? auditCandidateRows({
        discoveryScopeMode: resolveDiscoveryScopeMode(slice),
        rows: candidateRows,
      })
    : undefined;

  const userRawMatches = candidateAudit ? candidateAudit.userRawRows.length : summaryUserRawMatches;
  const processedUserMatches = candidateAudit ? candidateAudit.processedUserRows.length : summaryProcessedUserMatches;
  const hasGateData =
    hasCandidateRows ||
    summaryUserRawMatches > 0 ||
    summaryProcessedUserMatches > 0 ||
    slice.coverage_gate?.required === true;

  if (!hasGateData) {
    return {
      enforced: false,
      blocked: false,
      userRawMatches,
      processedUserMatches,
      slicePath,
      candidateAudit,
    };
  }

  const summaryMismatch = hasCandidateRows && (
    summaryUserRawMatches !== userRawMatches ||
    summaryProcessedUserMatches !== processedUserMatches
  );
  const countShortfall = processedUserMatches < userRawMatches;
  const blocked = Boolean(candidateAudit?.blocked) || summaryMismatch || countShortfall;
  const reason = candidateAudit?.blocked || summaryMismatch
    ? 'candidate_audit_drift'
    : blocked
      ? 'coverage_incomplete'
      : undefined;

  slice.coverage_gate = {
    ...slice.coverage_gate,
    required: true,
    user_raw_matches: userRawMatches,
    processed_user_matches: processedUserMatches,
    status: blocked ? 'blocked' : 'passed',
    reason,
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
    reason,
    slicePath,
    candidateAudit,
  };
}
