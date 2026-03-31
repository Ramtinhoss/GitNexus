import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runPipelineFromRepo } from '../../src/core/ingestion/pipeline.js';

type FlagState = 'on' | 'off';

type PersistProbe = {
  totalProcesses: number;
  runtimeRootProcessCount: number;
  processNodes: Array<Record<string, unknown>>;
  stepRows: Array<{ sourceId: string; targetId: string; step: number; reason: unknown; confidence: unknown }>;
};

const writeFile = async (filePath: string, content: string): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
};

const withLifecycleFlags = async <T>(
  syntheticCalls: FlagState,
  persistLifecycleProcess: FlagState,
  run: () => Promise<T>,
): Promise<T> => {
  const prevSynthetic = process.env.GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS;
  const prevPersist = process.env.GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST;
  process.env.GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS = syntheticCalls;
  process.env.GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST = persistLifecycleProcess;
  try {
    return await run();
  } finally {
    if (prevSynthetic === undefined) {
      delete process.env.GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS;
    } else {
      process.env.GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS = prevSynthetic;
    }
    if (prevPersist === undefined) {
      delete process.env.GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST;
    } else {
      process.env.GITNEXUS_UNITY_LIFECYCLE_PROCESS_PERSIST = prevPersist;
    }
  }
};

const probePipeline = async (
  repoPath: string,
  syntheticCalls: FlagState,
  persistLifecycleProcess: FlagState,
): Promise<PersistProbe> =>
  withLifecycleFlags(syntheticCalls, persistLifecycleProcess, async () => {
    const result = await runPipelineFromRepo(repoPath, () => {});
    const processNodes = [...result.graph.iterNodes()]
      .filter((node) => node.label === 'Process')
      .map((node) => node.properties as Record<string, unknown>);
    const stepRows = [...result.graph.iterRelationships()]
      .filter((edge) => edge.type === 'STEP_IN_PROCESS')
      .map((edge) => ({
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        step: edge.step,
        reason: edge.reason,
        confidence: edge.confidence,
      }));

    return {
      totalProcesses: result.processResult?.stats.totalProcesses ?? 0,
      runtimeRootProcessCount:
        result.processResult?.processes.filter((processNode) => processNode.entryPointId.includes('unity-runtime-root'))
          .length ?? 0,
      processNodes,
      stepRows,
    };
  });

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
  void Awake() {}
  void OnEnable() {}
  void RegisterEvents() {}
  void StartRoutineWithEvents() {}
}
public class ReloadConfig : ScriptableObject
{
  void OnEnable() {}
  int GetValue() { return 1; }
  bool CheckReload() { return true; }
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

  it('persists lifecycle process evidence attributes', async () => {
    const flagOff = await probePipeline(unityRepo, 'on', 'off');
    const flagOn = await probePipeline(unityRepo, 'on', 'on');
    const nonUnity = await probePipeline(nonUnityRepo, 'on', 'on');

    expect(flagOff.runtimeRootProcessCount).toBeGreaterThan(0);
    expect(flagOff.processNodes.some((processNode) => processNode.processSubtype === 'unity_lifecycle')).toBe(false);
    expect(flagOff.processNodes.some((processNode) => processNode.runtimeChainConfidence !== undefined)).toBe(false);
    expect(flagOff.stepRows.some((stepRow) => stepRow.reason === 'unity-runtime-loader-synthetic')).toBe(false);

    expect(flagOn.processNodes.some((processNode) => processNode.processSubtype === 'unity_lifecycle')).toBe(true);
    expect(flagOn.processNodes.some((processNode) => processNode.runtimeChainConfidence === 'medium')).toBe(true);
    expect(flagOn.stepRows.some((stepRow) => stepRow.reason === 'unity-runtime-loader-synthetic')).toBe(true);
    expect(
      flagOn.stepRows.some(
        (stepRow) => typeof stepRow.confidence === 'number' && Number(stepRow.confidence) < 1,
      ),
    ).toBe(true);

    expect(flagOff.totalProcesses).toBe(flagOn.totalProcesses);
    expect(nonUnity.processNodes.some((processNode) => processNode.processSubtype === 'unity_lifecycle')).toBe(false);
    expect(nonUnity.stepRows.some((stepRow) => stepRow.reason === 'unity-runtime-loader-synthetic')).toBe(false);
  }, 180000);

  it('does not persist lifecycle subtype when flag is off', async () => {
    const flagOff = await probePipeline(unityRepo, 'on', 'off');
    expect(flagOff.processNodes.some((processNode) => processNode.processSubtype === 'unity_lifecycle')).toBe(false);
    expect(flagOff.processNodes.some((processNode) => processNode.runtimeChainConfidence !== undefined)).toBe(false);
  }, 180000);
});
