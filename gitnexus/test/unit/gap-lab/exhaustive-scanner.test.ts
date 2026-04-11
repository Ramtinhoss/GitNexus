import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanLexicalUniverse } from '../../../src/gap-lab/exhaustive-scanner.js';

const tempDirs: string[] = [];

async function makeRepoFixture(): Promise<string> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gap-lab-exhaustive-'));
  tempDirs.push(repoRoot);

  const files: Array<[string, string]> = [
    [
      'Assets/NEON/Code/NetworkCode/NeonPlayer/NetPlayer.Dead.cs',
      [
        'using Mirror;',
        'public partial class NetPlayer {',
        '  [SyncVar(hook = nameof(OnDeadChange))]',
        '  public bool IsDead;',
        '  private void OnDeadChange(bool oldValue, bool newValue) {}',
        '}',
      ].join('\n'),
    ],
    [
      'Assets/NEON/Code/NetworkCode/NeonPlayer/NetPlayer.PickUp.cs',
      [
        'using Mirror;',
        'public partial class NetPlayer {',
        '  private SyncList<int> PickUpItems = new SyncList<int>();',
        '  private void InitPowerUp() {',
        '    PickUpItems.Callback += PackItemUpChanges;',
        '  }',
        '  private void PackItemUpChanges(SyncList<int>.Operation op, int index, int oldValue, int newValue) {}',
        '}',
      ].join('\n'),
    ],
  ];

  for (const [relPath, content] of files) {
    const absPath = path.join(repoRoot, relPath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, `${content}\n`, 'utf-8');
  }

  return repoRoot;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('gap-lab exhaustive scanner', () => {
  it('finds SyncVar hook lexical matches repo-wide', async () => {
    const repoPath = await makeRepoFixture();
    const out = await scanLexicalUniverse({
      repoPath,
      gapSubtype: 'mirror_syncvar_hook',
    });

    expect(out.matches.length).toBe(1);
    expect(out.matches[0]?.file).toContain('NetPlayer.Dead.cs');
    expect(out.matches[0]?.line).toBe(3);
    expect(out.matches[0]?.text).toContain('SyncVar');
  });

  it('finds callback registration lexical matches repo-wide', async () => {
    const repoPath = await makeRepoFixture();
    const out = await scanLexicalUniverse({
      repoPath,
      gapSubtype: 'mirror_synclist_callback',
    });

    expect(out.matches.length).toBe(1);
    expect(out.matches[0]?.file).toContain('NetPlayer.PickUp.cs');
    expect(out.matches[0]?.line).toBe(5);
    expect(out.matches[0]?.text).toContain('Callback +=');
  });
});

