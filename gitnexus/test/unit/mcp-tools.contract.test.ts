import { describe, expect, it } from 'vitest';
import { GITNEXUS_TOOLS } from '../../src/mcp/tools.js';

function toolDescription(name: string): string {
  const tool = GITNEXUS_TOOLS.find((t) => t.name === name);
  expect(tool, `missing tool: ${name}`).toBeTruthy();
  return String(tool?.description || '');
}

describe('mcp tool contract wording', () => {
  it('query description includes strict fallback policy-adjusted semantics', () => {
    const description = toolDescription('query');
    expect(description).toContain('strict');
    expect(description).toContain('fallbackToCompact');
    expect(description).toContain('policy-adjusted');
  });

  it('context description includes strict fallback policy-adjusted semantics', () => {
    const description = toolDescription('context');
    expect(description).toContain('strict');
    expect(description).toContain('fallbackToCompact');
    expect(description).toContain('policy-adjusted');
  });
});
