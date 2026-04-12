import { writeSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { isExhaustiveGapSubtype, runGapLabSlice } from '../gap-lab/run.js';

type GapLabHandlerName = 'runGapLabCommand';
type LazyFactory = (handlerName: GapLabHandlerName) => (...args: any[]) => void | Promise<void>;

export interface GapLabCommandOptions {
  repoPath: string;
  runId: string;
  sliceId: string;
  gapSubtype: string;
  scopePath?: string;
  timeoutMs?: string | number;
}

export interface GapLabCommandDeps {
  runGapLabSlice?: typeof runGapLabSlice;
  setExitCode?: (exitCode: number) => void;
  write?: (payload: unknown) => void;
}

function output(payload: unknown): void {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  writeSync(1, `${text}\n`);
}

function resolveRepoPath(repoPath?: string): string {
  return path.resolve(repoPath || process.cwd());
}

export function getGapLabCommandNames(program: Command): string[] {
  const root = program.commands.find((command) => command.name() === 'gap-lab');
  if (!root) return [];
  return root.commands.map((command) => command.name());
}

export function attachGapLabCommands(program: Command, lazyFactory?: LazyFactory): void {
  const action = (handlerName: GapLabHandlerName) => {
    if (lazyFactory) return lazyFactory(handlerName);

    switch (handlerName) {
      case 'runGapLabCommand':
        return async (options: GapLabCommandOptions): Promise<void> => {
          await runGapLabCommand(options);
        };
      default:
        return () => {
          throw new Error(`Unknown gap-lab handler: ${handlerName}`);
        };
    }
  };

  const root = program
    .command('gap-lab')
    .description('Offline gap-lab workflow for exhaustive candidate discovery');

  root
    .command('run')
    .requiredOption('--repo-path <path>', 'Repository path')
    .requiredOption('--run-id <id>', 'Gap-lab run id')
    .requiredOption('--slice-id <id>', 'Slice id')
    .requiredOption('--gap-subtype <subtype>', 'Gap subtype')
    .option('--scope-path <path>', 'Optional scope path override')
    .option('--timeout-ms <ms>', 'Scanner timeout override')
    .action(action('runGapLabCommand'));
}

export async function runGapLabCommand(options: GapLabCommandOptions, deps: GapLabCommandDeps = {}): Promise<number> {
  const runSlice = deps.runGapLabSlice ?? runGapLabSlice;
  const setExitCode = deps.setExitCode ?? ((exitCode: number) => {
    process.exitCode = exitCode;
  });
  const write = deps.write ?? output;

  try {
    if (!isExhaustiveGapSubtype(options.gapSubtype)) {
      throw new Error(`Unsupported gap subtype: ${options.gapSubtype}`);
    }

    const result = await runSlice({
      repoPath: resolveRepoPath(options.repoPath),
      runId: options.runId,
      sliceId: options.sliceId,
      gapSubtype: options.gapSubtype,
      scopePath: options.scopePath,
      timeoutMs: options.timeoutMs ? Number(options.timeoutMs) : undefined,
    });

    const exitCode = result.outcome === 'coverage_blocked' ? 1 : 0;
    write(result);
    setExitCode(exitCode);
    return exitCode;
  } catch (error: any) {
    write({
      outcome: 'hard_error',
      error: String(error?.message || error),
    });
    setExitCode(2);
    return 2;
  }
}
