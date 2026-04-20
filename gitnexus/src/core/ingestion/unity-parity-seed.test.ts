import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUnityParitySeed } from './unity-parity-seed.js';

test('buildUnityParitySeed extracts canonical script/guid/resource indexes', () => {
  const seed = buildUnityParitySeed({
    symbolToScriptPaths: new Map([
      ['DoorObj', ['Assets/Code/DoorObj.generated.cs', 'Assets/Code/DoorObj.cs']],
    ]),
    symbolToCanonicalScriptPath: new Map([
      ['DoorObj', 'Assets/Code/DoorObj.cs'],
    ]),
    symbolToScriptPath: new Map([
      ['DoorObj', 'Assets/Code/DoorObj.cs'],
    ]),
    scriptPathToGuid: new Map([
      ['Assets/Code/DoorObj.cs', 'abc123abc123abc123abc123abc123ab'],
    ]),
    guidToResourceHits: new Map([
      ['abc123abc123abc123abc123abc123ab', [
        { resourcePath: 'Assets/Prefabs/Door.prefab', resourceType: 'prefab', line: 12, lineText: 'guid: abc123' },
      ]],
    ]),
    assetGuidToPath: new Map([
      ['asset0000000000000000000000000001', 'Assets/Config/Ref.asset'],
    ]),
    serializableSymbols: new Set(),
    hostFieldTypeHints: new Map(),
    resourceDocCache: new Map(),
  } as any);

  assert.equal(seed.version, 1);
  assert.equal(seed.symbolToScriptPath.DoorObj, 'Assets/Code/DoorObj.cs');
  assert.equal(seed.scriptPathToGuid['Assets/Code/DoorObj.cs'], 'abc123abc123abc123abc123abc123ab');
  assert.deepEqual(seed.guidToResourcePaths['abc123abc123abc123abc123abc123ab'], ['Assets/Prefabs/Door.prefab']);
  assert.equal(seed.assetGuidToPath?.asset0000000000000000000000000001, 'Assets/Config/Ref.asset');
});
