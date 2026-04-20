import { normalizeScopeRules, normalizeScopedPath } from '../core/ingestion/scope-filter.js';

export interface ScopeManifestConfig {
  scopeRules: string[];
  directives: {
    extensions?: string;
    repoAlias?: string;
    embeddings?: string;
  };
}

const SUPPORTED_DIRECTIVES = new Set(['extensions', 'repoalias', 'embeddings']);

export function parseScopeManifestConfig(raw: string): ScopeManifestConfig {
  const scopeRules: string[] = [];
  const directives: ScopeManifestConfig['directives'] = {};

  const lines = raw.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('@')) {
      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex <= 1) {
        throw new Error(`Invalid manifest directive at line ${index + 1}: ${trimmed}`);
      }

      const key = trimmed.slice(1, separatorIndex).trim().toLowerCase();
      const value = trimmed.slice(separatorIndex + 1).trim();

      if (!SUPPORTED_DIRECTIVES.has(key)) {
        throw new Error(`Unknown manifest directive: @${key}`);
      }

      if (key === 'extensions') directives.extensions = value;
      else if (key === 'repoalias') directives.repoAlias = value;
      else if (key === 'embeddings') directives.embeddings = value;
      continue;
    }

    const normalized = normalizeScopedPath(trimmed);
    if (normalized) scopeRules.push(normalized);
  }

  return {
    scopeRules: normalizeScopeRules(scopeRules),
    directives,
  };
}
