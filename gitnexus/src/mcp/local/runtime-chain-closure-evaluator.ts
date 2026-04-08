import type { RuntimeGraphCandidate } from './runtime-chain-graph-candidates.js';

type RuntimeChainStatus = 'pending' | 'verified_partial' | 'verified_full' | 'failed';
type RuntimeChainEvidenceLevel = 'none' | 'clue' | 'verified_segment' | 'verified_chain';

interface RuntimeChainGap {
  segment: 'resource' | 'guid_map' | 'loader' | 'runtime';
  reason: string;
  next_command: string;
  why_not_next?: string;
}

export interface RuntimeClosureEvaluation {
  status: RuntimeChainStatus;
  evidence_level: RuntimeChainEvidenceLevel;
  gaps: RuntimeChainGap[];
  segments: {
    anchor: boolean;
    bind: boolean;
    bridge: boolean;
    runtime: boolean;
  };
}

interface EvaluateRuntimeClosureInput {
  queryText?: string;
  symbolName?: string;
  resourceSeedPath?: string;
  mappedSeedTargets?: string[];
  resourceBindings?: Array<{ resourcePath?: string }>;
  candidates: RuntimeGraphCandidate[];
  nextCommand: string;
}

function normalize(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function tokenize(value: unknown): string[] {
  return normalize(value)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function normalizeLoose(value: unknown): string {
  return normalize(value).replace(/[^a-z0-9]+/g, '');
}

function basenameStem(value: unknown): string {
  const text = String(value || '').trim();
  if (!text) return '';
  const parts = text.split(/[\\/]/);
  const base = parts[parts.length - 1] || '';
  const stem = base.replace(/\.[^.]+$/, '');
  return normalize(stem);
}

function isBridgeCandidate(candidate: RuntimeGraphCandidate): boolean {
  const reason = normalize(candidate.reason);
  return reason.includes('bridge') || reason.startsWith('unity-rule-');
}

function isAnchoredEndpoint(input: EvaluateRuntimeClosureInput, endpoint: {
  name?: string;
  id?: string;
  filePath?: string;
}): boolean {
  const symbolName = normalize(input.symbolName);
  if (!symbolName) return false;
  const looseSymbol = normalizeLoose(symbolName);
  if (normalize(endpoint.name) === symbolName) return true;
  const anchoredNeighborhood = [endpoint.id, endpoint.filePath];
  return anchoredNeighborhood.some((value) => normalizeLoose(value).includes(looseSymbol));
}

function candidateNodeKey(endpoint: {
  id?: string;
  name?: string;
  filePath?: string;
}): string {
  const id = normalize(endpoint.id);
  if (id) return `id:${id}`;
  const name = normalize(endpoint.name);
  if (!name) return '';
  const filePath = normalize(endpoint.filePath);
  return filePath ? `nf:${name}@${filePath}` : `n:${name}`;
}

function collectAnchorNodeKeys(input: EvaluateRuntimeClosureInput): Set<string> {
  const anchorKeys = new Set<string>();
  for (const candidate of input.candidates) {
    const sourceKey = candidateNodeKey({
      id: candidate.sourceId,
      name: candidate.sourceName,
      filePath: candidate.sourceFilePath,
    });
    const targetKey = candidateNodeKey({
      id: candidate.targetId,
      name: candidate.targetName,
      filePath: candidate.targetFilePath,
    });
    if (
      sourceKey
      && isAnchoredEndpoint(input, {
        name: candidate.sourceName,
        id: candidate.sourceId,
        filePath: candidate.sourceFilePath,
      })
    ) {
      anchorKeys.add(sourceKey);
    }
    if (
      targetKey
      && isAnchoredEndpoint(input, {
        name: candidate.targetName,
        id: candidate.targetId,
        filePath: candidate.targetFilePath,
      })
    ) {
      anchorKeys.add(targetKey);
    }
  }
  return anchorKeys;
}

function evaluateAnchorSegment(input: EvaluateRuntimeClosureInput): boolean {
  return collectAnchorNodeKeys(input).size > 0;
}

function evaluateBindSegment(input: EvaluateRuntimeClosureInput): boolean {
  const seedPath = normalize(input.resourceSeedPath);
  if (!seedPath) return false;
  const mapped = new Set((input.mappedSeedTargets || []).map((value) => normalize(value)).filter(Boolean));
  const bindings = new Set((input.resourceBindings || []).map((binding) => normalize(binding.resourcePath)).filter(Boolean));
  if (bindings.has(seedPath)) return true;
  if (mapped.size === 0) return false;
  const mappedStems = new Set(Array.from(mapped).map((value) => basenameStem(value)).filter(Boolean));
  for (const binding of bindings) {
    if (mapped.has(binding)) return true;
    const bindingStem = basenameStem(binding);
    if (bindingStem && mappedStems.has(bindingStem)) return true;
  }
  return false;
}

function evaluateBridgeSegment(input: EvaluateRuntimeClosureInput, anchorSatisfied: boolean): boolean {
  if (!anchorSatisfied) return false;
  return input.candidates.some((candidate) => isBridgeCandidate(candidate));
}

function evaluateRuntimeSegment(input: EvaluateRuntimeClosureInput): boolean {
  const anchorKeys = collectAnchorNodeKeys(input);
  if (anchorKeys.size === 0) return false;

  const adjacency = new Map<string, Set<string>>();
  const edgeByPair = new Map<string, { bridge: boolean; runtime: boolean }>();
  for (const candidate of input.candidates) {
    const sourceKey = candidateNodeKey({
      id: candidate.sourceId,
      name: candidate.sourceName,
      filePath: candidate.sourceFilePath,
    });
    const targetKey = candidateNodeKey({
      id: candidate.targetId,
      name: candidate.targetName,
      filePath: candidate.targetFilePath,
    });
    if (!sourceKey || !targetKey) continue;
    const sourceNeighbors = adjacency.get(sourceKey) || new Set<string>();
    sourceNeighbors.add(targetKey);
    adjacency.set(sourceKey, sourceNeighbors);
    const targetNeighbors = adjacency.get(targetKey) || new Set<string>();
    targetNeighbors.add(sourceKey);
    adjacency.set(targetKey, targetNeighbors);

    const pair = [sourceKey, targetKey].sort().join('||');
    const existing = edgeByPair.get(pair) || { bridge: false, runtime: false };
    const bridge = isBridgeCandidate(candidate);
    edgeByPair.set(pair, {
      bridge: existing.bridge || bridge,
      runtime: existing.runtime || !bridge,
    });
  }

  const seenNodes = new Set<string>();
  for (const node of anchorKeys) {
    if (seenNodes.has(node)) continue;
    const queue: string[] = [node];
    seenNodes.add(node);
    const componentNodes: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      componentNodes.push(current);
      const neighbors = adjacency.get(current) || new Set<string>();
      for (const neighbor of neighbors) {
        if (seenNodes.has(neighbor)) continue;
        seenNodes.add(neighbor);
        queue.push(neighbor);
      }
    }

    let hasBridge = false;
    let hasRuntime = false;
    for (const componentNode of componentNodes) {
      const neighbors = adjacency.get(componentNode) || new Set<string>();
      for (const neighbor of neighbors) {
        const pair = [componentNode, neighbor].sort().join('||');
        const edge = edgeByPair.get(pair);
        if (!edge) continue;
        if (edge.bridge) hasBridge = true;
        if (edge.runtime) hasRuntime = true;
      }
      if (hasBridge && hasRuntime) return true;
    }
  }

  return false;
}

function hasAnchorIntersection(input: EvaluateRuntimeClosureInput): boolean {
  const symbolTokens = new Set(tokenize(input.symbolName));
  if (symbolTokens.size === 0) return false;
  const resourceTokens = new Set([
    ...tokenize(input.resourceSeedPath),
    ...(input.mappedSeedTargets || []).flatMap((value) => tokenize(value)),
    ...(input.resourceBindings || []).flatMap((binding) => tokenize(binding.resourcePath)),
  ]);
  if (resourceTokens.size === 0) return false;
  for (const token of symbolTokens) {
    if (resourceTokens.has(token)) return true;
  }
  return false;
}

function hasUbiquitousRuntimeSignal(input: EvaluateRuntimeClosureInput): boolean {
  const ubiquitous = new Set(['getcomponent', 'awake', 'start', 'update', 'lateupdate', 'fixedupdate', 'onenable']);
  return input.candidates.some((candidate) => {
    const source = normalize(candidate.sourceName);
    const target = normalize(candidate.targetName);
    return ubiquitous.has(source) || ubiquitous.has(target);
  });
}

export function evaluateRuntimeClosure(input: EvaluateRuntimeClosureInput): RuntimeClosureEvaluation {
  const anchor = evaluateAnchorSegment(input);
  const bind = evaluateBindSegment(input);
  const bridge = evaluateBridgeSegment(input, anchor);
  const runtime = evaluateRuntimeSegment(input);
  const anchorIntersection = hasAnchorIntersection(input);
  const ubiquitousRuntimeSignal = hasUbiquitousRuntimeSignal(input);

  const segments = { anchor, bind, bridge, runtime };
  const allSatisfied = anchor && bind && bridge && runtime;
  const precisionPenalty = allSatisfied && !anchorIntersection && ubiquitousRuntimeSignal;
  const anySatisfied = anchor || bind || bridge || runtime;

  const gaps: RuntimeChainGap[] = [];
  if (!anchor) {
    gaps.push({
      segment: 'loader',
      reason: 'anchor segment missing',
      next_command: input.nextCommand,
    });
  }
  if (!bind) {
    gaps.push({
      segment: 'guid_map',
      reason: 'bind segment missing',
      next_command: input.nextCommand,
    });
  }
  if (!bridge) {
    gaps.push({
      segment: 'loader',
      reason: 'bridge segment missing',
      next_command: input.nextCommand,
    });
  }
  if (!runtime) {
    gaps.push({
      segment: 'runtime',
      reason: 'runtime segment missing',
      next_command: input.nextCommand,
    });
  }
  if (precisionPenalty) {
    gaps.push({
      segment: 'loader',
      reason: 'anchor intersection absent; downgraded for precision-first policy',
      next_command: input.nextCommand,
    });
  }

  if (allSatisfied && !precisionPenalty) {
    return {
      status: 'verified_full',
      evidence_level: 'verified_chain',
      gaps: [],
      segments,
    };
  }

  if (anySatisfied) {
    return {
      status: 'verified_partial',
      evidence_level: 'verified_segment',
      gaps,
      segments,
    };
  }

  return {
    status: 'failed',
    evidence_level: 'none',
    gaps,
    segments,
  };
}
