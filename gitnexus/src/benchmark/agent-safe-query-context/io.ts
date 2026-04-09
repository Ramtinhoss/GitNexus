import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  AgentSafeLiveTask,
  AgentSafeBenchmarkCase,
  AgentSafeBenchmarkSuite,
  AgentSafeBenchmarkThresholds,
  SemanticTuple,
} from './types.js';

const PLACEHOLDER_RE = /TODO|TBD|placeholder|<resource>|<symbol>/i;

export async function loadAgentSafeQueryContextSuite(root: string): Promise<AgentSafeBenchmarkSuite> {
  const thresholds = JSON.parse(
    await fs.readFile(path.join(root, 'thresholds.json'), 'utf-8'),
  ) as AgentSafeBenchmarkThresholds;
  const cases = JSON.parse(
    await fs.readFile(path.join(root, 'cases.json'), 'utf-8'),
  ) as AgentSafeBenchmarkSuite['cases'];

  assertCase('weapon_powerup', cases.weapon_powerup);
  assertCase('reload', cases.reload);

  return { thresholds, cases };
}

function assertCase(name: string, value: AgentSafeBenchmarkCase | undefined): asserts value is AgentSafeBenchmarkCase {
  if (!value) {
    throw new Error(`missing required case: ${name}`);
  }

  for (const field of ['label', 'start_query', 'retry_query', 'proof_cypher'] as const) {
    const candidate = value[field];
    if (!candidate || typeof candidate !== 'string') {
      throw new Error(`missing required field: ${name}.${field}`);
    }
    assertNoPlaceholder(`${name}.${field}`, candidate);
  }

  if (!Array.isArray(value.proof_contexts) || value.proof_contexts.length === 0) {
    throw new Error(`missing required field: ${name}.proof_contexts`);
  }
  value.proof_contexts.forEach((entry, index) => assertNoPlaceholder(`${name}.proof_contexts[${index}]`, entry));

  if (!Array.isArray(value.tool_plan) || value.tool_plan.length === 0) {
    throw new Error(`missing required field: ${name}.tool_plan`);
  }

  assertLiveTask(name, value.live_task, value.semantic_tuple);

  if (value.start_query_input && typeof value.start_query_input === 'object') {
    for (const entry of Object.values(value.start_query_input)) {
      if (typeof entry === 'string') {
        assertNoPlaceholder(`${name}.start_query_input`, entry);
      }
    }
  }
  if (value.retry_query_input && typeof value.retry_query_input === 'object') {
    for (const entry of Object.values(value.retry_query_input)) {
      if (typeof entry === 'string') {
        assertNoPlaceholder(`${name}.retry_query_input`, entry);
      }
    }
  }

  assertSemanticTuple(name, value.semantic_tuple);
}

function assertLiveTask(
  name: string,
  liveTask: AgentSafeLiveTask | undefined,
  tuple: SemanticTuple,
): asserts liveTask is AgentSafeLiveTask {
  if (!liveTask) {
    throw new Error(`missing required field: ${name}.live_task`);
  }

  for (const field of ['objective', 'symbol_seed', 'resource_seed'] as const) {
    const candidate = liveTask[field];
    if (!candidate || typeof candidate !== 'string') {
      throw new Error(`missing required field: ${name}.live_task.${field}`);
    }
    assertNoPlaceholder(`${name}.live_task.${field}`, candidate);
  }

  if (tuple.proof_edge && liveTask.objective.includes(tuple.proof_edge)) {
    throw new Error(`${name}.live_task.objective leaks canonical proof_edge`);
  }
  if (tuple.proof_edges?.every((edge) => liveTask.objective.includes(edge))) {
    throw new Error(`${name}.live_task.objective leaks canonical proof_edges`);
  }
}

function assertSemanticTuple(name: string, tuple: SemanticTuple | undefined): asserts tuple is SemanticTuple {
  if (!tuple) {
    throw new Error(`missing required field: ${name}.semantic_tuple`);
  }

  assertNoPlaceholder(`${name}.semantic_tuple.resource_anchor`, tuple.resource_anchor);
  assertNoPlaceholder(`${name}.semantic_tuple.symbol_anchor`, tuple.symbol_anchor);

  if (tuple.proof_edge) {
    assertNoPlaceholder(`${name}.semantic_tuple.proof_edge`, tuple.proof_edge);
  }
  if (tuple.proof_edges) {
    tuple.proof_edges.forEach((entry, index) =>
      assertNoPlaceholder(`${name}.semantic_tuple.proof_edges[${index}]`, entry),
    );
  }

  if (!tuple.proof_edge && (!tuple.proof_edges || tuple.proof_edges.length === 0)) {
    throw new Error(`missing proof edge(s): ${name}.semantic_tuple`);
  }
}

function assertNoPlaceholder(field: string, value: string): void {
  if (PLACEHOLDER_RE.test(value)) {
    throw new Error(`${field} contains placeholder text`);
  }
}
