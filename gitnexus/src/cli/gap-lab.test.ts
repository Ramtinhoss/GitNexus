import { Command } from 'commander';
import { describe, expect, it, vi } from 'vitest';
import { attachGapLabCommands, getGapLabCommandNames, runGapLabCommand } from './gap-lab.js';

describe('gap-lab cli', () => {
  it('registers the gap-lab run subcommand', () => {
    const program = new Command();
    program.version('test-version');
    attachGapLabCommands(program);

    expect(getGapLabCommandNames(program)).toEqual(['run']);
  });

  it('requires repo path, run id, slice id, and gap subtype for run', () => {
    const program = new Command();
    program.version('test-version');
    attachGapLabCommands(program);

    const gapLab = program.commands.find((command) => command.name() === 'gap-lab');
    const run = gapLab?.commands.find((command) => command.name() === 'run');
    expect(run).toBeTruthy();

    const mandatoryOptions = (run?.options || [])
      .filter((option) => option.mandatory)
      .map((option) => option.long);
    expect(mandatoryOptions).toEqual([
      '--repo-path',
      '--run-id',
      '--slice-id',
      '--gap-subtype',
    ]);
  });

  it('delegates to runGapLabSlice and maps pass/block/error outcomes to exit codes', async () => {
    const setExitCode = vi.fn();
    const write = vi.fn();
    const baseOptions = {
      repoPath: '/tmp/repo',
      runId: 'run-1',
      sliceId: 'slice-a',
      gapSubtype: 'mirror_syncvar_hook',
    } as const;

    const runGapLabSlice = vi.fn()
      .mockResolvedValueOnce({ outcome: 'passed', rowsWritten: 1 })
      .mockResolvedValueOnce({ outcome: 'coverage_blocked', rowsWritten: 1 })
      .mockRejectedValueOnce(new Error('boom'));

    await expect(runGapLabCommand(baseOptions, { runGapLabSlice, setExitCode, write })).resolves.toBe(0);
    await expect(runGapLabCommand(baseOptions, { runGapLabSlice, setExitCode, write })).resolves.toBe(1);
    await expect(runGapLabCommand(baseOptions, { runGapLabSlice, setExitCode, write })).resolves.toBe(2);

    expect(runGapLabSlice).toHaveBeenCalledTimes(3);
    expect(setExitCode).toHaveBeenNthCalledWith(1, 0);
    expect(setExitCode).toHaveBeenNthCalledWith(2, 1);
    expect(setExitCode).toHaveBeenNthCalledWith(3, 2);
    expect(write).toHaveBeenCalledTimes(3);
  });

  it('returns exit code 2 for invalid gap subtype before invoking the runner', async () => {
    const setExitCode = vi.fn();
    const write = vi.fn();
    const runGapLabSlice = vi.fn();

    await expect(runGapLabCommand({
      repoPath: '/tmp/repo',
      runId: 'run-1',
      sliceId: 'slice-a',
      gapSubtype: 'not-a-real-subtype',
    }, {
      runGapLabSlice,
      setExitCode,
      write,
    })).resolves.toBe(2);

    expect(runGapLabSlice).not.toHaveBeenCalled();
    expect(setExitCode).toHaveBeenCalledWith(2);
    expect(write).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'hard_error',
    }));
  });
});
