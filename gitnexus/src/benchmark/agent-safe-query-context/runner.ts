import path from 'node:path';
import { estimateTokens } from '../u2-e2e/metrics.js';
import type { AgentContextToolRunner } from '../agent-context/tool-runner.js';
import { createAgentContextToolRunner } from '../agent-context/tool-runner.js';
import { deriveSemanticTuple, semanticTuplePass } from './semantic-tuple.js';
import type { AgentSafeBenchmarkCase, SemanticDriftMetrics, SemanticTuple } from './types.js';

const PLACEHOLDER_FOLLOW_UP = 'Reload NEON.Game.Graph.Nodes.Reloads';

export interface WorkflowReplayStep {
  tool: 'query' | 'context' | 'cypher';
  input: Record<string, unknown>;
  output: unknown;
  durationMs: number;
  totalTokensEst: number;
}

export interface WorkflowReplayResult extends SemanticDriftMetrics {
  steps: WorkflowReplayStep[];
  base: {
    primary_candidate: string;
    recommended_follow_up: string;
  };
  guid_variant: {
    primary_candidate: string;
    recommended_follow_up: string;
  };
  confirmed_chain: {
    steps: string[];
  };
  semantic_tuple: SemanticTuple;
  semantic_tuple_pass: boolean;
  tool_calls_to_completion: number;
  tokens_to_completion: number;
  retry_breakdown: {
    query_retry_count: number;
    context_retry_count: number;
    cypher_retry_count: number;
  };
  stop_reason: 'semantic_tuple_satisfied' | 'max_steps_reached';
}

export type WorkflowReplayResponseProfile = 'full' | 'slim';

export async function runWorkflowReplay(
  benchmarkCase: AgentSafeBenchmarkCase,
  runner: Pick<AgentContextToolRunner, 'query' | 'context' | 'cypher'>,
  options: { repo?: string; maxSteps?: number; responseProfile?: WorkflowReplayResponseProfile } = {},
): Promise<WorkflowReplayResult> {
  const maxSteps = options.maxSteps ?? 5;
  const steps: WorkflowReplayStep[] = [];

  await pushStep(
    steps,
    'query',
    withReplayInput(
      benchmarkCase.start_query_input || { query: benchmarkCase.start_query },
      options.repo,
      options.responseProfile,
      'query',
    ),
    runner.query,
  );

  let semanticTuple = deriveSemanticTuple(
    benchmarkCase.semantic_tuple,
    steps.map((step) => step.output),
  );
  let passed = semanticTuplePass(semanticTuple, benchmarkCase.semantic_tuple);

  if (!passed && steps.length < maxSteps && shouldRetryQuery(semanticTuple)) {
    await pushStep(
      steps,
      'query',
      withReplayInput(
        benchmarkCase.retry_query_input || { query: benchmarkCase.retry_query },
        options.repo,
        options.responseProfile,
        'query',
      ),
      runner.query,
    );
    semanticTuple = deriveSemanticTuple(
      benchmarkCase.semantic_tuple,
      steps.map((step) => step.output),
    );
    passed = semanticTuplePass(semanticTuple, benchmarkCase.semantic_tuple);
  }

  for (const contextName of benchmarkCase.proof_contexts) {
    if (passed || steps.length >= maxSteps) {
      break;
    }
    await pushStep(
      steps,
      'context',
      withReplayInput({ name: contextName }, options.repo, options.responseProfile, 'context'),
      runner.context,
    );
    semanticTuple = deriveSemanticTuple(
      benchmarkCase.semantic_tuple,
      steps.map((step) => step.output),
    );
    passed = semanticTuplePass(semanticTuple, benchmarkCase.semantic_tuple);
  }

  if (!passed && steps.length < maxSteps) {
    await pushStep(
      steps,
      'cypher',
      withReplayInput({ query: benchmarkCase.proof_cypher }, options.repo, options.responseProfile, 'cypher'),
      runner.cypher,
    );
    semanticTuple = deriveSemanticTuple(
      benchmarkCase.semantic_tuple,
      steps.map((step) => step.output),
    );
    passed = semanticTuplePass(semanticTuple, benchmarkCase.semantic_tuple);
  }

  const guidInvariance = computeGuidInvariance(benchmarkCase, steps);
  const driftMetrics = computeSemanticDriftMetrics(benchmarkCase, steps);
  const confirmedChainSteps = deriveConfirmedChainSteps({
    steps,
    semanticTuple,
    placeholderLeakDetected: driftMetrics.placeholder_leak_detected,
  });
  const liveToolEvidencePass = countLiveToolEvidence(steps) > 0;
  const freezeReady = confirmedChainSteps.length > 0
    && !driftMetrics.placeholder_leak_detected
    && liveToolEvidencePass
    && guidInvariance.guid_invariance_pass;

  return {
    steps,
    ...driftMetrics,
    base: guidInvariance.base,
    guid_variant: guidInvariance.guid_variant,
    guid_invariance_pass: guidInvariance.guid_invariance_pass,
    confirmed_chain: { steps: confirmedChainSteps },
    live_tool_evidence_pass: liveToolEvidencePass,
    freeze_ready: freezeReady,
    semantic_tuple: semanticTuple,
    semantic_tuple_pass: passed,
    tool_calls_to_completion: steps.length,
    tokens_to_completion: steps.reduce((sum, step) => sum + step.totalTokensEst, 0),
    retry_breakdown: {
      query_retry_count: Math.max(0, steps.filter((step) => step.tool === 'query').length - 1),
      context_retry_count: Math.max(0, steps.filter((step) => step.tool === 'context').length - 1),
      cypher_retry_count: Math.max(0, steps.filter((step) => step.tool === 'cypher').length - 1),
    },
    stop_reason: passed ? 'semantic_tuple_satisfied' : 'max_steps_reached',
  };
}

export async function runWorkflowReplayWithDefaultRunner(
  benchmarkCase: AgentSafeBenchmarkCase,
  options: { repo?: string; maxSteps?: number; responseProfile?: WorkflowReplayResponseProfile } = {},
): Promise<WorkflowReplayResult> {
  const runner = await createAgentContextToolRunner();
  try {
    return await runWorkflowReplay(benchmarkCase, runner, options);
  } finally {
    await runner.close();
  }
}

async function pushStep(
  steps: WorkflowReplayStep[],
  tool: WorkflowReplayStep['tool'],
  input: Record<string, unknown>,
  executor: (input: Record<string, unknown>) => Promise<unknown>,
): Promise<void> {
  const started = performance.now();
  const output = await executor(input);
  const durationMs = Number((performance.now() - started).toFixed(1));
  const totalTokensEst = estimateTokens(JSON.stringify(input)) + estimateTokens(JSON.stringify(output));
  steps.push({
    tool,
    input,
    output,
    durationMs,
    totalTokensEst,
  });
}

function shouldRetryQuery(tuple: SemanticTuple): boolean {
  return !tuple.resource_anchor || !tuple.symbol_anchor;
}

function withReplayInput(
  input: Record<string, unknown>,
  repo: string | undefined,
  responseProfile: WorkflowReplayResponseProfile | undefined,
  tool: WorkflowReplayStep['tool'],
): Record<string, unknown> {
  const withRepo = repo ? { ...input, repo } : { ...input };
  if (!responseProfile) {
    return withRepo;
  }
  if (tool === 'query' || tool === 'context') {
    return { ...withRepo, response_profile: responseProfile };
  }
  return withRepo;
}

function computeSemanticDriftMetrics(
  benchmarkCase: AgentSafeBenchmarkCase,
  steps: WorkflowReplayStep[],
): SemanticDriftMetrics {
  const firstOutput = steps[0]?.output as Record<string, unknown> | undefined;
  const postNarrowingOutput = pickPostNarrowingQueryOutput(benchmarkCase, steps);
  const primaryCandidate = extractPrimaryCandidate(firstOutput);
  const recommendedFollowUp = extractRecommendedFollowUp(firstOutput);
  const postNarrowingPrimaryCandidate = extractPrimaryCandidate(postNarrowingOutput);
  const postNarrowingRecommendedFollowUp = extractRecommendedFollowUp(postNarrowingOutput);
  const placeholderLeakDetected = detectPlaceholderLeak({
    benchmarkCase,
    firstOutput,
    postNarrowingOutput,
  });
  const heuristicTopSummaryDetected = detectHeuristicTopSummary({
    benchmarkCase,
    output: firstOutput,
  });
  const tierEnvelope = readTierEnvelopeMetrics(firstOutput);

  return {
    anchor_top1_pass: stringsEqual(primaryCandidate, benchmarkCase.semantic_tuple.symbol_anchor),
    recommended_follow_up_hit: recommendedFollowUp
      ? matchesResourceAnchor(recommendedFollowUp, benchmarkCase.semantic_tuple.resource_anchor)
      : extractResourceTargets(firstOutput).some((target) => matchesResourceAnchor(target, benchmarkCase.semantic_tuple.resource_anchor)),
    post_narrowing_anchor_pass: stringsEqual(postNarrowingPrimaryCandidate, benchmarkCase.semantic_tuple.symbol_anchor),
    post_narrowing_follow_up_hit: postNarrowingRecommendedFollowUp
      ? matchesResourceAnchor(postNarrowingRecommendedFollowUp, benchmarkCase.semantic_tuple.resource_anchor)
      : extractResourceTargets(postNarrowingOutput).some((target) => matchesResourceAnchor(target, benchmarkCase.semantic_tuple.resource_anchor)),
    ambiguity_detour_count: steps.reduce(
      (count, step) => count + (isAmbiguousOutput(step.output) ? 1 : 0),
      0,
    ),
    placeholder_leak_detected: placeholderLeakDetected,
    heuristic_top_summary_detected: heuristicTopSummaryDetected,
    live_tool_evidence_pass: false,
    freeze_ready: false,
    guid_invariance_pass: false,
    tier_envelope: tierEnvelope,
  };
}

function readTierEnvelopeMetrics(output: Record<string, unknown> | undefined): {
  facts_present: boolean;
  closure_present: boolean;
  clues_present: boolean;
  semantic_order_pass: boolean;
  summary_source: string;
} {
  const envelope = output?.tier_envelope as Record<string, unknown> | undefined;
  const summarySource = String(envelope?.summary_source || '').trim()
    || inferSummarySourceFromOutput(output);
  const factsPresent = envelope?.facts_present === true
    || Boolean(output && typeof output.facts === 'object');
  const closurePresent = envelope?.closure_present === true
    || Boolean(output && typeof output.closure === 'object');
  const cluesPresent = envelope?.clues_present === true
    || Boolean(output && typeof output.clues === 'object');
  const semanticOrderPass = typeof envelope?.semantic_order_pass === 'boolean'
    ? Boolean(envelope.semantic_order_pass)
    : summarySource !== 'clues'
      || !hasStrongLeadOutsideClues(output);
  return {
    facts_present: factsPresent,
    closure_present: closurePresent,
    clues_present: cluesPresent,
    semantic_order_pass: semanticOrderPass,
    summary_source: summarySource || 'fallback',
  };
}

function inferSummarySourceFromOutput(output: Record<string, unknown> | undefined): string {
  if (!output) return 'fallback';
  const summary = String(output.summary || '').trim();
  const facts = output.facts as Record<string, unknown> | undefined;
  const clues = output.clues as Record<string, unknown> | undefined;
  const closure = output.closure as Record<string, unknown> | undefined;
  const factCandidates = Array.isArray(facts?.candidates) ? facts.candidates : [];
  const factProcessHints = Array.isArray(facts?.process_hints) ? facts.process_hints : [];
  const clueProcessHints = Array.isArray(clues?.process_hints) ? clues.process_hints : [];
  const runtimePreview = closure?.runtime_preview as Record<string, unknown> | undefined;
  const runtimeStatus = String(runtimePreview?.status || '').trim();
  if (factCandidates.some((row) => String((row as Record<string, unknown>)?.name || '').trim() === summary)) return 'facts';
  if (factProcessHints.some((row) => String((row as Record<string, unknown>)?.summary || '').trim() === summary)) return 'facts';
  if (runtimeStatus && runtimeStatus === summary) return 'closure';
  if (clueProcessHints.some((row) => String((row as Record<string, unknown>)?.summary || '').trim() === summary)) return 'clues';
  return 'fallback';
}

function hasStrongLeadOutsideClues(output: Record<string, unknown> | undefined): boolean {
  if (!output) return false;
  const facts = output.facts as Record<string, unknown> | undefined;
  const factCandidates = Array.isArray(facts?.candidates) ? facts.candidates : [];
  if (factCandidates.length > 0) return true;
  const factProcessHints = Array.isArray(facts?.process_hints) ? facts.process_hints : [];
  return factProcessHints.some((row) => {
    const confidence = String((row as Record<string, unknown>)?.confidence || '').trim().toLowerCase();
    const evidenceMode = String((row as Record<string, unknown>)?.evidence_mode || '').trim().toLowerCase();
    return (confidence === 'high' || confidence === 'medium') && evidenceMode !== 'resource_heuristic';
  });
}

function deriveConfirmedChainSteps(input: {
  steps: WorkflowReplayStep[];
  semanticTuple: SemanticTuple;
  placeholderLeakDetected: boolean;
}): string[] {
  if (input.placeholderLeakDetected) return [];
  const chain = new Set<string>();
  for (const step of input.steps) {
    if (step.tool !== 'cypher') continue;
    const output = step.output as Record<string, unknown> | undefined;
    const rows = Array.isArray(output?.rows) ? output.rows : [];
    for (const row of rows) {
      const src = String((row as Record<string, unknown>)?.src || '').trim();
      const dst = String((row as Record<string, unknown>)?.dst || '').trim();
      if (!src || !dst) continue;
      chain.add(`${src} -> ${dst}`);
    }
  }
  if (chain.size > 0) return [...chain].slice(0, 8);
  const fallback = [
    ...(Array.isArray(input.semanticTuple.proof_edges) ? input.semanticTuple.proof_edges : []),
    String(input.semanticTuple.proof_edge || '').trim(),
  ]
    .map((step) => String(step || '').trim())
    .filter(Boolean);
  return [...new Set(fallback)].slice(0, 8);
}

function countLiveToolEvidence(steps: WorkflowReplayStep[]): number {
  let score = 0;
  for (const step of steps) {
    const output = step.output as Record<string, unknown> | undefined;
    if (!output || typeof output !== 'object') continue;
    if (Number(output.row_count || 0) > 0) score += 1;
    if (Array.isArray(output.rows) && output.rows.length > 0) score += 1;
    if (Array.isArray(output.candidates) && output.candidates.length > 0) score += 1;
    if (Array.isArray(output.process_hints) && output.process_hints.length > 0) score += 1;
    if (Array.isArray(output.processes) && output.processes.length > 0) score += 1;
    if (Array.isArray(output.resource_hints) && output.resource_hints.length > 0) score += 1;
    if (output.symbol && typeof output.symbol === 'object') score += 1;
  }
  return score;
}

function computeGuidInvariance(
  benchmarkCase: AgentSafeBenchmarkCase,
  steps: WorkflowReplayStep[],
): {
  base: { primary_candidate: string; recommended_follow_up: string };
  guid_variant: { primary_candidate: string; recommended_follow_up: string };
  guid_invariance_pass: boolean;
} {
  const queryOutputs = steps
    .filter((step) => step.tool === 'query')
    .map((step) => step.output as Record<string, unknown> | undefined)
    .filter(Boolean) as Array<Record<string, unknown>>;

  const baseOutput = pickPostNarrowingQueryOutput(benchmarkCase, steps) || queryOutputs[0];
  const guidVariantOutput = queryOutputs.find((output) => output !== baseOutput && isGuidVariantOutput(output))
    || baseOutput;
  const base = {
    primary_candidate: extractPrimaryCandidate(baseOutput),
    recommended_follow_up: extractRecommendedFollowUp(baseOutput),
  };
  const guidVariant = {
    primary_candidate: extractPrimaryCandidate(guidVariantOutput),
    recommended_follow_up: extractRecommendedFollowUp(guidVariantOutput),
  };

  const guidInvariancePass = stringsEqual(base.primary_candidate, guidVariant.primary_candidate)
    && stringsEqual(normalizeAssetPath(base.recommended_follow_up), normalizeAssetPath(guidVariant.recommended_follow_up));

  return {
    base,
    guid_variant: guidVariant,
    guid_invariance_pass: guidInvariancePass,
  };
}

function detectPlaceholderLeak(input: {
  benchmarkCase: AgentSafeBenchmarkCase;
  firstOutput: Record<string, unknown> | undefined;
  postNarrowingOutput: Record<string, unknown> | undefined;
}): boolean {
  const intentText = `${input.benchmarkCase.start_query} ${input.benchmarkCase.semantic_tuple.symbol_anchor}`.toLowerCase();
  if (intentText.includes('reload')) return false;

  const signals = collectSignalTexts([input.firstOutput, input.postNarrowingOutput]);
  return signals.some((text) => text.includes(PLACEHOLDER_FOLLOW_UP.toLowerCase()));
}

function detectHeuristicTopSummary(input: {
  benchmarkCase: AgentSafeBenchmarkCase;
  output: Record<string, unknown> | undefined;
}): boolean {
  const output = input.output;
  if (!output) return false;
  const summary = String(output.summary || '').trim().toLowerCase();
  const processHints = Array.isArray(output.process_hints)
    ? output.process_hints
    : (Array.isArray(output.processes) ? output.processes : []);
  const topHint = processHints[0] as Record<string, unknown> | undefined;
  const topEvidenceMode = String(topHint?.evidence_mode || topHint?.process_evidence_mode || '').trim().toLowerCase();
  const topConfidence = String(topHint?.confidence || topHint?.process_confidence || '').trim().toLowerCase();
  const summaryLooksHeuristic = summary.includes('heuristic clue')
    || (topEvidenceMode === 'resource_heuristic' && topConfidence === 'low');
  if (!summaryLooksHeuristic) return false;

  const hasStrongerProcessLead = processHints.some((hint) => {
    const row = hint as Record<string, unknown>;
    const evidenceMode = String(row?.evidence_mode || row?.process_evidence_mode || '').trim().toLowerCase();
    const confidence = String(row?.confidence || row?.process_confidence || '').trim().toLowerCase();
    return (confidence === 'high' || confidence === 'medium') && evidenceMode !== 'resource_heuristic';
  });
  const anchorSymbol = input.benchmarkCase.semantic_tuple.symbol_anchor;
  const primaryCandidate = extractPrimaryCandidate(output);
  const candidates = Array.isArray(output.candidates) ? output.candidates : [];
  const hasStrongAnchorCandidate = stringsEqual(primaryCandidate, anchorSymbol)
    || candidates.some((candidate) => stringsEqual(String((candidate as Record<string, unknown>)?.name || ''), anchorSymbol));
  return hasStrongerProcessLead || hasStrongAnchorCandidate;
}

function collectSignalTexts(outputs: Array<Record<string, unknown> | undefined>): string[] {
  const texts: string[] = [];
  for (const output of outputs) {
    if (!output) continue;
    const summary = String(output.summary || '').trim();
    if (summary) texts.push(summary.toLowerCase());

    const decision = output.decision as Record<string, unknown> | undefined;
    const followUp = String(decision?.recommended_follow_up || '').trim();
    if (followUp) texts.push(followUp.toLowerCase());

    const runtimePreview = output.runtime_preview as Record<string, unknown> | undefined;
    const runtimePreviewNext = String(runtimePreview?.next_action || '').trim();
    if (runtimePreviewNext) texts.push(runtimePreviewNext.toLowerCase());

    const runtimeClaim = output.runtime_claim as Record<string, unknown> | undefined;
    const runtimeClaimNext = String(runtimeClaim?.next_action || '').trim();
    if (runtimeClaimNext) texts.push(runtimeClaimNext.toLowerCase());

    const upgradeHints = Array.isArray(output.upgrade_hints) ? output.upgrade_hints : [];
    for (const hint of upgradeHints) {
      const row = hint as Record<string, unknown>;
      const nextCommand = String(row.next_command || '').trim();
      const paramDelta = String(row.param_delta || '').trim();
      if (nextCommand) texts.push(nextCommand.toLowerCase());
      if (paramDelta) texts.push(paramDelta.toLowerCase());
    }
  }
  return texts;
}

function pickPostNarrowingQueryOutput(
  benchmarkCase: AgentSafeBenchmarkCase,
  steps: WorkflowReplayStep[],
): Record<string, unknown> | undefined {
  const queryOutputs = steps
    .filter((step) => step.tool === 'query')
    .map((step) => step.output as Record<string, unknown> | undefined);

  return queryOutputs.find((output) => {
    const primaryCandidate = extractPrimaryCandidate(output);
    if (stringsEqual(primaryCandidate, benchmarkCase.semantic_tuple.symbol_anchor)) {
      return true;
    }
    const resourceTargets = extractResourceTargets(output);
    if (resourceTargets.some((target) => matchesResourceAnchor(target, benchmarkCase.semantic_tuple.resource_anchor))) {
      return true;
    }
    return matchesResourceAnchor(extractRecommendedFollowUp(output), benchmarkCase.semantic_tuple.resource_anchor);
  });
}

function extractPrimaryCandidate(output: Record<string, unknown> | undefined): string {
  const decision = output?.decision as Record<string, unknown> | undefined;
  const candidates = Array.isArray(output?.candidates) ? output.candidates : [];
  const symbol = output?.symbol as Record<string, unknown> | undefined;
  return String(
    decision?.primary_candidate
    || (candidates[0] as Record<string, unknown> | undefined)?.name
    || symbol?.name
    || '',
  ).trim();
}

function extractRecommendedFollowUp(output: Record<string, unknown> | undefined): string {
  const decision = output?.decision as Record<string, unknown> | undefined;
  return String(decision?.recommended_follow_up || '').trim();
}

function extractResourceTargets(output: Record<string, unknown> | undefined): string[] {
  const targets = new Set<string>();
  const resourceHints = Array.isArray(output?.resource_hints) ? output.resource_hints : [];
  const nextHops = Array.isArray(output?.next_hops) ? output.next_hops : [];
  for (const row of [...resourceHints, ...nextHops]) {
    const target = String((row as Record<string, unknown>)?.target || (row as Record<string, unknown>)?.path || '').trim();
    if (target) targets.add(target);
  }
  return [...targets];
}

function isAmbiguousOutput(output: unknown): boolean {
  if (!output || typeof output !== 'object') return false;
  const row = output as Record<string, unknown>;
  const status = String(row.status || '').trim().toLowerCase();
  const message = String(row.message || '').trim().toLowerCase();
  return status === 'ambiguous' || message.includes('disambiguate');
}

function matchesResourceAnchor(candidate: string, canonical: string): boolean {
  const normalizedCandidate = normalizeAssetPath(candidate);
  const normalizedCanonical = normalizeAssetPath(canonical);
  if (!normalizedCandidate || !normalizedCanonical) return false;
  if (normalizedCandidate.includes(normalizedCanonical)) return true;

  const canonicalDir = path.posix.dirname(normalizedCanonical);
  return normalizedCandidate.includes(canonicalDir);
}

function isGuidVariantOutput(output: Record<string, unknown>): boolean {
  const signals = collectSignalTexts([output]);
  if (signals.some((text) => text.includes('guid'))) return true;
  return signals.some((text) => /[a-f0-9]{32}/.test(text));
}

function normalizeAssetPath(value: string): string {
  return String(value || '')
    .trim()
    .replace(/^resource_path_prefix=/, '')
    .replace(/^"+|"+$/g, '')
    .replace(/\\/g, '/');
}

function stringsEqual(left: string, right: string): boolean {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
}
