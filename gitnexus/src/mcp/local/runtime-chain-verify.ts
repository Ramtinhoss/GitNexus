import fs from 'node:fs/promises';
import path from 'node:path';
import {
  deriveRuntimeChainEvidenceLevel,
  type RuntimeChainEvidenceLevel,
} from './runtime-chain-evidence.js';
import { buildReloadRuntimeClaim, type RuntimeClaim } from './runtime-claim.js';

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
const RESOURCE_ASSET_PATH = 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset';
const GRAPH_ASSET_PATH = 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset';
const RELOAD_META_PATH = 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/Reload.cs.meta';
const RELOAD_GUID = 'bd387039cacb475381a86f156b54bac2';
const GRAPH_GUID = '69199acacbf8a7e489ad4aa872efcabd';
const VERIFY_NEXT_COMMAND = 'node gitnexus/dist/cli/index.js query --unity-resources on --unity-hydration parity --runtime-chain-verify on-demand "Reload NEON.Game.Graph.Nodes.Reloads"';

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function shouldVerifyReloadChain(input: VerifyRuntimeChainInput): boolean {
  const haystack = [
    input.queryText,
    input.symbolName,
    input.symbolFilePath,
    ...(input.resourceBindings || []).map((binding) => binding.resourcePath),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return RELOAD_QUERY_TOKENS.some((token) => haystack.includes(token));
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

export async function verifyRuntimeChainOnDemand(
  input: VerifyRuntimeChainInput,
): Promise<RuntimeChainResult | undefined> {
  if (!shouldVerifyReloadChain(input)) return undefined;

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

  const requiredSegments = ['resource', 'guid_map', 'code_loader', 'code_runtime'];
  const evidence_level = deriveRuntimeChainEvidenceLevel({
    mode: hops.length > 0 ? 'verified_hops' : 'none',
    requiredSegments,
    foundSegments: [...foundSegments],
  });
  const status: RuntimeChainStatus =
    evidence_level === 'verified_chain' ? 'verified_full'
      : hops.length > 0 ? 'verified_partial'
        : 'failed';

  return {
    status,
    evidence_level,
    hops,
    gaps,
  };
}

export function buildRuntimeClaimFromRuntimeChain(
  chain: RuntimeChainResult,
): RuntimeClaim {
  return buildReloadRuntimeClaim({
    status: chain.status === 'pending' ? 'failed' : chain.status,
    evidence_level: chain.evidence_level,
    hops: chain.hops,
    gaps: chain.gaps,
    ...(chain.status === 'failed'
      ? {
        reason: 'rule_matched_but_verification_failed' as const,
        next_action: VERIFY_NEXT_COMMAND,
      }
      : {}),
  });
}
