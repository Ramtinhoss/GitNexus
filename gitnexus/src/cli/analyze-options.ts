import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeScopeRules, parseScopeRules } from '../core/ingestion/scope-filter.js';

const REPO_ALIAS_REGEX = /^[a-zA-Z0-9._-]{3,64}$/;

export interface AnalyzeScopeOptions {
  scopeManifest?: string;
  scopePrefix?: string[] | string;
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
