import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalBackend } from '../../src/mcp/local/local-backend.js';
import { listRegisteredRepos } from '../../src/storage/repo-manager.js';

vi.mock('../../src/storage/repo-manager.js', () => ({
  listRegisteredRepos: vi.fn().mockResolvedValue([]),
  cleanupOldKuzuFiles: vi.fn().mockResolvedValue({ found: false, needsReindex: false }),
}));

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../src/core/unity/__fixtures__/mini-unity-ui');

describe('LocalBackend unity_ui_trace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listRegisteredRepos as any).mockResolvedValue([
      {
        name: 'mini-unity-ui',
        path: fixtureRoot,
        storagePath: path.join(fixtureRoot, '.gitnexus'),
        indexedAt: '2026-03-24T00:00:00.000Z',
        lastCommit: 'test-commit',
        stats: { files: 1, nodes: 1, communities: 0, processes: 0 },
      },
    ]);
  });

  it('returns template_refs evidence chain via callTool', async () => {
    const backend = new LocalBackend();
    const ok = await backend.init();
    expect(ok).toBe(true);

    const result = await backend.callTool('unity_ui_trace', {
      target: 'Assets/UI/Screens/DressUpScreenNew.uxml',
      goal: 'template_refs',
      repo: 'mini-unity-ui',
    });

    expect(result.goal).toBe('template_refs');
    expect(result.results.length).toBe(1);
    expect(result.results[0].evidence_chain[0]).toEqual(
      expect.objectContaining({ path: expect.any(String), line: expect.any(Number) }),
    );
  });
});
