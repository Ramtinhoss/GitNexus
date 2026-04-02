import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { attachRuleLabCommands, getRuleLabCommandNames } from './rule-lab.js';

describe('rule-lab cli', () => {
  it('registers all six rule-lab subcommands', async () => {
    const program = new Command();
    attachRuleLabCommands(program);
    const cmds = getRuleLabCommandNames(program);
    expect(cmds).toEqual(['discover', 'analyze', 'review-pack', 'curate', 'promote', 'regress']);
  });
});
