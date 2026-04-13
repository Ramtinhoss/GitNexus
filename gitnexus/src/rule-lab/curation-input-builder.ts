import type { RuleLabCandidate, RuleLabExactPair, RuleLabSlice, UnityResourceBinding } from './types.js';

interface CurationInputItem {
  id: string;
  rule_id: string;
  title: string;
  match: {
    trigger_tokens: string[];
    symbol_kind: string[];
    module_scope: string[];
    resource_types: string[];
    host_base_type: string[];
  };
  topology: NonNullable<RuleLabCandidate['topology']>;
  closure: {
    required_hops: string[];
    failure_map: Record<string, string>;
  };
  claims: {
    guarantees: string[];
    non_guarantees: string[];
    next_action: string;
  };
  confirmed_chain: {
    steps: Array<{ hop_type?: string; anchor: string; snippet: string }>;
  };
  guarantees: string[];
  non_guarantees: string[];
  resource_bindings: UnityResourceBinding[];
}

export interface CurationInputDocument {
  run_id: string;
  slice_id: string;
  curated: CurationInputItem[];
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function splitSymbol(symbol?: string): { className: string; methodName: string } {
  const raw = String(symbol || '').trim();
  const parts = raw.split('.');
  if (parts.length < 2) {
    return { className: '', methodName: '' };
  }
  const className = String(parts[parts.length - 2] || '').trim();
  const methodName = String(parts[parts.length - 1] || '').trim();
  return { className, methodName };
}

function assertResolvedBindingParts(parts: { className: string; methodName: string }, side: 'source' | 'target', candidateId: string): void {
  const className = String(parts.className || '').trim();
  const methodName = String(parts.methodName || '').trim();
  if (!className || !methodName) {
    throw new Error(`binding_unresolved: ${side} symbol unresolved for candidate ${candidateId}`);
  }
  if (/^unknown/i.test(className) || /^unknown/i.test(methodName)) {
    throw new Error(`binding_unresolved: ${side} symbol contains unknown placeholder for candidate ${candidateId}`);
  }
}

function assertResolvedSceneToken(value: string, candidateId: string): string {
  const token = String(value || '').trim();
  if (!token) {
    throw new Error(`binding_unresolved: scene token unresolved for candidate ${candidateId}`);
  }
  if (/^unknown/i.test(token)) {
    throw new Error(`binding_unresolved: scene token contains unknown placeholder for candidate ${candidateId}`);
  }
  return token;
}

function buildBinding(candidate: RuleLabCandidate, pair: RuleLabExactPair): UnityResourceBinding[] {
  const source = splitSymbol(pair.source_anchor.symbol);
  assertResolvedBindingParts(source, 'source', candidate.id);
  const kind = candidate.binding_kind === 'method_triggers_scene_load'
    ? 'method_triggers_scene_load'
    : 'method_triggers_method';
  if (kind === 'method_triggers_scene_load') {
    const sceneName = assertResolvedSceneToken(
      String(pair.target_anchor.symbol || pair.target_anchor.file || ''),
      candidate.id,
    );
    return [{
      kind,
      host_class_pattern: source.className,
      loader_methods: [source.methodName],
      scene_name: sceneName,
      description: `Derived from exact pair ${String(pair.id || candidate.id)}`,
    }];
  }
  const target = splitSymbol(pair.target_anchor.symbol);
  assertResolvedBindingParts(target, 'target', candidate.id);
  return [{
    kind,
    source_class_pattern: source.className,
    source_method: source.methodName,
    target_class_pattern: target.className,
    target_method: target.methodName,
    description: `Derived from exact pair ${String(pair.id || candidate.id)}`,
  }];
}

function buildConfirmedChain(candidate: RuleLabCandidate, pair: RuleLabExactPair): Array<{ hop_type?: string; anchor: string; snippet: string }> {
  const hops = (candidate.evidence?.hops || []).filter((hop) => String(hop.anchor || '').trim() && String(hop.snippet || '').trim());
  if (hops.length > 0) return hops;
  const sourceAnchor = String(pair.source_anchor.file || '').trim();
  const targetAnchor = String(pair.target_anchor.file || '').trim();
  const sourceSnippet = String(pair.source_anchor.symbol || '').trim();
  const targetSnippet = String(pair.target_anchor.symbol || '').trim();
  const fallback = [
    sourceAnchor ? {
      hop_type: 'code_runtime',
      anchor: `${sourceAnchor}:${Number(pair.source_anchor.line || 1)}`,
      snippet: sourceSnippet || 'source',
    } : undefined,
    targetAnchor ? {
      hop_type: 'code_runtime',
      anchor: `${targetAnchor}:${Number(pair.target_anchor.line || 1)}`,
      snippet: targetSnippet || 'target',
    } : undefined,
  ].filter((item): item is { hop_type: string; anchor: string; snippet: string } => Boolean(item));
  if (fallback.length === 0) {
    throw new Error(`confirmed_chain_empty: no evidence or anchor fallback for candidate ${candidate.id}`);
  }
  return fallback;
}

export function buildCurationInput(input: {
  runId: string;
  sliceId: string;
  slice: RuleLabSlice;
  candidates: RuleLabCandidate[];
}): CurationInputDocument {
  const curated: CurationInputItem[] = input.candidates.map((candidate) => {
    const pair = candidate.exact_pair;
    if (!pair) {
      throw new Error(`binding_unresolved: exact_pair missing for candidate ${candidate.id}`);
    }
    const requiredHops = unique((candidate.topology || []).map((hop) => hop.hop));
    const guaranteed = unique(candidate.claims?.guarantees || [`exact pair candidate: ${candidate.id}`]);
    const nonGuaranteed = unique(candidate.claims?.non_guarantees || ['sparse gap path only']);
    const bindings = buildBinding(candidate, pair);
    const confirmedChain = buildConfirmedChain(candidate, pair);
    return {
      id: candidate.id,
      rule_id: String(candidate.draft_rule_id || candidate.id),
      title: String(candidate.title || ''),
      match: {
        trigger_tokens: [input.slice.trigger_family],
        symbol_kind: ['method'],
        module_scope: [input.slice.id],
        resource_types: [...input.slice.resource_types],
        host_base_type: [...input.slice.host_base_type],
      },
      topology: candidate.topology || [],
      closure: {
        required_hops: requiredHops.length > 0 ? requiredHops : ['code_runtime'],
        failure_map: {
          missing_evidence: 'rule_matched_but_evidence_missing',
        },
      },
      claims: {
        guarantees: guaranteed,
        non_guarantees: nonGuaranteed,
        next_action: String(candidate.claims?.next_action || `gitnexus query "${input.slice.trigger_family}"`),
      },
      confirmed_chain: {
        steps: confirmedChain,
      },
      guarantees: guaranteed,
      non_guarantees: nonGuaranteed,
      resource_bindings: bindings,
    };
  });

  return {
    run_id: input.runId,
    slice_id: input.sliceId,
    curated,
  };
}
