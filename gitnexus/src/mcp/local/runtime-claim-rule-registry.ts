import fs from 'node:fs/promises';
import path from 'node:path';

export interface RuntimeClaimRuleCatalogEntry {
  id: string;
  version: string;
  file?: string;
  enabled?: boolean;
}

export interface RuntimeClaimRule {
  id: string;
  version: string;
  trigger_family: string;
  resource_types: string[];
  host_base_type: string[];
  required_hops: string[];
  guarantees: string[];
  non_guarantees: string[];
  next_action?: string;
  file_path: string;
}

export interface RuntimeClaimRuleRegistry {
  repoPath: string;
  rulesRoot: string;
  catalogPath: string;
  activeRules: RuntimeClaimRule[];
}

function readScalar(raw: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = raw.match(new RegExp(`^${escaped}:\\s*(.+)$`, 'm'));
  if (!match) return undefined;
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

function readList(raw: string, key: string): string[] {
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^${key}:\\s*$`).test(line.trim()));
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s+-\s+/.test(line)) break;
    out.push(line.replace(/^\s+-\s+/, '').trim().replace(/^['"]|['"]$/g, ''));
  }
  return out;
}

function parseRuleYaml(raw: string, filePath: string): RuntimeClaimRule {
  const id = readScalar(raw, 'id');
  const version = readScalar(raw, 'version');
  if (!id || !version) {
    throw new Error(`Rule yaml missing required id/version: ${filePath}`);
  }

  return {
    id,
    version,
    trigger_family: readScalar(raw, 'trigger_family') || 'unknown',
    resource_types: readList(raw, 'resource_types'),
    host_base_type: readList(raw, 'host_base_type'),
    required_hops: readList(raw, 'required_hops'),
    guarantees: readList(raw, 'guarantees'),
    non_guarantees: readList(raw, 'non_guarantees'),
    next_action: readScalar(raw, 'next_action'),
    file_path: filePath,
  };
}

export async function loadRuleRegistry(repoPath: string, rulesRoot?: string): Promise<RuntimeClaimRuleRegistry> {
  const normalizedRepoPath = path.resolve(repoPath);
  const requestedRoot = rulesRoot
    ? path.resolve(rulesRoot)
    : path.join(normalizedRepoPath, '.gitnexus', 'rules');
  const requestedCatalogPath = path.join(requestedRoot, 'catalog.json');
  let root = requestedRoot;
  let catalogPath = requestedCatalogPath;
  let catalogRaw: string;
  try {
    catalogRaw = await fs.readFile(catalogPath, 'utf-8');
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
    const fallbackRoot = path.resolve('.gitnexus', 'rules');
    const fallbackCatalogPath = path.join(fallbackRoot, 'catalog.json');
    if (fallbackCatalogPath === requestedCatalogPath) throw error;
    catalogRaw = await fs.readFile(fallbackCatalogPath, 'utf-8');
    root = fallbackRoot;
    catalogPath = fallbackCatalogPath;
  }

  const catalog = JSON.parse(catalogRaw) as { rules?: RuntimeClaimRuleCatalogEntry[] };
  const catalogRules = Array.isArray(catalog.rules) ? catalog.rules : [];

  const activeRules: RuntimeClaimRule[] = [];
  for (const entry of catalogRules) {
    if (entry.enabled === false) continue;
    const relativeRulePath = String(entry.file || path.join('approved', `${entry.id}.yaml`));
    const rulePath = path.join(root, relativeRulePath);
    const raw = await fs.readFile(rulePath, 'utf-8');
    const parsed = parseRuleYaml(raw, rulePath);
    if (parsed.id !== entry.id) {
      throw new Error(`Rule id mismatch between catalog and yaml: ${entry.id} vs ${parsed.id}`);
    }
    activeRules.push({
      ...parsed,
      version: entry.version || parsed.version,
    });
  }

  return {
    repoPath: normalizedRepoPath,
    rulesRoot: root,
    catalogPath,
    activeRules,
  };
}
