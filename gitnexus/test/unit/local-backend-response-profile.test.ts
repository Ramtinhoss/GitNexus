import { describe, expect, it } from 'vitest';
import { resolveResponseProfile } from '../../src/mcp/local/agent-safe-response.js';

describe('response profile resolution', () => {
  it('defaults query/context response shaping to slim', () => {
    expect(resolveResponseProfile(undefined)).toBe('slim');
    expect(resolveResponseProfile('')).toBe('slim');
    expect(resolveResponseProfile('unknown')).toBe('slim');
  });

  it('honors explicit full profile', () => {
    expect(resolveResponseProfile('full')).toBe('full');
  });
});
