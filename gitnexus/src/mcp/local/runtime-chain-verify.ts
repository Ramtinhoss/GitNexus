import type { RuntimeChainEvidenceLevel } from './runtime-chain-evidence.js';
import { buildRuntimeClaimFromRule, type RuntimeClaim } from './runtime-claim.js';
import { extractRuntimeGraphCandidates } from './runtime-chain-graph-candidates.js';
import { RuleRegistryLoadError, loadRuleRegistry, type RuntimeClaimRule } from './runtime-claim-rule-registry.js';

export type RuntimeChainVerifyMode = 'off' | 'on-demand';
export type RuntimeChainStatus = 'pending' | 'verified_partial' | 'verified_full' | 'failed';
export type RuntimeChainHopType = 'resource' | 'guid_map' | 'code_loader' | 'code_runtime';

export interface RuntimeChainHop {
  hop_type: RuntimeChainHopType;
  anchor: string;
  confidence: 'low' | 'medium' | 'high';
  note: string;
  snippet?: string;
}

export interface RuntimeChainGap {
  segment: 'resource' | 'guid_map' | 'loader' | 'runtime';
  reason: string;
  next_command: string;
  why_not_next?: string;
}

export interface RuntimeChainResult {
  status: RuntimeChainStatus;
  evidence_level: RuntimeChainEvidenceLevel;
  evidence_source?: 'analyze_time' | 'query_time';
  hops: RuntimeChainHop[];
  gaps: RuntimeChainGap[];
  why_not_next?: string[];
}

interface QueryExecutor {
  (query: string, params?: Record<string, unknown>): Promise<any[]>;
}

interface VerifyRuntimeChainInput {
  repoPath: string;
  executeParameterized: QueryExecutor;
  queryText?: string;
  resourceSeedPath?: string;
  mappedSeedTargets?: string[];
  symbolName?: string;
  symbolFilePath?: string;
  resourceBindings?: Array<{ resourcePath?: string }>;
  requiredHops?: string[];
  rule?: RuntimeClaimRule;
}
interface VerifyRuntimeClaimInput extends VerifyRuntimeChainInput {
  rulesRoot?: string;
  minimumEvidenceSatisfied?: boolean;
}

function hasStructuredVerifierAnchors(input: VerifyRuntimeChainInput): boolean {
  const hasValue = (value: unknown): boolean => String(value || '').trim().length > 0;
  if (hasValue(input.resourceSeedPath)) return true;
  if (hasValue(input.symbolName)) return true;
  if (hasValue(input.symbolFilePath)) return true;
  if (Array.isArray(input.mappedSeedTargets) && input.mappedSeedTargets.some((value) => hasValue(value))) return true;
  if (
    Array.isArray(input.resourceBindings)
    && input.resourceBindings.some((binding) => hasValue(binding?.resourcePath))
  ) return true;
  return false;
}

function toGraphOnlyRuntimeChainResult(input: {
  queryText?: string;
  candidates: Awaited<ReturnType<typeof extractRuntimeGraphCandidates>>;
}): RuntimeChainResult {
  if (input.candidates.length === 0) {
    return {
      status: 'failed',
      evidence_level: 'none',
      evidence_source: 'query_time',
      hops: [],
      gaps: [
        {
          segment: 'runtime',
          reason: 'no graph candidates found for structured anchors',
          next_command: buildDefaultVerifyNextCommand(input.queryText),
        },
      ],
    };
  }

  const hops: RuntimeChainHop[] = input.candidates.slice(0, 20).map((candidate) => ({
    hop_type: 'code_runtime',
    anchor: `${candidate.sourceFilePath || candidate.sourceName}:${candidate.sourceStartLine || 1}->${candidate.targetFilePath || candidate.targetName}:${candidate.targetStartLine || 1}`,
    confidence: String(candidate.reason || '').startsWith('unity-rule-') ? 'high' : 'medium',
    note: String(candidate.reason || '').startsWith('unity-rule-')
      ? `Synthetic edge observed in graph (${candidate.reason}).`
      : 'Graph CALLS neighborhood candidate from structured anchors.',
    snippet: `${candidate.sourceName} -> ${candidate.targetName}`,
  }));

  return {
    status: 'verified_partial',
    evidence_level: 'verified_segment',
    evidence_source: 'query_time',
    hops,
    gaps: [],
  };
}

function buildDefaultVerifyNextCommand(queryText?: string): string {
  const normalizedQuery = String(queryText || '').trim() || 'Reload NEON.Game.Graph.Nodes.Reloads';
  const escapedQuery = normalizedQuery
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
  return `node gitnexus/dist/cli/index.js query --unity-resources on --unity-hydration parity --runtime-chain-verify on-demand "${escapedQuery}"`;
}

function buildRuntimeMatchHaystack(input: VerifyRuntimeChainInput): string {
  return [
    input.queryText,
    input.resourceSeedPath,
    input.symbolName,
    input.symbolFilePath,
    ...(input.mappedSeedTargets || []),
    ...(input.resourceBindings || []).map((binding) => binding.resourcePath),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function parseTriggerTokens(triggerFamily: string): string[] {
  return String(triggerFamily || '')
    .toLowerCase()
    .split(/[\s,|/]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

async function verifyRuleDrivenRuntimeChain(input: VerifyRuntimeChainInput): Promise<RuntimeChainResult> {
  const ruleId = input.rule?.id;
  if (!ruleId) {
    return { status: 'failed', evidence_level: 'none', evidence_source: 'analyze_time', hops: [], gaps: [] };
  }
  try {
    const rows = await input.executeParameterized(`
      MATCH (s)-[r:CodeRelation {type: 'CALLS'}]->(t)
      WHERE r.reason CONTAINS $ruleId
        AND r.reason STARTS WITH 'unity-rule-'
      RETURN s.name AS sourceName, s.filePath AS sourceFilePath, s.startLine AS sourceStartLine,
             t.name AS targetName, t.filePath AS targetFilePath, t.startLine AS targetStartLine,
             r.reason AS reason
      LIMIT 20
    `, { ruleId });
    if (rows.length > 0) {
      const hops: RuntimeChainHop[] = rows.map((row) => ({
        hop_type: 'code_runtime' as RuntimeChainHopType,
        anchor: `${row.sourceFilePath}:${row.sourceStartLine || 1}->${row.targetFilePath}:${row.targetStartLine || 1}`,
        confidence: 'high' as const,
        note: `Synthetic edge injected at analyze time (${row.reason}).`,
        snippet: `${row.sourceName} -> ${row.targetName}`,
      }));
      return {
        status: 'verified_full',
        evidence_level: 'verified_chain',
        evidence_source: 'analyze_time',
        hops,
        gaps: [],
      };
    }
  } catch {
    // Graph query failed; fall through to no match.
  }
  return {
    status: 'failed',
    evidence_level: 'none',
    evidence_source: 'analyze_time',
    hops: [],
    gaps: [],
  };
}

export async function verifyRuntimeChainOnDemand(
  input: VerifyRuntimeChainInput,
): Promise<RuntimeChainResult | undefined> {
  if (!input.rule) {
    if (!hasStructuredVerifierAnchors(input) || !String(input.symbolName || '').trim()) return undefined;
    const candidates = await extractRuntimeGraphCandidates({
      executeParameterized: input.executeParameterized,
      symbolName: input.symbolName,
      symbolFilePath: input.symbolFilePath,
    });
    return toGraphOnlyRuntimeChainResult({
      queryText: input.queryText,
      candidates,
    });
  }
  return await verifyRuleDrivenRuntimeChain(input);
}
function buildFailureRuntimeClaim(input: {
  reason: RuntimeClaim['reason'];
  next_action: string;
  rule?: RuntimeClaimRule;
}): RuntimeClaim {
  return {
    rule_id: input.rule?.id || 'none',
    rule_version: input.rule?.version || '0.0.0',
    scope: {
      resource_types: input.rule?.resource_types || [],
      host_base_type: input.rule?.host_base_type || [],
      trigger_family: input.rule?.trigger_family || 'none',
    },
    status: 'failed',
    evidence_level: 'none',
    guarantees: [],
    non_guarantees: input.rule?.non_guarantees?.length
      ? [...input.rule.non_guarantees]
      : ['runtime_chain_verification_not_executed'],
    hops: [],
    gaps: [],
    reason: input.reason,
    next_action: input.next_action,
  };
}

function scoreRuntimeClaimRule(
  rule: RuntimeClaimRule,
  input: VerifyRuntimeClaimInput,
): number {
  const haystack = buildRuntimeMatchHaystack(input);
  const tokens = Array.isArray(rule.match?.trigger_tokens) && rule.match!.trigger_tokens.length > 0
    ? rule.match!.trigger_tokens
    : parseTriggerTokens(rule.trigger_family);
  if (tokens.length === 0) return Number.NEGATIVE_INFINITY;

  let score = 0;
  let matchedTrigger = false;
  for (const token of tokens) {
    const normalized = String(token || '').trim().toLowerCase();
    if (!normalized) continue;
    if (haystack.includes(normalized)) {
      matchedTrigger = true;
      score += 10 + normalized.length;
    }
  }
  if (!matchedTrigger) return Number.NEGATIVE_INFINITY;

  const boostLists = [
    ...(Array.isArray(rule.match?.host_base_type) ? [rule.match!.host_base_type!] : []),
    ...(Array.isArray(rule.host_base_type) ? [rule.host_base_type] : []),
  ];
  for (const list of boostLists) {
    for (const token of list) {
      const normalized = String(token || '').trim().toLowerCase();
      if (normalized && haystack.includes(normalized)) score += 20 + normalized.length;
    }
  }

  const resourceLists = [
    ...(Array.isArray(rule.match?.resource_types) ? [rule.match!.resource_types!] : []),
    ...(Array.isArray(rule.resource_types) ? [rule.resource_types] : []),
  ];
  for (const list of resourceLists) {
    for (const token of list) {
      const normalized = String(token || '').trim().toLowerCase();
      if (normalized && haystack.includes(normalized)) score += 4 + normalized.length;
    }
  }

  for (const token of rule.match?.module_scope || []) {
    const normalized = String(token || '').trim().toLowerCase();
    if (normalized && haystack.includes(normalized)) score += 8 + normalized.length;
  }

  return score;
}
export async function verifyRuntimeClaimOnDemand(
  input: VerifyRuntimeClaimInput,
): Promise<RuntimeClaim> {
  const fallbackNextAction = buildDefaultVerifyNextCommand(input.queryText);
  if (!hasStructuredVerifierAnchors(input)) {
    return buildFailureRuntimeClaim({
      reason: 'rule_not_matched',
      next_action: fallbackNextAction,
    });
  }

  let registry;
  try {
    registry = await loadRuleRegistry(input.repoPath, input.rulesRoot);
  } catch (error) {
    if (error instanceof RuleRegistryLoadError) {
      if (error.code === 'rule_catalog_missing' || error.code === 'rule_file_missing') {
        return buildFailureRuntimeClaim({
          reason: 'rule_not_matched',
          next_action: buildDefaultVerifyNextCommand(input.queryText),
        });
      }
    }
    throw error;
  }
  const activeRules = registry.activeRules || [];

  if (activeRules.length === 0) {
    return buildFailureRuntimeClaim({
      reason: 'rule_not_matched',
      next_action: fallbackNextAction,
    });
  }

  const matchedRule = [...activeRules]
    .map((rule) => ({ rule, score: scoreRuntimeClaimRule(rule, input) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => (b.score - a.score) || a.rule.id.localeCompare(b.rule.id))[0]?.rule;
  if (!matchedRule) {
    return buildFailureRuntimeClaim({
      reason: 'rule_not_matched',
      next_action: fallbackNextAction,
    });
  }

  const runtimeChain = await verifyRuntimeChainOnDemand({
    ...input,
    requiredHops: matchedRule.required_hops,
    rule: matchedRule,
  });
  if (!runtimeChain) {
    return buildFailureRuntimeClaim({
      reason: 'rule_matched_but_evidence_missing',
      next_action: matchedRule.next_action || buildDefaultVerifyNextCommand(input.queryText),
      rule: matchedRule,
    });
  }

  const normalizedStatus: RuntimeClaim['status'] = (
    runtimeChain.status === 'pending' ? 'failed' : runtimeChain.status
  );
  const verificationFailed = normalizedStatus === 'failed'
    || (runtimeChain.evidence_level === 'none' && normalizedStatus !== 'verified_full');
  const resolved: RuntimeClaim = buildRuntimeClaimFromRule({
    rule: matchedRule,
    status: verificationFailed ? 'failed' : normalizedStatus,
    evidence_level: runtimeChain.evidence_level,
    hops: runtimeChain.hops,
    gaps: runtimeChain.gaps,
    ...(verificationFailed
      ? {
        reason: 'rule_matched_but_verification_failed' as const,
        next_action: matchedRule.next_action || buildDefaultVerifyNextCommand(input.queryText),
      }
      : {}),
  });

  const chainClosed = resolved.status === 'verified_full'
    && resolved.evidence_level === 'verified_chain'
    && resolved.gaps.length === 0;
  if (input.minimumEvidenceSatisfied === false && !chainClosed) {
    return {
      ...resolved,
      status: 'failed',
      evidence_level: 'clue',
      guarantees: [],
      non_guarantees: [...resolved.non_guarantees, 'minimum_evidence_contract_not_satisfied'],
      reason: 'rule_matched_but_evidence_missing',
      next_action: matchedRule.next_action || buildDefaultVerifyNextCommand(input.queryText),
    };
  }

  return resolved;
}
