import fs from 'node:fs/promises';
import path from 'node:path';
import { getRuleLabPaths } from './paths.js';
import type { RuleDslDraft, RuleDslTopologyHop } from './types.js';
import { writeCompiledRuleBundle, loadCompiledRuleBundle, type StageAwareCompiledRule } from './compiled-bundles.js';

interface PromotableItem {
  id: string;
  rule_id?: string;
  title?: string;
  match?: RuleDslDraft['match'];
  topology?: RuleDslTopologyHop[];
  closure?: RuleDslDraft['closure'];
  claims?: RuleDslDraft['claims'];
  confirmed_chain: {
    steps: Array<{
      hop_type?: string;
      anchor: string;
      snippet: string;
    }>;
  };
  guarantees: string[];
  non_guarantees: string[];
}

interface CatalogEntry {
  id: string;
  version: string;
  enabled: boolean;
  file: string;
  family?: string;
}

interface CatalogShape {
  version: number;
  rules: CatalogEntry[];
}

interface CompiledRuntimeRule {
  id: string;
  version: string;
  family?: string;
  trigger_family: string;
  resource_types: string[];
  host_base_type: string[];
  required_hops: string[];
  guarantees: string[];
  non_guarantees: string[];
  next_action: string;
  match: RuleDslDraft['match'];
  topology: RuleDslTopologyHop[];
  closure: RuleDslDraft['closure'];
  claims: RuleDslDraft['claims'];
  resource_bindings?: import('./types.js').UnityResourceBinding[];
  lifecycle_overrides?: import('./types.js').LifecycleOverrides;
}

export interface PromoteInput {
  repoPath: string;
  runId: string;
  sliceId: string;
  version?: string;
}

export interface PromoteOutput {
  catalog: CatalogShape;
  promotedFiles: string[];
  compiledPaths: Record<'analyze_rules' | 'retrieval_rules' | 'verification_rules', string>;
  paths: ReturnType<typeof getRuleLabPaths>;
}

function quoteYaml(value: string): string {
  const raw = String(value || '');
  if (/^[a-zA-Z0-9._-]+$/.test(raw)) return raw;
  return `'${raw.replace(/'/g, "''")}'`;
}

function inferTriggerFamily(item: PromotableItem): string {
  const fromTitle = String(item.title || '').trim().split(/\s+/)[0];
  if (fromTitle) return fromTitle.toLowerCase();
  return 'runtime';
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function toComparableToken(value: string): string {
  return String(value || '').trim().toLowerCase();
}

function isForbiddenPlaceholder(value: string): boolean {
  const token = toComparableToken(value);
  return token === 'unknown' || token === 'todo' || token === 'tbd' || /<[^>]+>/.test(token);
}

function assertNoPlaceholderScope(values: string[], field: 'resource_types' | 'host_base_type'): void {
  if (values.length === 0) {
    throw new Error(`promote lint failed: ${field} must be non-empty`);
  }
  if (values.some((entry) => isForbiddenPlaceholder(entry))) {
    throw new Error(`promote lint failed: unknown scope placeholder is forbidden (${field})`);
  }
}

function toDraftFromCurated(item: PromotableItem): RuleDslDraft {
  const triggerTokens = unique(item.match?.trigger_tokens || [inferTriggerFamily(item)]);
  const topology = Array.isArray(item.topology) && item.topology.length > 0
    ? item.topology
    : item.confirmed_chain.steps.map((step) => ({
      hop: String(step.hop_type || 'resource'),
      from: { entity: 'resource' },
      to: { entity: 'script' },
      edge: { kind: 'binds_script' },
    }));
  const requiredHops = unique(item.closure?.required_hops || topology.map((step) => step.hop));
  const failureMap = item.closure?.failure_map && Object.keys(item.closure.failure_map).length > 0
    ? item.closure.failure_map
    : { missing_evidence: 'rule_matched_but_evidence_missing' as const };
  const guarantees = unique(item.claims?.guarantees || item.guarantees);
  const nonGuarantees = unique(item.claims?.non_guarantees || item.non_guarantees);
  const nextAction = String(item.claims?.next_action || '').trim() || 'gitnexus query "runtime"';

  return {
    id: String(item.rule_id || item.id || '').trim(),
    version: '2.0.0',
    match: {
      trigger_tokens: triggerTokens,
      symbol_kind: item.match?.symbol_kind || [],
      module_scope: item.match?.module_scope || [],
      resource_types: unique(item.match?.resource_types || []),
      host_base_type: unique(item.match?.host_base_type || []),
    },
    topology,
    closure: {
      required_hops: requiredHops,
      failure_map: failureMap,
    },
    claims: {
      guarantees,
      non_guarantees: nonGuarantees,
      next_action: nextAction,
    },
  };
}

function compileRule(ruleId: string, version: string, draft: RuleDslDraft): CompiledRuntimeRule {
  const triggerFamily = String(draft.match.trigger_tokens[0] || '').trim() || 'runtime';
  const resourceTypes = unique(draft.match.resource_types || []);
  const hostBaseType = unique(draft.match.host_base_type || []);
  if (resourceTypes.length === 0) {
    resourceTypes.push('unspecified_resource');
  }
  if (hostBaseType.length === 0) {
    hostBaseType.push('unspecified_host');
  }
  const requiredHops = unique(draft.closure.required_hops);
  const guarantees = unique(draft.claims.guarantees);
  const nonGuarantees = unique(draft.claims.non_guarantees);
  const nextAction = String(draft.claims.next_action || '').trim() || 'gitnexus query "runtime"';

  assertNoPlaceholderScope(resourceTypes, 'resource_types');
  assertNoPlaceholderScope(hostBaseType, 'host_base_type');

  return {
    id: ruleId,
    version,
    trigger_family: triggerFamily,
    resource_types: resourceTypes,
    host_base_type: hostBaseType,
    required_hops: requiredHops,
    guarantees,
    non_guarantees: nonGuarantees,
    next_action: nextAction,
    match: draft.match,
    topology: draft.topology,
    closure: draft.closure,
    claims: draft.claims,
    ...(draft.resource_bindings ? { resource_bindings: draft.resource_bindings } : {}),
    ...(draft.lifecycle_overrides ? { lifecycle_overrides: draft.lifecycle_overrides } : {}),
  };
}

function toStageAwareCompiledRule(rule: CompiledRuntimeRule, relativeFile: string): StageAwareCompiledRule {
  return {
    id: rule.id,
    version: rule.version,
    trigger_family: rule.trigger_family,
    trigger_tokens: [...rule.match.trigger_tokens],
    resource_types: [...rule.resource_types],
    host_base_type: [...rule.host_base_type],
    required_hops: [...rule.required_hops],
    guarantees: [...rule.guarantees],
    non_guarantees: [...rule.non_guarantees],
    next_action: rule.next_action,
    file_path: relativeFile,
    match: rule.match,
    topology: rule.topology,
    closure: rule.closure,
    claims: rule.claims,
    ...(rule.resource_bindings ? { resource_bindings: rule.resource_bindings } : {}),
    ...(rule.lifecycle_overrides ? { lifecycle_overrides: rule.lifecycle_overrides } : {}),
  };
}

function pushList(lines: string[], key: string, values: string[], indent = ''): void {
  lines.push(`${indent}${key}:`);
  values.forEach((value) => lines.push(`${indent}  - ${quoteYaml(value)}`));
}

function renderObjectLines(lines: string[], object: Record<string, unknown>, indent = ''): void {
  const entries = Object.entries(object || {});
  for (const [key, value] of entries) {
    const scalar = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : JSON.stringify(value);
    lines.push(`${indent}${key}: ${quoteYaml(scalar)}`);
  }
}

function buildRuleYaml(rule: CompiledRuntimeRule): string {
  const lines: string[] = [
    `id: ${quoteYaml(rule.id)}`,
    `version: ${quoteYaml(rule.version)}`,
    ...(rule.family ? [`family: ${quoteYaml(rule.family)}`] : []),
    `trigger_family: ${quoteYaml(rule.trigger_family)}`,
  ];

  pushList(lines, 'resource_types', rule.resource_types);
  pushList(lines, 'host_base_type', rule.host_base_type);
  pushList(lines, 'required_hops', rule.required_hops);
  pushList(lines, 'guarantees', rule.guarantees);
  pushList(lines, 'non_guarantees', rule.non_guarantees);
  lines.push(`next_action: ${quoteYaml(rule.next_action)}`);
  lines.push('match:');
  pushList(lines, 'trigger_tokens', rule.match.trigger_tokens, '  ');
  if (Array.isArray(rule.match.symbol_kind) && rule.match.symbol_kind.length > 0) {
    pushList(lines, 'symbol_kind', rule.match.symbol_kind, '  ');
  }
  if (Array.isArray(rule.match.module_scope) && rule.match.module_scope.length > 0) {
    pushList(lines, 'module_scope', rule.match.module_scope, '  ');
  }
  if (Array.isArray(rule.match.resource_types) && rule.match.resource_types.length > 0) {
    pushList(lines, 'resource_types', rule.match.resource_types, '  ');
  }
  if (Array.isArray(rule.match.host_base_type) && rule.match.host_base_type.length > 0) {
    pushList(lines, 'host_base_type', rule.match.host_base_type, '  ');
  }

  lines.push('topology:');
  for (const hop of rule.topology) {
    lines.push(`  - hop: ${quoteYaml(hop.hop)}`);
    lines.push('    from:');
    renderObjectLines(lines, hop.from || {}, '      ');
    lines.push('    to:');
    renderObjectLines(lines, hop.to || {}, '      ');
    lines.push('    edge:');
    lines.push(`      kind: ${quoteYaml(String(hop.edge?.kind || 'calls'))}`);
    if (hop.constraints && Object.keys(hop.constraints).length > 0) {
      lines.push('    constraints:');
      renderObjectLines(lines, hop.constraints, '      ');
    }
  }

  lines.push('closure:');
  pushList(lines, 'required_hops', rule.closure.required_hops, '  ');
  lines.push('  failure_map:');
  for (const [key, value] of Object.entries(rule.closure.failure_map || {})) {
    lines.push(`    ${quoteYaml(key)}: ${quoteYaml(String(value || 'rule_matched_but_evidence_missing'))}`);
  }

  lines.push('claims:');
  pushList(lines, 'guarantees', rule.claims.guarantees, '  ');
  pushList(lines, 'non_guarantees', rule.claims.non_guarantees, '  ');
  lines.push(`  next_action: ${quoteYaml(rule.claims.next_action)}`);

  if (rule.resource_bindings && rule.resource_bindings.length > 0) {
    lines.push('resource_bindings:');
    for (const binding of rule.resource_bindings) {
      lines.push(`  - kind: ${binding.kind}`);
      if (binding.ref_field_pattern) lines.push(`    ref_field_pattern: ${quoteYaml(binding.ref_field_pattern)}`);
      if (binding.target_entry_points?.length) pushList(lines, 'target_entry_points', binding.target_entry_points, '    ');
      if (binding.host_class_pattern) lines.push(`    host_class_pattern: ${quoteYaml(binding.host_class_pattern)}`);
      if (binding.field_name) lines.push(`    field_name: ${quoteYaml(binding.field_name)}`);
      if (binding.loader_methods?.length) pushList(lines, 'loader_methods', binding.loader_methods, '    ');
    }
  }

  if (rule.lifecycle_overrides) {
    lines.push('lifecycle_overrides:');
    if (rule.lifecycle_overrides.additional_entry_points?.length) {
      pushList(lines, 'additional_entry_points', rule.lifecycle_overrides.additional_entry_points, '  ');
    }
    if (rule.lifecycle_overrides.scope) {
      lines.push(`  scope: ${quoteYaml(rule.lifecycle_overrides.scope)}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

async function readCatalog(catalogPath: string): Promise<CatalogShape> {
  try {
    const raw = await fs.readFile(catalogPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<CatalogShape>;
    return {
      version: Number(parsed.version || 1),
      rules: Array.isArray(parsed.rules) ? parsed.rules as CatalogEntry[] : [],
    };
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return { version: 1, rules: [] };
    }
    throw error;
  }
}

export async function promoteCuratedRules(input: PromoteInput): Promise<PromoteOutput> {
  const normalizedRepoPath = path.resolve(input.repoPath);
  const paths = getRuleLabPaths(normalizedRepoPath, input.runId, input.sliceId);
  const version = String(input.version || '1.0.0');

  const curatedRaw = await fs.readFile(paths.curatedPath, 'utf-8');
  const curatedDoc = JSON.parse(curatedRaw) as { curated?: PromotableItem[] };
  const curatedItems = Array.isArray(curatedDoc.curated) ? curatedDoc.curated : [];
  if (curatedItems.length === 0) {
    throw new Error('No curated candidates available for promotion');
  }
  let dslDraftFromCurate: RuleDslDraft | undefined;
  try {
    const dslDraftRaw = await fs.readFile(path.join(path.dirname(paths.curatedPath), 'dsl-draft.json'), 'utf-8');
    dslDraftFromCurate = JSON.parse(dslDraftRaw) as RuleDslDraft;
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const catalogPath = path.join(paths.rulesRoot, 'catalog.json');
  const catalog = await readCatalog(catalogPath);
  const promotedFiles: string[] = [];
  const compiledRules: StageAwareCompiledRule[] = [];

  await fs.mkdir(paths.promotedRoot, { recursive: true });

  for (const item of curatedItems) {
    const ruleId = String(item.rule_id || item.id || '').trim();
    if (!ruleId) {
      throw new Error('curated item missing rule id');
    }

    const relativeFile = path.join('approved', `${ruleId}.yaml`).split(path.sep).join('/');
    const absoluteFile = path.join(paths.rulesRoot, relativeFile);
    const draft = dslDraftFromCurate && curatedItems.length === 1
      ? { ...dslDraftFromCurate, id: ruleId, version }
      : { ...toDraftFromCurated(item), id: ruleId, version };
    const compiledRule = compileRule(ruleId, version, draft);
    const yaml = buildRuleYaml(compiledRule);
    await fs.writeFile(absoluteFile, yaml, 'utf-8');
    promotedFiles.push(absoluteFile);
    compiledRules.push(toStageAwareCompiledRule(compiledRule, relativeFile));

    const nextEntry: CatalogEntry = {
      id: ruleId,
      version,
      enabled: true,
      file: relativeFile,
      ...(compiledRule.family ? { family: compiledRule.family } : {}),
    };

    const existingIndex = catalog.rules.findIndex((entry) => entry.id === ruleId);
    if (existingIndex >= 0) {
      catalog.rules[existingIndex] = nextEntry;
    } else {
      catalog.rules.push(nextEntry);
    }
  }

  await fs.mkdir(path.dirname(catalogPath), { recursive: true });
  await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf-8');

  const mergeCompiledRules = async (family: 'analyze_rules' | 'retrieval_rules' | 'verification_rules'): Promise<string> => {
    const existing = await loadCompiledRuleBundle(normalizedRepoPath, family, paths.rulesRoot);
    const merged = new Map<string, StageAwareCompiledRule>();
    for (const rule of existing?.rules || []) {
      merged.set(rule.id, rule);
    }
    for (const rule of compiledRules) {
      merged.set(rule.id, rule);
    }
    return writeCompiledRuleBundle(paths.rulesRoot, family, [...merged.values()]);
  };

  const compiledPaths = {
    analyze_rules: await mergeCompiledRules('analyze_rules'),
    retrieval_rules: await mergeCompiledRules('retrieval_rules'),
    verification_rules: await mergeCompiledRules('verification_rules'),
  };

  return {
    catalog,
    promotedFiles,
    compiledPaths,
    paths,
  };
}
