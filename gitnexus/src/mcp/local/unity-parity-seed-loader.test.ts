import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { loadUnityParitySeed } from './unity-parity-seed-loader.js';

test('loadUnityParitySeed returns null on missing file and parsed object on valid file', async () => {
  const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-seed-loader-'));
  try {
    const missing = await loadUnityParitySeed(storagePath);
    assert.equal(missing, null);

    await fs.writeFile(
      path.join(storagePath, 'unity-parity-seed.json'),
      JSON.stringify({
        version: 1,
        symbolToScriptPath: { DoorObj: 'Assets/Code/DoorObj.cs' },
        scriptPathToGuid: { 'Assets/Code/DoorObj.cs': 'abc123abc123abc123abc123abc123ab' },
        guidToResourcePaths: { abc123abc123abc123abc123abc123ab: ['Assets/Prefabs/Door.prefab'] },
      }),
      'utf-8',
    );

    const loaded = await loadUnityParitySeed(storagePath);
    assert.equal(loaded?.version, 1);
    assert.equal(loaded?.symbolToScriptPath.DoorObj, 'Assets/Code/DoorObj.cs');
  } finally {
    await fs.rm(storagePath, { recursive: true, force: true });
  }
});
