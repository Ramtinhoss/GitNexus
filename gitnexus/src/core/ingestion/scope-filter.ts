export interface ScopePathCollision {
  normalizedPath: string;
  paths: string[];
}

export interface ScopeSelectionDiagnostics {
  appliedRuleCount: number;
  matchedFiles: number;
  overlapFiles: number;
  dedupedMatchCount: number;
  normalizedCollisions: ScopePathCollision[];
}

export interface ScopeSelectionResult<T extends { path: string }> {
  selected: T[];
  diagnostics: ScopeSelectionDiagnostics;
}

export function normalizeScopedPath(input: string): string {
  return input
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');
}

export function parseScopeRules(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => normalizeScopedPath(line))
    .filter((line) => line.length > 0);
}

export function normalizeScopeRules(rules: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const rule of rules) {
    const cleaned = normalizeScopedPath(rule);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    normalized.push(cleaned);
  }

  return normalized;
}

export function pathMatchesScopeRule(relPath: string, rule: string): boolean {
  const normalizedPath = normalizeScopedPath(relPath);
  const normalizedRule = normalizeScopedPath(rule);
  if (!normalizedPath || !normalizedRule) return false;

  if (normalizedRule.endsWith('*')) {
    const prefix = normalizedRule.slice(0, -1);
    return normalizedPath.startsWith(prefix);
  }

  return normalizedPath === normalizedRule || normalizedPath.startsWith(`${normalizedRule}/`);
}

export function pathMatchesScopeRules(relPath: string, rules: string[]): boolean {
  const normalizedRules = normalizeScopeRules(rules);
  if (normalizedRules.length === 0) return true;
  return normalizedRules.some((rule) => pathMatchesScopeRule(relPath, rule));
}

export function selectEntriesByScopeRules<T extends { path: string }>(
  entries: T[],
  rules: string[],
): ScopeSelectionResult<T> {
  const normalizedRules = normalizeScopeRules(rules);
  if (normalizedRules.length === 0) {
    return {
      selected: entries,
      diagnostics: {
        appliedRuleCount: 0,
        matchedFiles: entries.length,
        overlapFiles: 0,
        dedupedMatchCount: 0,
        normalizedCollisions: [],
      },
    };
  }

  const selected: T[] = [];
  let overlapFiles = 0;
  let dedupedMatchCount = 0;

  const collisionIndex = new Map<string, Set<string>>();

  for (const entry of entries) {
    const matchedRules = normalizedRules.filter((rule) => pathMatchesScopeRule(entry.path, rule));
    if (matchedRules.length === 0) continue;

    selected.push(entry);

    if (matchedRules.length > 1) {
      overlapFiles += 1;
      dedupedMatchCount += matchedRules.length - 1;
    }

    const normalizedPath = normalizeScopedPath(entry.path);
    if (!normalizedPath) continue;

    const existing = collisionIndex.get(normalizedPath) || new Set<string>();
    existing.add(entry.path);
    collisionIndex.set(normalizedPath, existing);
  }

  const normalizedCollisions: ScopePathCollision[] = [];
  for (const [normalizedPath, paths] of collisionIndex.entries()) {
    if (paths.size > 1) {
      normalizedCollisions.push({
        normalizedPath,
        paths: [...paths].sort(),
      });
    }
  }

  normalizedCollisions.sort((a, b) => a.normalizedPath.localeCompare(b.normalizedPath));

  return {
    selected,
    diagnostics: {
      appliedRuleCount: normalizedRules.length,
      matchedFiles: selected.length,
      overlapFiles,
      dedupedMatchCount,
      normalizedCollisions,
    },
  };
}
