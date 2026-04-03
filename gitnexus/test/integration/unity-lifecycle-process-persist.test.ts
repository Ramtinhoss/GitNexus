import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runPipelineFromRepo } from '../../src/core/ingestion/pipeline.js';

type PersistProbe = {
  totalProcesses: number;
  syntheticEdgeCount: number;
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
  return {
    totalProcesses: result.processResult?.stats.totalProcesses ?? 0,
    syntheticEdgeCount,
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
  void Awake() {}
  void OnEnable() {}
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
    const unity = await probePipeline(unityRepo);
    const nonUnity = await probePipeline(nonUnityRepo);

    expect(unity.syntheticEdgeCount).toBeGreaterThan(0);
    expect(nonUnity.syntheticEdgeCount).toBe(0);
  }, 180000);
});
