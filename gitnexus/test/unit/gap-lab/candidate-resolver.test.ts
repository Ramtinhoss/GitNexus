import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { LexicalMatch } from '../../../src/gap-lab/exhaustive-scanner.js';
import { resolveLexicalCandidates } from '../../../src/gap-lab/candidate-resolver.js';
import { verifyMissingEdges } from '../../../src/gap-lab/missing-edge-verifier.js';

const baseMatch = (overrides: Partial<LexicalMatch>): LexicalMatch => ({
  gapSubtype: 'mirror_synclist_callback',
  patternId: 'event_delegate.mirror_synclist_callback.v1',
  file: 'Assets/NEON/Code/NetworkCode/NetPlayer.PlayerState.cs',
  line: 100,
  text: 'PlayerStates.Callback += OnPlayerStateChange',
  ...overrides,
});

const tempDirs: string[] = [];

async function createRepo(files: Array<{ path: string; content: string }>): Promise<string> {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'gap-lab-syncvar-'));
  tempDirs.push(repoPath);
  for (const file of files) {
    const abs = path.join(repoPath, file.path);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, file.content, 'utf-8');
  }
  return repoPath;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const repoPath = tempDirs.pop();
    if (!repoPath) continue;
    await fs.rm(repoPath, { recursive: true, force: true });
  }
});

describe('gap-lab candidate resolver', () => {
  it('resolves handler symbol from callback and syncvar patterns', async () => {
    const matches: LexicalMatch[] = [
      baseMatch({}),
      baseMatch({
        gapSubtype: 'mirror_syncvar_hook',
        patternId: 'event_delegate.mirror_syncvar_hook.v1',
        text: '[SyncVar(hook = nameof(OnDeadChange))] public bool IsDead;',
      }),
    ];

    const out = await resolveLexicalCandidates({ matches });
    expect(out.length).toBe(2);
    expect(out.every((row) => row.status === 'resolved')).toBe(true);
    expect(out.map((row) => row.handlerSymbol)).toEqual(['OnPlayerStateChange', 'OnDeadChange']);
  });

  it('marks unresolved/ambiguous handlers with explicit reason_code', async () => {
    const matches: LexicalMatch[] = [
      baseMatch({ text: 'PlayerStates.Callback += handlers[index]' }),
      baseMatch({ text: 'PlayerStates.Callback +=' }),
    ];

    const out = await resolveLexicalCandidates({ matches });
    expect(out.length).toBe(2);
    expect(out.every((row) => row.status === 'rejected')).toBe(true);
    expect(out.every((row) => row.reasonCode === 'handler_symbol_unresolved')).toBe(true);
  });

  it('recovers syncvar field-write source and hook handler anchors from user code', async () => {
    const repoPath = await createRepo([
      {
        path: 'Assets/NEON/Code/NetworkCode/NeonPlayer/NetPlayer.Dead.cs',
        content: `using Mirror;

public partial class NetPlayer : NetworkBehaviour
{
    [SyncVar(hook = nameof(OnDeadChange))]
    public bool IsDead;

    public void GameOverInDead()
    {
        IsDead = true;
    }

    private void OnDeadChange(bool oldValue, bool newValue)
    {
    }
}
`,
      },
    ]);

    const out = await resolveLexicalCandidates({
      repoPath,
      matches: [
        baseMatch({
          gapSubtype: 'mirror_syncvar_hook',
          patternId: 'event_delegate.mirror_syncvar_hook.v1',
          file: 'Assets/NEON/Code/NetworkCode/NeonPlayer/NetPlayer.Dead.cs',
          line: 4,
          text: '[SyncVar(hook = nameof(OnDeadChange))]',
        }),
      ],
    });

    expect(out).toHaveLength(1);
    expect(out[0].status).toBe('resolved');
    expect(out[0].fieldName).toBe('IsDead');
    expect(out[0].hostClassName).toBe('NetPlayer');
    expect(out[0].sourceAnchor?.symbol).toBe('NetPlayer.GameOverInDead');
    expect(out[0].targetAnchor?.symbol).toBe('NetPlayer.OnDeadChange');
    expect(out[0].sourceAnchorCandidates).toHaveLength(1);
  });

  it('recovers typed host-instance assignments and backlogs ambiguous or missing source anchors', async () => {
    const repoPath = await createRepo([
      {
        path: 'Assets/NEON/Code/NetworkCode/NeonPlayer/NetPlayer.EnterRoom.cs',
        content: `using Mirror;

public partial class NetPlayer : NetworkBehaviour
{
    [SyncVar(hook = nameof(ChangeRoomGrid))]
    public int roomGrid;

    private void ChangeRoomGrid(int oldValue, int newValue)
    {
    }
}
`,
      },
      {
        path: 'Assets/NEON/Code/NetworkCode/NeonMirror/Battle/MirrorBattleMgr.cs',
        content: `public class MirrorBattleMgr
{
    public void CreateNetPlayer()
    {
        NetPlayer np = null;
        np.roomGrid = 1;
    }

    public void RefreshRoomGrid(NetPlayer np)
    {
        np.roomGrid = 2;
    }
}
`,
      },
    ]);

    const resolved = await resolveLexicalCandidates({
      repoPath,
      matches: [
        baseMatch({
          gapSubtype: 'mirror_syncvar_hook',
          patternId: 'event_delegate.mirror_syncvar_hook.v1',
          file: 'Assets/NEON/Code/NetworkCode/NeonPlayer/NetPlayer.EnterRoom.cs',
          line: 4,
          text: '[SyncVar(hook = nameof(ChangeRoomGrid))]',
        }),
      ],
    });
    expect(resolved[0].sourceAnchor).toBeUndefined();
    expect(resolved[0].sourceAnchorCandidates).toHaveLength(2);

    const verified = await verifyMissingEdges({ candidates: resolved });
    expect(verified[0].status).toBe('promotion_backlog');
    expect(verified[0].reasonCode).toBe('ambiguous_source_anchor');
  });
});

describe('gap-lab missing-edge verifier', () => {
  it('keeps missing-edge candidates and rejects already-present edges', async () => {
    const resolved = await resolveLexicalCandidates({
      matches: [
        baseMatch({ text: 'PlayerStates.Callback += OnPlayerStateChange' }),
        baseMatch({ text: 'PlayerStates.Callback += OnGunGraphVariableChange' }),
      ],
    });

    const verified = await verifyMissingEdges({
      candidates: resolved,
      edgeLookup: async ({ handlerSymbol }) => handlerSymbol === 'OnGunGraphVariableChange',
    });

    const kept = verified.find((row) => row.handlerSymbol === 'OnPlayerStateChange');
    const rejected = verified.find((row) => row.handlerSymbol === 'OnGunGraphVariableChange');
    expect(kept?.status).toBe('verified_missing');
    expect(kept?.missingEdge).toBe(true);
    expect(rejected?.status).toBe('rejected');
    expect(rejected?.reasonCode).toBe('edge_already_present');
  });

  it('classifies syncvar candidates into accepted, backlog, and third-party buckets', async () => {
    const repoPath = await createRepo([
      {
        path: 'Assets/NEON/Code/NetworkCode/NeonPlayer/NetPlayer.Dead.cs',
        content: `using Mirror;

public partial class NetPlayer : NetworkBehaviour
{
    [SyncVar(hook = nameof(OnDeadChange))]
    public bool IsDead;

    public void GameOverInDead()
    {
        IsDead = true;
    }

    private void OnDeadChange(bool oldValue, bool newValue)
    {
    }
}
`,
      },
      {
        path: 'Assets/NEON/Code/UI/StoreItem.cs',
        content: `using Mirror;

public class StoreItem : NetworkBehaviour
{
    [SyncVar(hook = nameof(GetTradingType))]
    public int tradingTypeId;

    private void GetTradingType(int oldValue, int newValue)
    {
    }
}
`,
      },
      {
        path: 'Assets/Plugins/Mirror/Tests/Editor/HookBehaviour.cs',
        content: `using Mirror;

public class HookBehaviour : NetworkBehaviour
{
    [SyncVar(hook = nameof(OnValueChanged))]
    public int value;

    private void OnValueChanged(int oldValue, int newValue)
    {
    }
}
`,
      },
    ]);

    const resolved = await resolveLexicalCandidates({
      repoPath,
      matches: [
        baseMatch({
          gapSubtype: 'mirror_syncvar_hook',
          patternId: 'event_delegate.mirror_syncvar_hook.v1',
          file: 'Assets/NEON/Code/NetworkCode/NeonPlayer/NetPlayer.Dead.cs',
          line: 4,
          text: '[SyncVar(hook = nameof(OnDeadChange))]',
        }),
        baseMatch({
          gapSubtype: 'mirror_syncvar_hook',
          patternId: 'event_delegate.mirror_syncvar_hook.v1',
          file: 'Assets/NEON/Code/UI/StoreItem.cs',
          line: 4,
          text: '[SyncVar(hook = nameof(GetTradingType))]',
        }),
        baseMatch({
          gapSubtype: 'mirror_syncvar_hook',
          patternId: 'event_delegate.mirror_syncvar_hook.v1',
          file: 'Assets/Plugins/Mirror/Tests/Editor/HookBehaviour.cs',
          line: 4,
          text: '[SyncVar(hook = nameof(OnValueChanged))]',
        }),
      ],
    });

    const verified = await verifyMissingEdges({ candidates: resolved });
    const accepted = verified.find((row) => row.file.endsWith('NetPlayer.Dead.cs'));
    const backlog = verified.find((row) => row.file.endsWith('StoreItem.cs'));
    const thirdParty = verified.find((row) => row.file.endsWith('HookBehaviour.cs'));

    expect(accepted?.status).toBe('accepted');
    expect(accepted?.sourceAnchor?.symbol).toBe('NetPlayer.GameOverInDead');
    expect(accepted?.targetAnchor?.symbol).toBe('NetPlayer.OnDeadChange');
    expect(backlog?.status).toBe('promotion_backlog');
    expect(backlog?.reasonCode).toBe('missing_runtime_source_anchor');
    expect(thirdParty?.status).toBe('rejected');
    expect(thirdParty?.reasonCode).toBe('third_party_scope_excluded');
  });
});
