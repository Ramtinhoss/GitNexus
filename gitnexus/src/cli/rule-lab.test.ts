import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { attachRuleLabCommands, getRuleLabCommandNames, ruleLabAnalyzeCommand } from './rule-lab.js';

describe('rule-lab cli', () => {
  it('registers all rule-lab subcommands', async () => {
    const program = new Command();
    program.version('test-version');
    attachRuleLabCommands(program);
    const cmds = getRuleLabCommandNames(program);
    expect(cmds).toEqual(['analyze', 'review-pack', 'curate', 'promote', 'regress', 'compile']);
  });

  it('uses --rule-version for promote to avoid root --version collision', () => {
    const program = new Command();
    program.version('test-version');
    attachRuleLabCommands(program);

    const ruleLab = program.commands.find((command) => command.name() === 'rule-lab');
    expect(ruleLab).toBeTruthy();
    const promote = ruleLab?.commands.find((command) => command.name() === 'promote');
    expect(promote).toBeTruthy();

    const optionNames = (promote?.options || []).map((option) => option.long);
    expect(optionNames).toContain('--rule-version');
    expect(optionNames).not.toContain('--version');
  });

  it('rejects placeholder run/slice ids at analyze command boundary', async () => {
    await expect(
      ruleLabAnalyzeCommand({
        repoPath: process.cwd(),
        runId: '<run_id>',
        sliceId: '<slice_id>',
      }),
    ).rejects.toThrow(/placeholder/i);
  });
});
