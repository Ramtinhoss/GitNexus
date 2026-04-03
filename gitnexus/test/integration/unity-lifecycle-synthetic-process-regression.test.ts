import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runPipelineFromRepo } from '../../src/core/ingestion/pipeline.js';

const writeFile = async (filePath: string, content: string): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
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
}
public class ReloadConfig : ScriptableObject
{
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

  it('keeps synthetic runtime-root traces visible and bounded while preserving non-Unity baseline', async () => {
    const unityResult = await runPipelineFromRepo(unityRepo, () => {});
    const nonUnityResult = await runPipelineFromRepo(nonUnityRepo, () => {});

    const syntheticEdges = [...unityResult.graph.iterRelationships()].filter(
      (edge) => edge.type === 'CALLS' && edge.reason === 'unity-lifecycle-synthetic',
    );
    expect(syntheticEdges.length).toBeGreaterThan(0);

    const nonUnitySyntheticEdges = [...nonUnityResult.graph.iterRelationships()].filter(
      (edge) => edge.type === 'CALLS' && edge.reason === 'unity-lifecycle-synthetic',
    );
    expect(nonUnitySyntheticEdges.length).toBe(0);
  }, 180000);
});
