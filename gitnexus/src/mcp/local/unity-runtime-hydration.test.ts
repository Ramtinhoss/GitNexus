import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrateUnityForSymbol } from './unity-runtime-hydration.js';

test('hydrateUnityForSymbol(compact) marks needsParityRetry when lightweight bindings remain', async () => {
  const out = await hydrateUnityForSymbol({
    mode: 'compact',
    basePayload: {
      resourceBindings: [
        {
          resourcePath: 'Assets/A.prefab',
          resourceType: 'prefab',
          bindingKind: 'direct',
          componentObjectId: 'summary',
          lightweight: true,
          evidence: { line: 0, lineText: '' },
          serializedFields: { scalarFields: [], referenceFields: [] },
          resolvedReferences: [],
          assetRefPaths: [],
        },
      ],
      serializedFields: { scalarFields: [], referenceFields: [] },
      unityDiagnostics: [],
    },
    deps: {
      executeQuery: async () => [],
      repoPath: '/tmp/repo',
      storagePath: '/tmp/storage',
      indexedCommit: 'abc123',
    },
    symbol: {
      uid: 'Class:Assets/Scripts/A.cs:A',
      name: 'A',
      filePath: 'Assets/Scripts/A.cs',
    },
    runtime: {
      shouldEnableWarmup: () => false,
      resolveLazyConfig: () => ({ maxPendingPathsPerRequest: 10, batchSize: 10, maxHydrationMs: 5000 }),
      hydrateLazyBindings: async () => ({
        resolvedByPath: new Map(),
        timedOut: false,
        elapsedMs: 1,
        diagnostics: [],
      }),
      readOverlayBindings: async () => new Map(),
      upsertOverlayBindings: async () => undefined,
    },
  } as any);

  assert.equal(out.hydrationMeta?.effectiveMode, 'compact');
  assert.equal(out.hydrationMeta?.needsParityRetry, true);
});

test('hydrateUnityForSymbol(parity) sets isComplete=true on parity success', async () => {
  const out = await hydrateUnityForSymbol({
    mode: 'parity',
    basePayload: {
      resourceBindings: [
        {
          resourcePath: 'Assets/A.prefab',
          resourceType: 'prefab',
          bindingKind: 'direct',
          componentObjectId: 'summary',
          lightweight: true,
          evidence: { line: 0, lineText: '' },
          serializedFields: { scalarFields: [], referenceFields: [] },
          resolvedReferences: [],
          assetRefPaths: [],
        },
      ],
      serializedFields: { scalarFields: [], referenceFields: [] },
      unityDiagnostics: [],
    },
    deps: {
      executeQuery: async () => [],
      repoPath: '/tmp/repo',
      storagePath: '/tmp/storage',
      indexedCommit: 'abc123',
    },
    symbol: {
      uid: 'Class:Assets/Scripts/A.cs:A',
      name: 'A',
      filePath: 'Assets/Scripts/A.cs',
    },
    runtime: {
      shouldEnableWarmup: () => false,
      readParityCache: async () => null,
      upsertParityCache: async () => undefined,
      loadParitySeed: async () => null,
      buildScanContext: async () => ({}) as any,
      resolveBindings: async () => ({
        resourceBindings: [
          {
            resourcePath: 'Assets/A.prefab',
            resourceType: 'prefab',
            bindingKind: 'direct',
            componentObjectId: '114',
            lightweight: false,
            evidence: { line: 1, lineText: 'stub' },
            serializedFields: { scalarFields: [], referenceFields: [] },
            resolvedReferences: [],
            assetRefPaths: [],
          },
        ],
        unityDiagnostics: [],
      }),
    },
  } as any);

  assert.equal(out.hydrationMeta?.effectiveMode, 'parity');
  assert.equal(out.hydrationMeta?.isComplete, true);
});
