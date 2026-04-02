import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/mcp/core/lbug-adapter.js', () => ({
  initLbug: vi.fn().mockResolvedValue(undefined),
  executeQuery: vi.fn().mockResolvedValue([]),
  executeParameterized: vi.fn().mockResolvedValue([]),
  closeLbug: vi.fn().mockResolvedValue(undefined),
  isLbugReady: vi.fn().mockReturnValue(true),
}));

vi.mock('../../src/storage/repo-manager.js', () => ({
  listRegisteredRepos: vi.fn().mockResolvedValue([
    {
      name: 'test-repo',
      path: '/tmp/test-repo',
      storagePath: '/tmp/.gitnexus/test-repo',
      indexedAt: '2026-04-02T00:00:00Z',
      lastCommit: 'abc123',
      stats: { files: 1, nodes: 1, edges: 1, communities: 1, processes: 1 },
    },
  ]),
  cleanupOldKuzuFiles: vi.fn().mockResolvedValue({ found: false, needsReindex: false }),
}));

import { GITNEXUS_TOOLS } from '../../src/mcp/tools.js';
import { LocalBackend } from '../../src/mcp/local/local-backend.js';

describe('rule-lab MCP tools', () => {
  let backend: LocalBackend;

  beforeEach(async () => {
    backend = new LocalBackend();
    await backend.init();
  });

  it('exposes rule_lab_* tools in schema and dispatches to backend handlers', async () => {
    const toolNames = GITNEXUS_TOOLS.map((tool) => tool.name);
    expect(toolNames).toContain('rule_lab_discover');
    expect(toolNames).toContain('rule_lab_analyze');
    expect(toolNames).toContain('rule_lab_review_pack');
    expect(toolNames).toContain('rule_lab_curate');
    expect(toolNames).toContain('rule_lab_promote');
    expect(toolNames).toContain('rule_lab_regress');

    const discoverSpy = vi.fn().mockResolvedValue({ artifact_paths: { manifest: '/tmp/manifest.json' } });
    (backend as any).ruleLabDiscover = discoverSpy;

    const out = await backend.callTool('rule_lab_discover', { repo: 'test-repo', scope: 'full' });
    expect(discoverSpy).toHaveBeenCalledTimes(1);
    expect(out).toHaveProperty('artifact_paths');
  });
});
