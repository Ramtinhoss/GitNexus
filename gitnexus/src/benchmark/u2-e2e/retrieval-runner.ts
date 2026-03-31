import { performance } from 'node:perf_hooks';
import path from 'node:path';
import type { SymbolScenario } from './config.js';
import { estimateTokens, type StepMetric } from './metrics.js';

export interface ToolRunner {
  query: (params: Record<string, unknown>) => Promise<any>;
  context: (params: Record<string, unknown>) => Promise<any>;
  impact: (params: Record<string, unknown>) => Promise<any>;
  cypher: (params: Record<string, unknown>) => Promise<any>;
}

export interface RetrievalStepResult extends StepMetric {
  input: Record<string, unknown>;
  output: any;
}

export interface SymbolScenarioResult {
  symbol: string;
  steps: RetrievalStepResult[];
  assertions: {
    pass: boolean;
    failures: string[];
  };
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value);
  }
}

function buildMetric(stepId: string, tool: string, durationMs: number, input: Record<string, unknown>, output: any): RetrievalStepResult {
  const inputText = stringify(input);
  const outputText = stringify(output);
  const inputChars = inputText.length;
  const outputChars = outputText.length;
  const inputTokensEst = estimateTokens(inputText);
  const outputTokensEst = estimateTokens(outputText);
  return {
    stepId,
    tool,
    durationMs: Number(durationMs.toFixed(1)),
    inputChars,
    outputChars,
    inputTokensEst,
    outputTokensEst,
    totalTokensEst: inputTokensEst + outputTokensEst,
    input,
    output,
  };
}

function countRefs(value: Record<string, unknown> | undefined): number {
  if (!value) return 0;
  let total = 0;
  for (const rows of Object.values(value)) {
    if (Array.isArray(rows)) {
      total += rows.length;
    }
  }
  return total;
}

function hasDeepDiveEvidence(output: any): boolean {
  const processSymbols = Array.isArray(output?.process_symbols) ? output.process_symbols.length : 0;
  const definitions = Array.isArray(output?.definitions) ? output.definitions.length : 0;
  const candidates = Array.isArray(output?.candidates) ? output.candidates.length : 0;
  const rows = Array.isArray(output?.rows) ? output.rows.length : 0;
  const byDepth = output?.byDepth && typeof output.byDepth === 'object'
    ? Object.values(output.byDepth).reduce<number>(
        (sum, value) => sum + (Array.isArray(value) ? value.length : 0),
        0,
      )
    : 0;
  const impacted = Number(output?.impactedCount || 0);
  const incomingRefs = countRefs(output?.incoming);
  const outgoingRefs = countRefs(output?.outgoing);
  return processSymbols + definitions + candidates + rows + byDepth + impacted + incomingRefs + outgoingRefs > 0;
}

function hasQueryUnityEvidence(output: any): boolean {
  const symbols = [
    ...(Array.isArray(output?.process_symbols) ? output.process_symbols : []),
    ...(Array.isArray(output?.definitions) ? output.definitions : []),
  ];
  return symbols.some((symbol: any) => {
    const bindings = Array.isArray(symbol?.resourceBindings) ? symbol.resourceBindings.length : 0;
    const scalarFields = Array.isArray(symbol?.serializedFields?.scalarFields) ? symbol.serializedFields.scalarFields.length : 0;
    const referenceFields = Array.isArray(symbol?.serializedFields?.referenceFields) ? symbol.serializedFields.referenceFields.length : 0;
    return bindings + scalarFields + referenceFields > 0;
  });
}

interface DeepDiveExecution {
  tool: SymbolScenario['deepDivePlan'][number]['tool'];
  input: Record<string, unknown>;
  output: any;
}

function assertScenario(
  scenario: SymbolScenario,
  contextOnOutput: any,
  deepDiveExecutions: DeepDiveExecution[],
  contextUnityHydration: 'compact' | 'parity',
): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  const bindings = Array.isArray(contextOnOutput?.resourceBindings) ? contextOnOutput.resourceBindings : [];
  const hasBindings = bindings.length > 0;
  const hasResolvedReferences = bindings.some((binding: any) => Array.isArray(binding?.resolvedReferences) && binding.resolvedReferences.length > 0);
  const hasAssetTypeBinding = bindings.some((binding: any) => typeof binding?.resourceType === 'string' && binding.resourceType.length > 0);
  const hydrationMeta = contextOnOutput?.hydrationMeta && typeof contextOnOutput.hydrationMeta === 'object'
    ? contextOnOutput.hydrationMeta
    : null;

  if (!hydrationMeta) {
    failures.push(`${scenario.symbol}: context(on) must include hydrationMeta`);
  } else if (contextUnityHydration === 'compact') {
    if (typeof hydrationMeta.needsParityRetry !== 'boolean') {
      failures.push(`${scenario.symbol}: context(on) hydrationMeta.needsParityRetry must be boolean`);
    }
    if (hydrationMeta.isComplete === false && hydrationMeta.needsParityRetry !== true) {
      failures.push(`${scenario.symbol}: context(on) incomplete compact response must set hydrationMeta.needsParityRetry=true`);
    }
  } else if (hydrationMeta.isComplete !== true) {
    failures.push(`${scenario.symbol}: context(on) parity response must set hydrationMeta.isComplete=true`);
  }

  if (scenario.symbol === 'MainUIManager' || scenario.symbol === 'PlayerActor') {
    if (!hasBindings) {
      failures.push(`${scenario.symbol}: context(on) must include resourceBindings`);
    }
  }

  if (scenario.symbol === 'CoinPowerUp' || scenario.symbol === 'GlobalDataAssets') {
    if (!hasAssetTypeBinding && !hasResolvedReferences) {
      failures.push(`${scenario.symbol}: require asset-type binding or resolved references evidence`);
    }
  }

  if (scenario.symbol === 'AssetRef') {
    if (!hasBindings) {
      failures.push('AssetRef: context(on) must include resourceBindings');
    }
    const deepDiveEvidence = deepDiveExecutions.some((step) => hasDeepDiveEvidence(step.output));
    if (!deepDiveEvidence) {
      failures.push('AssetRef: deep-dive must provide usage/dependency evidence');
    }
  }

  const queryOnRuns = deepDiveExecutions.filter(
    (step) => step.tool === 'query' && String(step.input?.unity_resources || '').toLowerCase() === 'on',
  );
  if (queryOnRuns.length > 0) {
    const hasUnityEvidenceFromQueryOn = queryOnRuns.some((step) => hasQueryUnityEvidence(step.output));
    if (!hasUnityEvidenceFromQueryOn) {
      failures.push(`${scenario.symbol}: query(on) must include unity serialized/resource evidence`);
    }
  }

  return {
    pass: failures.length === 0,
    failures,
  };
}

async function invokeTool(runner: ToolRunner, tool: SymbolScenario['deepDivePlan'][number]['tool'], input: Record<string, unknown>): Promise<any> {
  if (tool === 'query') {
    return runner.query(input);
  }
  if (tool === 'context') {
    return runner.context(input);
  }
  if (tool === 'impact') {
    return runner.impact(input);
  }
  return runner.cypher(input);
}

function selectDisambiguationUid(symbol: string, output: any): string | undefined {
  const expectedFile = `${symbol}.cs`.toLowerCase();
  const candidates = Array.isArray(output?.candidates) ? output.candidates : [];
  for (const candidate of candidates) {
    const kind = String(candidate?.kind || '').toLowerCase();
    if (kind !== 'class') continue;
    const filePath = String(candidate?.filePath || candidate?.file_path || '').trim();
    if (!filePath) continue;
    if (path.basename(filePath).toLowerCase() !== expectedFile) continue;
    const uid = String(candidate?.uid || '').trim();
    if (uid) {
      return uid;
    }
  }
  return undefined;
}

async function runContextWithDisambiguation(
  runner: ToolRunner,
  scenario: SymbolScenario,
  input: Record<string, unknown>,
): Promise<any> {
  const first = await runner.context(input);
  if (first?.status !== 'ambiguous') {
    return first;
  }

  const hint = typeof scenario.contextFileHint === 'string' ? scenario.contextFileHint.trim() : '';
  if (hint) {
    const hinted = await runner.context({ ...input, file_path: hint });
    if (hinted?.status !== 'ambiguous') {
      return hinted;
    }
  }

  const uid = selectDisambiguationUid(scenario.symbol, first);
  if (uid) {
    return runner.context({ ...input, uid });
  }
  return first;
}

export async function runSymbolScenario(
  runner: ToolRunner,
  scenario: SymbolScenario,
  repo?: string,
): Promise<SymbolScenarioResult> {
  const steps: RetrievalStepResult[] = [];
  const baseContextInput: Record<string, unknown> = { name: scenario.symbol };
  if (repo) {
    baseContextInput.repo = repo;
  }

  const contextOffInput = { ...baseContextInput, unity_resources: 'off' };
  const t0 = performance.now();
  const contextOff = await runContextWithDisambiguation(runner, scenario, contextOffInput);
  steps.push(buildMetric('context-off', 'context', performance.now() - t0, contextOffInput, contextOff));

  const contextUnityHydration = scenario.contextUnityHydration === 'parity' ? 'parity' : 'compact';
  const contextOnInput = {
    ...baseContextInput,
    unity_resources: 'on',
    unity_hydration_mode: contextUnityHydration,
  };
  const t1 = performance.now();
  const contextOn = await runContextWithDisambiguation(runner, scenario, contextOnInput);
  steps.push(buildMetric('context-on', 'context', performance.now() - t1, contextOnInput, contextOn));

  const deepDiveExecutions: DeepDiveExecution[] = [];
  for (let i = 0; i < scenario.deepDivePlan.length; i += 1) {
    const step = scenario.deepDivePlan[i];
    const input: Record<string, unknown> = { ...(step.input || {}) };
    if (repo) {
      input.repo = repo;
    }
    const ts = performance.now();
    const output = await invokeTool(runner, step.tool, input);
    deepDiveExecutions.push({ tool: step.tool, input, output });
    steps.push(buildMetric(`deep-dive-${i + 1}`, step.tool, performance.now() - ts, input, output));
  }

  return {
    symbol: scenario.symbol,
    steps,
    assertions: assertScenario(scenario, contextOn, deepDiveExecutions, contextUnityHydration),
  };
}
