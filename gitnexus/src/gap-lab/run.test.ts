import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runGapLabSlice, type PersistedGapLabCandidateRow } from './run.js';

const tempDirs: string[] = [];

async function createRepo(files: Array<{ path: string; content: string }>): Promise<string> {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'gap-lab-run-'));
  tempDirs.push(repoPath);
  for (const file of files) {
    const absPath = path.join(repoPath, file.path);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, file.content, 'utf-8');
  }
  return repoPath;
}

async function readJsonLines(filePath: string): Promise<PersistedGapLabCandidateRow[]> {
  const raw = await fs.readFile(filePath, 'utf-8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as PersistedGapLabCandidateRow);
}

async function readJson(filePath: string): Promise<Record<string, any>> {
  return JSON.parse(await fs.readFile(filePath, 'utf-8')) as Record<string, any>;
}

async function writeApprovedRule(repoPath: string, fileName: string, yaml: string): Promise<void> {
  const filePath = path.join(repoPath, '.gitnexus', 'rules', 'approved', fileName);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, yaml, 'utf-8');
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('gap-lab run', () => {
  it('orchestrates the full mirror syncvar hook pipeline and updates coverage gate state', async () => {
    const repoPath = await createRepo([
      {
        path: 'Assets/NEON/Code/Gameplay/NetPlayer.Dead.cs',
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

    const result = await runGapLabSlice({
      repoPath,
      runId: 'run-1',
      sliceId: 'event_delegate_gap.mirror_syncvar_hook',
      gapSubtype: 'mirror_syncvar_hook',
    });

    const rows = await readJsonLines(result.paths.candidatesPath);
    const slice = await readJson(result.paths.slicePath);
    expect(result.outcome).toBe('passed');
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.gap_type === 'event_delegate_gap')).toBe(true);
    expect(rows.every((row) => row.gap_subtype === 'mirror_syncvar_hook')).toBe(true);
    expect(rows.every((row) => typeof row.candidate_id === 'string' && row.candidate_id.length > 0)).toBe(true);
    expect(rows.every((row) => typeof row.pattern_id === 'string' && row.pattern_id.length > 0)).toBe(true);
    expect(rows.every((row) => row.detector_version === '1.0.0')).toBe(true);
    expect(rows.every((row) => typeof row.file === 'string' && typeof row.line === 'number')).toBe(true);
    expect(rows.every((row) => ['user_code', 'third_party', 'unknown'].includes(String(row.scopeClass)))).toBe(true);
    expect(rows.filter((row) => row.status !== 'accepted').every((row) => typeof row.reasonCode === 'string')).toBe(true);
    expect(rows.filter((row) => row.status === 'accepted').every((row) =>
      !!row.source_anchor?.file &&
      !!row.source_anchor?.symbol &&
      !!row.target_anchor?.file &&
      !!row.target_anchor?.symbol,
    )).toBe(true);

    const accepted = rows.find((row) => row.status === 'accepted');
    const backlog = rows.find((row) => row.status === 'promotion_backlog');
    const rejected = rows.find((row) => row.status === 'rejected');
    expect(accepted).toMatchObject({
      file: 'Assets/NEON/Code/Gameplay/NetPlayer.Dead.cs',
      source_anchor: { symbol: 'NetPlayer.GameOverInDead' },
      target_anchor: { symbol: 'NetPlayer.OnDeadChange' },
    });
    expect(backlog?.reasonCode).toBe('missing_runtime_source_anchor');
    expect(rejected?.reasonCode).toBe('third_party_scope_excluded');

    expect(slice.classification_buckets.accepted.count).toBe(1);
    expect(slice.classification_buckets.promotion_backlog.count).toBe(1);
    expect(slice.classification_buckets.third_party_scope_excluded.count).toBe(1);
    expect(slice.coverage_gate.status).toBe('passed');
    expect(slice.coverage_gate.user_raw_matches).toBe(2);
    expect(slice.coverage_gate.processed_user_matches).toBe(2);
  });

  it('overwrites candidates.jsonl on rerun instead of appending stale rows', async () => {
    const repoPath = await createRepo([
      {
        path: 'Assets/NEON/Code/Gameplay/NetPlayer.Dead.cs',
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

    const first = await runGapLabSlice({
      repoPath,
      runId: 'run-2',
      sliceId: 'event_delegate_gap.mirror_syncvar_hook',
      gapSubtype: 'mirror_syncvar_hook',
    });
    await fs.appendFile(first.paths.candidatesPath, `${JSON.stringify({ stale: true })}\n`, 'utf-8');

    const second = await runGapLabSlice({
      repoPath,
      runId: 'run-2',
      sliceId: 'event_delegate_gap.mirror_syncvar_hook',
      gapSubtype: 'mirror_syncvar_hook',
    });

    const rows = await readJsonLines(second.paths.candidatesPath);
    expect(rows).toHaveLength(1);
    expect('stale' in (rows[0] as unknown as Record<string, unknown>)).toBe(false);
  });

  it('rejects already-covered accepted candidates from approved rule artifacts', async () => {
    const repoPath = await createRepo([
      {
        path: 'Assets/NEON/Code/Gameplay/NetPlayer.Dead.cs',
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
    await writeApprovedRule(repoPath, 'netplayer.syncvar.yaml', `id: approved.netplayer.syncvar
version: 1.0.0
family: analyze_rules
trigger_family: event_delegate
resource_types:
  - syncvar_hook
host_base_type:
  - network_behaviour
required_hops:
  - code_runtime
guarantees:
  - duplicate already covered
non_guarantees:
  - none
resource_bindings:
  - kind: method_triggers_method
    source_class_pattern: NetPlayer
    source_method: GameOverInDead
    target_class_pattern: NetPlayer
    target_method: OnDeadChange
`);

    const result = await runGapLabSlice({
      repoPath,
      runId: 'run-covered',
      sliceId: 'event_delegate_gap.mirror_syncvar_hook',
      gapSubtype: 'mirror_syncvar_hook',
    });

    expect(result.outcome).toBe('passed');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe('rejected');
    expect(result.rows[0].reasonCode).toBe('edge_already_present');
  });

  it('returns coverage_blocked when the semantic coverage gate blocks', async () => {
    const repoPath = await createRepo([
      {
        path: 'Assets/NEON/Code/Gameplay/NetPlayer.Dead.cs',
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

    const result = await runGapLabSlice({
      repoPath,
      runId: 'run-blocked',
      sliceId: 'event_delegate_gap.mirror_syncvar_hook',
      gapSubtype: 'mirror_syncvar_hook',
    }, {
      enforceCoverageGate: async () => ({
        enforced: true,
        blocked: true,
        userRawMatches: 1,
        processedUserMatches: 0,
        reason: 'coverage_incomplete',
      }),
    });

    expect(result.outcome).toBe('coverage_blocked');
  });

  it('surfaces ripgrep timeout as a hard error', async () => {
    const repoPath = await createRepo([]);

    await expect(runGapLabSlice({
      repoPath,
      runId: 'run-timeout',
      sliceId: 'event_delegate_gap.mirror_syncvar_hook',
      gapSubtype: 'mirror_syncvar_hook',
    }, {
      scanLexicalUniverse: async () => {
        throw new Error('rg timed out');
      },
    })).rejects.toThrow(/timed out/i);
  });
});
