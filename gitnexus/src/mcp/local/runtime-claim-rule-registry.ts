import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCompiledRuleBundle } from '../../rule-lab/compiled-bundles.js';
import type { UnityResourceBinding, LifecycleOverrides } from '../../rule-lab/types.js';

export interface RuntimeClaimRuleCatalogEntry {
  id: string;
  version: string;
  file?: string;
  enabled?: boolean;
  family?: 'analyze_rules' | 'verification_rules';
}

export interface RuntimeClaimRule {
  id: string;
  version: string;
  description?: string;
  trigger_family: string;
  resource_types: string[];
  host_base_type: string[];
  match?: {
    trigger_tokens: string[];
    symbol_kind?: string[];
    module_scope?: string[];
    resource_types?: string[];
    host_base_type?: string[];
  };
  required_hops: string[];
  guarantees: string[];
  non_guarantees: string[];
  next_action?: string;
  family?: 'analyze_rules' | 'verification_rules';
  resource_bindings?: UnityResourceBinding[];
  lifecycle_overrides?: LifecycleOverrides;
  file_path: string;
  topology?: Array<{
    hop: string;
    from: Record<string, unknown>;
    to: Record<string, unknown>;
    edge: { kind: string };
    constraints?: Record<string, unknown>;
  }>;
  closure?: {
    required_hops: string[];
    failure_map: Record<string, string>;
  };
  claims?: {
    guarantees: string[];
    non_guarantees: string[];
    next_action: string;
  };
}

export interface RuntimeClaimRuleRegistry {
  repoPath: string;
  rulesRoot: string;
  catalogPath: string;
  activeRules: RuntimeClaimRule[];
}

export type RuleRegistryLoadErrorCode = 'rule_catalog_missing' | 'rule_catalog_invalid' | 'rule_file_missing';

export class RuleRegistryLoadError extends Error {
  code: RuleRegistryLoadErrorCode;
  details?: Record<string, string>;

  constructor(code: RuleRegistryLoadErrorCode, message: string, details?: Record<string, string>) {
    super(message);
    this.name = 'RuleRegistryLoadError';
    this.code = code;
    this.details = details;
  }
}

function decodeYamlScalar(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (trimmed.length < 2) return trimmed;

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if (first === '"' && last === '"') {
    return trimmed
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  if (first === '\'' && last === '\'') {
    return trimmed
      .slice(1, -1)
      .replace(/''/g, '\'');
  }
  return trimmed;
}

function readScalar(raw: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = raw.match(new RegExp(`^${escaped}:\\s*(.+)$`, 'm'));
  if (!match) return undefined;
  return decodeYamlScalar(match[1]);
}

function readList(raw: string, key: string): string[] {
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^${key}:\\s*$`).test(line.trim()));
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s+-\s+/.test(line)) break;
    out.push(decodeYamlScalar(line.replace(/^\s+-\s+/, '')));
  }
  return out;
}

function readSectionLines(raw: string, key: string): string[] {
  const lines = raw.split(/\r?\n/);
  const sectionHeader = new RegExp(`^(\\s*)${key}:\\s*$`);
  const start = lines.findIndex((line) => sectionHeader.test(line));
  if (start < 0) return [];

  const startMatch = lines[start].match(sectionHeader);
  const sectionIndent = startMatch ? startMatch[1].length : 0;
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      out.push(line);
      continue;
    }
    const indent = (line.match(/^(\s*)/)?.[1] || '').length;
    if (indent <= sectionIndent) break;
    out.push(line);
  }
  return out;
}

function readNestedList(raw: string, section: string, key: string): string[] {
  const sectionLines = readSectionLines(raw, section);
  if (sectionLines.length === 0) return [];

  const nestedKey = new RegExp(`^(\\s*)${key}:\\s*$`);
  const start = sectionLines.findIndex((line) => nestedKey.test(line.trimStart()));
  if (start < 0) return [];

  const normalized = sectionLines.map((line) => line.replace(/^\s{2}/, ''));
  const startMatch = normalized[start].match(nestedKey);
  const baseIndent = startMatch ? startMatch[1].length : 0;

  const out: string[] = [];
  for (let i = start + 1; i < normalized.length; i++) {
    const line = normalized[i];
    if (!line.trim()) continue;
    const indent = (line.match(/^(\s*)/)?.[1] || '').length;
    if (indent <= baseIndent) break;
    if (!/^\s*-\s+/.test(line)) break;
    out.push(decodeYamlScalar(line.replace(/^\s*-\s+/, '')));
  }
  return out;
}

function readNestedScalar(raw: string, section: string, key: string): string | undefined {
  const sectionLines = readSectionLines(raw, section).map((line) => line.replace(/^\s{2}/, ''));
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = sectionLines
    .map((line) => line.trimStart())
    .join('\n')
    .match(new RegExp(`^${escaped}:\\s*(.+)$`, 'm'));
  if (!match) return undefined;
  return decodeYamlScalar(match[1]);
}

function majorVersion(version: string): number {
  const n = Number(String(version || '').trim().split('.')[0]);
  return Number.isFinite(n) ? n : 0;
}

function assertDslShape(raw: string, filePath: string, version: string): void {
  if (majorVersion(version) < 2) return;

  const required = ['match', 'topology', 'closure', 'claims'];
  const missing = required.filter((key) => !new RegExp(`^${key}:\\s*$`, 'm').test(raw));
  if (missing.length > 0) {
    throw new Error(`Rule yaml missing required DSL sections (${missing.join(', ')}): ${filePath}`);
  }
}

export function parseRuleYaml(raw: string, filePath: string): RuntimeClaimRule {
  const id = readScalar(raw, 'id');
  const version = readScalar(raw, 'version');
  if (!id || !version) {
    throw new Error(`Rule yaml missing required id/version: ${filePath}`);
  }

  assertDslShape(raw, filePath, version);

  const triggerTokens = readNestedList(raw, 'match', 'trigger_tokens');
  const closureRequiredHops = readNestedList(raw, 'closure', 'required_hops');
  const claimGuarantees = readNestedList(raw, 'claims', 'guarantees');
  const claimNonGuarantees = readNestedList(raw, 'claims', 'non_guarantees');
  const claimNextAction = readNestedScalar(raw, 'claims', 'next_action');
  const legacyTriggerFamily = readScalar(raw, 'trigger_family');
  const legacyRequiredHops = readList(raw, 'required_hops');
  const legacyGuarantees = readList(raw, 'guarantees');
  const legacyNonGuarantees = readList(raw, 'non_guarantees');
  const legacyNextAction = readScalar(raw, 'next_action');

  // Parse resource_bindings
  const rbLines = readSectionLines(raw, 'resource_bindings');
  let resource_bindings: UnityResourceBinding[] | undefined;
  if (rbLines.length > 0) {
    resource_bindings = [];
    const joined = rbLines.map((l) => l.replace(/^\s{2}/, '')).join('\n');
    const entries = joined.split(/(?=^\s*- kind:)/m).filter((s) => s.trim());
    for (const entry of entries) {
      const kindMatch = entry.match(/- kind:\s*(.+)/);
      if (!kindMatch) continue;
      const binding: UnityResourceBinding = { kind: decodeYamlScalar(kindMatch[1]) as UnityResourceBinding['kind'] };
      const scalar = (k: string) => {
        const m = entry.match(new RegExp(`^\\s+${k}:\\s*(.+)$`, 'm'));
        return m ? decodeYamlScalar(m[1]) : undefined;
      };
      const list = (k: string): string[] | undefined => {
        const lines = entry.split('\n');
        const idx = lines.findIndex((l) => new RegExp(`^\\s+${k}:\\s*$`).test(l));
        if (idx < 0) return undefined;
        const out: string[] = [];
        for (let i = idx + 1; i < lines.length; i++) {
          if (!/^\s+-\s+/.test(lines[i])) break;
          out.push(decodeYamlScalar(lines[i].replace(/^\s+-\s+/, '')));
        }
        return out.length > 0 ? out : undefined;
      };
      binding.ref_field_pattern = scalar('ref_field_pattern');
      binding.target_entry_points = list('target_entry_points');
      binding.host_class_pattern = scalar('host_class_pattern');
      binding.field_name = scalar('field_name');
      binding.loader_methods = list('loader_methods');
      binding.scene_name = scalar('scene_name');
      binding.source_class_pattern = scalar('source_class_pattern');
      binding.source_method = scalar('source_method');
      binding.target_class_pattern = scalar('target_class_pattern');
      binding.target_method = scalar('target_method');
      resource_bindings.push(binding);
    }
    if (resource_bindings.length === 0) resource_bindings = undefined;
  }

  // Parse lifecycle_overrides
  const loEntryPoints = readNestedList(raw, 'lifecycle_overrides', 'additional_entry_points');
  const loScope = readNestedScalar(raw, 'lifecycle_overrides', 'scope');
  const lifecycle_overrides: LifecycleOverrides | undefined =
    loEntryPoints.length > 0 || loScope
      ? {
          ...(loEntryPoints.length > 0 ? { additional_entry_points: loEntryPoints } : {}),
          ...(loScope ? { scope: loScope } : {}),
        }
      : undefined;

  return {
    id,
    version,
    trigger_family: legacyTriggerFamily || triggerTokens[0] || 'unknown',
    resource_types: readList(raw, 'resource_types'),
    host_base_type: readList(raw, 'host_base_type'),
    match: {
      trigger_tokens: triggerTokens,
      symbol_kind: readNestedList(raw, 'match', 'symbol_kind'),
      module_scope: readNestedList(raw, 'match', 'module_scope'),
      resource_types: readNestedList(raw, 'match', 'resource_types'),
      host_base_type: readNestedList(raw, 'match', 'host_base_type'),
    },
    required_hops: closureRequiredHops.length > 0 ? closureRequiredHops : legacyRequiredHops,
    guarantees: claimGuarantees.length > 0 ? claimGuarantees : legacyGuarantees,
    non_guarantees: claimNonGuarantees.length > 0 ? claimNonGuarantees : legacyNonGuarantees,
    next_action: claimNextAction || legacyNextAction,
    family: (readScalar(raw, 'family') as RuntimeClaimRule['family']) || 'verification_rules',
    resource_bindings,
    lifecycle_overrides,
    file_path: filePath,
  };
}

/**
 * Runtime claim rule registry remains the source for analyze-time synthetic-edge production
 * and offline governance/report workflows. Query-time runtime closure verification is graph-only.
 */
export async function loadRuleRegistry(repoPath: string, rulesRoot?: string): Promise<RuntimeClaimRuleRegistry> {
  const normalizedRepoPath = path.resolve(repoPath);
  const root = rulesRoot
    ? path.resolve(rulesRoot)
    : path.join(normalizedRepoPath, '.gitnexus', 'rules');
  const compiledVerificationBundle = await loadCompiledRuleBundle(normalizedRepoPath, 'verification_rules', root);
  if (compiledVerificationBundle && compiledVerificationBundle.rules.length > 0) {
    return {
      repoPath: normalizedRepoPath,
      rulesRoot: root,
      catalogPath: path.join(root, 'compiled', 'verification_rules.v2.json'),
      activeRules: compiledVerificationBundle.rules.map((rule) => ({
        id: rule.id,
        version: rule.version,
        trigger_family: rule.trigger_family,
        resource_types: rule.resource_types,
        host_base_type: rule.host_base_type,
        match: rule.match,
        required_hops: rule.required_hops,
        guarantees: rule.guarantees,
        non_guarantees: rule.non_guarantees,
        next_action: rule.next_action,
        file_path: rule.file_path,
        topology: rule.topology,
        closure: rule.closure,
        claims: rule.claims,
      })),
    };
  }
  const catalogPath = path.join(root, 'catalog.json');
  let catalogRaw: string;
  try {
    catalogRaw = await fs.readFile(catalogPath, 'utf-8');
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      throw new RuleRegistryLoadError(
        'rule_catalog_missing',
        `Runtime claim rule catalog not found: ${catalogPath}`,
        { repoPath: normalizedRepoPath, rulesRoot: root, catalogPath },
      );
    }
    throw error;
  }

  let catalog: { rules?: RuntimeClaimRuleCatalogEntry[] };
  try {
    catalog = JSON.parse(catalogRaw) as { rules?: RuntimeClaimRuleCatalogEntry[] };
  } catch {
    throw new RuleRegistryLoadError(
      'rule_catalog_invalid',
      `Runtime claim rule catalog is invalid JSON: ${catalogPath}`,
      { repoPath: normalizedRepoPath, rulesRoot: root, catalogPath },
    );
  }
  const catalogRules = Array.isArray(catalog.rules) ? catalog.rules : [];

  const activeRules: RuntimeClaimRule[] = [];
  for (const entry of catalogRules) {
    if (entry.enabled === false) continue;
    const relativeRulePath = String(entry.file || path.join('approved', `${entry.id}.yaml`));
    const rulePath = path.join(root, relativeRulePath);
    let raw: string;
    try {
      raw = await fs.readFile(rulePath, 'utf-8');
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        throw new RuleRegistryLoadError(
          'rule_file_missing',
          `Runtime claim rule file not found: ${rulePath}`,
          { repoPath: normalizedRepoPath, rulesRoot: root, catalogPath, rulePath, ruleId: entry.id },
        );
      }
      throw error;
    }
    const parsed = parseRuleYaml(raw, rulePath);
    if (parsed.id !== entry.id) {
      throw new Error(`Rule id mismatch between catalog and yaml: ${entry.id} vs ${parsed.id}`);
    }
    activeRules.push({
      ...parsed,
      version: entry.version || parsed.version,
      family: entry.family || parsed.family || 'verification_rules',
    });
  }

  return {
    repoPath: normalizedRepoPath,
    rulesRoot: root,
    catalogPath,
    activeRules,
  };
}

export async function loadAnalyzeRules(repoPath: string, rulesRoot?: string): Promise<RuntimeClaimRule[]> {
  const normalizedRepoPath = path.resolve(repoPath);
  const root = rulesRoot
    ? path.resolve(rulesRoot)
    : path.join(normalizedRepoPath, '.gitnexus', 'rules');
  const analyzeBundle = await loadCompiledRuleBundle(normalizedRepoPath, 'analyze_rules', root);
  if (analyzeBundle && analyzeBundle.rules.length > 0) {
    return analyzeBundle.rules.map((rule) => ({
      ...rule,
      family: 'analyze_rules' as const,
    }));
  }
  const registry = await loadRuleRegistry(repoPath, rulesRoot);
  return registry.activeRules.filter((r) => r.family === 'analyze_rules');
}
