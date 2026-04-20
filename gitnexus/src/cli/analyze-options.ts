import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeScopeRules } from '../core/ingestion/scope-filter.js';
import { parseScopeManifestConfig } from './scope-manifest-config.js';

const REPO_ALIAS_REGEX = /^[a-zA-Z0-9._-]{3,64}$/;

export interface AnalyzeScopeOptions {
  scopeManifest?: string;
  scopePrefix?: string[] | string;
}

export interface StoredAnalyzeOptions {
  includeExtensions?: string[];
  scopeRules?: string[];
  repoAlias?: string;
  embeddings?: boolean;
}

export interface ResolveAnalyzeOptionsInput extends AnalyzeScopeOptions {
  extensions?: string;
  repoAlias?: string;
  embeddings?: boolean;
  reuseOptions?: boolean;
}

export interface EffectiveAnalyzeOptions {
  includeExtensions: string[];
  scopeRules: string[];
  repoAlias?: string;
  embeddings: boolean;
}

export function parseExtensionList(rawExtensions?: string): string[] {
  return (rawExtensions || '')
    .split(',')
    .map((ext) => ext.trim().toLowerCase())
    .filter(Boolean)
    .map((ext) => (ext.startsWith('.') ? ext : `.${ext}`));
}

export function normalizeRepoAlias(repoAlias?: string): string | undefined {
  if (!repoAlias) return undefined;
  const normalized = repoAlias.trim();
  if (!normalized) return undefined;

  if (!REPO_ALIAS_REGEX.test(normalized)) {
    throw new Error('Invalid repo alias. Use ^[a-zA-Z0-9._-]{3,64}$');
  }
  return normalized;
}

export async function resolveAnalyzeScopeRules(options?: AnalyzeScopeOptions): Promise<string[]> {
  let manifestRules: string[] = [];

  if (options?.scopeManifest) {
    const manifestPath = path.resolve(options.scopeManifest);
    const manifest = await readScopeManifestConfig(manifestPath);
    manifestRules = manifest.scopeRules;
    if (manifestRules.length === 0) {
      throw new Error(`Scope manifest has no valid scope rules: ${manifestPath}`);
    }
  }

  return resolveScopeRulesFromInput(
    manifestRules,
    normalizeScopePrefixes(options?.scopePrefix),
    Boolean(options?.scopeManifest),
  );
}

function parseScopePrefixCount(scopePrefix?: string[] | string): number {
  if (Array.isArray(scopePrefix)) return scopePrefix.length;
  if (typeof scopePrefix === 'string') return scopePrefix.trim() ? 1 : 0;
  return 0;
}

export async function resolveEffectiveAnalyzeOptions(
  options?: ResolveAnalyzeOptionsInput,
  stored?: StoredAnalyzeOptions,
): Promise<EffectiveAnalyzeOptions> {
  const manifestConfig = options?.scopeManifest
    ? await readScopeManifestConfig(path.resolve(options.scopeManifest))
    : undefined;

  const includeExtensionsFromCli = parseExtensionList(options?.extensions);
  const scopeRulesFromCli = resolveScopeRulesFromInput(
    manifestConfig?.scopeRules || [],
    normalizeScopePrefixes(options?.scopePrefix),
    Boolean(options?.scopeManifest),
  );
  const repoAliasFromCli = normalizeRepoAlias(options?.repoAlias);

  const manifestExtensions = manifestConfig?.directives.extensions;
  const manifestRepoAlias = manifestConfig?.directives.repoAlias;
  const manifestEmbeddings = manifestConfig?.directives.embeddings;

  const hasCliExtensions = options?.extensions !== undefined;
  const hasCliScope = Boolean(options?.scopeManifest) || parseScopePrefixCount(options?.scopePrefix) > 0;
  const hasCliRepoAlias = options?.repoAlias !== undefined;
  const canReuse = options?.reuseOptions !== false;

  const includeExtensions = hasCliExtensions
    ? includeExtensionsFromCli
    : (manifestExtensions !== undefined
      ? parseExtensionList(manifestExtensions)
      : (canReuse ? (stored?.includeExtensions || []) : []));
  const scopeRules = hasCliScope
    ? scopeRulesFromCli
    : (canReuse ? (stored?.scopeRules || []) : []);
  const repoAlias = hasCliRepoAlias
    ? repoAliasFromCli
    : (manifestRepoAlias !== undefined
      ? normalizeRepoAlias(manifestRepoAlias)
      : (canReuse ? normalizeRepoAlias(stored?.repoAlias) : undefined));
  const embeddings = options?.embeddings
    ?? (manifestEmbeddings !== undefined
      ? parseManifestEmbeddings(manifestEmbeddings)
      : (canReuse ? Boolean(stored?.embeddings) : false));

  return {
    includeExtensions: [...includeExtensions],
    scopeRules: [...scopeRules],
    repoAlias,
    embeddings,
  };
}

function normalizeScopePrefixes(scopePrefix?: string[] | string): string[] {
  const prefixesRaw = Array.isArray(scopePrefix)
    ? scopePrefix || []
    : scopePrefix
      ? [scopePrefix]
      : [];

  return prefixesRaw
    .map((prefix) => prefix.trim())
    .filter(Boolean);
}

function resolveScopeRulesFromInput(
  manifestRules: string[],
  prefixes: string[],
  hasScopeManifest: boolean,
): string[] {
  const normalizedRules = normalizeScopeRules([...manifestRules, ...prefixes]);
  if ((hasScopeManifest || prefixes.length > 0) && normalizedRules.length === 0) {
    throw new Error('No valid scope rules provided.');
  }
  return normalizedRules;
}

async function readScopeManifestConfig(manifestPath: string) {
  let content: string;
  try {
    content = await fs.readFile(manifestPath, 'utf-8');
  } catch {
    throw new Error(`Scope manifest not found: ${manifestPath}`);
  }
  return parseScopeManifestConfig(content);
}

function parseManifestEmbeddings(raw: string): boolean {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`Invalid @embeddings directive value: ${raw}. Expected true or false.`);
}
