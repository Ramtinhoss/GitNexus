import { describe, expect, it } from 'vitest';
import { classifyScopePath } from '../../../src/gap-lab/scope-classifier.js';

describe('gap-lab scope classifier', () => {
  it('classifies user code with deterministic reason code', () => {
    const out = classifyScopePath('Assets/NEON/Code/NetworkCode/NetPlayer.Dead.cs');
    expect(out.scopeClass).toBe('user_code');
    expect(out.reasonCode).toBe('user_scope_prefix_match');
    expect(out.evidence.matchedPrefix).toBe('Assets/NEON/');
  });

  it('classifies third-party code with deterministic reason code', () => {
    const out = classifyScopePath('Assets/Plugins/Mirror/Runtime/SyncList.cs');
    expect(out.scopeClass).toBe('third_party');
    expect(out.reasonCode).toBe('third_party_prefix_match');
    expect(out.evidence.matchedPrefix).toBe('Assets/Plugins/');
  });

  it('classifies unknown paths with deterministic reason code', () => {
    const out = classifyScopePath('Assets/Experimental/Temp/Prototype.cs');
    expect(out.scopeClass).toBe('unknown');
    expect(out.reasonCode).toBe('unknown_scope_prefix');
    expect(out.evidence.normalizedPath).toBe('Assets/Experimental/Temp/Prototype.cs');
  });
});

