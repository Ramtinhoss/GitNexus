import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runPipelineFromRepo } from '../../src/core/ingestion/pipeline.js';

const MAX_SYNTHETIC_EDGES = 64;

type PipelineProbe = {
  syntheticEdgeCount: number;
  runtimeRootProcessCount: number;
  totalProcesses: number;
};

const writeFile = async (filePath: string, content: string): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
};

const probePipeline = async (repoPath: string, flag: 'on' | 'off'): Promise<PipelineProbe> => {
  const previous = process.env.GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS;
  process.env.GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS = flag;
  try {
    const result = await runPipelineFromRepo(repoPath, () => {});
    const syntheticEdgeCount = [...result.graph.iterRelationships()].filter(
      (edge) =>
        edge.type === 'CALLS' &&
        (edge.reason === 'unity-lifecycle-synthetic' || edge.reason === 'unity-runtime-loader-synthetic'),
    ).length;
    const runtimeRootProcessCount =
      result.processResult?.processes.filter((processNode) =>
        processNode.trace.some((nodeId) => nodeId.includes('unity-runtime-root')),
      ).length ?? 0;
    return {
      syntheticEdgeCount,
      runtimeRootProcessCount,
      totalProcesses: result.processResult?.stats.totalProcesses ?? 0,
    };
  } finally {
    if (previous === undefined) {
      delete process.env.GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS;
    } else {
      process.env.GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS = previous;
    }
  }
};

describe('unity lifecycle synthetic calls pipeline integration', () => {
  let tempRoot = '';
  let unityRepo = '';
  let nonUnityRepo = '';
  let expandedUnityRepo = '';

  beforeAll(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-u3-lifecycle-'));
    unityRepo = path.join(tempRoot, 'unity-fixture');
    nonUnityRepo = path.join(tempRoot, 'non-unity-fixture');
    expandedUnityRepo = path.join(tempRoot, 'unity-fixture-expanded');

    await writeFile(
      path.join(unityRepo, 'Assets/Scripts/GunGraphMB.cs'),
      `using UnityEngine;
public class GunGraphMB : MonoBehaviour
{
  void Awake() {}
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
      path.join(nonUnityRepo, 'src/index.ts'),
      `export function startApp() {
  return "ok";
}
`,
    );

    await writeFile(
      path.join(expandedUnityRepo, 'Assets/Scripts/ExpandedGunGraph.cs'),
      `using UnityEngine;
public class ExpandedGunGraph : MonoBehaviour
{
  void Awake() {}
  void OnEnable() {}
  void Start() {}
  void Update() {}
  void Equip() {}
  void EquipWithEvent() {}
  void RegisterGraphEvents() {}
  void RegisterEvents() {}
  void StartRoutineWithEvents() {}
}
public class ExpandedReloadConfig : ScriptableObject
{
  void OnEnable() {}
  int GetValue() { return 1; }
  bool CheckReload() { return true; }
  void ReloadRoutine() {}
}
`,
    );
  }, 120000);

  afterAll(async () => {
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('pipeline injects synthetic lifecycle edges before process detection', async () => {
    const flagOffResult = await probePipeline(unityRepo, 'off');
    const flagOnResult = await probePipeline(unityRepo, 'on');
    const nonUnityFlagOnResult = await probePipeline(nonUnityRepo, 'on');
    const expandedFlagOnResult = await probePipeline(expandedUnityRepo, 'on');

    expect(flagOffResult.syntheticEdgeCount).toBe(0);
    expect(flagOnResult.syntheticEdgeCount).toBeGreaterThan(0);
    expect(flagOnResult.runtimeRootProcessCount).toBeGreaterThan(0);
    expect(nonUnityFlagOnResult.syntheticEdgeCount).toBe(0);
    expect(expandedFlagOnResult.syntheticEdgeCount).toBeLessThanOrEqual(MAX_SYNTHETIC_EDGES);
    expect(flagOnResult.totalProcesses).toBeGreaterThanOrEqual(flagOffResult.totalProcesses);
  }, 180000);
});
