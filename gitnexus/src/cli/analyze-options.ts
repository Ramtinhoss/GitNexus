import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeScopeRules, parseScopeRules } from '../core/ingestion/scope-filter.js';

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
  const rules: string[] = [];

  if (options?.scopeManifest) {
    const manifestPath = path.resolve(options.scopeManifest);
    let content: string;
    try {
      content = await fs.readFile(manifestPath, 'utf-8');
    } catch {
      throw new Error(`Scope manifest not found: ${manifestPath}`);
    }

    const manifestRules = parseScopeRules(content);
    if (manifestRules.length === 0) {
      throw new Error(`Scope manifest has no valid scope rules: ${manifestPath}`);
    }
    rules.push(...manifestRules);
  }

  const prefixesRaw = Array.isArray(options?.scopePrefix)
    ? options?.scopePrefix || []
    : options?.scopePrefix
      ? [options.scopePrefix]
      : [];

  for (const prefix of prefixesRaw) {
    const trimmed = prefix.trim();
    if (trimmed) {
      rules.push(trimmed);
    }
  }

  const normalizedRules = normalizeScopeRules(rules);
  if ((options?.scopeManifest || prefixesRaw.length > 0) && normalizedRules.length === 0) {
    throw new Error('No valid scope rules provided.');
  }

  return normalizedRules;
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
  const includeExtensionsFromCli = parseExtensionList(options?.extensions);
  const scopeRulesFromCli = await resolveAnalyzeScopeRules({
    scopeManifest: options?.scopeManifest,
    scopePrefix: options?.scopePrefix,
  });
  const repoAliasFromCli = normalizeRepoAlias(options?.repoAlias);

  const hasCliExtensions = options?.extensions !== undefined;
  const hasCliScope = Boolean(options?.scopeManifest) || parseScopePrefixCount(options?.scopePrefix) > 0;
  const hasCliRepoAlias = options?.repoAlias !== undefined;
  const canReuse = options?.reuseOptions !== false;

  const includeExtensions = hasCliExtensions
    ? includeExtensionsFromCli
    : (canReuse ? (stored?.includeExtensions || []) : []);
  const scopeRules = hasCliScope
    ? scopeRulesFromCli
    : (canReuse ? (stored?.scopeRules || []) : []);
  const repoAlias = hasCliRepoAlias
    ? repoAliasFromCli
    : (canReuse ? normalizeRepoAlias(stored?.repoAlias) : undefined);
  const embeddings = options?.embeddings ?? (canReuse ? Boolean(stored?.embeddings) : false);

  return {
    includeExtensions: [...includeExtensions],
    scopeRules: [...scopeRules],
    repoAlias,
    embeddings,
  };
}
