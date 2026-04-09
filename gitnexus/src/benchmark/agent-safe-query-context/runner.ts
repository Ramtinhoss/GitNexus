import { estimateTokens } from '../u2-e2e/metrics.js';
import type { AgentContextToolRunner } from '../agent-context/tool-runner.js';
import { createAgentContextToolRunner } from '../agent-context/tool-runner.js';
import { deriveSemanticTuple, semanticTuplePass } from './semantic-tuple.js';
import type { AgentSafeBenchmarkCase, SemanticTuple } from './types.js';

export interface WorkflowReplayStep {
  tool: 'query' | 'context' | 'cypher';
  input: Record<string, unknown>;
  output: unknown;
  durationMs: number;
  totalTokensEst: number;
}

export interface WorkflowReplayResult {
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

export async function runWorkflowReplay(
  benchmarkCase: AgentSafeBenchmarkCase,
  runner: Pick<AgentContextToolRunner, 'query' | 'context' | 'cypher'>,
  options: { repo?: string; maxSteps?: number } = {},
): Promise<WorkflowReplayResult> {
  const maxSteps = options.maxSteps ?? 5;
  const steps: WorkflowReplayStep[] = [];

  await pushStep(
    steps,
    'query',
    withRepo(benchmarkCase.start_query_input || { query: benchmarkCase.start_query }, options.repo),
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
      withRepo(benchmarkCase.retry_query_input || { query: benchmarkCase.retry_query }, options.repo),
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
    await pushStep(steps, 'context', withRepo({ name: contextName }, options.repo), runner.context);
    semanticTuple = deriveSemanticTuple(
      benchmarkCase.semantic_tuple,
      steps.map((step) => step.output),
    );
    passed = semanticTuplePass(semanticTuple, benchmarkCase.semantic_tuple);
  }

  if (!passed && steps.length < maxSteps) {
    await pushStep(steps, 'cypher', withRepo({ query: benchmarkCase.proof_cypher }, options.repo), runner.cypher);
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
  options: { repo?: string; maxSteps?: number } = {},
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

function withRepo(input: Record<string, unknown>, repo?: string): Record<string, unknown> {
  if (!repo) {
    return input;
  }
  return { ...input, repo };
}
