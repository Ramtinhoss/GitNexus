import test from 'node:test';
import assert from 'node:assert/strict';
import { runSymbolScenario, summarizePhase5ConfidenceCalibration } from './retrieval-runner.js';
import { loadE2EConfig } from './config.js';

test('runSymbolScenario executes context off/on + deepDive and records metrics', async () => {
  const mockToolRunner = {
    context: async (input: any) => {
      if (input.unity_resources === 'on') {
        return {
          status: 'found',
          hydrationMeta: {
            requestedMode: 'compact',
            effectiveMode: 'compact',
            isComplete: false,
            needsParityRetry: true,
          },
          resourceBindings: [
            {
              resourcePath: 'Assets/Prefabs/UI.prefab',
              resourceType: 'prefab',
              resolvedReferences: [{ uid: 'Class:Foo' }],
            },
          ],
        };
      }
      return { status: 'found' };
    },
    query: async () => ({ process_symbols: [{ id: 'Class:MainUIManager' }] }),
    impact: async () => ({ impactedCount: 1 }),
    cypher: async () => ({ rows: [] }),
  };

  const out = await runSymbolScenario(mockToolRunner as any, {
    symbol: 'MainUIManager',
    kind: 'component',
    objectives: ['verify context'],
    deepDivePlan: [{ tool: 'query', input: { query: 'MainUIManager' } }],
  });

  assert.equal(out.steps.length, 3);
  assert.ok(out.steps.every((s) => s.durationMs >= 0));
  assert.ok(out.steps.every((s) => s.totalTokensEst >= 0));
  assert.equal(out.assertions.pass, true);
});

test('AssetRef requires context(on) resourceBindings after serializable-class coverage', async () => {
  const noEvidenceRunner = {
    context: async () => ({
      status: 'found',
      hydrationMeta: { requestedMode: 'compact', effectiveMode: 'compact', isComplete: false, needsParityRetry: true },
      resourceBindings: [],
    }),
    query: async () => ({ process_symbols: [] }),
    impact: async () => ({ impactedCount: 0 }),
    cypher: async () => ({ rows: [] }),
  };

  const out = await runSymbolScenario(noEvidenceRunner as any, {
    symbol: 'AssetRef',
    kind: 'serializable-class',
    objectives: ['verify usage evidence'],
    deepDivePlan: [{ tool: 'query', input: { query: 'AssetRef usage' } }],
  });

  assert.equal(out.assertions.pass, false);
  assert.ok(out.assertions.failures.some((f) => f.includes('context(on) must include resourceBindings')));
});

test('AssetRef requires deep-dive evidence even when context(on) has resourceBindings', async () => {
  const noDeepDiveEvidenceRunner = {
    context: async () => ({
      status: 'found',
      hydrationMeta: { requestedMode: 'compact', effectiveMode: 'compact', isComplete: false, needsParityRetry: true },
      resourceBindings: [{ resourcePath: 'Assets/Data/Unlock.asset', resourceType: 'asset' }],
    }),
    query: async () => ({ process_symbols: [] }),
    impact: async () => ({ impactedCount: 0 }),
    cypher: async () => ({ rows: [] }),
  };

  const out = await runSymbolScenario(noDeepDiveEvidenceRunner as any, {
    symbol: 'AssetRef',
    kind: 'serializable-class',
    objectives: ['verify usage evidence'],
    deepDivePlan: [{ tool: 'query', input: { query: 'AssetRef usage' } }],
  });

  assert.equal(out.assertions.pass, false);
  assert.ok(out.assertions.failures.some((f) => f.includes('deep-dive must provide usage/dependency evidence')));
});

test('AssetRef passes when context(on) bindings and deep-dive evidence are both present', async () => {
  const satisfiedRunner = {
    context: async () => ({
      status: 'found',
      hydrationMeta: { requestedMode: 'compact', effectiveMode: 'compact', isComplete: false, needsParityRetry: true },
      resourceBindings: [{ resourcePath: 'Assets/Data/Unlock.asset', resourceType: 'asset' }],
    }),
    query: async () => ({ process_symbols: [{ id: 'Class:Assets/Scripts/UnlockContent.cs:UnlockContent' }] }),
    impact: async () => ({ impactedCount: 0 }),
    cypher: async () => ({ rows: [] }),
  };

  const out = await runSymbolScenario(satisfiedRunner as any, {
    symbol: 'AssetRef',
    kind: 'serializable-class',
    objectives: ['verify usage evidence'],
    deepDivePlan: [{ tool: 'query', input: { query: 'AssetRef usage' } }],
  });

  assert.equal(out.assertions.pass, true);
  assert.equal(out.assertions.failures.length, 0);
});

test('PlayerActor scenario uses context file hint and valid context deep-dive input', async () => {
  const config = await loadE2EConfig('benchmarks/u2-e2e/neonspark-full-u2-e2e.config.json');
  const player = config.symbolScenarios.find((s) => s.symbol === 'PlayerActor');
  assert.equal(player?.contextFileHint, 'Assets/NEON/Code/Game/Actors/PlayerActor/PlayerActor.cs');
  assert.equal(player?.deepDivePlan[0]?.tool, 'context');
  assert.equal(player?.deepDivePlan[0]?.input?.name, 'PlayerActor');
});

test('runSymbolScenario retries context with file hint when response is ambiguous', async () => {
  const hint = 'Assets/NEON/Code/Game/Actors/PlayerActor/PlayerActor.cs';
  const contextCalls: Record<string, unknown>[] = [];
  const runner = {
    context: async (input: Record<string, unknown>) => {
      contextCalls.push(input);
      if (input.unity_resources === 'off') {
        return { status: 'found' };
      }
      if (input.file_path === hint) {
        return {
          status: 'found',
          hydrationMeta: {
            requestedMode: 'compact',
            effectiveMode: 'compact',
            isComplete: false,
            needsParityRetry: true,
          },
          resourceBindings: [
            {
              resourcePath: 'Assets/Prefabs/Player.prefab',
              resourceType: 'prefab',
              resolvedReferences: [{ uid: 'Class:PlayerActor' }],
            },
          ],
        };
      }
      return {
        status: 'ambiguous',
        candidates: [
          {
            uid: 'Class:Assets/NEON/Code/Game/Actors/PlayerActor/PlayerActor.Visual.cs:PlayerActor',
            kind: 'Class',
            filePath: 'Assets/NEON/Code/Game/Actors/PlayerActor/PlayerActor.Visual.cs',
          },
        ],
      };
    },
    query: async () => ({ process_symbols: [] }),
    impact: async () => ({ impactedCount: 0 }),
    cypher: async () => ({ rows: [] }),
  };

  const out = await runSymbolScenario(runner as any, {
    symbol: 'PlayerActor',
    kind: 'partial-component',
    contextFileHint: hint,
    objectives: ['verify fallback'],
    deepDivePlan: [{ tool: 'query', input: { query: 'PlayerActor resource binding' } }],
  });

  assert.equal(contextCalls.length, 3);
  assert.equal(contextCalls[2]?.file_path, hint);
  assert.equal(out.steps[1]?.output?.status, 'found');
  assert.equal(out.assertions.pass, true);
});

test('runSymbolScenario fails when compact context hydrationMeta.needsParityRetry is missing', async () => {
  const runner = {
    context: async (input: Record<string, unknown>) => {
      if (input.unity_resources === 'on') {
        return {
          status: 'found',
          hydrationMeta: { requestedMode: 'compact', effectiveMode: 'compact', isComplete: false },
          resourceBindings: [{ resourcePath: 'Assets/Prefabs/A.prefab', resourceType: 'prefab' }],
        };
      }
      return { status: 'found' };
    },
    query: async () => ({ process_symbols: [{ id: 'Class:A' }] }),
    impact: async () => ({ impactedCount: 1 }),
    cypher: async () => ({ rows: [] }),
  };

  const out = await runSymbolScenario(runner as any, {
    symbol: 'MainUIManager',
    kind: 'component',
    objectives: ['verify hydration contract'],
    deepDivePlan: [{ tool: 'query', input: { query: 'MainUIManager' } }],
  });

  assert.equal(out.assertions.pass, false);
  assert.ok(out.assertions.failures.some((f) => f.includes('hydrationMeta.needsParityRetry')));
});

test('runSymbolScenario fails when query(on) has no unity serialized/resource evidence', async () => {
  const runner = {
    context: async (input: Record<string, unknown>) => {
      if (input.unity_resources === 'on') {
        return {
          status: 'found',
          hydrationMeta: {
            requestedMode: 'compact',
            effectiveMode: 'compact',
            isComplete: false,
            needsParityRetry: true,
          },
          resourceBindings: [{ resourcePath: 'Assets/Prefabs/A.prefab', resourceType: 'prefab' }],
          serializedFields: { scalarFields: [], referenceFields: [] },
        };
      }
      return { status: 'found' };
    },
    query: async () => ({ process_symbols: [{ id: 'Class:A' }] }),
    impact: async () => ({ impactedCount: 1 }),
    cypher: async () => ({ rows: [] }),
  };

  const out = await runSymbolScenario(runner as any, {
    symbol: 'MainUIManager',
    kind: 'component',
    objectives: ['verify query evidence gate'],
    deepDivePlan: [{ tool: 'query', input: { query: 'MainUIManager', unity_resources: 'on' } }],
  });

  assert.equal(out.assertions.pass, false);
  assert.ok(
    out.assertions.failures.some((f) => f.includes('query(on) must include unity serialized/resource evidence')),
  );
});

test('phase5 confidence calibration fails when low confidence process is missing verification_hint', async () => {
  const runner = {
    context: async (input: Record<string, unknown>) => {
      if (input.unity_resources === 'on') {
        return {
          status: 'found',
          hydrationMeta: {
            requestedMode: 'compact',
            effectiveMode: 'compact',
            isComplete: false,
            needsParityRetry: true,
          },
          resourceBindings: [{ resourcePath: 'Assets/Prefabs/A.prefab', resourceType: 'prefab' }],
        };
      }
      return { status: 'found' };
    },
    query: async () => ({
      processes: [{ confidence: 'low', evidence_mode: 'resource_heuristic' }],
      process_symbols: [{ id: 'Class:A', resourceBindings: [{ resourcePath: 'Assets/Prefabs/A.prefab' }] }],
    }),
    impact: async () => ({ impactedCount: 0 }),
    cypher: async () => ({ rows: [] }),
  };

  const out = await runSymbolScenario(runner as any, {
    symbol: 'MainUIManager',
    kind: 'component',
    objectives: ['phase5 low confidence hint gate'],
    deepDivePlan: [{ tool: 'query', input: { query: 'MainUIManager', unity_resources: 'on' } }],
  });

  assert.equal(out.assertions.pass, false);
  assert.ok(out.assertions.failures.some((f) => /verification_hint/i.test(f)));
});

test('phase5 confidence calibration fails when empty process result with unity evidence has no fallback clue', async () => {
  const runner = {
    context: async (input: Record<string, unknown>) => {
      if (input.unity_resources === 'on') {
        return {
          status: 'found',
          hydrationMeta: {
            requestedMode: 'compact',
            effectiveMode: 'compact',
            isComplete: false,
            needsParityRetry: true,
          },
          resourceBindings: [{ resourcePath: 'Assets/Prefabs/A.prefab', resourceType: 'prefab' }],
        };
      }
      return { status: 'found' };
    },
    query: async () => ({
      processes: [],
      process_symbols: [{ id: 'Class:A', resourceBindings: [{ resourcePath: 'Assets/Prefabs/A.prefab' }] }],
    }),
    impact: async () => ({ impactedCount: 0 }),
    cypher: async () => ({ rows: [] }),
  };

  const out = await runSymbolScenario(runner as any, {
    symbol: 'MainUIManager',
    kind: 'component',
    objectives: ['phase5 empty process fallback gate'],
    deepDivePlan: [{ tool: 'query', input: { query: 'MainUIManager', unity_resources: 'on' } }],
  });

  assert.equal(out.assertions.pass, false);
  assert.ok(out.assertions.failures.some((f) => /fallback|empty process/i.test(f)));
});

test('phase5 confidence calibration fails when direct static chain is not high confidence', async () => {
  const runner = {
    context: async (input: Record<string, unknown>) => {
      if (input.unity_resources === 'on') {
        return {
          status: 'found',
          hydrationMeta: {
            requestedMode: 'compact',
            effectiveMode: 'compact',
            isComplete: false,
            needsParityRetry: true,
          },
          resourceBindings: [{ resourcePath: 'Assets/Prefabs/A.prefab', resourceType: 'prefab' }],
        };
      }
      return { status: 'found' };
    },
    query: async () => ({
      processes: [{
        confidence: 'medium',
        evidence_mode: 'direct_step',
        process_subtype: 'static_calls',
        verification_hint: { action: 'none', target: 'none', next_command: 'none' },
      }],
      process_symbols: [{ id: 'Class:A', resourceBindings: [{ resourcePath: 'Assets/Prefabs/A.prefab' }] }],
    }),
    impact: async () => ({ impactedCount: 0 }),
    cypher: async () => ({ rows: [] }),
  };

  const out = await runSymbolScenario(runner as any, {
    symbol: 'MainUIManager',
    kind: 'component',
    objectives: ['phase5 direct static confidence gate'],
    deepDivePlan: [{ tool: 'query', input: { query: 'MainUIManager', unity_resources: 'on' } }],
  });

  assert.equal(out.assertions.pass, false);
  assert.ok(out.assertions.failures.some((f) => /direct.*static.*high/i.test(f)));
});

test('phase5 confidence calibration summary requires baseline provenance fields', async () => {
  assert.throws(() => summarizePhase5ConfidenceCalibration({
    current: {
      totalEvaluated: 4,
      falseNegativeCount: 1,
      falseConfidenceCount: 1,
      lowConfidenceHintCovered: 1,
      lowConfidenceCount: 2,
      fallbackCovered: 2,
    },
    baseline: {
      totalEvaluated: 4,
      falseNegativeCount: 2,
      falseConfidenceCount: 2,
    } as any,
  }), /baseline provenance/i);
});
