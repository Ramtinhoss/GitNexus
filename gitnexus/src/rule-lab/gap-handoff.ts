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
  status?: string;
  lifecycle_stage?: string;
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

function readAcceptedCandidateIds(gapSlice: Record<string, any>): string[] {
  const rows = Array.isArray(gapSlice.selected_candidates) ? gapSlice.selected_candidates : [];
  const accepted = rows
    .filter((row) => String(row?.decision || '').toLowerCase() === 'accepted')
    .map((row) => String(row?.candidate_id || '').trim())
    .filter(Boolean);
  return [...new Set(accepted)];
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
    rejectBuckets[status] = (rejectBuckets[status] || 0) + 1;
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
  const acceptedCandidateIds = readAcceptedCandidateIds(gapSlice);
  if (acceptedCandidateIds.length === 0) return null;

  const candidateRows = parseJsonLines(gapCandidatesRaw).map((row) => ({
    candidate_id: String(row.candidate_id || '').trim(),
    status: typeof row.status === 'string' ? row.status : undefined,
    lifecycle_stage: typeof row.lifecycle_stage === 'string' ? row.lifecycle_stage : undefined,
    binding_kind: typeof row.binding_kind === 'string'
      ? row.binding_kind
      : typeof (row.binding as Record<string, unknown> | undefined)?.kind === 'string'
        ? String((row.binding as Record<string, unknown>).kind)
        : undefined,
    source_anchor: typeof row.source_anchor === 'object' ? row.source_anchor as GapCandidateAnchor : undefined,
    target_anchor: typeof row.target_anchor === 'object' ? row.target_anchor as GapCandidateAnchor : undefined,
    raw_match: typeof row.raw_match === 'string' ? row.raw_match : undefined,
  }));
  const acceptedRows = candidateRows.filter((row) =>
    acceptedCandidateIds.includes(String(row.candidate_id || '').trim()) && isAcceptedRow(row),
  );
  assertNoPlaceholders(input.runId, input.sliceId, candidateRows);

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
