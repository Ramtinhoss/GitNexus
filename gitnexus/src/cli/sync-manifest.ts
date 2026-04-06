import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { parseScopeManifestConfig } from './scope-manifest-config.js';
import { normalizeRepoAlias, parseExtensionList } from './analyze-options.js';

export interface SyncManifestScopeOptions {
  scopeManifest?: string;
  scopePrefix?: string[] | string;
}

export type SyncManifestPolicy = 'ask' | 'update' | 'keep' | 'error';

export interface SyncManifestDiffEntry {
  directive: 'extensions' | 'repoAlias' | 'embeddings';
  manifestValue?: string;
  cliValue: string;
}

export interface EnforceSyncManifestConsistencyInput {
  manifestPath?: string;
  extensions?: string;
  repoAlias?: string;
  embeddings?: boolean;
  policy?: SyncManifestPolicy;
  stdinIsTTY?: boolean;
  prompt?: (message: string) => Promise<'update' | 'keep'>;
}

export interface EnforceSyncManifestConsistencyResult {
  decision: 'none' | 'update' | 'keep';
  diff: SyncManifestDiffEntry[];
}

interface NormalizedManifestDirectives {
  extensions?: string;
  repoAlias?: string;
  embeddings?: string;
}

export function resolveDefaultSyncManifestPath(repoPath: string): string {
  return path.join(repoPath, '.gitnexus', 'sync-manifest.txt');
}

export function shouldAutoUseSyncManifest(options?: SyncManifestScopeOptions): boolean {
  if (options?.scopeManifest) return false;
  return parseScopePrefixCount(options?.scopePrefix) === 0;
}

export async function resolveScopeManifestForAnalyze(
  repoPath: string,
  options?: SyncManifestScopeOptions,
  pathExists: (candidatePath: string) => Promise<boolean> = fileExists,
): Promise<string | undefined> {
  if (options?.scopeManifest) {
    return options.scopeManifest;
  }

  if (!shouldAutoUseSyncManifest(options)) {
    return undefined;
  }

  const defaultManifestPath = resolveDefaultSyncManifestPath(repoPath);
  if (await pathExists(defaultManifestPath)) {
    return defaultManifestPath;
  }
  return undefined;
}

export async function enforceSyncManifestConsistency(
  input: EnforceSyncManifestConsistencyInput,
): Promise<EnforceSyncManifestConsistencyResult> {
  if (!input.manifestPath) {
    return { decision: 'none', diff: [] };
  }
  ensureConcreteManifestPath(input.manifestPath);

  const raw = await fs.readFile(input.manifestPath, 'utf-8');
  const parsed = parseScopeManifestConfig(raw);
  const normalizedDirectives = normalizeManifestDirectives(parsed.directives);
  const diff = computeDiff(normalizedDirectives, input);
  const policy = normalizePolicy(input.policy);

  if (diff.length === 0) {
    if (policy === 'update') {
      throw new Error('Sync manifest rewrite requires non-empty diff entries.');
    }
    return { decision: 'none', diff };
  }

  const decision = await resolveDecision(
    policy,
    input.manifestPath,
    diff,
    input.stdinIsTTY,
    input.prompt,
  );

  if (decision === 'update') {
    const nextDirectives = mergeDirectivesForUpdate(normalizedDirectives, input);
    const rewritten = renderSyncManifest(parsed.scopeRules, nextDirectives);
    await fs.writeFile(input.manifestPath, rewritten, 'utf-8');
  }

  return {
    decision,
    diff,
  };
}

function parseScopePrefixCount(scopePrefix?: string[] | string): number {
  if (Array.isArray(scopePrefix)) return scopePrefix.length;
  if (typeof scopePrefix === 'string') return scopePrefix.trim() ? 1 : 0;
  return 0;
}

async function fileExists(candidatePath: string): Promise<boolean> {
  try {
    await fs.stat(candidatePath);
    return true;
  } catch {
    return false;
  }
}

function normalizePolicy(raw?: string): SyncManifestPolicy {
  if (!raw) return 'ask';
  if (raw === 'ask' || raw === 'update' || raw === 'keep' || raw === 'error') return raw;
  throw new Error(`Invalid --sync-manifest-policy value: ${raw}. Use ask|update|keep|error.`);
}

function normalizeManifestDirectives(directives: {
  extensions?: string;
  repoAlias?: string;
  embeddings?: string;
}): NormalizedManifestDirectives {
  return {
    extensions: normalizeExtensions(directives.extensions),
    repoAlias: normalizeAlias(directives.repoAlias),
    embeddings: normalizeEmbeddings(directives.embeddings),
  };
}

function computeDiff(
  manifest: NormalizedManifestDirectives,
  input: EnforceSyncManifestConsistencyInput,
): SyncManifestDiffEntry[] {
  const diff: SyncManifestDiffEntry[] = [];

  if (input.extensions !== undefined) {
    const cliValue = normalizeExtensions(input.extensions);
    if (cliValue !== manifest.extensions) {
      diff.push({ directive: 'extensions', manifestValue: manifest.extensions, cliValue: cliValue || '' });
    }
  }

  if (input.repoAlias !== undefined) {
    const cliValue = normalizeAlias(input.repoAlias);
    if (cliValue !== manifest.repoAlias) {
      diff.push({ directive: 'repoAlias', manifestValue: manifest.repoAlias, cliValue: cliValue || '' });
    }
  }

  if (input.embeddings !== undefined) {
    const cliValue = input.embeddings ? 'true' : 'false';
    if (cliValue !== manifest.embeddings) {
      diff.push({ directive: 'embeddings', manifestValue: manifest.embeddings, cliValue });
    }
  }

  return diff;
}

async function resolveDecision(
  policy: SyncManifestPolicy,
  manifestPath: string,
  diff: SyncManifestDiffEntry[],
  stdinIsTTY: boolean | undefined,
  prompt: ((message: string) => Promise<'update' | 'keep'>) | undefined,
): Promise<'update' | 'keep'> {
  if (policy === 'update' || policy === 'keep') return policy;
  if (policy === 'error') {
    throw new Error(`${formatMismatchHeader(manifestPath)}\n${formatDiff(diff)}`);
  }

  if (stdinIsTTY === undefined) {
    throw new Error('TTY prompt branch requires concrete stdin.isTTY evidence.');
  }

  const interactive = stdinIsTTY;
  if (!interactive) {
    throw new Error(
      `${formatMismatchHeader(manifestPath)}\n${formatDiff(diff)}\n` +
      'Non-interactive mode requires --sync-manifest-policy ask|update|keep|error.',
    );
  }

  const promptFn = prompt || defaultPrompt;
  return promptFn(
    [
      formatMismatchHeader(manifestPath),
      formatDiff(diff),
      'Choose: update (rewrite sync-manifest) or keep (continue without rewrite).',
    ].join('\n'),
  );
}

function mergeDirectivesForUpdate(
  manifest: NormalizedManifestDirectives,
  input: EnforceSyncManifestConsistencyInput,
): NormalizedManifestDirectives {
  const merged: NormalizedManifestDirectives = { ...manifest };

  if (input.extensions !== undefined) {
    merged.extensions = normalizeExtensions(input.extensions);
  }
  if (input.repoAlias !== undefined) {
    merged.repoAlias = normalizeAlias(input.repoAlias);
  }
  if (input.embeddings !== undefined) {
    merged.embeddings = input.embeddings ? 'true' : 'false';
  }

  return merged;
}

function renderSyncManifest(scopeRules: string[], directives: NormalizedManifestDirectives): string {
  const lines: string[] = [...scopeRules];

  if (directives.extensions) lines.push(`@extensions=${directives.extensions}`);
  if (directives.repoAlias) lines.push(`@repoAlias=${directives.repoAlias}`);
  if (directives.embeddings) lines.push(`@embeddings=${directives.embeddings}`);

  return `${lines.join('\n')}\n`;
}

function normalizeExtensions(raw?: string): string | undefined {
  if (raw === undefined) return undefined;
  const parsed = parseExtensionList(raw);
  return parsed.length > 0 ? parsed.join(',') : undefined;
}

function normalizeAlias(raw?: string): string | undefined {
  if (raw === undefined) return undefined;
  return normalizeRepoAlias(raw);
}

function normalizeEmbeddings(raw?: string): string | undefined {
  if (raw === undefined) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true') return 'true';
  if (normalized === 'false') return 'false';
  throw new Error(`Invalid @embeddings directive value: ${raw}. Expected true or false.`);
}

function formatMismatchHeader(manifestPath: string): string {
  return `Explicit analyze options differ from sync manifest directives: ${manifestPath}`;
}

function formatDiff(diff: SyncManifestDiffEntry[]): string {
  return diff
    .map((entry) => `- @${entry.directive}: ${entry.manifestValue ?? '<unset>'} -> ${entry.cliValue}`)
    .join('\n');
}

async function defaultPrompt(message: string): Promise<'update' | 'keep'> {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`${message}\nUpdate sync-manifest now? [y/N] `);
    return /^y(es)?$/i.test(answer.trim()) ? 'update' : 'keep';
  } finally {
    rl.close();
  }
}

function ensureConcreteManifestPath(manifestPath: string): void {
  const normalized = manifestPath.trim();
  if (!normalized) {
    throw new Error('Invalid placeholder manifest path: empty value.');
  }

  if (
    /placeholder/i.test(normalized) ||
    /<\s*path\s*>/i.test(normalized) ||
    /todo/i.test(normalized)
  ) {
    throw new Error(`Invalid placeholder manifest path: ${manifestPath}`);
  }
}
