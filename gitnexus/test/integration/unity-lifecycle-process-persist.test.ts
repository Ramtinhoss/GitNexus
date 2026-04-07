import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runPipelineFromRepo } from '../../src/core/ingestion/pipeline.js';

type PersistProbe = {
  processRows: Array<{
    processSubtype?: string;
    runtimeChainConfidence?: string;
    sourceReasons?: string[];
    sourceConfidences?: number[];
  }>;
  stepRows: Array<{
    reason?: string;
    confidence: number;
  }>;
  syntheticEdgeCount: number;
  unityBindingCount: number;
};

const writeFile = async (filePath: string, content: string): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
};

const probePipeline = async (repoPath: string): Promise<PersistProbe> => {
  const result = await runPipelineFromRepo(repoPath, () => {});
  const syntheticEdgeCount = [...result.graph.iterRelationships()].filter(
    (edge) => edge.type === 'CALLS' && edge.reason === 'unity-lifecycle-synthetic',
  ).length;
  const processRows = [...result.graph.iterNodes()]
    .filter((node) => node.label === 'Process')
    .map((node) => ({
      processSubtype: typeof node.properties.processSubtype === 'string' ? node.properties.processSubtype : undefined,
      runtimeChainConfidence: typeof node.properties.runtimeChainConfidence === 'string'
        ? node.properties.runtimeChainConfidence
        : undefined,
      sourceReasons: Array.isArray(node.properties.sourceReasons) ? node.properties.sourceReasons : undefined,
      sourceConfidences: Array.isArray(node.properties.sourceConfidences) ? node.properties.sourceConfidences : undefined,
    }));
  const stepRows = [...result.graph.iterRelationships()]
    .filter((edge) => edge.type === 'STEP_IN_PROCESS')
    .map((edge) => ({
      reason: typeof edge.reason === 'string' ? edge.reason : undefined,
      confidence: edge.confidence,
    }));

  return {
    processRows,
    stepRows,
    syntheticEdgeCount,
    unityBindingCount: result.unityResult?.bindingCount ?? 0,
  };
};

describe('unity lifecycle process persistence integration', () => {
  let tempRoot = '';
  let unityRepo = '';
  let nonUnityRepo = '';

  beforeAll(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-u4-process-persist-'));
    unityRepo = path.join(tempRoot, 'unity-fixture');
    nonUnityRepo = path.join(tempRoot, 'non-unity-fixture');

    await writeFile(
      path.join(unityRepo, 'Assets/Scripts/GunGraphMB.cs'),
      `using UnityEngine;
public class GunGraphMB : MonoBehaviour
{
  void Awake() {
    OnEnable();
  }

  void OnEnable() {
    Tick();
  }

  void Tick() {}
}
`,
    );

    await writeFile(
      path.join(nonUnityRepo, 'src/server.ts'),
      `export function bootstrap() {
  return "ok";
}
export function processRequest() {
  return bootstrap();
}
`,
    );
  }, 120000);

  afterAll(async () => {
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('auto-enables lifecycle metadata persistence when unity resource-binding flow is active', async () => {
    const unity = await probePipeline(unityRepo);

    expect(unity.syntheticEdgeCount).toBeGreaterThan(0);
    expect(unity.processRows.length).toBeGreaterThan(0);
    // Predicate rule: Unity resource-binding flow is considered active for repos with Unity scripts under Assets/*.cs.
    expect(unity.processRows.some((row) => row.processSubtype === 'unity_lifecycle')).toBe(true);
    expect(unity.processRows.some((row) => row.runtimeChainConfidence === 'medium')).toBe(true);
    expect(unity.stepRows.some((row) => row.reason && row.reason !== 'trace-detection')).toBe(true);
    expect(unity.stepRows.some((row) => row.confidence !== 1.0)).toBe(true);
  }, 180000);

  it('does not emit unity lifecycle metadata for non-unity repositories', async () => {
    const nonUnity = await probePipeline(nonUnityRepo);

    expect(nonUnity.syntheticEdgeCount).toBe(0);
    expect(nonUnity.unityBindingCount).toBe(0);
    expect(nonUnity.processRows.some((row) => row.processSubtype === 'unity_lifecycle')).toBe(false);
    expect(nonUnity.stepRows.some((row) => row.reason === 'unity-lifecycle-synthetic')).toBe(false);
    expect(nonUnity.stepRows.some((row) => row.confidence !== 1.0)).toBe(false);
  }, 180000);
});
