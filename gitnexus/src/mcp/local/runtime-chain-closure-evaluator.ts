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

export function evaluateRuntimeClosure(input: EvaluateRuntimeClosureInput): RuntimeClosureEvaluation {
  const anchor = evaluateAnchorSegment(input);
  const bind = evaluateBindSegment(input);
  const bridge = evaluateBridgeSegment(input, anchor);
  const runtime = evaluateRuntimeSegment(input);

  const segments = { anchor, bind, bridge, runtime };
  const allSatisfied = anchor && bind && bridge && runtime;
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

  if (allSatisfied) {
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
