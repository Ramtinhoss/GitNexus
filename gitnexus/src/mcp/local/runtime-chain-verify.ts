import fs from 'node:fs/promises';
import path from 'node:path';
import {
  deriveRuntimeChainEvidenceLevel,
  type RuntimeChainEvidenceLevel,
} from './runtime-chain-evidence.js';
import { buildRuntimeClaimFromRule, type RuntimeClaim } from './runtime-claim.js';
import { RuleRegistryLoadError, loadRuleRegistry, type RuntimeClaimRule } from './runtime-claim-rule-registry.js';

export type RuntimeChainVerifyMode = 'off' | 'on-demand';
export type RuntimeChainStatus = 'pending' | 'verified_partial' | 'verified_full' | 'failed';
export type RuntimeChainHopType = 'resource' | 'guid_map' | 'code_loader' | 'code_runtime';

export interface RuntimeChainHop {
  hop_type: RuntimeChainHopType;
  anchor: string;
  confidence: 'low' | 'medium' | 'high';
  note: string;
  snippet?: string;
}

export interface RuntimeChainGap {
  segment: 'resource' | 'guid_map' | 'loader' | 'runtime';
  reason: string;
  next_command: string;
}

export interface RuntimeChainResult {
  status: RuntimeChainStatus;
  evidence_level: RuntimeChainEvidenceLevel;
  hops: RuntimeChainHop[];
  gaps: RuntimeChainGap[];
}

interface QueryExecutor {
  (query: string, params?: Record<string, unknown>): Promise<any[]>;
}

interface VerifyRuntimeChainInput {
  repoPath: string;
  executeParameterized: QueryExecutor;
  queryText?: string;
  resourceSeedPath?: string;
  mappedSeedTargets?: string[];
  symbolName?: string;
  symbolFilePath?: string;
  resourceBindings?: Array<{ resourcePath?: string }>;
  requiredHops?: string[];
  rule?: RuntimeClaimRule;
}

interface VerifyRuntimeClaimInput extends VerifyRuntimeChainInput {
  rulesRoot?: string;
  minimumEvidenceSatisfied?: boolean;
}

const VERIFY_NEXT_COMMAND = 'node gitnexus/dist/cli/index.js query --unity-resources on --unity-hydration parity --runtime-chain-verify on-demand "Reload NEON.Game.Graph.Nodes.Reloads"';
const DEFAULT_REQUIRED_HOPS: RuntimeChainHopType[] = ['resource', 'guid_map', 'code_loader', 'code_runtime'];
const SYMBOL_NAME_QUERY_LIMIT = 30;
const CALL_EDGE_QUERY_LIMIT = 40;

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function buildDefaultVerifyNextCommand(queryText?: string): string {
  const normalizedQuery = normalizeText(queryText) || 'Reload NEON.Game.Graph.Nodes.Reloads';
  const escapedQuery = normalizedQuery
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
  return `node gitnexus/dist/cli/index.js query --unity-resources on --unity-hydration parity --runtime-chain-verify on-demand "${escapedQuery}"`;
}

function buildRuntimeMatchHaystack(input: VerifyRuntimeChainInput): string {
  return [
    input.queryText,
    input.resourceSeedPath,
    input.symbolName,
    input.symbolFilePath,
    ...(input.mappedSeedTargets || []),
    ...(input.resourceBindings || []).map((binding) => binding.resourcePath),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function parseTriggerTokens(triggerFamily: string): string[] {
  return String(triggerFamily || '')
    .toLowerCase()
    .split(/[\s,|/]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function sanitizeRequiredHops(requiredHops?: string[]): RuntimeChainHopType[] {
  const allowed = new Set<RuntimeChainHopType>(['resource', 'guid_map', 'code_loader', 'code_runtime']);
  const normalized = (requiredHops || [])
    .map((hop) => String(hop || '').trim().toLowerCase())
    .filter((hop): hop is RuntimeChainHopType => allowed.has(hop as RuntimeChainHopType));
  return normalized.length > 0 ? [...new Set(normalized)] : [...DEFAULT_REQUIRED_HOPS];
}

function buildGap(segment: RuntimeChainGap['segment'], reason: string): RuntimeChainGap {
  return {
    segment,
    reason,
    next_command: VERIFY_NEXT_COMMAND,
  };
}

interface SymbolCandidate {
  id: string;
  name: string;
  type: string;
  filePath: string;
  startLine?: number;
}

interface CallEdge {
  sourceId: string;
  sourceName: string;
  sourceFilePath: string;
  sourceStartLine?: number;
  targetId: string;
  targetName: string;
  targetFilePath: string;
  targetStartLine?: number;
}

function normalizePathLike(value: string): string {
  return String(value || '').replace(/\\/g, '/').trim().toLowerCase();
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function extractQueryResourcePaths(queryText?: string): string[] {
  const raw = String(queryText || '');
  const matches = raw.match(/Assets\/[^\s"']+\.(?:asset|prefab|meta)/gi) || [];
  return dedupeStrings(matches);
}

function resolvePrimaryQueryResourcePath(input: VerifyRuntimeChainInput): string {
  const candidates = dedupeStrings([
    String(input.resourceSeedPath || '').trim(),
    ...extractQueryResourcePaths(input.queryText),
  ]);
  return candidates[0] || '';
}

async function resolveMappedResourceCandidates(input: VerifyRuntimeChainInput, seedPath: string): Promise<string[]> {
  const fromInput = dedupeStrings((input.mappedSeedTargets || []).map((value) => normalizeText(value)));
  if (fromInput.length > 0) {
    return fromInput;
  }
  try {
    const rows = await input.executeParameterized(`
      MATCH (:File {filePath: $seedPath})-[r:CodeRelation {type: 'UNITY_ASSET_GUID_REF'}]->(target:File)
      RETURN DISTINCT target.filePath AS targetPath
      LIMIT 100
    `, { seedPath });
    return dedupeStrings(
      rows.map((row: any) => normalizeText(row?.targetPath || row?.[0])),
    );
  } catch {
    return [];
  }
}

function scoreResourcePath(pathText: string, hints: string[]): number {
  const normalizedPath = normalizePathLike(pathText);
  if (!normalizedPath) return 0;
  let score = 0;
  for (const hint of hints) {
    const normalizedHint = normalizePathLike(hint);
    if (!normalizedHint) continue;
    if (normalizedPath.includes(normalizedHint)) score += 3;
  }
  if (normalizedPath.includes('/graphs/')) score += 1;
  return score;
}

function resolveRepoPath(repoPath: string, relativePath: string): string {
  const resolved = path.resolve(repoPath, relativePath);
  return resolved;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function inspectResourceGuidEvidence(repoPath: string, resourcePath: string): Promise<{
  metaPath?: string;
  guid?: string;
}> {
  const absResourcePath = resolveRepoPath(repoPath, resourcePath);
  const absMetaPath = resolveRepoPath(repoPath, `${resourcePath}.meta`);
  if (await pathExists(absMetaPath)) {
    return { metaPath: `${resourcePath}.meta` };
  }
  if (!(await pathExists(absResourcePath))) {
    return {};
  }
  try {
    const content = await fs.readFile(absResourcePath, 'utf-8');
    const match = content.match(/\bguid\s*[:=]\s*([a-f0-9]{32})\b/i)
      || content.match(/\b([a-f0-9]{32})\b/i);
    if (match?.[1]) {
      return { guid: String(match[1]) };
    }
  } catch {
    // Best-effort evidence probe; fall through to missing evidence.
  }
  return {};
}

function extractLikelySymbolNames(queryText?: string): string[] {
  const raw = String(queryText || '');
  const matches = raw.match(/\b[A-Z][A-Za-z0-9_]{2,}\b/g) || [];
  const blacklist = new Set([
    'Assets',
    'NEON',
    'DataAssets',
    'Powerups',
    'Graphs',
    'PlayerGun',
    'Code',
    'Game',
    'Node',
    'Guid',
  ]);
  return dedupeStrings(matches.filter((name) => !blacklist.has(name)));
}

function pickBestSymbol(rows: any[], preferredNames: string[] = []): SymbolCandidate | undefined {
  if (!Array.isArray(rows) || rows.length === 0) return undefined;
  const preferred = preferredNames.map((name) => name.toLowerCase());
  const typed = rows
    .map((row) => ({
      id: String(row.id || ''),
      name: String(row.name || ''),
      type: String(row.type || ''),
      filePath: String(row.filePath || ''),
      startLine: Number.isFinite(Number(row.startLine)) ? Number(row.startLine) : undefined,
    }))
    .filter((row) => row.id && row.filePath);
  if (typed.length === 0) return undefined;

  const rank = (row: SymbolCandidate): number => {
    let score = 0;
    const rowType = row.type.toLowerCase();
    if (rowType === 'class') score += 4;
    if (rowType === 'method') score += 3;
    if (rowType === 'function') score += 2;
    const rowName = row.name.toLowerCase();
    if (preferred.includes(rowName)) score += 5;
    return score;
  };
  return typed.sort((a, b) => rank(b) - rank(a))[0];
}

async function resolvePrimarySymbolCandidate(
  input: VerifyRuntimeChainInput,
): Promise<SymbolCandidate | undefined> {
  const explicitName = normalizeText(input.symbolName);
  const explicitFilePath = normalizeText(input.symbolFilePath);
  const ruleHostBaseTypes = Array.isArray(input.rule?.host_base_type)
    ? input.rule!.host_base_type.map((name) => normalizeText(name)).filter(Boolean)
    : [];
  const likelyNames = dedupeStrings([
    ...(explicitName ? [explicitName] : []),
    ...ruleHostBaseTypes,
    ...extractLikelySymbolNames(input.queryText),
  ]);

  if (explicitFilePath) {
    const rows = await input.executeParameterized(`
      MATCH (n)
      WHERE n.filePath = $filePath
        AND ($symbolName = '' OR n.name = $symbolName)
      RETURN n.id AS id, n.name AS name, labels(n)[0] AS type, n.filePath AS filePath, n.startLine AS startLine
      LIMIT 20
    `, {
      filePath: explicitFilePath,
      symbolName: explicitName,
    });
    const picked = pickBestSymbol(rows, likelyNames);
    if (picked) return picked;
  }

  if (likelyNames.length > 0) {
    const rows = await input.executeParameterized(`
      MATCH (n)
      WHERE n.name IN $symbolNames
      RETURN n.id AS id, n.name AS name, labels(n)[0] AS type, n.filePath AS filePath, n.startLine AS startLine
      LIMIT ${SYMBOL_NAME_QUERY_LIMIT}
    `, {
      symbolNames: likelyNames,
    });
    const picked = pickBestSymbol(rows, likelyNames);
    if (picked) return picked;
  }

  return undefined;
}

async function fetchCallEdges(
  input: VerifyRuntimeChainInput,
  symbol: SymbolCandidate,
): Promise<CallEdge[]> {
  if (!symbol?.id) return [];
  const symbolId = symbol.id;
  const directQueries = [
    input.executeParameterized(`
      MATCH (s {id: $symbolId})-[r:CodeRelation {type: 'CALLS'}]->(t)
      RETURN s.id AS sourceId, s.name AS sourceName, s.filePath AS sourceFilePath, s.startLine AS sourceStartLine,
             t.id AS targetId, t.name AS targetName, t.filePath AS targetFilePath, t.startLine AS targetStartLine
      LIMIT ${CALL_EDGE_QUERY_LIMIT}
    `, { symbolId }),
    input.executeParameterized(`
      MATCH (s)-[r:CodeRelation {type: 'CALLS'}]->(t {id: $symbolId})
      RETURN s.id AS sourceId, s.name AS sourceName, s.filePath AS sourceFilePath, s.startLine AS sourceStartLine,
             t.id AS targetId, t.name AS targetName, t.filePath AS targetFilePath, t.startLine AS targetStartLine
      LIMIT ${CALL_EDGE_QUERY_LIMIT}
    `, { symbolId }),
  ];
  const containerType = String(symbol.type || '').toLowerCase();
  const isMethodContainer = new Set(['class', 'interface', 'struct', 'trait', 'impl', 'record']).has(containerType)
    || String(symbol.id).toLowerCase().startsWith('class:');
  if (isMethodContainer) {
    directQueries.push(
      input.executeParameterized(`
        MATCH (n {id: $symbolId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)
        MATCH (m)-[r:CodeRelation {type: 'CALLS'}]->(t)
        RETURN m.id AS sourceId, m.name AS sourceName, m.filePath AS sourceFilePath, m.startLine AS sourceStartLine,
               t.id AS targetId, t.name AS targetName, t.filePath AS targetFilePath, t.startLine AS targetStartLine
        LIMIT ${CALL_EDGE_QUERY_LIMIT}
      `, { symbolId }),
      input.executeParameterized(`
        MATCH (n {id: $symbolId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)
        MATCH (s)-[r:CodeRelation {type: 'CALLS'}]->(m)
        RETURN s.id AS sourceId, s.name AS sourceName, s.filePath AS sourceFilePath, s.startLine AS sourceStartLine,
               m.id AS targetId, m.name AS targetName, m.filePath AS targetFilePath, m.startLine AS targetStartLine
        LIMIT ${CALL_EDGE_QUERY_LIMIT}
      `, { symbolId }),
    );
  }
  const rows = await Promise.all(directQueries);
  const combined = rows.flatMap((rowSet) => rowSet || []);
  return combined
    .map((row) => ({
      sourceId: String(row.sourceId || ''),
      sourceName: String(row.sourceName || ''),
      sourceFilePath: String(row.sourceFilePath || ''),
      sourceStartLine: Number.isFinite(Number(row.sourceStartLine)) ? Number(row.sourceStartLine) : undefined,
      targetId: String(row.targetId || ''),
      targetName: String(row.targetName || ''),
      targetFilePath: String(row.targetFilePath || ''),
      targetStartLine: Number.isFinite(Number(row.targetStartLine)) ? Number(row.targetStartLine) : undefined,
    }))
    .filter((row) => row.sourceId && row.targetId && row.sourceFilePath && row.targetFilePath)
    .filter((row, index, list) => {
      const key = `${row.sourceId}->${row.targetId}`;
      return list.findIndex((other) => `${other.sourceId}->${other.targetId}` === key) === index;
    });
}

function formatCallAnchor(edge: CallEdge): string {
  const left = `${edge.sourceFilePath}:${edge.sourceStartLine || 1}`;
  const right = `${edge.targetFilePath}:${edge.targetStartLine || 1}`;
  return `${left}->${right}`;
}

function edgeKey(edge: CallEdge): string {
  return `${edge.sourceId}->${edge.targetId}`;
}

function chooseBestCallEdge(
  edges: CallEdge[],
  matcher: RegExp,
  options?: { requireMatch?: boolean; excludeKeys?: Set<string> },
): CallEdge | undefined {
  if (edges.length === 0) return undefined;
  const excludeKeys = options?.excludeKeys || new Set<string>();
  const scored = edges
    .filter((edge) => !excludeKeys.has(edgeKey(edge)))
    .map((edge) => {
    const text = `${edge.sourceName} ${edge.sourceFilePath} ${edge.targetName} ${edge.targetFilePath}`;
    const score = matcher.test(text) ? 10 : 0;
    return { edge, score };
    });
  if (scored.length === 0) return undefined;
  scored.sort((a, b) => b.score - a.score);
  if (options?.requireMatch && scored[0]?.score === 0) return undefined;
  return scored[0]?.edge;
}

function finalizeRuntimeChain(input: {
  requiredSegments: RuntimeChainHopType[];
  foundSegments: Set<string>;
  hops: RuntimeChainHop[];
  gaps: RuntimeChainGap[];
}): RuntimeChainResult {
  const missingRequired = input.requiredSegments.filter((segment) => !input.foundSegments.has(segment));
  const evidence_level = deriveRuntimeChainEvidenceLevel({
    mode: input.hops.length > 0 ? 'verified_hops' : 'none',
    requiredSegments: input.requiredSegments,
    foundSegments: [...input.foundSegments],
  });
  const status: RuntimeChainStatus =
    missingRequired.length === 0 ? 'verified_full'
      : input.foundSegments.size === 0 ? 'failed'
        : input.hops.length > 0 ? 'verified_partial'
          : 'failed';
  return {
    status,
    evidence_level,
    hops: input.hops,
    gaps: input.gaps,
  };
}

async function verifyRuleDrivenRuntimeChain(input: VerifyRuntimeChainInput): Promise<RuntimeChainResult> {
  const requiredSegments = sanitizeRequiredHops(input.requiredHops);
  const hops: RuntimeChainHop[] = [];
  const gaps: RuntimeChainGap[] = [];
  const foundSegments = new Set<string>();
  const bindingPaths = dedupeStrings(
    (input.resourceBindings || [])
      .map((binding) => normalizeText(binding.resourcePath))
      .filter((resourcePath) => resourcePath.length > 0),
  );
  const queryResourcePath = resolvePrimaryQueryResourcePath(input);
  const queryResourcePathNorm = normalizePathLike(queryResourcePath || '');
  const bindingPathMap = new Map(bindingPaths.map((resourcePath) => [normalizePathLike(resourcePath), resourcePath]));
  const triggerFamily = String(input.rule?.trigger_family || '').trim() || 'unknown';
  const triggerTokens = parseTriggerTokens(triggerFamily);
  const symbolCandidate = await resolvePrimarySymbolCandidate(input);
  const callEdges = symbolCandidate?.id
    ? await fetchCallEdges(input, symbolCandidate)
    : [];
  const preferredResourceHints = dedupeStrings([
    normalizeText(symbolCandidate?.name || ''),
    normalizeText(path.basename(symbolCandidate?.filePath || '', path.extname(symbolCandidate?.filePath || ''))),
    ...triggerTokens,
  ]);
  let selectedResourcePath = '';
  let queryResourceMissingFromBindings = false;
  let selectedFromMappedResource = false;

  if (queryResourcePathNorm) {
    selectedResourcePath = bindingPathMap.get(queryResourcePathNorm) || '';
    queryResourceMissingFromBindings = !selectedResourcePath;
    if (!selectedResourcePath) {
      const mappedCandidates = await resolveMappedResourceCandidates(input, queryResourcePath);
      const mappedMatch = mappedCandidates
        .map((resourcePath) => normalizePathLike(resourcePath))
        .find((resourcePathNorm) => bindingPathMap.has(resourcePathNorm));
      if (mappedMatch) {
        selectedResourcePath = bindingPathMap.get(mappedMatch) || '';
        queryResourceMissingFromBindings = !selectedResourcePath;
        selectedFromMappedResource = Boolean(selectedResourcePath);
      } else if (mappedCandidates.length > 0) {
        const rankedMapped = mappedCandidates
          .map((resourcePath) => ({
            resourcePath,
            score: scoreResourcePath(resourcePath, preferredResourceHints),
          }))
          .sort((a, b) => (b.score - a.score) || a.resourcePath.localeCompare(b.resourcePath));
        selectedResourcePath = rankedMapped[0]?.resourcePath || '';
        queryResourceMissingFromBindings = !selectedResourcePath;
        selectedFromMappedResource = Boolean(selectedResourcePath);
      }
    }
  } else if (bindingPaths.length > 0) {
    const scored = bindingPaths
      .map((resourcePath) => ({ resourcePath, score: scoreResourcePath(resourcePath, preferredResourceHints) }))
      .sort((a, b) => b.score - a.score);
    selectedResourcePath = scored[0]?.resourcePath || '';
  }

  if (requiredSegments.includes('resource')) {
    if (selectedResourcePath) {
      hops.push({
        hop_type: 'resource',
        anchor: `${selectedResourcePath}:1`,
        confidence: 'medium',
        note: selectedFromMappedResource
          ? `Rule-driven resource anchor verified by mapped resource equivalence for trigger_family=${triggerFamily}.`
          : `Rule-driven resource anchor verified by binding evidence for trigger_family=${triggerFamily}.`,
        snippet: selectedResourcePath,
      });
      foundSegments.add('resource');
    } else if (queryResourceMissingFromBindings && queryResourcePath) {
      gaps.push(buildGap('resource', `queried resource is not present in symbol binding evidence: ${queryResourcePath}`));
    } else {
      gaps.push(buildGap('resource', `missing resource binding evidence for trigger_family=${triggerFamily}`));
    }
  }

  if (requiredSegments.includes('guid_map')) {
    let guidAnchor = '';
    let guidSnippet = '';
    if (selectedResourcePath) {
      const resourceGuidEvidence = await inspectResourceGuidEvidence(input.repoPath, selectedResourcePath);
      if (resourceGuidEvidence.metaPath) {
        guidAnchor = `${resourceGuidEvidence.metaPath}:1`;
        guidSnippet = resourceGuidEvidence.metaPath;
      } else if (resourceGuidEvidence.guid) {
        guidAnchor = `${selectedResourcePath}:1`;
        guidSnippet = `guid:${resourceGuidEvidence.guid}`;
      }
    }
    if (!guidAnchor && symbolCandidate?.filePath) {
      const symbolMetaPath = `${symbolCandidate.filePath}.meta`;
      if (await pathExists(resolveRepoPath(input.repoPath, symbolMetaPath))) {
        guidAnchor = `${symbolMetaPath}:1`;
        guidSnippet = symbolMetaPath;
      }
    }
    if (guidAnchor) {
      hops.push({
        hop_type: 'guid_map',
        anchor: guidAnchor,
        confidence: 'medium',
        note: `Rule-driven guid_map evidence verified by filesystem artifacts for trigger_family=${triggerFamily}.`,
        snippet: guidSnippet,
      });
      foundSegments.add('guid_map');
    } else {
      gaps.push(buildGap('guid_map', `missing guid_map evidence for trigger_family=${triggerFamily}`));
    }
  }

  if (requiredSegments.includes('code_loader')) {
    const loaderEdge = chooseBestCallEdge(
      callEdges,
      /load|reload|equip|register|bootstrap|init|graph|node/i,
      { requireMatch: true },
    );
    if (loaderEdge) {
      hops.push({
        hop_type: 'code_loader',
        anchor: formatCallAnchor(loaderEdge),
        confidence: 'high',
        note: `Rule-driven code_loader evidence verified by CALLS edge for trigger_family=${triggerFamily}.`,
        snippet: `${loaderEdge.sourceName} -> ${loaderEdge.targetName}`,
      });
      foundSegments.add('code_loader');
    } else if (symbolCandidate?.filePath) {
      gaps.push(buildGap('loader', `no CALLS edge evidence found for loader segment in ${symbolCandidate.filePath}`));
    } else {
      gaps.push(buildGap('loader', `missing symbol evidence for code_loader verification under trigger_family=${triggerFamily}`));
    }
  }

  if (requiredSegments.includes('code_runtime')) {
    const loaderKeys = new Set(
      hops
        .filter((hop) => hop.hop_type === 'code_loader')
        .flatMap((hop) => {
          const [left, right] = String(hop.anchor || '').split('->');
          if (!left || !right) return [];
          return [`${left}->${right}`];
        }),
    );
    const runtimeEdge = chooseBestCallEdge(
      callEdges,
      /runtime|start|tick|update|execute|routine|finish|shoot|trigger|onreload|value|getvalue|checkreload|output|rpm/i,
      {
        requireMatch: true,
        excludeKeys: new Set(
          callEdges
            .filter((edge) => loaderKeys.has(`${edge.sourceFilePath}:${edge.sourceStartLine || 1}->${edge.targetFilePath}:${edge.targetStartLine || 1}`))
            .map((edge) => edgeKey(edge)),
        ),
      },
    );
    if (runtimeEdge) {
      hops.push({
        hop_type: 'code_runtime',
        anchor: formatCallAnchor(runtimeEdge),
        confidence: 'high',
        note: `Rule-driven code_runtime evidence verified by CALLS edge for trigger_family=${triggerFamily}.`,
        snippet: `${runtimeEdge.sourceName} -> ${runtimeEdge.targetName}`,
      });
      foundSegments.add('code_runtime');
    } else if (symbolCandidate?.filePath) {
      gaps.push(buildGap('runtime', `no CALLS edge evidence found for runtime segment in ${symbolCandidate.filePath}`));
    } else {
      gaps.push(buildGap('runtime', `missing symbol evidence for code_runtime verification under trigger_family=${triggerFamily}`));
    }
  }

  return finalizeRuntimeChain({
    requiredSegments,
    foundSegments,
    hops,
    gaps,
  });
}

export async function verifyRuntimeChainOnDemand(
  input: VerifyRuntimeChainInput,
): Promise<RuntimeChainResult | undefined> {
  if (!input.rule) return undefined;
  return await verifyRuleDrivenRuntimeChain(input);
}

function buildFailureRuntimeClaim(input: {
  reason: RuntimeClaim['reason'];
  next_action: string;
  rule?: RuntimeClaimRule;
}): RuntimeClaim {
  return {
    rule_id: input.rule?.id || 'none',
    rule_version: input.rule?.version || '0.0.0',
    scope: {
      resource_types: input.rule?.resource_types || [],
      host_base_type: input.rule?.host_base_type || [],
      trigger_family: input.rule?.trigger_family || 'none',
    },
    status: 'failed',
    evidence_level: 'none',
    guarantees: [],
    non_guarantees: input.rule?.non_guarantees?.length
      ? [...input.rule.non_guarantees]
      : ['runtime_chain_verification_not_executed'],
    hops: [],
    gaps: [],
    reason: input.reason,
    next_action: input.next_action,
  };
}

function matchesRuntimeClaimRule(
  rule: RuntimeClaimRule,
  input: VerifyRuntimeClaimInput,
): boolean {
  const haystack = buildRuntimeMatchHaystack(input);
  const tokens = parseTriggerTokens(rule.trigger_family);
  if (tokens.length === 0) return false;
  return tokens.some((token) => haystack.includes(token));
}

export async function verifyRuntimeClaimOnDemand(
  input: VerifyRuntimeClaimInput,
): Promise<RuntimeClaim> {
  let registry;
  try {
    registry = await loadRuleRegistry(input.repoPath, input.rulesRoot);
  } catch (error) {
    if (error instanceof RuleRegistryLoadError) {
      if (error.code === 'rule_catalog_missing' || error.code === 'rule_file_missing') {
        return buildFailureRuntimeClaim({
          reason: 'rule_not_matched',
          next_action: buildDefaultVerifyNextCommand(input.queryText),
        });
      }
    }
    throw error;
  }
  const activeRules = registry.activeRules || [];
  const fallbackNextAction = buildDefaultVerifyNextCommand(input.queryText);

  if (activeRules.length === 0) {
    return buildFailureRuntimeClaim({
      reason: 'rule_not_matched',
      next_action: fallbackNextAction,
    });
  }

  const matchedRule = activeRules.find((rule) => matchesRuntimeClaimRule(rule, input));
  if (!matchedRule) {
    return buildFailureRuntimeClaim({
      reason: 'rule_not_matched',
      next_action: fallbackNextAction,
    });
  }

  const runtimeChain = await verifyRuntimeChainOnDemand({
    ...input,
    requiredHops: matchedRule.required_hops,
    rule: matchedRule,
  });
  if (!runtimeChain) {
    return buildFailureRuntimeClaim({
      reason: 'rule_matched_but_evidence_missing',
      next_action: matchedRule.next_action || buildDefaultVerifyNextCommand(input.queryText),
      rule: matchedRule,
    });
  }

  const normalizedStatus: RuntimeClaim['status'] = (
    runtimeChain.status === 'pending' ? 'failed' : runtimeChain.status
  );
  const verificationFailed = normalizedStatus === 'failed'
    || (runtimeChain.evidence_level === 'none' && normalizedStatus !== 'verified_full');
  const resolved: RuntimeClaim = buildRuntimeClaimFromRule({
    rule: matchedRule,
    status: verificationFailed ? 'failed' : normalizedStatus,
    evidence_level: runtimeChain.evidence_level,
    hops: runtimeChain.hops,
    gaps: runtimeChain.gaps,
    ...(verificationFailed
      ? {
        reason: 'rule_matched_but_verification_failed' as const,
        next_action: matchedRule.next_action || buildDefaultVerifyNextCommand(input.queryText),
      }
      : {}),
  });

  if (input.minimumEvidenceSatisfied === false) {
    return {
      ...resolved,
      status: 'failed',
      evidence_level: 'clue',
      guarantees: [],
      non_guarantees: [...resolved.non_guarantees, 'minimum_evidence_contract_not_satisfied'],
      reason: 'rule_matched_but_evidence_missing',
      next_action: matchedRule.next_action || buildDefaultVerifyNextCommand(input.queryText),
    };
  }

  return resolved;
}
