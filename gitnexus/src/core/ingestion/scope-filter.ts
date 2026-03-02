function normalizeScopedPath(input: string): string {
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
