import test from 'node:test';
import assert from 'node:assert/strict';
import { executeToolPlan, runAgentContextBenchmark } from './runner.js';
import type { AgentContextDataset } from './types.js';

test('runner computes per-scenario coverage and suite averages', async () => {
  const dataset: AgentContextDataset = {
    thresholds: {
      coverage: { minPerScenario: 0.5, suiteAvgMin: 0.5 },
      efficiency: { maxToolCallsPerScenario: 4, suiteAvgMax: 4 },
    },
    scenarios: [
      {
        scenario_id: 'sample-refactor-context',
        target_uid: 'Class:Sample:Target',
        tool_plan: [
          { tool: 'query', input: { query: 'Target' } },
          { tool: 'context', input: { uid: 'Class:Sample:Target' } },
          { tool: 'impact', input: { target: 'Target', direction: 'upstream' } },
        ],
        checks: [
          { id: 'T', required_uid: 'Class:Sample:Target' },
          { id: 'U', min_incoming: 1 },
          { id: 'D', min_outgoing: 1 },
          { id: 'B', min_impacted: 1 },
          { id: 'I', internal_anchors: ['AddMinion'], min_internal_hits: 1 },
          { id: 'E', max_tool_calls: 4 },
        ],
      },
    ],
  };

  const fakeRunner = {
    query: async () => ({
      process_symbols: [{ id: 'Class:Sample:Target', name: 'Target' }],
      definitions: [{ id: 'Method:Sample:AddMinion', name: 'AddMinion' }],
      symbol: { uid: 'Class:Sample:Target', name: 'Target' },
    }),
    context: async () => ({
      incoming: { depth_1: [{ id: 'Caller:1' }] },
      outgoing: { depth_1: [{ id: 'Callee:1' }] },
      symbol: { uid: 'Class:Sample:Target', name: 'Target' },
    }),
    impact: async () => ({
      impactedCount: 3,
      target: { id: 'Class:Sample:Target', name: 'Target' },
    }),
    cypher: async () => ({ rows: [] }),
    close: async () => {},
  };

  const result = await runAgentContextBenchmark(dataset, {
    repo: 'sample-repo',
    runner: fakeRunner,
  });

  assert.ok(result.metrics.avgCoverage > 0);
  assert.ok(result.scenarios[0].checks.length > 0);
});

test('executeToolPlan maps impact uid to target_uid for backend impact contract', async () => {
  const calls: any[] = [];
  const fakeRunner = {
    query: async () => ({}),
    context: async () => ({}),
    impact: async (params: any) => {
      calls.push(params);
      return { impactedCount: 1 };
    },
    cypher: async () => ({}),
    close: async () => {},
  };

  await executeToolPlan(
    [
      {
        tool: 'impact',
        input: {
          target: 'MirrorNetMgr',
          uid: 'Class:Assets/NEON/Code/NetworkCode/NeonMgr/MirrorNetMgr.cs:MirrorNetMgr',
          direction: 'upstream',
        },
      },
    ],
    fakeRunner,
    'neonspark-v1-subset',
  );

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].target_uid,
    'Class:Assets/NEON/Code/NetworkCode/NeonMgr/MirrorNetMgr.cs:MirrorNetMgr',
  );
});

test('executeToolPlan injects response_profile=full for legacy query/context payloads', async () => {
  const calls: any[] = [];
  const fakeRunner = {
    query: async (params: any) => {
      calls.push({ tool: 'query', params });
      return {};
    },
    context: async (params: any) => {
      calls.push({ tool: 'context', params });
      return {};
    },
    impact: async () => ({}),
    cypher: async () => ({}),
    close: async () => {},
  };

  await executeToolPlan(
    [
      { tool: 'query', input: { query: 'Target' } },
      { tool: 'context', input: { name: 'Target' } },
    ],
    fakeRunner,
    'sample-repo',
  );

  assert.equal(calls[0].params.response_profile, 'full');
  assert.equal(calls[1].params.response_profile, 'full');
});
