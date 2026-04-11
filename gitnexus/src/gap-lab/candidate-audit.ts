export type DiscoveryScopeMode = 'full_user_code' | 'path_prefix_override' | 'module_override';

export interface CandidateAuditRow {
  scopeClass?: string;
  status?: string;
  reasonCode?: string;
}

export interface CandidateAuditInput {
  discoveryScopeMode: DiscoveryScopeMode;
  rows: CandidateAuditRow[];
}

export interface CandidateAuditResult {
  blocked: boolean;
  blockedReason?: 'invalid_default_scope_reason';
  invalidRows: CandidateAuditRow[];
  eligibleRows: CandidateAuditRow[];
  userRawRows: CandidateAuditRow[];
  processedUserRows: CandidateAuditRow[];
}

const DISALLOWED_DEFAULT_SCOPE_REASONS = new Set([
  'out_of_focus_scope',
  'deferred_non_clue_module',
  'community_mismatch',
  'not_example_chain',
]);

const ELIGIBLE_STATUSES = new Set(['verified_missing', 'accepted', 'eligible', 'promotion_backlog']);
const NON_FINAL_STATUSES = new Set(['raw_match', 'resolved']);

export function auditCandidateRows(input: CandidateAuditInput): CandidateAuditResult {
  const userRawRows = input.rows.filter((row) => row.scopeClass === 'user_code');
  const eligibleRows = input.rows.filter((row) => ELIGIBLE_STATUSES.has(row.status ?? ''));

  if (input.discoveryScopeMode !== 'full_user_code') {
    return {
      blocked: false,
      invalidRows: [],
      eligibleRows,
      userRawRows,
      processedUserRows: userRawRows.filter((row) => !NON_FINAL_STATUSES.has(row.status ?? '')),
    };
  }

  const invalidRows = input.rows.filter(
    (row) =>
      row.scopeClass === 'user_code' &&
      row.status === 'rejected' &&
      !!row.reasonCode &&
      DISALLOWED_DEFAULT_SCOPE_REASONS.has(row.reasonCode),
  );
  const invalidRowSet = new Set(invalidRows);
  const processedUserRows = userRawRows.filter(
    (row) => !NON_FINAL_STATUSES.has(row.status ?? '') && !invalidRowSet.has(row),
  );

  return {
    blocked: invalidRows.length > 0,
    blockedReason: invalidRows.length > 0 ? 'invalid_default_scope_reason' : undefined,
    invalidRows,
    eligibleRows,
    userRawRows,
    processedUserRows,
  };
}
