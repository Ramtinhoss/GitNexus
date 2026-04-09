import path from 'node:path';
import { estimateTokens } from '../u2-e2e/metrics.js';
import { writeReports } from '../report.js';
import { executeToolPlan } from '../agent-context/runner.js';
import { createAgentContextToolRunner, type AgentContextToolRunner } from '../agent-context/tool-runner.js';
import { deriveSemanticTuple, semanticTuplePass } from './semantic-tuple.js';
import { runWorkflowReplay, type WorkflowReplayResult } from './runner.js';
import { loadSubagentLiveCaseResult, type SubagentLiveResult, type TelemetryStep } from './subagent-live.js';
import type { AgentContextToolStep } from '../agent-context/types.js';
import type { AgentSafeBenchmarkCase, AgentSafeBenchmarkSuite, AgentSafeCaseKey, SemanticTuple } from './types.js';

type CaseKey = AgentSafeCaseKey;

export interface SameScriptCaseResult {
  tool_plan: AgentSafeBenchmarkCase['tool_plan'];
  steps: TelemetryStep[];
  semantic_tuple: SemanticTuple;
  semantic_tuple_pass: boolean;
  tool_calls_to_completion: number;
  tokens_to_completion: number;
}

export interface AgentSafeQueryContextBenchmarkReport {
  generatedAt: string;
  workflow_replay_full: Record<CaseKey, WorkflowReplayResult>;
  workflow_replay_slim: Record<CaseKey, WorkflowReplayResult>;
  same_script_full: Record<CaseKey, SameScriptCaseResult>;
  same_script_slim: Record<CaseKey, SameScriptCaseResult>;
  subagent_live: Record<CaseKey, SubagentLiveResult>;
  acceptance: {
    pass: boolean;
    cases: Record<CaseKey, boolean>;
  };
  // Legacy aliases kept for downstream compatibility while the benchmark contract migrates.
  cases: Record<CaseKey, SubagentLiveResult>;
  same_script: {
    tool_plan: Record<CaseKey, AgentSafeBenchmarkCase['tool_plan']>;
    cases: Record<CaseKey, SameScriptCaseResult>;
  };
  semantic_equivalence: {
    pass: boolean;
    cases: Record<CaseKey, boolean>;
  };
  token_summary: Record<CaseKey, { before: number; after: number; saved: number; reduction: number }>;
  call_summary: Record<CaseKey, { before: number; after: number; saved: number }>;
}

export async function runAgentSafeQueryContextBenchmark(
  suite: AgentSafeBenchmarkSuite,
  options: { repo?: string; subagentRunsDir?: string },
  deps: {
    runner?: AgentContextToolRunner;
    executeToolPlan?: typeof executeToolPlan;
    loadSubagentLiveCaseResult?: typeof loadSubagentLiveCaseResult;
  } = {},
): Promise<AgentSafeQueryContextBenchmarkReport> {
  const runner = deps.runner || (await createAgentContextToolRunner());
  const ownsRunner = !deps.runner;
  const executeToolPlanImpl = deps.executeToolPlan || executeToolPlan;
  const loadSubagentLiveCaseResultImpl = deps.loadSubagentLiveCaseResult || loadSubagentLiveCaseResult;

  const workflowReplayFullCases = {} as Record<CaseKey, WorkflowReplayResult>;
  const workflowReplaySlimCases = {} as Record<CaseKey, WorkflowReplayResult>;
  const sameScriptFullCases = {} as Record<CaseKey, SameScriptCaseResult>;
  const sameScriptSlimCases = {} as Record<CaseKey, SameScriptCaseResult>;
  const subagentLiveCases = {} as Record<CaseKey, SubagentLiveResult>;
  const acceptanceCases = {} as Record<CaseKey, boolean>;
  const semanticEquivalenceCases = {} as Record<CaseKey, boolean>;
  const tokenSummary = {} as Record<CaseKey, { before: number; after: number; saved: number; reduction: number }>;
  const callSummary = {} as Record<CaseKey, { before: number; after: number; saved: number }>;

  if (!options.subagentRunsDir) {
    throw new Error('subagentRunsDir is required for real subagent benchmark runs');
  }

  try {
    for (const key of Object.keys(suite.cases) as CaseKey[]) {
      const benchmarkCase = suite.cases[key];
      const workflowReplayFull = await runWorkflowReplay(benchmarkCase, runner, {
        repo: options.repo,
        maxSteps: suite.thresholds.workflowReplay.maxSteps,
        responseProfile: 'full',
      });
      const workflowReplaySlim = await runWorkflowReplay(benchmarkCase, runner, {
        repo: options.repo,
        maxSteps: suite.thresholds.workflowReplay.maxSteps,
        responseProfile: 'slim',
      });
      const sameScriptFull = await runSameScriptCase(benchmarkCase, runner, executeToolPlanImpl, {
        repo: options.repo,
        responseProfile: 'full',
      });
      const sameScriptSlim = await runSameScriptCase(benchmarkCase, runner, executeToolPlanImpl, {
        repo: options.repo,
        responseProfile: 'slim',
      });
      const subagentLive = await loadSubagentLiveCaseResultImpl(path.join(options.subagentRunsDir, key), benchmarkCase);

      workflowReplayFullCases[key] = workflowReplayFull;
      workflowReplaySlimCases[key] = workflowReplaySlim;
      sameScriptFullCases[key] = sameScriptFull;
      sameScriptSlimCases[key] = sameScriptSlim;
      subagentLiveCases[key] = subagentLive;
      acceptanceCases[key] = workflowReplaySlim.semantic_tuple_pass
        && workflowReplaySlim.post_narrowing_anchor_pass
        && workflowReplaySlim.post_narrowing_follow_up_hit;
      semanticEquivalenceCases[key] = sameScriptSlim.semantic_tuple_pass && subagentLive.semantic_tuple_pass;

      const tokenSaved = sameScriptFull.tokens_to_completion - sameScriptSlim.tokens_to_completion;
      tokenSummary[key] = {
        before: sameScriptFull.tokens_to_completion,
        after: sameScriptSlim.tokens_to_completion,
        saved: tokenSaved,
        reduction: sameScriptFull.tokens_to_completion > 0 ? Number((tokenSaved / sameScriptFull.tokens_to_completion).toFixed(3)) : 0,
      };
      callSummary[key] = {
        before: sameScriptFull.tool_calls_to_completion,
        after: sameScriptSlim.tool_calls_to_completion,
        saved: sameScriptFull.tool_calls_to_completion - sameScriptSlim.tool_calls_to_completion,
      };
    }
  } finally {
    if (ownsRunner) {
      await runner.close();
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    workflow_replay_full: workflowReplayFullCases,
    workflow_replay_slim: workflowReplaySlimCases,
    same_script_full: sameScriptFullCases,
    same_script_slim: sameScriptSlimCases,
    subagent_live: subagentLiveCases,
    acceptance: {
      pass: Object.values(acceptanceCases).every(Boolean),
      cases: acceptanceCases,
    },
    cases: subagentLiveCases,
    same_script: {
      tool_plan: {
        weapon_powerup: suite.cases.weapon_powerup.tool_plan,
        reload: suite.cases.reload.tool_plan,
      },
      cases: sameScriptSlimCases,
    },
    semantic_equivalence: {
      pass: Object.values(semanticEquivalenceCases).every(Boolean),
      cases: semanticEquivalenceCases,
    },
    token_summary: tokenSummary,
    call_summary: callSummary,
  };
}

export async function writeAgentSafeQueryContextReports(
  reportDir: string,
  report: AgentSafeQueryContextBenchmarkReport,
): Promise<void> {
  const markdown = [
    '# Agent-Safe Query/Context Benchmark Summary',
    '',
    `- Pass: ${report.acceptance.pass ? 'YES' : 'NO'}`,
    '',
    '## Cases',
    ...(['weapon_powerup', 'reload'] as CaseKey[]).map(
      (key) =>
        `- ${key}: live_pass=${report.subagent_live[key].semantic_tuple_pass}, token_saved=${report.token_summary[key].saved}, call_saved=${report.call_summary[key].saved}, anchor_top1_pass=${report.workflow_replay_slim[key].anchor_top1_pass}, recommended_follow_up_hit=${report.workflow_replay_slim[key].recommended_follow_up_hit}, post_narrowing_anchor_pass=${report.workflow_replay_slim[key].post_narrowing_anchor_pass}, post_narrowing_follow_up_hit=${report.workflow_replay_slim[key].post_narrowing_follow_up_hit}, ambiguity_detour_count=${report.workflow_replay_slim[key].ambiguity_detour_count}`,
    ),
  ].join('\n');

  await writeReports(reportDir, report, markdown);
}

async function runSameScriptCase(
  benchmarkCase: AgentSafeBenchmarkCase,
  runner: AgentContextToolRunner,
  executeToolPlanImpl: typeof executeToolPlan,
  options: { repo?: string; responseProfile: 'full' | 'slim' },
): Promise<SameScriptCaseResult> {
  const toolPlan = applyResponseProfileToToolPlan(benchmarkCase.tool_plan, options.responseProfile);
  const outputs = await executeToolPlanImpl(toolPlan, runner, options.repo);
  const steps = outputs.map((step) => ({
    tool: step.tool as TelemetryStep['tool'],
    input: step.input,
    output: step.output,
    durationMs: 0,
    totalTokensEst: estimateTokens(JSON.stringify(step.input)) + estimateTokens(JSON.stringify(step.output)),
    timestamp: new Date(0).toISOString(),
  }));
  const semanticTuple = deriveSemanticTuple(
    benchmarkCase.semantic_tuple,
    steps.map((step) => step.output),
  );

  return {
    tool_plan: toolPlan,
    steps,
    semantic_tuple: semanticTuple,
    semantic_tuple_pass: semanticTuplePass(semanticTuple, benchmarkCase.semantic_tuple),
    tool_calls_to_completion: steps.length,
    tokens_to_completion: steps.reduce((sum, step) => sum + step.totalTokensEst, 0),
  };
}

function applyResponseProfileToToolPlan(
  toolPlan: AgentContextToolStep[],
  responseProfile: 'full' | 'slim',
): AgentContextToolStep[] {
  return toolPlan.map((step) => {
    if (step.tool !== 'query' && step.tool !== 'context') {
      return step;
    }
    return {
      ...step,
      input: {
        ...step.input,
        response_profile: responseProfile,
      },
    };
  });
}
