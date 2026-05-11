import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeScopeRules } from '../core/ingestion/scope-filter.js';

const REPO_ALIAS_REGEX = /^[a-zA-Z0-9._-]{3,64}$/;

export interface StoredAnalyzeOptions {
  includeExtensions?: string[];
  scopeRules?: string[];
  repoAlias?: string;
  embeddings?: boolean;
  csharpDefineCsproj?: string;
}

export interface ResolveAnalyzeOptionsInput {
  extensions?: string;
  scope?: string;
  repoAlias?: string;
  embeddings?: boolean;
  reuseOptions?: boolean;
  csharpDefineCsproj?: string;
}

export interface EffectiveAnalyzeOptions {
  includeExtensions: string[];
  scopeRules: string[];
  repoAlias?: string;
  embeddings: boolean;
  csharpDefineCsproj?: string;
}

export function parseExtensionList(rawExtensions?: string): string[] {
  return (rawExtensions || '')
    .split(',')
    .map((ext) => ext.trim().toLowerCase())
    .filter(Boolean)
    .map((ext) => (ext.startsWith('.') ? ext : `.${ext}`));
}

/** Parse comma-separated scope rules (e.g. "Assets/,Packages/com.veewo.*"). */
export function parseScopeList(rawScope?: string): string[] {
  if (!rawScope) return [];
  const rules = rawScope
    .split(',')
    .map((rule) => rule.trim())
    .filter(Boolean);
  return normalizeScopeRules(rules);
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

export interface ValidatedStoredOptions {
  includeExtensions: string[];
  scopeRules: string[];
  repoAlias?: string;
  embeddings: boolean;
  csharpDefineCsproj?: string;
}

/**
 * Validate stored options from meta.json.analyzeOptions before reusing them.
 * Invalid fields are filtered out or set to undefined, with console.warn output.
 */
export async function validateStoredOptions(
  stored: StoredAnalyzeOptions | undefined,
  repoPath: string,
): Promise<ValidatedStoredOptions> {
  if (!stored) {
    return { includeExtensions: [], scopeRules: [], repoAlias: undefined, embeddings: false, csharpDefineCsproj: undefined };
  }

  // Validate repoAlias
  let repoAlias: string | undefined;
  if (stored.repoAlias) {
    const trimmed = stored.repoAlias.trim();
    if (trimmed && REPO_ALIAS_REGEX.test(trimmed)) {
      repoAlias = trimmed;
    } else {
      console.warn(`  Warning: stored repoAlias "${stored.repoAlias}" is invalid, resetting to undefined.`);
    }
  }

  // Validate includeExtensions (must start with '.')
  let includeExtensions: string[] = [];
  if (stored.includeExtensions) {
    const valid: string[] = [];
    for (const ext of stored.includeExtensions) {
      if (typeof ext === 'string' && ext.startsWith('.')) {
        valid.push(ext);
      } else {
        console.warn(`  Warning: stored includeExtensions entry "${ext}" does not start with '.', filtering out.`);
      }
    }
    includeExtensions = valid;
  }

  // Validate scopeRules (filter empty/whitespace-only)
  let scopeRules: string[] = [];
  if (stored.scopeRules) {
    scopeRules = stored.scopeRules.filter((rule) => typeof rule === 'string' && rule.trim().length > 0);
  }

  // Validate csharpDefineCsproj (file must exist)
  let csharpDefineCsproj: string | undefined;
  if (stored.csharpDefineCsproj) {
    try {
      await fs.stat(stored.csharpDefineCsproj);
      csharpDefineCsproj = stored.csharpDefineCsproj;
    } catch {
      console.warn(`  Warning: stored csharpDefineCsproj "${stored.csharpDefineCsproj}" not found on disk, resetting to undefined.`);
    }
  }

  return {
    includeExtensions,
    scopeRules,
    repoAlias,
    embeddings: Boolean(stored.embeddings),
    csharpDefineCsproj,
  };
}

export async function resolveEffectiveAnalyzeOptions(
  options?: ResolveAnalyzeOptionsInput,
  stored?: StoredAnalyzeOptions,
): Promise<EffectiveAnalyzeOptions> {
  const includeExtensionsFromCli = parseExtensionList(options?.extensions);
  const scopeRulesFromCli = parseScopeList(options?.scope);
  const repoAliasFromCli = normalizeRepoAlias(options?.repoAlias);

  const hasCliExtensions = options?.extensions !== undefined;
  const hasCliScope = options?.scope !== undefined;
  const hasCliRepoAlias = options?.repoAlias !== undefined;
  const hasCliCsproj = options?.csharpDefineCsproj !== undefined;
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
  const embeddings = options?.embeddings !== undefined
    ? options.embeddings
    : (canReuse ? Boolean(stored?.embeddings) : false);
  const csharpDefineCsproj = hasCliCsproj
    ? options!.csharpDefineCsproj
    : (canReuse ? stored?.csharpDefineCsproj : undefined);

  return {
    includeExtensions: [...includeExtensions],
    scopeRules: [...scopeRules],
    repoAlias,
    embeddings,
    csharpDefineCsproj,
  };
}
