export type ScopeClass = 'user_code' | 'third_party' | 'unknown';

export interface ScopeEvidence {
  normalizedPath: string;
  matchedPrefix?: string;
}

export interface ScopeClassification {
  scopeClass: ScopeClass;
  reasonCode: 'user_scope_prefix_match' | 'third_party_prefix_match' | 'unknown_scope_prefix';
  evidence: ScopeEvidence;
}

export interface ScopeClassifierOptions {
  userPrefixes?: string[];
  thirdPartyPrefixes?: string[];
}

const DEFAULT_USER_PREFIXES = ['Assets/NEON/'];
const DEFAULT_THIRD_PARTY_PREFIXES = ['Assets/Plugins/', 'Packages/', 'Library/', 'ThirdParty/'];

function normalizePrefix(prefix: string): string {
  const unified = prefix.replace(/\\/g, '/');
  return unified.endsWith('/') ? unified : `${unified}/`;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function findMatchedPrefix(filePath: string, prefixes: string[]): string | null {
  const normalized = normalizePath(filePath);
  for (const rawPrefix of prefixes) {
    const prefix = normalizePrefix(rawPrefix);
    if (normalized.startsWith(prefix)) return prefix;
  }
  return null;
}

export function classifyScopePath(filePath: string, options: ScopeClassifierOptions = {}): ScopeClassification {
  const normalizedPath = normalizePath(filePath);
  const userPrefixes = (options.userPrefixes ?? DEFAULT_USER_PREFIXES).map(normalizePrefix);
  const thirdPartyPrefixes = (options.thirdPartyPrefixes ?? DEFAULT_THIRD_PARTY_PREFIXES).map(normalizePrefix);

  const userPrefix = findMatchedPrefix(normalizedPath, userPrefixes);
  if (userPrefix) {
    return {
      scopeClass: 'user_code',
      reasonCode: 'user_scope_prefix_match',
      evidence: {
        normalizedPath,
        matchedPrefix: userPrefix,
      },
    };
  }

  const thirdPartyPrefix = findMatchedPrefix(normalizedPath, thirdPartyPrefixes);
  if (thirdPartyPrefix) {
    return {
      scopeClass: 'third_party',
      reasonCode: 'third_party_prefix_match',
      evidence: {
        normalizedPath,
        matchedPrefix: thirdPartyPrefix,
      },
    };
  }

  return {
    scopeClass: 'unknown',
    reasonCode: 'unknown_scope_prefix',
    evidence: {
      normalizedPath,
    },
  };
}

