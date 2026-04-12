import fs from 'node:fs/promises';
import path from 'node:path';
import type { RuleLabSourceGapHandoff } from './types.js';

interface GapCandidateAnchor {
  file?: string;
  line?: number;
  symbol?: string;
  symbol_id?: string;
}

export interface GapCandidateRow {
  candidate_id: string;
  gap_type?: string;
  gap_subtype?: string;
  pattern_id?: string;
  detector_version?: string;
  status?: string;
  lifecycle_stage?: string;
  reasonCode?: string;
  binding_kind?: string;
  source_anchor?: GapCandidateAnchor;
  target_anchor?: GapCandidateAnchor;
  raw_match?: string;
}

export interface GapHandoffData {
  source_gap_handoff: RuleLabSourceGapHandoff;
  accepted_candidates: GapCandidateRow[];
  confirmed_chain_steps: Array<{ hop_type?: string; anchor: string; snippet: string }>;
  default_binding_kinds: string[];
}

const PLACEHOLDER_RE = /<[^>]+>|placeholder|todo|tbd/i;

function isPlaceholderText(value: unknown): boolean {
  return PLACEHOLDER_RE.test(String(value || '').trim());
}

function toNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function parseJsonLines(raw: string): Array<Record<string, unknown>> {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function readAcceptedCandidateIds(gapSlice: Record<string, any>, candidateRows: GapCandidateRow[]): string[] {
  // Primary: read from selected_candidates in slice.json (legacy format)
  const rows = Array.isArray(gapSlice.selected_candidates) ? gapSlice.selected_candidates : [];
  const fromSlice = rows
    .filter((row) => String(row?.decision || '').toLowerCase() === 'accepted')
    .map((row) => String(row?.candidate_id || '').trim())
    .filter(Boolean);
  if (fromSlice.length > 0) return [...new Set(fromSlice)];

  // Fallback: derive from candidates.jsonl status=accepted (gap-lab run format)
  const fromCandidates = candidateRows
    .filter((row) => getRowStatus(row) === 'accepted')
    .map((row) => String(row.candidate_id || '').trim())
    .filter(Boolean);
  return [...new Set(fromCandidates)];
}

function readRejectBuckets(buckets: Record<string, any>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(buckets || {})) {
    if (key === 'accepted' || key === 'promotion_backlog') continue;
    out[key] = toNumber((value as { count?: number })?.count);
  }
  return out;
}

function getRowStatus(row: GapCandidateRow): string {
  return String(row.status || row.lifecycle_stage || '').trim().toLowerCase();
}

function summarizeCandidateRows(rows: GapCandidateRow[]): {
  promotion_backlog_count: number;
  reject_buckets: Record<string, number>;
} {
  let promotionBacklogCount = 0;
  const rejectBuckets: Record<string, number> = {};
  for (const row of rows) {
    const status = getRowStatus(row);
    if (!status || status === 'accepted') continue;
    if (status === 'promotion_backlog') {
      promotionBacklogCount += 1;
      continue;
    }
    const reasonCode = String(row.reasonCode || '').trim();
    const bucket = reasonCode || status;
    rejectBuckets[bucket] = (rejectBuckets[bucket] || 0) + 1;
  }
  return {
    promotion_backlog_count: promotionBacklogCount,
    reject_buckets: rejectBuckets,
  };
}

function selectAggregationMode(
  rows: Array<Record<string, unknown>>,
  sliceId: string,
): 'per_anchor_rules' | 'aggregate_single_rule' {
  for (const row of rows) {
    if (String(row.decision_type || '') !== 'rule_aggregation_mode') continue;
    if (String(row.slice_id || '') !== sliceId) continue;
    const mode = String(row.aggregation_mode || '');
    if (mode === 'aggregate_single_rule') return 'aggregate_single_rule';
    if (mode === 'per_anchor_rules') return 'per_anchor_rules';
  }
  return 'per_anchor_rules';
}

function isAcceptedRow(row: GapCandidateRow): boolean {
  return getRowStatus(row) === 'accepted';
}

function schemaError(candidateId: string, fieldPath: string): never {
  throw new Error(`gap-handoff schema error: candidate ${candidateId} missing ${fieldPath}`);
}

function acceptedAnchorError(candidateId: string, fieldPath: string): never {
  throw new Error(`gap-handoff schema error: accepted candidate ${candidateId} has empty ${fieldPath}`);
}

function assertRequiredString(candidateId: string, fieldPath: string, value: unknown): void {
  if (!String(value || '').trim()) {
    schemaError(candidateId, fieldPath);
  }
}

function assertAcceptedAnchorField(candidateId: string, fieldPath: string, value: unknown): void {
  const str = String(value || '').trim();
  if (!str || isPlaceholderText(str)) {
    acceptedAnchorError(candidateId, fieldPath);
  }
}

function assertCandidateSchema(rows: GapCandidateRow[]): void {
  rows.forEach((row) => {
    const candidateId = String(row.candidate_id || '').trim() || '<missing-candidate-id>';
    assertRequiredString(candidateId, 'gap_type', row.gap_type);
    assertRequiredString(candidateId, 'gap_subtype', row.gap_subtype);
    assertRequiredString(candidateId, 'pattern_id', row.pattern_id);
    assertRequiredString(candidateId, 'detector_version', row.detector_version);

    if (!isAcceptedRow(row)) return;

    assertAcceptedAnchorField(candidateId, 'source_anchor.file', row.source_anchor?.file);
    assertAcceptedAnchorField(candidateId, 'source_anchor.symbol', row.source_anchor?.symbol);
    assertAcceptedAnchorField(candidateId, 'target_anchor.file', row.target_anchor?.file);
    assertAcceptedAnchorField(candidateId, 'target_anchor.symbol', row.target_anchor?.symbol);
  });
}

function assertNoPlaceholders(runId: string, sliceId: string, rows: GapCandidateRow[]): void {
  if (isPlaceholderText(runId) || isPlaceholderText(sliceId)) {
    throw new Error('gap handoff rejected placeholder run/slice id');
  }
  rows.forEach((row) => {
    if (isPlaceholderText(row.candidate_id)) {
      throw new Error('gap handoff rejected placeholder candidate id');
    }
    if (isPlaceholderText(row.source_anchor?.file) || isPlaceholderText(row.target_anchor?.file)) {
      throw new Error('gap handoff rejected placeholder source/target anchor path');
    }
  });
}

export async function loadGapHandoff(input: {
  repoPath: string;
  runId: string;
  sliceId: string;
}): Promise<GapHandoffData | null> {
  const gapRunRoot = path.join(path.resolve(input.repoPath), '.gitnexus', 'gap-lab', 'runs', input.runId);
  const gapSlicePath = path.join(gapRunRoot, 'slices', `${input.sliceId}.json`);
  const gapCandidatesPath = path.join(gapRunRoot, 'slices', `${input.sliceId}.candidates.jsonl`);
  const decisionsPath = path.join(gapRunRoot, 'decisions.jsonl');

  let gapSliceRaw: string;
  let gapCandidatesRaw: string;
  let decisionsRaw: string;
  try {
    [gapSliceRaw, gapCandidatesRaw, decisionsRaw] = await Promise.all([
      fs.readFile(gapSlicePath, 'utf-8'),
      fs.readFile(gapCandidatesPath, 'utf-8'),
      fs.readFile(decisionsPath, 'utf-8'),
    ]);
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }

  const gapSlice = JSON.parse(gapSliceRaw) as Record<string, any>;

  const candidateRows = parseJsonLines(gapCandidatesRaw).map((row) => ({
    candidate_id: String(row.candidate_id || '').trim(),
    gap_type: typeof row.gap_type === 'string' ? row.gap_type : undefined,
    gap_subtype: typeof row.gap_subtype === 'string' ? row.gap_subtype : undefined,
    pattern_id: typeof row.pattern_id === 'string' ? row.pattern_id : undefined,
    detector_version: typeof row.detector_version === 'string' ? row.detector_version : undefined,
    status: typeof row.status === 'string' ? row.status : undefined,
    lifecycle_stage: typeof row.lifecycle_stage === 'string' ? row.lifecycle_stage : undefined,
    reasonCode: typeof row.reasonCode === 'string'
      ? row.reasonCode
      : typeof row.reason_code === 'string'
        ? String(row.reason_code)
        : undefined,
    binding_kind: typeof row.binding_kind === 'string'
      ? row.binding_kind
      : typeof (row.binding as Record<string, unknown> | undefined)?.kind === 'string'
        ? String((row.binding as Record<string, unknown>).kind)
        : undefined,
    source_anchor: typeof row.source_anchor === 'object' ? row.source_anchor as GapCandidateAnchor : undefined,
    target_anchor: typeof row.target_anchor === 'object' ? row.target_anchor as GapCandidateAnchor : undefined,
    raw_match: typeof row.raw_match === 'string' ? row.raw_match : undefined,
  }));

  const acceptedCandidateIds = readAcceptedCandidateIds(gapSlice, candidateRows);
  if (acceptedCandidateIds.length === 0) return null;

  assertNoPlaceholders(input.runId, input.sliceId, candidateRows);
  assertCandidateSchema(candidateRows);

  const acceptedRows = candidateRows.filter((row) =>
    acceptedCandidateIds.includes(String(row.candidate_id || '').trim()) && isAcceptedRow(row),
  );

  const decisionRows = parseJsonLines(decisionsRaw);
  const aggregationMode = selectAggregationMode(decisionRows, input.sliceId);
  const classificationBuckets = (gapSlice.classification_buckets || {}) as Record<string, any>;
  const rowSummary = summarizeCandidateRows(candidateRows);

  const handoff: RuleLabSourceGapHandoff = {
    run_id: input.runId,
    slice_id: input.sliceId,
    discovery_scope_mode: String(gapSlice.discovery_scope?.mode || 'full_user_code'),
    user_raw_matches: toNumber(gapSlice.coverage_gate?.user_raw_matches),
    processed_user_matches: toNumber(gapSlice.coverage_gate?.processed_user_matches),
    accepted_candidate_ids: acceptedCandidateIds,
    promotion_backlog_count: rowSummary.promotion_backlog_count > 0
      ? rowSummary.promotion_backlog_count
      : toNumber(classificationBuckets.promotion_backlog?.count),
    reject_buckets: Object.keys(rowSummary.reject_buckets).length > 0
      ? rowSummary.reject_buckets
      : readRejectBuckets(classificationBuckets),
    aggregation_mode: aggregationMode,
  };

  return {
    source_gap_handoff: handoff,
    accepted_candidates: acceptedRows,
    confirmed_chain_steps: Array.isArray(gapSlice.verification?.confirmed_chain?.steps)
      ? (gapSlice.verification.confirmed_chain.steps as Array<{ hop_type?: string; anchor: string; snippet: string }>)
      : [],
    default_binding_kinds: Array.isArray(gapSlice.default_binding_kinds)
      ? gapSlice.default_binding_kinds.map((value: unknown) => String(value))
      : [],
  };
}
