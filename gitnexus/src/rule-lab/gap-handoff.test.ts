import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadGapHandoff } from './gap-handoff.js';

const tempDirs: string[] = [];

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

async function setupGapHandoffFixture(candidateRows: Array<Record<string, unknown>>): Promise<{
  repoPath: string;
  runId: string;
  sliceId: string;
}> {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'gap-handoff-'));
  tempDirs.push(repoPath);
  const runId = 'run-gap-handoff';
  const sliceId = 'event_delegate_gap.mirror_syncvar_hook';
  const gapSlicePath = path.join(repoPath, '.gitnexus', 'gap-lab', 'runs', runId, 'slices', `${sliceId}.json`);
  const gapCandidatesPath = path.join(repoPath, '.gitnexus', 'gap-lab', 'runs', runId, 'slices', `${sliceId}.candidates.jsonl`);
  const decisionsPath = path.join(repoPath, '.gitnexus', 'gap-lab', 'runs', runId, 'decisions.jsonl');

  await writeJson(gapSlicePath, {
    slice_id: sliceId,
    selected_candidates: [{ candidate_id: 'accepted-a', decision: 'accepted' }],
    coverage_gate: {
      user_raw_matches: 1,
      processed_user_matches: 1,
    },
    discovery_scope: { mode: 'full_user_code' },
    classification_buckets: {
      accepted: { count: 1 },
      promotion_backlog: { count: 0 },
    },
    verification: {
      confirmed_chain: {
        steps: [
          {
            hop_type: 'code_runtime',
            anchor: 'Assets/Gameplay/Bootstrap.cs:42',
            snippet: 'OnInit()',
          },
        ],
      },
    },
    default_binding_kinds: ['method_triggers_method'],
  });
  await fs.mkdir(path.dirname(gapCandidatesPath), { recursive: true });
  await fs.writeFile(
    gapCandidatesPath,
    `${candidateRows.map((row) => JSON.stringify({
      gap_type: 'event_delegate_gap',
      gap_subtype: 'mirror_syncvar_hook',
      pattern_id: 'event_delegate.mirror_syncvar_hook.v1',
      detector_version: '1.0.0',
      candidate_id: 'accepted-a',
      status: 'accepted',
      source_anchor: {
        file: 'Assets/Gameplay/SourceA.cs',
        line: 12,
        symbol: 'SourceA.Trigger',
      },
      target_anchor: {
        file: 'Assets/Gameplay/TargetA.cs',
        line: 35,
        symbol: 'TargetA.OnTrigger',
      },
      ...row,
    })).join('\n')}\n`,
    'utf-8',
  );
  await fs.writeFile(
    decisionsPath,
    `${JSON.stringify({
      decision_type: 'rule_aggregation_mode',
      slice_id: sliceId,
      aggregation_mode: 'per_anchor_rules',
      candidate_ids: ['accepted-a'],
    })}\n`,
    'utf-8',
  );

  return { repoPath, runId, sliceId };
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const repoPath = tempDirs.pop();
    if (!repoPath) continue;
    await fs.rm(repoPath, { recursive: true, force: true });
  }
});

describe('gap-handoff schema validation', () => {
  it('throws field-specific errors when taxonomy fields are missing', async () => {
    const fixture = await setupGapHandoffFixture([
      { gap_type: undefined },
    ]);

    await expect(loadGapHandoff(fixture)).rejects.toThrow(
      /gap-handoff schema error: candidate accepted-a missing gap_type/i,
    );
  });

  it('throws field-specific errors when accepted anchors are incomplete', async () => {
    const sourceMissing = await setupGapHandoffFixture([
      { source_anchor: { file: 'Assets/Gameplay/SourceA.cs', line: 12, symbol: '' } },
    ]);
    await expect(loadGapHandoff(sourceMissing)).rejects.toThrow(
      /gap-handoff schema error: accepted candidate accepted-a has empty source_anchor\.symbol/i,
    );

    const targetMissing = await setupGapHandoffFixture([
      { target_anchor: { file: '', line: 35, symbol: 'TargetA.OnTrigger' } },
    ]);
    await expect(loadGapHandoff(targetMissing)).rejects.toThrow(
      /gap-handoff schema error: accepted candidate accepted-a has empty target_anchor\.file/i,
    );
  });

  it('throws when accepted anchor fields contain placeholder text', async () => {
    const fixture = await setupGapHandoffFixture([
      { source_anchor: { file: 'Assets/Gameplay/SourceA.cs', line: 12, symbol: '<placeholder>' } },
    ]);
    await expect(loadGapHandoff(fixture)).rejects.toThrow(
      /gap-handoff schema error: accepted candidate accepted-a has empty source_anchor\.symbol/i,
    );
  });

  it('loads valid rows into the downstream handoff structure', async () => {
    const fixture = await setupGapHandoffFixture([{}]);
    const handoff = await loadGapHandoff(fixture);

    expect(handoff).not.toBeNull();
    expect(handoff?.source_gap_handoff.accepted_candidate_ids).toEqual(['accepted-a']);
    expect(handoff?.accepted_candidates[0]).toMatchObject({
      candidate_id: 'accepted-a',
      gap_type: 'event_delegate_gap',
      gap_subtype: 'mirror_syncvar_hook',
      pattern_id: 'event_delegate.mirror_syncvar_hook.v1',
      detector_version: '1.0.0',
    });
  });
});
