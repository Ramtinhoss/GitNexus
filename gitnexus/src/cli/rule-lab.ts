import { writeSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';
import { discoverRuleLabRun } from '../rule-lab/discover.js';
import { analyzeRuleLabSlice } from '../rule-lab/analyze.js';
import { buildReviewPack } from '../rule-lab/review-pack.js';
import { curateRuleLabSlice } from '../rule-lab/curate.js';
import { promoteCuratedRules } from '../rule-lab/promote.js';
import { runRuleLabRegress } from '../rule-lab/regress.js';
import { compileRules } from '../rule-lab/compile.js';

const RULE_LAB_COMMANDS = ['discover', 'analyze', 'review-pack', 'curate', 'promote', 'regress'] as const;

type RuleLabHandlerName =
  | 'ruleLabDiscoverCommand'
  | 'ruleLabAnalyzeCommand'
  | 'ruleLabReviewPackCommand'
  | 'ruleLabCurateCommand'
  | 'ruleLabPromoteCommand'
  | 'ruleLabRegressCommand';

type LazyFactory = (handlerName: RuleLabHandlerName) => (...args: any[]) => void | Promise<void>;

function output(data: unknown): void {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  writeSync(1, `${text}\n`);
}

function resolveRepoPath(repoPath?: string): string {
  return path.resolve(repoPath || process.cwd());
}

function assertConcreteRunSliceIds(runId: string, sliceId: string): void {
  if (/[<>]/.test(runId) || /[<>]/.test(sliceId)) {
    throw new Error('Invalid run/slice id: placeholder values are not allowed');
  }
}

export function getRuleLabCommandNames(program: Command): string[] {
  const root = program.commands.find((command) => command.name() === 'rule-lab');
  if (!root) return [];
  return root.commands.map((command) => command.name());
}

export function attachRuleLabCommands(program: Command, lazyFactory?: LazyFactory): void {
  const action = (handlerName: RuleLabHandlerName) => {
    if (lazyFactory) return lazyFactory(handlerName);

    switch (handlerName) {
      case 'ruleLabDiscoverCommand':
        return (options: any) => ruleLabDiscoverCommand(options);
      case 'ruleLabAnalyzeCommand':
        return (options: any) => ruleLabAnalyzeCommand(options);
      case 'ruleLabReviewPackCommand':
        return (options: any) => ruleLabReviewPackCommand(options);
      case 'ruleLabCurateCommand':
        return (options: any) => ruleLabCurateCommand(options);
      case 'ruleLabPromoteCommand':
        return (options: any) => ruleLabPromoteCommand(options);
      case 'ruleLabRegressCommand':
        return (options: any) => ruleLabRegressCommand(options);
      default:
        return () => {
          throw new Error(`Unknown rule lab handler: ${handlerName}`);
        };
    }
  };

  const root = program
    .command('rule-lab')
    .description('Offline rule-lab workflow for discover/analyze/review-pack/curate/promote/regress');

  root
    .command('discover')
    .option('--repo-path <path>', 'Repository path (default: cwd)')
    .option('--scope <scope>', 'Discovery scope: full|diff', 'full')
    .option('--seed <seed>', 'Optional deterministic seed')
    .action(action('ruleLabDiscoverCommand'));

  root
    .command('analyze')
    .requiredOption('--run-id <id>', 'Rule-lab run id')
    .requiredOption('--slice-id <id>', 'Slice id')
    .option('--repo-path <path>', 'Repository path (default: cwd)')
    .action(action('ruleLabAnalyzeCommand'));

  root
    .command('review-pack')
    .requiredOption('--run-id <id>', 'Rule-lab run id')
    .requiredOption('--slice-id <id>', 'Slice id')
    .option('--repo-path <path>', 'Repository path (default: cwd)')
    .option('--max-tokens <n>', 'Token budget', '6000')
    .action(action('ruleLabReviewPackCommand'));

  root
    .command('curate')
    .requiredOption('--run-id <id>', 'Rule-lab run id')
    .requiredOption('--slice-id <id>', 'Slice id')
    .requiredOption('--input-path <path>', 'Path to curation input JSON')
    .option('--repo-path <path>', 'Repository path (default: cwd)')
    .action(action('ruleLabCurateCommand'));

  root
    .command('promote')
    .requiredOption('--run-id <id>', 'Rule-lab run id')
    .requiredOption('--slice-id <id>', 'Slice id')
    .option('--repo-path <path>', 'Repository path (default: cwd)')
    .option('--rule-version <version>', 'Promoted rule version', '1.0.0')
    .action(action('ruleLabPromoteCommand'));

  root
    .command('regress')
    .requiredOption('--precision <n>', 'Precision metric')
    .requiredOption('--coverage <n>', 'Coverage metric')
    .option('--repo-path <path>', 'Repository path (default: cwd)')
    .option('--run-id <id>', 'Run id (if provided, write report to .gitnexus/rules/reports)')
    .option('--probes-path <path>', 'Optional JSON file containing regress probes')
    .action(action('ruleLabRegressCommand'));

  root
    .command('compile')
    .description('Compile approved YAML rules into a JSON bundle')
    .option('--repo-path <path>', 'Repository path (default: cwd)')
    .option('--family <family>', 'Rule family to compile', 'analyze_rules')
    .action((options: { repoPath?: string; family?: string }) =>
      compileRules({ repoPath: options.repoPath, family: options.family as any }),
    );
}

export async function ruleLabDiscoverCommand(options: { repoPath?: string; scope?: 'full' | 'diff'; seed?: string }): Promise<void> {
  const result = await discoverRuleLabRun({
    repoPath: resolveRepoPath(options?.repoPath),
    scope: options?.scope || 'full',
    seed: options?.seed,
  });
  output(result);
}

export async function ruleLabAnalyzeCommand(options: { repoPath?: string; runId: string; sliceId: string }): Promise<void> {
  assertConcreteRunSliceIds(options.runId, options.sliceId);
  const repoPath = resolveRepoPath(options?.repoPath);

  const result = await analyzeRuleLabSlice({
    repoPath,
    runId: options.runId,
    sliceId: options.sliceId,
  });
  output(result);
}

export async function ruleLabReviewPackCommand(options: { repoPath?: string; runId: string; sliceId: string; maxTokens?: string | number }): Promise<void> {
  const result = await buildReviewPack({
    repoPath: resolveRepoPath(options?.repoPath),
    runId: options.runId,
    sliceId: options.sliceId,
    maxTokens: Number(options.maxTokens || 6000),
  });
  output(result);
}

export async function ruleLabCurateCommand(options: { repoPath?: string; runId: string; sliceId: string; inputPath: string }): Promise<void> {
  const result = await curateRuleLabSlice({
    repoPath: resolveRepoPath(options?.repoPath),
    runId: options.runId,
    sliceId: options.sliceId,
    inputPath: path.resolve(options.inputPath),
  });
  output(result);
}

export async function ruleLabPromoteCommand(options: { repoPath?: string; runId: string; sliceId: string; ruleVersion?: string; version?: string }): Promise<void> {
  const version = options.ruleVersion ?? options.version;
  const result = await promoteCuratedRules({
    repoPath: resolveRepoPath(options?.repoPath),
    runId: options.runId,
    sliceId: options.sliceId,
    version,
  });
  output(result);
}

export async function ruleLabRegressCommand(options: { precision: string | number; coverage: string | number; repoPath?: string; runId?: string; probesPath?: string }): Promise<void> {
  let probes: any[] | undefined;
  if (options.probesPath) {
    const raw = await fs.readFile(path.resolve(options.probesPath), 'utf-8');
    probes = JSON.parse(raw) as any[];
  }
  const result = await runRuleLabRegress({
    precision: Number(options.precision),
    coverage: Number(options.coverage),
    repoPath: options.repoPath ? resolveRepoPath(options.repoPath) : undefined,
    runId: options.runId,
    probes,
  });
  output(result);
}

export { RULE_LAB_COMMANDS };
