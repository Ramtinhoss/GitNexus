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

function evaluateAnchorSegment(input: EvaluateRuntimeClosureInput): boolean {
  const symbolName = normalize(input.symbolName);
  if (!symbolName) return false;
  return input.candidates.some((candidate) => {
    const source = normalize(candidate.sourceName);
    const target = normalize(candidate.targetName);
    return source === symbolName || target === symbolName;
  });
}

function evaluateBindSegment(input: EvaluateRuntimeClosureInput): boolean {
  const seedPath = normalize(input.resourceSeedPath);
  if (!seedPath) return false;
  const mapped = new Set((input.mappedSeedTargets || []).map((value) => normalize(value)).filter(Boolean));
  const bindings = new Set((input.resourceBindings || []).map((binding) => normalize(binding.resourcePath)).filter(Boolean));
  if (mapped.size > 0) {
    for (const target of mapped) {
      if (bindings.has(target)) return true;
    }
    return false;
  }
  return bindings.has(seedPath);
}

function evaluateBridgeSegment(input: EvaluateRuntimeClosureInput, anchorSatisfied: boolean): boolean {
  if (!anchorSatisfied) return false;
  return input.candidates.length > 0;
}

function evaluateRuntimeSegment(input: EvaluateRuntimeClosureInput): boolean {
  const runtimeSignal = /(runtime|start|update|execute|reload|onenable|onstart)/i;
  return input.candidates.some((candidate) => {
    if (runtimeSignal.test(String(candidate.reason || ''))) return true;
    if (runtimeSignal.test(String(candidate.targetName || ''))) return true;
    return runtimeSignal.test(String(candidate.sourceName || ''));
  });
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
