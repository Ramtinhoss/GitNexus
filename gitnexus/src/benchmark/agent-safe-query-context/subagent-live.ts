import fs from 'node:fs/promises';
import path from 'node:path';
import { deriveSemanticTuple, semanticTuplePass } from './semantic-tuple.js';
import type { AgentSafeBenchmarkCase, SemanticTuple } from './types.js';

export interface TelemetryStep {
  tool: 'query' | 'context' | 'cypher';
  input: Record<string, unknown>;
  output: unknown;
  durationMs: number;
  totalTokensEst: number;
  timestamp: string;
}

export interface SubagentFinalResult {
  resource_anchor?: string;
  symbol_anchor?: string;
  proof_edge?: string;
  proof_edges?: string[];
  closure_status?: SemanticTuple['closure_status'];
  summary?: string;
}

export interface SubagentLiveResult {
  prompt: string;
  prompt_path: string;
  result_path: string;
  telemetry_path: string;
  final_result: SubagentFinalResult;
  steps: TelemetryStep[];
  semantic_tuple: SemanticTuple;
  semantic_tuple_pass: boolean;
  tool_calls_to_completion: number;
  tokens_to_completion: number;
  stop_reason: 'semantic_tuple_satisfied' | 'agent_result_incomplete';
}

const ALLOWED_TOOLS = new Set(['query', 'context', 'cypher']);

export function buildSubagentPrompt(
  benchmarkCase: AgentSafeBenchmarkCase,
  options: { repo: string; runDir: string; resultPath: string },
): string {
  const wrapperCommand = [
    'node gitnexus/dist/benchmark/agent-safe-query-context/telemetry-tool.js',
    `--run-dir "${options.runDir}"`,
    '--tool <query|context|cypher>',
    `--input '<JSON>'`,
  ].join(' ');

  return [
    'You are running a benchmarked GitNexus investigation.',
    '',
    `Case: ${benchmarkCase.label}`,
    `Repo: ${options.repo}`,
    `Objective: ${benchmarkCase.live_task.objective}`,
    '',
    'Starting seeds:',
    `- Symbol/class seed: ${benchmarkCase.live_task.symbol_seed}`,
    `- Resource seed: ${benchmarkCase.live_task.resource_seed}`,
    '',
    'Use only this wrapper command for benchmarked evidence collection:',
    wrapperCommand,
    '',
    'Rules:',
    '- Investigate normally from the seeds. Do not assume the answer.',
    '- For benchmarked GitNexus evidence collection, use only query/context/cypher through the wrapper command above.',
    '- Stop when you have enough evidence to return your best result.',
    '',
    `Write your final result as JSON to: ${options.resultPath}`,
    'Final JSON schema:',
    '{',
    '  "resource_anchor": "string",',
    '  "symbol_anchor": "string",',
    '  "proof_edge": "string (optional)",',
    '  "proof_edges": ["string"] (optional),',
    '  "closure_status": "not_verified_full|verified_partial|verified_full|failed",',
    '  "summary": "short explanation"',
    '}',
    '',
    'Do not include any extra wrapper calls after you have enough evidence.',
  ].join('\n');
}

export async function prepareSubagentCaseRun(
  runDir: string,
  benchmarkCase: AgentSafeBenchmarkCase,
  options: { repo: string },
): Promise<{ promptPath: string; resultPath: string; prompt: string }> {
  await fs.mkdir(runDir, { recursive: true });
  const promptPath = path.join(runDir, 'prompt.txt');
  const resultPath = path.join(runDir, 'result.json');
  const prompt = buildSubagentPrompt(benchmarkCase, {
    repo: options.repo,
    runDir,
    resultPath,
  });
  assertPromptContract(prompt, benchmarkCase.semantic_tuple);
  await fs.writeFile(promptPath, prompt, 'utf-8');
  return { promptPath, resultPath, prompt };
}

export async function loadSubagentLiveCaseResult(
  runDir: string,
  benchmarkCase: AgentSafeBenchmarkCase,
): Promise<SubagentLiveResult> {
  const promptPath = path.join(runDir, 'prompt.txt');
  const telemetryPath = path.join(runDir, 'telemetry.jsonl');
  const resultPath = path.join(runDir, 'result.json');

  const prompt = await fs.readFile(promptPath, 'utf-8');
  assertPromptContract(prompt, benchmarkCase.semantic_tuple);

  const telemetryText = await fs.readFile(telemetryPath, 'utf-8');
  const steps = telemetryText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => validateTelemetryRow(JSON.parse(line) as TelemetryStep));

  if (steps.length === 0) {
    throw new Error(`missing telemetry rows: ${runDir}`);
  }

  const finalResult = JSON.parse(await fs.readFile(resultPath, 'utf-8')) as SubagentFinalResult;
  const semanticTuple = deriveSemanticTuple(
    benchmarkCase.semantic_tuple,
    steps.map((step) => step.output),
  );
  const passed = semanticTuplePass(semanticTuple, benchmarkCase.semantic_tuple);

  return {
    prompt,
    prompt_path: promptPath,
    result_path: resultPath,
    telemetry_path: telemetryPath,
    final_result: finalResult,
    steps,
    semantic_tuple: semanticTuple,
    semantic_tuple_pass: passed,
    tool_calls_to_completion: steps.length,
    tokens_to_completion: steps.reduce((sum, step) => sum + step.totalTokensEst, 0),
    stop_reason: passed ? 'semantic_tuple_satisfied' : 'agent_result_incomplete',
  };
}

function assertPromptContract(prompt: string, tuple: SemanticTuple): void {
  if (!prompt.includes('telemetry-tool.js')) {
    throw new Error('prompt missing wrapper command');
  }
  if (!prompt.includes('Final JSON schema:')) {
    throw new Error('prompt missing final JSON schema');
  }
  if (tuple.proof_edge && prompt.includes(tuple.proof_edge)) {
    throw new Error('prompt leaks canonical proof_edge');
  }
  if (tuple.proof_edges && tuple.proof_edges.every((edge) => prompt.includes(edge))) {
    throw new Error('prompt leaks canonical proof_edges');
  }
}

function validateTelemetryRow(row: TelemetryStep): TelemetryStep {
  if (!row || typeof row !== 'object') {
    throw new Error('invalid telemetry row');
  }
  if (!ALLOWED_TOOLS.has(row.tool)) {
    throw new Error(`telemetry row contains non-allowlisted tool: ${String(row.tool)}`);
  }
  if (!('input' in row) || !('output' in row)) {
    throw new Error('telemetry row missing input/output');
  }
  if (typeof row.durationMs !== 'number' || typeof row.totalTokensEst !== 'number') {
    throw new Error('telemetry row missing duration/token estimates');
  }
  if (typeof row.timestamp !== 'string' || row.timestamp.length === 0) {
    throw new Error('telemetry row missing timestamp');
  }
  return row;
}
