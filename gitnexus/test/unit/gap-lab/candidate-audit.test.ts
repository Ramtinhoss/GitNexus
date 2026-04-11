import { describe, expect, it } from 'vitest';
import { auditCandidateRows } from '../../../src/gap-lab/candidate-audit.js';

describe('gap-lab candidate audit', () => {
  it('rejects exemplar-driven exclusions under full_user_code scope', async () => {
    const result = auditCandidateRows({
      discoveryScopeMode: 'full_user_code',
      rows: [{ scopeClass: 'user_code', status: 'rejected', reasonCode: 'out_of_focus_scope' }],
    });

    expect(result.blocked).toBe(true);
  });
});
