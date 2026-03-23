import { describe, expect, it } from 'vitest';
import {
  filterBm25ResultsByScopePreset,
  rankExpandedSymbolsForQuery,
} from '../../src/mcp/local/local-backend.js';

describe('local backend query noise controls', () => {
  it('unity-gameplay scope preset excludes common plugin-heavy Unity paths', () => {
    const filtered = filterBm25ResultsByScopePreset(
      [
        { filePath: 'Assets/NEON/Scripts/OnlineMatchRoom.cs', score: 10 },
        { filePath: 'Assets/Plugins/Crash/CrashReporter.cs', score: 9 },
        { filePath: 'Packages/com.fmod/Runtime/FmodSystem.cs', score: 8 },
        { filePath: 'Library/PackageCache/com.unity.ui@1.0.0/UI.cs', score: 7 },
      ],
      'unity-gameplay',
    );

    expect(filtered.map((row) => row.filePath)).toEqual([
      'Assets/NEON/Scripts/OnlineMatchRoom.cs',
    ]);
  });

  it('unknown scope preset keeps original BM25 candidate list', () => {
    const input = [
      { filePath: 'Assets/NEON/Scripts/A.cs', score: 5 },
      { filePath: 'Assets/Plugins/B.cs', score: 4 },
    ];
    const filtered = filterBm25ResultsByScopePreset(input, 'not-a-preset');
    expect(filtered).toEqual(input);
  });

  it('query-aware expansion ranks gameplay symbols ahead of plugin symbols', () => {
    const ranked = rankExpandedSymbolsForQuery(
      [
        {
          id: 'Class:Assets/Plugins/Crash/CrashReporter.cs:CrashReporter',
          name: 'CrashReporter',
          type: 'Class',
          filePath: 'Assets/Plugins/Crash/CrashReporter.cs',
          startLine: 1,
          endLine: 20,
        },
        {
          id: 'Class:Assets/NEON/Scripts/OnlineMatchRoom.cs:OnlineMatchRoomController',
          name: 'OnlineMatchRoomController',
          type: 'Class',
          filePath: 'Assets/NEON/Scripts/OnlineMatchRoom.cs',
          startLine: 10,
          endLine: 120,
        },
      ],
      'legacy OnlineMatchRoom.cs pattern',
      2,
      'unity-all',
    );

    expect(ranked[0]?.name).toBe('OnlineMatchRoomController');
    expect(ranked[1]?.name).toBe('CrashReporter');
  });
});
