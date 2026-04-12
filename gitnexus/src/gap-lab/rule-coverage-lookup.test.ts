import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ResolvedCandidate } from './candidate-resolver.js';
import { buildRuleArtifactCoverageCheck } from './rule-coverage-lookup.js';

const tempDirs: string[] = [];

async function createRepo(): Promise<string> {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'gap-lab-rule-coverage-'));
  tempDirs.push(repoPath);
  return repoPath;
}

async function writeApprovedRule(repoPath: string, fileName: string, yaml: string): Promise<void> {
  const filePath = path.join(repoPath, '.gitnexus', 'rules', 'approved', fileName);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, yaml, 'utf-8');
}

function makeCandidate(overrides: Partial<ResolvedCandidate> = {}): ResolvedCandidate {
  return {
    candidateId: 'candidate-1',
    gapSubtype: 'mirror_syncvar_hook',
    patternId: 'event_delegate.mirror_syncvar_hook.v1',
    file: 'Assets/NEON/Code/NetworkCode/NeonPlayer/NetPlayer.Dead.cs',
    line: 4,
    sourceText: '[SyncVar(hook = nameof(OnDeadChange))]',
    scopeClass: 'user_code',
    scopeReasonCode: 'user_scope_prefix_match',
    status: 'resolved',
    handlerSymbol: 'OnDeadChange',
    sourceAnchor: {
      file: 'Assets/NEON/Code/NetworkCode/NeonPlayer/NetPlayer.Dead.cs',
      line: 8,
      symbol: 'NetPlayer.GameOverInDead',
      symbolId: 'Method:Assets/NEON/Code/NetworkCode/NeonPlayer/NetPlayer.Dead.cs:GameOverInDead',
    },
    targetAnchor: {
      file: 'Assets/NEON/Code/NetworkCode/NeonPlayer/NetPlayer.Dead.cs',
      line: 12,
      symbol: 'NetPlayer.OnDeadChange',
      symbolId: 'Method:Assets/NEON/Code/NetworkCode/NeonPlayer/NetPlayer.Dead.cs:OnDeadChange',
    },
    ...overrides,
  };
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const repoPath = tempDirs.pop();
    if (!repoPath) continue;
    await fs.rm(repoPath, { recursive: true, force: true });
  }
});

describe('approved rule coverage lookup', () => {
  it('reads method_triggers_method bindings from approved rule artifacts', async () => {
    const repoPath = await createRepo();
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
  - syncvar hook coverage
non_guarantees:
  - none
resource_bindings:
  - kind: method_triggers_method
    source_class_pattern: NetPlayer
    source_method: GameOverInDead
    target_class_pattern: NetPlayer
    target_method: OnDeadChange
`);

    const coverageCheck = await buildRuleArtifactCoverageCheck(repoPath);
    await expect(coverageCheck({
      handlerSymbol: 'OnDeadChange',
      candidate: makeCandidate(),
    })).resolves.toBe(true);
  });

  it('returns false when approved rules are absent or do not match', async () => {
    const repoPath = await createRepo();
    const emptyCoverage = await buildRuleArtifactCoverageCheck(repoPath);
    await expect(emptyCoverage({
      handlerSymbol: 'OnDeadChange',
      candidate: makeCandidate(),
    })).resolves.toBe(false);

    await writeApprovedRule(repoPath, 'other-rule.yaml', `id: approved.other
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
  - other coverage
non_guarantees:
  - none
resource_bindings:
  - kind: method_triggers_method
    source_class_pattern: StoreItem
    source_method: RefreshTradeState
    target_class_pattern: StoreItem
    target_method: OnTradeStateChanged
`);

    const coverageCheck = await buildRuleArtifactCoverageCheck(repoPath);
    await expect(coverageCheck({
      handlerSymbol: 'OnDeadChange',
      candidate: makeCandidate(),
    })).resolves.toBe(false);
  });
});
