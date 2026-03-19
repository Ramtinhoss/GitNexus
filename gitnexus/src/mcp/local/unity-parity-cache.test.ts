import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readUnityParityCache, upsertUnityParityCache } from './unity-parity-cache.js';

test('unity parity cache reads and writes by symbol key', async () => {
  const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-unity-parity-'));
  try {
    const before = await readUnityParityCache(storagePath, 'abc123', 'Class:Foo');
    assert.equal(before, null);

    await upsertUnityParityCache(storagePath, 'abc123', 'Class:Foo', {
      resourceBindings: [{
        resourcePath: 'Assets/A.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: '100',
        serializedFields: { scalarFields: [], referenceFields: [] },
        resolvedReferences: [],
        evidence: { line: 1, lineText: 'm_Script: ...' },
      } as any],
      serializedFields: { scalarFields: [], referenceFields: [] },
      unityDiagnostics: [],
    });

    const after = await readUnityParityCache(storagePath, 'abc123', 'Class:Foo');
    assert.equal(after?.resourceBindings.length, 1);
    assert.equal(after?.resourceBindings[0]?.componentObjectId, '100');
  } finally {
    await fs.rm(storagePath, { recursive: true, force: true });
  }
});

test('unity parity cache invalidates entries on indexed commit change', async () => {
  const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-unity-parity-'));
  try {
    await upsertUnityParityCache(storagePath, 'old-commit', 'Class:Foo', {
      resourceBindings: [{
        resourcePath: 'Assets/A.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: '100',
        serializedFields: { scalarFields: [], referenceFields: [] },
        resolvedReferences: [],
        evidence: { line: 1, lineText: 'm_Script: ...' },
      } as any],
      serializedFields: { scalarFields: [], referenceFields: [] },
      unityDiagnostics: [],
    });

    const stale = await readUnityParityCache(storagePath, 'new-commit', 'Class:Foo');
    assert.equal(stale, null);
  } finally {
    await fs.rm(storagePath, { recursive: true, force: true });
  }
});

test('unity parity cache persists entries in shard files and supports atomic replace', async () => {
  const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-unity-parity-'));
  try {
    await upsertUnityParityCache(storagePath, 'abc123', 'Class:Foo', {
      resourceBindings: [{
        resourcePath: 'Assets/A.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: '101',
        serializedFields: { scalarFields: [], referenceFields: [] },
        resolvedReferences: [],
        evidence: { line: 1, lineText: 'm_Script: ...' },
      } as any],
      serializedFields: { scalarFields: [], referenceFields: [] },
      unityDiagnostics: [],
    });
    await upsertUnityParityCache(storagePath, 'abc123', 'Class:Bar', {
      resourceBindings: [{
        resourcePath: 'Assets/B.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: '102',
        serializedFields: { scalarFields: [], referenceFields: [] },
        resolvedReferences: [],
        evidence: { line: 1, lineText: 'm_Script: ...' },
      } as any],
      serializedFields: { scalarFields: [], referenceFields: [] },
      unityDiagnostics: [],
    });

    const shardsDir = path.join(storagePath, 'unity-parity-cache');
    const shards = await fs.readdir(shardsDir);
    assert.ok(shards.length > 0);
    assert.ok(shards.every((name) => name.endsWith('.json')));
  } finally {
    await fs.rm(storagePath, { recursive: true, force: true });
  }
});

test('unity parity cache evicts oldest entries when max entries exceeded', async () => {
  const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-unity-parity-'));
  try {
    const shard = (key: string): string => createHash('sha1').update(key).digest('hex').slice(0, 2);
    const firstKey = 'Class:A';
    let secondKey = '';
    for (let i = 0; i < 4096; i += 1) {
      const candidate = `Class:B:${i}`;
      if (shard(candidate) === shard(firstKey)) {
        secondKey = candidate;
        break;
      }
    }
    assert.notEqual(secondKey, '');

    await upsertUnityParityCache(storagePath, 'abc123', firstKey, {
      resourceBindings: [{
        resourcePath: 'Assets/A.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: '201',
        serializedFields: { scalarFields: [], referenceFields: [] },
        resolvedReferences: [],
        evidence: { line: 1, lineText: 'm_Script: ...' },
      } as any],
      serializedFields: { scalarFields: [], referenceFields: [] },
      unityDiagnostics: [],
    }, { maxEntries: 1 });

    await upsertUnityParityCache(storagePath, 'abc123', secondKey, {
      resourceBindings: [{
        resourcePath: 'Assets/B.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: '202',
        serializedFields: { scalarFields: [], referenceFields: [] },
        resolvedReferences: [],
        evidence: { line: 1, lineText: 'm_Script: ...' },
      } as any],
      serializedFields: { scalarFields: [], referenceFields: [] },
      unityDiagnostics: [],
    }, { maxEntries: 1 });

    const evicted = await readUnityParityCache(storagePath, 'abc123', firstKey);
    const retained = await readUnityParityCache(storagePath, 'abc123', secondKey);
    assert.equal(evicted, null);
    assert.ok(retained);
  } finally {
    await fs.rm(storagePath, { recursive: true, force: true });
  }
});
