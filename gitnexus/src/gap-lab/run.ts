import fs from 'node:fs/promises';
import path from 'node:path';
import { auditCandidateRows } from './candidate-audit.js';
import { enforceCoverageGate } from './coverage-gate.js';
import { buildRuleArtifactCoverageCheck } from './rule-coverage-lookup.js';
import { resolveLexicalCandidates, type ResolvedCandidate } from './candidate-resolver.js';
import { scanLexicalUniverse } from './exhaustive-scanner.js';
import { verifyMissingEdges, type VerifiedCandidate } from './missing-edge-verifier.js';
import type { ExhaustiveGapSubtype } from './pattern-library.js';
import { ensureBalancedSlimArtifacts, getGapLabSliceArtifactPaths } from './slim-artifacts.js';

export const GAP_LAB_DETECTOR_VERSION = '1.0.0';

export const GAP_SUBTYPE_TO_TYPE: Record<ExhaustiveGapSubtype, 'event_delegate_gap'> = {
  mirror_synclist_callback: 'event_delegate_gap',
  mirror_syncdictionary_callback: 'event_delegate_gap',
  mirror_syncvar_hook: 'event_delegate_gap',
};

export interface RunGapLabSliceInput {
  repoPath: string;
  runId: string;
  sliceId: string;
  gapSubtype: ExhaustiveGapSubtype;
  scopePath?: string;
  timeoutMs?: number;
}

export interface PersistedGapLabAnchor {
  file?: string;
  line?: number;
  symbol?: string;
  symbol_id?: string;
}

export interface PersistedGapLabCandidateRow {
  candidate_id: string;
  gap_type: string;
  gap_subtype: ExhaustiveGapSubtype;
  pattern_id: string;
  detector_version: string;
  file: string;
  line: number;
  scopeClass: ResolvedCandidate['scopeClass'];
  status: VerifiedCandidate['status'];
  reasonCode?: VerifiedCandidate['reasonCode'];
  source_anchor?: PersistedGapLabAnchor;
  target_anchor?: PersistedGapLabAnchor;
}

export interface RunGapLabSliceResult {
  outcome: 'passed' | 'coverage_blocked';
  rowsWritten: number;
  rows: PersistedGapLabCandidateRow[];
  paths: ReturnType<typeof getGapLabSliceArtifactPaths>;
}

export interface RunGapLabSliceDeps {
  scanLexicalUniverse?: typeof scanLexicalUniverse;
  resolveLexicalCandidates?: typeof resolveLexicalCandidates;
  buildRuleArtifactCoverageCheck?: typeof buildRuleArtifactCoverageCheck;
  verifyMissingEdges?: typeof verifyMissingEdges;
  enforceCoverageGate?: typeof enforceCoverageGate;
}

function mapAnchor(anchor?: ResolvedCandidate['sourceAnchor']): PersistedGapLabAnchor | undefined {
  if (!anchor) return undefined;
  return {
    file: anchor.file,
    line: anchor.line,
    symbol: anchor.symbol,
    symbol_id: anchor.symbolId,
  };
}

function toPersistedRow(candidate: VerifiedCandidate): PersistedGapLabCandidateRow {
  return {
    candidate_id: candidate.candidateId,
    gap_type: GAP_SUBTYPE_TO_TYPE[candidate.gapSubtype],
    gap_subtype: candidate.gapSubtype,
    pattern_id: candidate.patternId,
    detector_version: GAP_LAB_DETECTOR_VERSION,
    file: candidate.file,
    line: candidate.line,
    scopeClass: candidate.scopeClass,
    status: candidate.status,
    reasonCode: candidate.reasonCode,
    source_anchor: mapAnchor(candidate.sourceAnchor),
    target_anchor: mapAnchor(candidate.targetAnchor),
  };
}

function summarizeBuckets(rows: PersistedGapLabCandidateRow[]): Record<string, { count: number }> {
  const buckets: Record<string, { count: number }> = {};
  for (const row of rows) {
    const key = row.status === 'accepted' || row.status === 'promotion_backlog'
      ? row.status
      : row.reasonCode || row.status;
    buckets[key] = { count: (buckets[key]?.count || 0) + 1 };
  }
  return buckets;
}

function buildCoverageGateSummary(rows: PersistedGapLabCandidateRow[]) {
  const audit = auditCandidateRows({
    discoveryScopeMode: 'full_user_code',
    rows,
  });
  const userRawMatches = audit.userRawRows.length;
  const processedUserMatches = audit.processedUserRows.length;
  const blocked = audit.blocked || processedUserMatches < userRawMatches;
  return {
    required: rows.length > 0,
    user_raw_matches: userRawMatches,
    processed_user_matches: processedUserMatches,
    status: blocked ? 'blocked' : 'passed',
    reason: audit.blocked
      ? 'candidate_audit_drift'
      : blocked
        ? 'coverage_incomplete'
        : undefined,
  };
}

function buildSliceDoc(input: RunGapLabSliceInput, rows: PersistedGapLabCandidateRow[]) {
  const coverageGate = buildCoverageGateSummary(rows);
  return {
    run_id: input.runId,
    slice_id: input.sliceId,
    gap_type: GAP_SUBTYPE_TO_TYPE[input.gapSubtype],
    gap_subtype: input.gapSubtype,
    discovery_scope: { mode: 'full_user_code' },
    status: coverageGate.status === 'blocked' ? 'blocked' : 'passed',
    updated_at: new Date().toISOString(),
    classification_buckets: summarizeBuckets(rows),
    coverage_gate: coverageGate,
  };
}

export function isExhaustiveGapSubtype(value: string): value is ExhaustiveGapSubtype {
  return value in GAP_SUBTYPE_TO_TYPE;
}

export async function runGapLabSlice(
  input: RunGapLabSliceInput,
  deps: RunGapLabSliceDeps = {},
): Promise<RunGapLabSliceResult> {
  const repoPath = path.resolve(input.repoPath);
  const scanLexicalUniverseImpl = deps.scanLexicalUniverse ?? scanLexicalUniverse;
  const resolveLexicalCandidatesImpl = deps.resolveLexicalCandidates ?? resolveLexicalCandidates;
  const buildRuleArtifactCoverageCheckImpl = deps.buildRuleArtifactCoverageCheck ?? buildRuleArtifactCoverageCheck;
  const verifyMissingEdgesImpl = deps.verifyMissingEdges ?? verifyMissingEdges;
  const enforceCoverageGateImpl = deps.enforceCoverageGate ?? enforceCoverageGate;

  await ensureBalancedSlimArtifacts({
    repoPath,
    runId: input.runId,
    sliceId: input.sliceId,
  });
  const paths = getGapLabSliceArtifactPaths({
    repoPath,
    runId: input.runId,
    sliceId: input.sliceId,
  });

  const scan = await scanLexicalUniverseImpl({
    repoPath,
    gapSubtype: input.gapSubtype,
    scopePath: input.scopePath,
    timeoutMs: input.timeoutMs,
  });
  const resolved = await resolveLexicalCandidatesImpl({
    repoPath,
    matches: scan.matches,
  });
  const coverageCheck = await buildRuleArtifactCoverageCheckImpl(repoPath);
  const verified = await verifyMissingEdgesImpl({
    candidates: resolved,
    coverageCheck,
  });
  const rows = verified.map(toPersistedRow);

  const serializedRows = rows.map((row) => JSON.stringify(row)).join('\n');
  await fs.writeFile(paths.candidatesPath, serializedRows ? `${serializedRows}\n` : '', 'utf-8');
  await fs.writeFile(paths.slicePath, `${JSON.stringify(buildSliceDoc(input, rows), null, 2)}\n`, 'utf-8');
  const coverageGate = await enforceCoverageGateImpl({
    repoPath,
    runId: input.runId,
    sliceId: input.sliceId,
  });

  return {
    outcome: coverageGate.enforced && coverageGate.blocked ? 'coverage_blocked' : 'passed',
    rowsWritten: rows.length,
    rows,
    paths,
  };
}
