import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { __resetUnityParitySeedLoaderCacheForTest, loadUnityParitySeed } from './unity-parity-seed-loader.js';

const baseSeed = {
  version: 1 as const,
  symbolToScriptPath: { DoorObj: 'Assets/Code/DoorObj.cs' },
  scriptPathToGuid: { 'Assets/Code/DoorObj.cs': 'abc123abc123abc123abc123abc123ab' },
  guidToResourcePaths: { abc123abc123abc123abc123abc123ab: ['Assets/Prefabs/Door.prefab'] },
};

async function writeSeed(storagePath: string, symbol = 'DoorObj'): Promise<void> {
  await fs.writeFile(
    path.join(storagePath, 'unity-parity-seed.json'),
    JSON.stringify({
      ...baseSeed,
      symbolToScriptPath: { [symbol]: `Assets/Code/${symbol}.cs` },
      scriptPathToGuid: { [`Assets/Code/${symbol}.cs`]: 'abc123abc123abc123abc123abc123ab' },
    }),
    'utf-8',
  );
}

test('loadUnityParitySeed returns null on missing file and parsed object on valid file', async () => {
  const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-seed-loader-'));
  try {
    const missing = await loadUnityParitySeed(storagePath);
    assert.equal(missing, null);

    await writeSeed(storagePath, 'DoorObj');

    const loaded = await loadUnityParitySeed(storagePath);
    assert.equal(loaded?.version, 1);
    assert.equal(loaded?.symbolToScriptPath.DoorObj, 'Assets/Code/DoorObj.cs');
  } finally {
    __resetUnityParitySeedLoaderCacheForTest();
    await fs.rm(storagePath, { recursive: true, force: true });
  }
});

test('loadUnityParitySeed deduplicates concurrent requests for same storage key', async (t) => {
  const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-seed-loader-'));
  try {
    await writeSeed(storagePath, 'ConcurrentSymbol');
    const readFileOriginal = fs.readFile.bind(fs);
    let readFileCalls = 0;
    t.mock.method(fs, 'readFile', async (...args: Parameters<typeof fs.readFile>) => {
      readFileCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return readFileOriginal(...args);
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, () => loadUnityParitySeed(storagePath)),
    );
    assert.equal(results.every((row) => row?.symbolToScriptPath.ConcurrentSymbol), true);
    assert.equal(readFileCalls, 1);
  } finally {
    __resetUnityParitySeedLoaderCacheForTest();
    await fs.rm(storagePath, { recursive: true, force: true });
  }
});

test('loadUnityParitySeed evicts idle cache entry after ttl', async (t) => {
  const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-seed-loader-'));
  const idleEnvKey = 'GITNEXUS_UNITY_PARITY_SEED_CACHE_IDLE_MS';
  const previousIdle = process.env[idleEnvKey];
  process.env[idleEnvKey] = '15';

  try {
    await writeSeed(storagePath, 'IdleSymbol');
    const readFileOriginal = fs.readFile.bind(fs);
    let readFileCalls = 0;
    t.mock.method(fs, 'readFile', async (...args: Parameters<typeof fs.readFile>) => {
      readFileCalls += 1;
      return readFileOriginal(...args);
    });

    await loadUnityParitySeed(storagePath);
    await loadUnityParitySeed(storagePath);
    assert.equal(readFileCalls, 1);

    await new Promise((resolve) => setTimeout(resolve, 30));
    await loadUnityParitySeed(storagePath);
    assert.equal(readFileCalls, 2);
  } finally {
    __resetUnityParitySeedLoaderCacheForTest();
    if (previousIdle === undefined) {
      delete process.env[idleEnvKey];
    } else {
      process.env[idleEnvKey] = previousIdle;
    }
    await fs.rm(storagePath, { recursive: true, force: true });
  }
});

test('loadUnityParitySeed invalidates cache when seed mtime changes', async (t) => {
  const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-seed-loader-'));
  const seedPath = path.join(storagePath, 'unity-parity-seed.json');
  try {
    await writeSeed(storagePath, 'VersionA');
    const readFileOriginal = fs.readFile.bind(fs);
    let readFileCalls = 0;
    t.mock.method(fs, 'readFile', async (...args: Parameters<typeof fs.readFile>) => {
      readFileCalls += 1;
      return readFileOriginal(...args);
    });

    const first = await loadUnityParitySeed(storagePath);
    const second = await loadUnityParitySeed(storagePath);
    assert.equal(first?.symbolToScriptPath.VersionA, 'Assets/Code/VersionA.cs');
    assert.equal(second?.symbolToScriptPath.VersionA, 'Assets/Code/VersionA.cs');
    assert.equal(readFileCalls, 1);

    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeSeed(storagePath, 'VersionB');
    await fs.utimes(seedPath, new Date(), new Date());

    const third = await loadUnityParitySeed(storagePath);
    assert.equal(third?.symbolToScriptPath.VersionB, 'Assets/Code/VersionB.cs');
    assert.equal(readFileCalls, 2);
  } finally {
    __resetUnityParitySeedLoaderCacheForTest();
    await fs.rm(storagePath, { recursive: true, force: true });
  }
});
