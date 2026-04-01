/**
 * P0 Integration Tests: Local Backend — callTool dispatch
 *
 * Tests the full LocalBackend.callTool() dispatch with a real LadybugDB
 * instance, verifying cypher, context, impact, and query tools work
 * end-to-end against seeded graph data with FTS indexes.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { LocalBackend } from '../../src/mcp/local/local-backend.js';
import { listRegisteredRepos } from '../../src/storage/repo-manager.js';
import { withTestLbugDB } from '../helpers/test-indexed-db.js';
import { LOCAL_BACKEND_SEED_DATA, LOCAL_BACKEND_FTS_INDEXES } from '../fixtures/local-backend-seed.js';

vi.mock('../../src/storage/repo-manager.js', () => ({
  listRegisteredRepos: vi.fn().mockResolvedValue([]),
  cleanupOldKuzuFiles: vi.fn().mockResolvedValue({ found: false, needsReindex: false }),
}));

// ─── Block 2: callTool dispatch tests ────────────────────────────────

withTestLbugDB('local-backend-calltool', (handle) => {

  describe('callTool dispatch with real DB', () => {
    let backend: LocalBackend;

    beforeAll(async () => {
      // backend is created in afterSetup and attached to the handle
      const ext = handle as typeof handle & { _backend?: LocalBackend };
      if (!ext._backend) {
        throw new Error('LocalBackend not initialized — afterSetup did not attach _backend to handle');
      }
      backend = ext._backend;
    });

    it('cypher tool returns function names', async () => {
      const result = await backend.callTool('cypher', {
        query: 'MATCH (n:Function) RETURN n.name AS name ORDER BY n.name',
      });
      // cypher tool wraps results as markdown
      expect(result).toHaveProperty('markdown');
      expect(result).toHaveProperty('row_count');
      expect(result.row_count).toBeGreaterThanOrEqual(3);
      expect(result.markdown).toContain('login');
      expect(result.markdown).toContain('validate');
      expect(result.markdown).toContain('hash');
    });

    it('cypher tool blocks write queries', async () => {
      const result = await backend.callTool('cypher', {
        query: "CREATE (n:Function {id: 'x', name: 'x', filePath: '', startLine: 0, endLine: 0, isExported: false, content: '', description: ''})",
      });
      expect(result).toHaveProperty('error');
      expect(result.error).toMatch(/write operations/i);
    });

    it('context tool returns symbol info with callers and callees', async () => {
      const result = await backend.callTool('context', { name: 'login' });
      expect(result).not.toHaveProperty('error');
      expect(result.status).toBe('found');
      // Should have the symbol identity
      expect(result.symbol).toBeDefined();
      expect(result.symbol.name).toBe('login');
      expect(result.symbol.filePath).toBe('src/auth.ts');
      // login calls validate and hash — should appear in outgoing.calls
      expect(result.outgoing).toBeDefined();
      expect(result.outgoing.calls).toBeDefined();
      expect(result.outgoing.calls.length).toBeGreaterThanOrEqual(2);
      const calleeNames = result.outgoing.calls.map((c: any) => c.name);
      expect(calleeNames).toContain('validate');
      expect(calleeNames).toContain('hash');
    });

    it('context tool aggregates method-level relations for class symbols and keeps direct relations separate', async () => {
      const result = await backend.callTool('context', { name: 'AuthService' });
      expect(result).not.toHaveProperty('error');
      expect(result.status).toBe('found');
      expect(result.symbol.name).toBe('AuthService');

      // Aggregated via HAS_METHOD -> method CALLS graph
      expect(result.incoming?.calls?.map((r: any) => r.name)).toContain('login');
      expect(result.outgoing?.calls?.map((r: any) => r.name)).toContain('validate');

      // Direct class-level relations remain available and separate.
      expect(result.directIncoming).toBeDefined();
      expect(result.directOutgoing).toBeDefined();
      expect(result.directIncoming.calls || []).toHaveLength(0);
      expect(result.directOutgoing.calls || []).toHaveLength(0);
    });

    it('context tool projects method-level process participation for class symbols', async () => {
      const result = await backend.callTool('context', { name: 'AuthService' });

      expect(result.processes?.length).toBeGreaterThan(0);
      expect(result.processes.some((p: any) => p.evidence_mode === 'method_projected')).toBe(true);
      expect(result.processes.every((p: any) => ['high', 'medium'].includes(p.confidence))).toBe(true);
      expect(result.processes.some((p: any) => p.evidence_mode === 'direct_step')).toBe(false);
    });

    it('impact tool returns upstream dependents', async () => {
      const result = await backend.callTool('impact', {
        target: 'validate',
        direction: 'upstream',
      });
      expect(result).not.toHaveProperty('error');
      // validate is called by login, so login should appear at depth 1
      expect(result.impactedCount).toBeGreaterThanOrEqual(1);
      expect(result.byDepth).toBeDefined();
      const directDeps = result.byDepth[1] || result.byDepth['1'] || [];
      expect(directDeps.length).toBeGreaterThanOrEqual(1);
      const depNames = directDeps.map((d: any) => d.name);
      expect(depNames).toContain('login');
    });

    it('impact honors target_uid disambiguation over target name', async () => {
      const result = await backend.callTool('impact', {
        target: 'definitely-not-a-real-symbol-name',
        target_uid: 'func:validate',
        direction: 'upstream',
      });
      expect(result).not.toHaveProperty('error');
      expect(result.target.id).toBe('func:validate');
      expect(result.target.name).toBe('validate');
    });

    it('impact honors file_path disambiguation for duplicate symbol names', async () => {
      const result = await backend.callTool('impact', {
        target: 'authenticate',
        file_path: 'src/base.ts',
        direction: 'downstream',
        relationTypes: ['OVERRIDES'],
      });
      expect(result).not.toHaveProperty('error');
      expect(result.target.name).toBe('authenticate');
      expect(result.target.filePath).toBe('src/base.ts');
    });

    it('query tool returns results for keyword search', async () => {
      const result = await backend.callTool('query', { query: 'login' });
      expect(result).not.toHaveProperty('error');
      // Should have some combination of processes, process_symbols, or definitions
      expect(result).toHaveProperty('processes');
      expect(result).toHaveProperty('definitions');
      // The search should find something (FTS or graph-based)
      const totalResults =
        (result.processes?.length || 0) +
        (result.process_symbols?.length || 0) +
        (result.definitions?.length || 0);
      expect(totalResults).toBeGreaterThanOrEqual(1);
    });

    it('query tool projects class hits into processes via method STEP_IN_PROCESS', async () => {
      const result = await backend.callTool('query', { query: 'AuthService' });

      expect(result.processes?.length).toBeGreaterThan(0);
      expect(result.process_symbols.some((s: any) => s.name === 'AuthService')).toBe(true);
      expect(result.processes.some((p: any) => p.evidence_mode === 'method_projected')).toBe(true);
    });

    it('query keeps direct evidence as high confidence when available', async () => {
      const result = await backend.callTool('query', { query: 'authenticate' });
      const directHigh = result.process_symbols.find(
        (s: any) => s.process_evidence_mode === 'direct_step' && s.process_confidence === 'high',
      );

      expect(directHigh).toBeDefined();
    });

    it('phase5 confidence fields and verification hints', async () => {
      const original = process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS;
      process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS = 'on';
      try {
        const on = await backend.callTool('context', { name: 'AuthService' });
        expect(on.processes.length).toBeGreaterThan(0);
        expect(on.processes.every((p: any) => ['high', 'medium', 'low'].includes(p.confidence))).toBe(true);
        expect(on.processes.some((p: any) => Object.prototype.hasOwnProperty.call(p, 'verification_hint'))).toBe(true);

        const low = on.processes.find((p: any) => p.confidence === 'low');
        if (low) {
          expect(low.verification_hint).toHaveProperty('action');
          expect(low.verification_hint).toHaveProperty('target');
          expect(low.verification_hint).toHaveProperty('next_command');
        }
      } finally {
        if (original === undefined) {
          delete process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS;
        } else {
          process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS = original;
        }
      }
    });

    it('phase5 flag-off preserves legacy response shape', async () => {
      const original = process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS;
      process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS = 'off';
      try {
        const off = await backend.callTool('context', { name: 'AuthService' });
        expect(off.processes.length).toBeGreaterThan(0);
        expect(off.processes.every((p: any) => p.verification_hint === undefined)).toBe(true);
        expect(off.processes.every((p: any) => typeof p.step_count === 'number')).toBe(true);
      } finally {
        if (original === undefined) {
          delete process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS;
        } else {
          process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS = original;
        }
      }
    });

    it('phase5 emits low confidence heuristic runtime clues', async () => {
      const original = process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS;
      process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS = 'on';
      try {
        const result = await backend.callTool('query', {
          query: 'Reload',
          unity_resources: 'on',
          unity_hydration_mode: 'compact',
        });

        expect(result.processes.some((p: any) => p.confidence === 'low')).toBe(true);
        expect(result.processes.some((p: any) => p.evidence_mode === 'resource_heuristic')).toBe(true);
        expect(
          result.processes.some((p: any) => /asset|meta|parity/i.test(JSON.stringify(p.verification_hint || ''))),
        ).toBe(true);
      } finally {
        if (original === undefined) {
          delete process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS;
        } else {
          process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS = original;
        }
      }
    });

    it('returns lifecycle process metadata without breaking legacy fields', async () => {
      const queryResult = await backend.callTool('query', { query: 'login' });
      expect(queryResult.processes.some((p: any) => p.process_subtype === 'unity_lifecycle')).toBe(true);
      expect(queryResult.processes.every((p: any) => typeof p.step_count === 'number')).toBe(true);
      expect(queryResult.processes.every((p: any) => typeof p.process_type === 'string')).toBe(true);

      const contextResult = await backend.callTool('context', { name: 'login' });
      expect(contextResult.processes.some((p: any) => p.process_subtype === 'unity_lifecycle')).toBe(true);
      expect(contextResult.processes.every((p: any) => typeof p.step_count === 'number')).toBe(true);
    });

    it('unknown tool throws', async () => {
      await expect(
        backend.callTool('nonexistent_tool', {}),
      ).rejects.toThrow(/unknown tool/i);
    });
  });

  describe('impact tool relationTypes filtering', () => {
    let backend: LocalBackend;

    beforeAll(async () => {
      const ext = handle as typeof handle & { _backend?: LocalBackend };
      if (!ext._backend) {
        throw new Error('LocalBackend not initialized — afterSetup did not attach _backend to handle');
      }
      backend = ext._backend;
    });

    it('filters by HAS_METHOD only', async () => {
      const result = await backend.callTool('impact', {
        target: 'AuthService',
        direction: 'downstream',
        relationTypes: ['HAS_METHOD'],
      });
      expect(result).not.toHaveProperty('error');
      expect(result.impactedCount).toBeGreaterThanOrEqual(1);
      const d1 = result.byDepth[1] || result.byDepth['1'] || [];
      const names = d1.map((d: any) => d.name);
      expect(names).toContain('authenticate');
      // Should NOT include CALLS-reachable symbols like validate/hash
      expect(names).not.toContain('validate');
      expect(names).not.toContain('hash');
    });

    it('filters by OVERRIDES only', async () => {
      const result = await backend.callTool('impact', {
        target: 'authenticate',
        direction: 'downstream',
        relationTypes: ['OVERRIDES'],
      });
      expect(result).not.toHaveProperty('error');
      // AuthService.authenticate overrides BaseService.authenticate
      expect(result.impactedCount).toBeGreaterThanOrEqual(1);
      const d1 = result.byDepth[1] || result.byDepth['1'] || [];
      const names = d1.map((d: any) => d.name);
      expect(names).toContain('authenticate');
    });

    it('does not return HAS_METHOD results when filtering by CALLS only', async () => {
      const result = await backend.callTool('impact', {
        target: 'AuthService',
        direction: 'downstream',
        relationTypes: ['CALLS'],
      });
      expect(result).not.toHaveProperty('error');
      // AuthService has no outgoing CALLS edges, only HAS_METHOD
      expect(result.impactedCount).toBe(0);
    });

    it('bridges class-target upstream traversal through HAS_METHOD by default', async () => {
      const result = await backend.callTool('impact', {
        target: 'AuthService',
        direction: 'upstream',
      });
      expect(result).not.toHaveProperty('error');
      const d1 = result.byDepth[1] || result.byDepth['1'] || [];
      const names = d1.map((d: any) => d.name);
      expect(names).toContain('login');
    });
  });

  describe('tool parameter edge cases', () => {
    let backend: LocalBackend;

    beforeAll(async () => {
      const ext = handle as typeof handle & { _backend?: LocalBackend };
      if (!ext._backend) {
        throw new Error('LocalBackend not initialized — afterSetup did not attach _backend to handle');
      }
      backend = ext._backend;
    });

    it('context tool returns error for nonexistent symbol', async () => {
      const result = await backend.callTool('context', { name: 'nonexistent_xyz_symbol_999' });
      expect(result).toHaveProperty('error');
      expect(result.error).toMatch(/not found/i);
    });

    it('query tool returns error for empty query', async () => {
      const result = await backend.callTool('query', { query: '' });
      expect(result).toHaveProperty('error');
      expect(result.error).toMatch(/required/i);
    });

    it('query tool returns error for missing query param', async () => {
      const result = await backend.callTool('query', {});
      expect(result).toHaveProperty('error');
    });

    it('cypher tool returns error for invalid Cypher syntax', async () => {
      const result = await backend.callTool('cypher', { query: 'THIS IS NOT VALID CYPHER AT ALL' });
      expect(result).toHaveProperty('error');
    });

    it('context tool returns error when no name or uid provided', async () => {
      const result = await backend.callTool('context', {});
      expect(result).toHaveProperty('error');
      expect(result.error).toMatch(/required/i);
    });

    // ─── impact error handling tests (#321) ───────────────────────────
    // Verify that impact() returns structured JSON instead of crashing

    it('impact tool returns structured error for unknown symbol', async () => {
      const result = await backend.callTool('impact', {
        target: 'nonexistent_symbol_xyz_999',
        direction: 'upstream',
      });
      // Must return structured JSON, not throw
      expect(result).toBeDefined();
      // Should have either an error field (not found) or impactedCount 0
      // Either outcome is valid — the key is it doesn't crash
      if (result.error) {
        expect(typeof result.error).toBe('string');
      } else {
        expect(result.impactedCount).toBe(0);
      }
    });

    it('impact error response has consistent target shape', async () => {
      const result = await backend.callTool('impact', {
        target: 'nonexistent_symbol_xyz_999',
        direction: 'downstream',
      });
      // When an error is returned, target must be an object (not raw string)
      // so downstream API consumers can safely access result.target.name
      if (result.error && result.target !== undefined) {
        expect(typeof result.target).toBe('object');
        expect(result.target).not.toBeNull();
      }
    });

    it('impact partial results: traversalComplete flag when depth fails', async () => {
      // Even if traversal fails at some depth, partial results should be returned
      // and partial:true should only be set when some results were collected
      const result = await backend.callTool('impact', {
        target: 'validate',
        direction: 'upstream',
        maxDepth: 10, // Large depth to trigger multi-level traversal
      });
      // Should succeed (validate exists in seed data)
      expect(result).not.toHaveProperty('error');
      if (result.partial) {
        // If partial, must still have some results
        expect(result.impactedCount).toBeGreaterThan(0);
      }
    });
  });

}, {
  seed: LOCAL_BACKEND_SEED_DATA,
  ftsIndexes: LOCAL_BACKEND_FTS_INDEXES,
  poolAdapter: true,
  afterSetup: async (handle) => {
    // Configure listRegisteredRepos mock with handle values
    vi.mocked(listRegisteredRepos).mockResolvedValue([
      {
        name: 'test-repo',
        path: '/test/repo',
        storagePath: handle.tmpHandle.dbPath,
        indexedAt: new Date().toISOString(),
        lastCommit: 'abc123',
        stats: { files: 2, nodes: 3, communities: 1, processes: 1 },
      },
    ]);

    const backend = new LocalBackend();
    await backend.init();
    // Stash backend on handle so tests can access it
    (handle as any)._backend = backend;
  },
});
