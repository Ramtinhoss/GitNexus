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

  return {
    steps,
    semantic_tuple: semanticTuple,
    semantic_tuple_pass: passed,
    ...computeSemanticDriftMetrics(benchmarkCase, steps),
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
  const heuristicTopSummaryDetected = detectHeuristicTopSummary(firstOutput);

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

function detectHeuristicTopSummary(output: Record<string, unknown> | undefined): boolean {
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
  const hasStrongPrimaryCandidate = String(extractPrimaryCandidate(output) || '').trim().length > 0;
  return hasStrongerProcessLead || hasStrongPrimaryCandidate;
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
