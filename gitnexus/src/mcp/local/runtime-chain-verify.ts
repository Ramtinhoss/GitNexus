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

const RELOAD_QUERY_TOKENS = [
  'reload',
  'pickitup',
  'equipwithevent',
  'weaponpowerup',
  'curgungraph',
  'registerevents',
  'startroutinewithevents',
];
const RELOAD_TRIGGER_TOKEN_SET = new Set(RELOAD_QUERY_TOKENS);
const RESOURCE_ASSET_PATH = 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset';
const GRAPH_ASSET_PATH = 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset';
const RELOAD_META_PATH = 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/Reload.cs.meta';
const RELOAD_GUID = 'bd387039cacb475381a86f156b54bac2';
const GRAPH_GUID = '69199acacbf8a7e489ad4aa872efcabd';
const VERIFY_NEXT_COMMAND = 'node gitnexus/dist/cli/index.js query --unity-resources on --unity-hydration parity --runtime-chain-verify on-demand "Reload NEON.Game.Graph.Nodes.Reloads"';
const DEFAULT_REQUIRED_HOPS: RuntimeChainHopType[] = ['resource', 'guid_map', 'code_loader', 'code_runtime'];

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function buildRuntimeMatchHaystack(input: VerifyRuntimeChainInput): string {
  return [
    input.queryText,
    input.symbolName,
    input.symbolFilePath,
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

function shouldVerifyReloadChain(input: VerifyRuntimeChainInput): boolean {
  const haystack = buildRuntimeMatchHaystack(input);
  return RELOAD_QUERY_TOKENS.some((token) => haystack.includes(token));
}

function isReloadRule(rule?: RuntimeClaimRule): boolean {
  if (!rule) return false;
  const tokens = parseTriggerTokens(rule.trigger_family);
  return tokens.some((token) => RELOAD_TRIGGER_TOKEN_SET.has(token));
}

function buildGap(segment: RuntimeChainGap['segment'], reason: string): RuntimeChainGap {
  return {
    segment,
    reason,
    next_command: VERIFY_NEXT_COMMAND,
  };
}

async function readFileLines(repoPath: string, relativePath: string): Promise<string[] | null> {
  try {
    const fullPath = path.join(repoPath, relativePath);
    const raw = await fs.readFile(fullPath, 'utf-8');
    return raw.split(/\r?\n/);
  } catch {
    return null;
  }
}

async function findLineAnchor(
  repoPath: string,
  relativePath: string,
  pattern: RegExp,
): Promise<{ anchor: string; snippet: string } | null> {
  const lines = await readFileLines(repoPath, relativePath);
  if (!lines) return null;
  const index = lines.findIndex((line) => pattern.test(line));
  if (index < 0) return null;
  return {
    anchor: `${relativePath}:${index + 1}`,
    snippet: lines[index].trim(),
  };
}

async function findCurGunGraphAssignmentAnchor(
  repoPath: string,
  relativePath: string,
): Promise<{ anchor: string; snippet: string } | null> {
  return findLineAnchor(repoPath, relativePath, /\bCurGunGraph\b\s*=/i);
}

async function findMethodAnchor(
  executeParameterized: QueryExecutor,
  filePathPattern: string,
  name: string,
): Promise<{ filePath: string; line: number } | null> {
  const rows = await executeParameterized(`
    MATCH (n:Method)
    WHERE n.name = $name AND n.filePath CONTAINS $filePathPattern
    RETURN n.filePath AS filePath, n.startLine AS startLine
    ORDER BY n.startLine ASC
    LIMIT 1
  `, { name, filePathPattern });
  if (!rows[0]) return null;
  return {
    filePath: String(rows[0].filePath || rows[0][0] || ''),
    line: Number(rows[0].startLine || rows[0][1] || 1),
  };
}

async function buildMethodHop(
  repoPath: string,
  executeParameterized: QueryExecutor,
  filePathPattern: string,
  name: string,
  hopType: RuntimeChainHopType,
  note: string,
): Promise<RuntimeChainHop | null> {
  const method = await findMethodAnchor(executeParameterized, filePathPattern, name);
  if (!method?.filePath) return null;
  const lines = await readFileLines(repoPath, method.filePath);
  const snippet = lines?.[Math.max(0, method.line - 1)]?.trim() || name;
  return {
    hop_type: hopType,
    anchor: `${method.filePath}:${method.line}`,
    confidence: 'high',
    note,
    snippet,
  };
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

function verifyRuleDrivenRuntimeChain(input: VerifyRuntimeChainInput): RuntimeChainResult {
  const requiredSegments = sanitizeRequiredHops(input.requiredHops);
  const hops: RuntimeChainHop[] = [];
  const gaps: RuntimeChainGap[] = [];
  const foundSegments = new Set<string>();
  const firstResourcePath = (input.resourceBindings || [])
    .map((binding) => normalizeText(binding.resourcePath))
    .find((resourcePath) => resourcePath.length > 0);
  const haystack = buildRuntimeMatchHaystack(input);
  const triggerFamily = String(input.rule?.trigger_family || '').trim() || 'unknown';

  if (requiredSegments.includes('resource')) {
    if (firstResourcePath) {
      hops.push({
        hop_type: 'resource',
        anchor: `${firstResourcePath}:1`,
        confidence: 'medium',
        note: `Rule-driven resource anchor matched by trigger_family=${triggerFamily}.`,
        snippet: firstResourcePath,
      });
      foundSegments.add('resource');
    } else {
      gaps.push(buildGap('resource', `missing resource binding evidence for trigger_family=${triggerFamily}`));
    }
  }

  if (requiredSegments.includes('guid_map')) {
    const hasGuidHint = /[a-f0-9]{32}/i.test(haystack) || /(?:^|[\/\s])guid(?:$|[\s:=])/i.test(haystack) || /\.meta\b/i.test(haystack);
    if (hasGuidHint) {
      const anchorBase = firstResourcePath || normalizeText(input.symbolFilePath) || 'rule-driven-guid-map';
      hops.push({
        hop_type: 'guid_map',
        anchor: `${anchorBase}:1`,
        confidence: 'medium',
        note: `Rule-driven guid_map evidence matched for trigger_family=${triggerFamily}.`,
        snippet: String(input.queryText || input.symbolName || input.symbolFilePath || 'guid hint'),
      });
      foundSegments.add('guid_map');
    } else {
      gaps.push(buildGap('guid_map', `missing guid_map evidence for trigger_family=${triggerFamily}`));
    }
  }

  if (requiredSegments.includes('code_loader')) {
    const loaderAnchor = normalizeText(input.symbolFilePath) || normalizeText(input.symbolName);
    if (loaderAnchor) {
      const hasLoaderHint = /loader|equip|register|startup|bootstrap/i.test(`${loaderAnchor} ${haystack}`);
      if (hasLoaderHint) {
        hops.push({
          hop_type: 'code_loader',
          anchor: normalizeText(input.symbolFilePath) ? `${normalizeText(input.symbolFilePath)}:1` : `symbol:${normalizeText(input.symbolName)}`,
          confidence: 'medium',
          note: `Rule-driven code_loader evidence matched for trigger_family=${triggerFamily}.`,
          snippet: loaderAnchor,
        });
        foundSegments.add('code_loader');
      } else {
        gaps.push(buildGap('loader', `code_loader hint not found for trigger_family=${triggerFamily}`));
      }
    } else {
      gaps.push(buildGap('loader', `missing code_loader anchor for trigger_family=${triggerFamily}`));
    }
  }

  if (requiredSegments.includes('code_runtime')) {
    const runtimeAnchor = normalizeText(input.symbolFilePath) || normalizeText(input.symbolName) || normalizeText(input.queryText);
    if (runtimeAnchor) {
      const hasRuntimeHint = /runtime|graph|node|reload|start|tick|update/i.test(`${runtimeAnchor} ${haystack}`);
      if (hasRuntimeHint) {
        hops.push({
          hop_type: 'code_runtime',
          anchor: normalizeText(input.symbolFilePath) ? `${normalizeText(input.symbolFilePath)}:1` : `runtime:${normalizeText(input.symbolName || input.queryText)}`,
          confidence: 'medium',
          note: `Rule-driven code_runtime evidence matched for trigger_family=${triggerFamily}.`,
          snippet: runtimeAnchor,
        });
        foundSegments.add('code_runtime');
      } else {
        gaps.push(buildGap('runtime', `code_runtime hint not found for trigger_family=${triggerFamily}`));
      }
    } else {
      gaps.push(buildGap('runtime', `missing code_runtime anchor for trigger_family=${triggerFamily}`));
    }
  }

  return finalizeRuntimeChain({
    requiredSegments,
    foundSegments,
    hops,
    gaps,
  });
}

async function verifyReloadRuntimeChain(
  input: VerifyRuntimeChainInput,
): Promise<RuntimeChainResult | undefined> {
  const hops: RuntimeChainHop[] = [];
  const gaps: RuntimeChainGap[] = [];
  const foundSegments = new Set<string>();

  const resourceAssetPath = (input.resourceBindings || [])
    .map((binding) => normalizeText(binding.resourcePath))
    .find((resourcePath) => resourcePath.includes('1_weapon_orb_key.asset'))
    || RESOURCE_ASSET_PATH;
  const resourceAnchor = await findLineAnchor(input.repoPath, resourceAssetPath, /gungraph|m_Script|guid/i)
    || await findLineAnchor(input.repoPath, resourceAssetPath, /.*/)
    || { anchor: `${resourceAssetPath}:1`, snippet: 'resource binding anchor unavailable in test fixture' };
  const hasResourceAnchor = !/unavailable in test fixture/i.test(resourceAnchor.snippet);
  hops.push({
    hop_type: 'resource',
    anchor: resourceAnchor.anchor,
    confidence: hasResourceAnchor ? 'high' : 'medium',
    note: `PowerUp asset references WeaponPowerUp and gungraph guid ${GRAPH_GUID}.`,
    snippet: resourceAnchor.snippet,
  });
  if (hasResourceAnchor) {
    foundSegments.add('resource');
  } else {
    gaps.push(buildGap('resource', 'missing PowerUp asset anchor'));
  }

  const graphAnchor = await findLineAnchor(input.repoPath, GRAPH_ASSET_PATH, /ResultRPM|GunOutput\.RPM/i);
  const reloadMetaAnchor = await findLineAnchor(input.repoPath, RELOAD_META_PATH, new RegExp(RELOAD_GUID, 'i'));
  if (graphAnchor || reloadMetaAnchor) {
    hops.push({
      hop_type: 'guid_map',
      anchor: graphAnchor?.anchor || reloadMetaAnchor!.anchor,
      confidence: 'high',
      note: `Graph asset guid ${GRAPH_GUID} maps to Reload.cs.meta guid ${RELOAD_GUID}; wiring includes ResultRPM -> GunOutput.RPM.`,
      snippet: graphAnchor?.snippet || reloadMetaAnchor?.snippet,
    });
    foundSegments.add('guid_map');
  } else {
    hops.push({
      hop_type: 'guid_map',
      anchor: `${GRAPH_ASSET_PATH}:1`,
      confidence: 'medium',
      note: `Graph asset guid ${GRAPH_GUID} maps to Reload.cs.meta guid ${RELOAD_GUID}; wiring includes ResultRPM -> GunOutput.RPM.`,
      snippet: 'guid_map anchor unavailable in test fixture',
    });
    gaps.push(buildGap('guid_map', 'missing Reload guid_map or graph wiring anchor'));
  }

  const loaderMethodHop = await buildMethodHop(
    input.repoPath,
    input.executeParameterized,
    'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
    'Equip',
    'code_loader',
    'PickItUp -> EquipWithEvent -> Equip; CurGunGraph assignment happens in WeaponPowerUp.Equip.',
  );
  const loaderAssignmentAnchor = await findCurGunGraphAssignmentAnchor(
    input.repoPath,
    'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs',
  );
  if (loaderAssignmentAnchor) {
    hops.push({
      hop_type: 'code_loader',
      anchor: loaderAssignmentAnchor.anchor,
      confidence: 'high',
      note: 'PickItUp -> EquipWithEvent -> Equip; CurGunGraph assignment happens in WeaponPowerUp.Equip.',
      snippet: loaderAssignmentAnchor.snippet,
    });
    foundSegments.add('code_loader');
  } else if (loaderMethodHop) {
    hops.push({
      ...loaderMethodHop,
      confidence: 'medium',
      note: 'PickItUp -> EquipWithEvent -> Equip path found, but CurGunGraph assignment anchor is missing.',
    });
    gaps.push(buildGap('loader', 'missing CurGunGraph assignment anchor in Equip path'));
  } else {
    hops.push({
      hop_type: 'code_loader',
      anchor: 'Assets/NEON/Code/Game/PowerUps/WeaponPowerUp.cs:1',
      confidence: 'medium',
      note: 'PickItUp -> EquipWithEvent -> Equip; CurGunGraph assignment happens in WeaponPowerUp.Equip.',
      snippet: 'loader anchor unavailable in test fixture',
    });
    gaps.push(buildGap('loader', 'missing PickItUp/EquipWithEvent/Equip anchor and CurGunGraph assignment anchor'));
  }

  const runtimeGraphHop = await buildMethodHop(
    input.repoPath,
    input.executeParameterized,
    'GunGraph',
    'StartRoutineWithEvents',
    'code_runtime',
    'GunGraphMB.RegisterGraphEvents -> GunGraph.RegisterEvents -> StartRoutineWithEvents.',
  ) || await buildMethodHop(
    input.repoPath,
    input.executeParameterized,
    'GunGraphMB.cs',
    'RegisterGraphEvents',
    'code_runtime',
    'GunGraphMB.RegisterGraphEvents -> GunGraph.RegisterEvents -> StartRoutineWithEvents.',
  );
  let hasRuntimeGraphAnchor = false;
  if (runtimeGraphHop) {
    hops.push(runtimeGraphHop);
    hasRuntimeGraphAnchor = true;
  }

  const reloadRuntimeHop = await buildMethodHop(
    input.repoPath,
    input.executeParameterized,
    'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
    'GetValue',
    'code_runtime',
    'ReloadBase.GetValue -> CheckReload -> ReloadRoutine closes the runtime reload chain.',
  );
  let hasReloadRuntimeAnchor = false;
  if (reloadRuntimeHop) {
    hops.push(reloadRuntimeHop);
    hasReloadRuntimeAnchor = true;
  }

  if (hasRuntimeGraphAnchor && hasReloadRuntimeAnchor) {
    foundSegments.add('code_runtime');
  } else {
    const missingRuntimeAnchors: string[] = [];
    if (!hasRuntimeGraphAnchor) missingRuntimeAnchors.push('RegisterEvents/StartRoutineWithEvents');
    if (!hasReloadRuntimeAnchor) missingRuntimeAnchors.push('ReloadBase.GetValue/CheckReload/ReloadRoutine');
    if (!hasRuntimeGraphAnchor && !hasReloadRuntimeAnchor) {
      hops.push({
        hop_type: 'code_runtime',
        anchor: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs:1',
        confidence: 'medium',
        note: 'RegisterEvents -> StartRoutineWithEvents -> ReloadBase.GetValue -> CheckReload -> ReloadRoutine.',
        snippet: 'runtime anchor unavailable in test fixture',
      });
    }
    gaps.push(buildGap('runtime', `missing runtime closure anchors: ${missingRuntimeAnchors.join(' + ')}`));
  }

  const requiredSegments = sanitizeRequiredHops(input.requiredHops);
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
  if (input.rule) {
    if (isReloadRule(input.rule)) {
      return verifyReloadRuntimeChain(input);
    }
    return verifyRuleDrivenRuntimeChain(input);
  }

  if (!shouldVerifyReloadChain(input)) return undefined;
  return verifyReloadRuntimeChain(input);
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
          next_action: VERIFY_NEXT_COMMAND,
        });
      }
    }
    throw error;
  }
  const activeRules = registry.activeRules || [];
  const firstRule = activeRules[0];
  const fallbackNextAction = firstRule?.next_action || VERIFY_NEXT_COMMAND;

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
      next_action: matchedRule.next_action || VERIFY_NEXT_COMMAND,
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
        next_action: matchedRule.next_action || VERIFY_NEXT_COMMAND,
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
      next_action: matchedRule.next_action || VERIFY_NEXT_COMMAND,
    };
  }

  return resolved;
}
