import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runPipelineFromRepo } from '../../src/core/ingestion/pipeline.js';

const writeFile = async (filePath: string, content: string): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
};

const withLifecycleFlag = async <T>(value: 'on' | 'off', run: () => Promise<T>): Promise<T> => {
  const previous = process.env.GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS;
  process.env.GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) {
      delete process.env.GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS;
    } else {
      process.env.GITNEXUS_UNITY_LIFECYCLE_SYNTHETIC_CALLS = previous;
    }
  }
};

describe('unity lifecycle synthetic process regression', () => {
  let tempRoot = '';
  let unityRepo = '';
  let nonUnityRepo = '';

  beforeAll(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-u3-proc-reg-'));
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

  it('keeps synthetic runtime-root traces visible and bounded while preserving non-Unity baseline', async () => {
    const unityResult = await withLifecycleFlag('on', async () => runPipelineFromRepo(unityRepo, () => {}));
    const nonUnityBaseline = await withLifecycleFlag('off', async () => runPipelineFromRepo(nonUnityRepo, () => {}));
    const nonUnityWithFlag = await withLifecycleFlag('on', async () => runPipelineFromRepo(nonUnityRepo, () => {}));

    const runtimeRootProcesses = unityResult.processResult?.processes.filter((processNode) =>
      processNode.entryPointId.includes('unity-runtime-root'),
    ) ?? [];

    expect(unityResult.processResult?.processes.some((processNode) =>
      processNode.trace.some((nodeId) => nodeId.includes('unity-runtime-root')),
    )).toBe(true);
    expect(unityResult.processResult?.processes.some((processNode) => processNode.stepCount >= 3)).toBe(true);
    expect(runtimeRootProcesses.length).toBeGreaterThanOrEqual(2);
    expect(runtimeRootProcesses.some((processNode) => processNode.trace.some((nodeId) => nodeId.includes('RegisterEvents')))).toBe(true);
    expect(runtimeRootProcesses.some((processNode) => processNode.trace.some((nodeId) => nodeId.includes('GetValue')))).toBe(true);
    expect(nonUnityWithFlag.processResult?.stats.totalProcesses).toBe(nonUnityBaseline.processResult?.stats.totalProcesses);
  }, 180000);
});
