import type { GapHandoffData } from './gap-handoff.js';
import type { RuleLabCandidate, RuleLabSliceWithHandoff, UnityResourceBinding } from './types.js';

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
  if (parts.length >= 2) {
    return {
      className: parts[parts.length - 2] || 'UnknownClass',
      methodName: parts[parts.length - 1] || 'UnknownMethod',
    };
  }
  return {
    className: 'UnknownClass',
    methodName: raw || 'UnknownMethod',
  };
}

function buildBinding(
  candidate: RuleLabCandidate,
  handoff: GapHandoffData,
): UnityResourceBinding[] {
  const sourceId = candidate.source_gap_candidate_ids?.[0];
  const row = handoff.accepted_candidates.find((item) => item.candidate_id === sourceId);
  if (!row) return [];
  const source = splitSymbol(row.source_anchor?.symbol);
  const target = splitSymbol(row.target_anchor?.symbol);
  return [{
    kind: 'method_triggers_method',
    source_class_pattern: source.className,
    source_method: source.methodName,
    target_class_pattern: target.className,
    target_method: target.methodName,
    description: `Derived from gap candidate ${row.candidate_id}`,
  }];
}

function buildConfirmedChain(
  candidate: RuleLabCandidate,
  handoff: GapHandoffData,
): Array<{ hop_type?: string; anchor: string; snippet: string }> {
  if (handoff.confirmed_chain_steps.length > 0) return handoff.confirmed_chain_steps;
  const hops = (candidate.evidence?.hops || []).filter((hop) => String(hop.anchor || '').trim() && String(hop.snippet || '').trim());
  if (hops.length > 0) return hops;
  return [{
    hop_type: 'code_runtime',
    anchor: '.gitnexus/gap-lab/slice.json:1',
    snippet: 'derived-from-gap-handoff',
  }];
}

export function buildCurationInput(input: {
  runId: string;
  sliceId: string;
  slice: RuleLabSliceWithHandoff;
  candidates: RuleLabCandidate[];
  handoff: GapHandoffData;
}): CurationInputDocument {
  const curated: CurationInputItem[] = input.candidates.map((candidate) => {
    const requiredHops = unique((candidate.topology || []).map((hop) => hop.hop));
    const guaranteed = [
      `rule proposal derived from gap accepted ids: ${(candidate.source_gap_candidate_ids || []).join(', ')}`,
    ];
    const nonGuaranteed = [
      `does not promote backlog candidates (${input.slice.source_gap_handoff?.promotion_backlog_count || 0})`,
    ];
    const bindings = buildBinding(candidate, input.handoff);
    const confirmedChain = buildConfirmedChain(candidate, input.handoff);
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
        next_action: `gitnexus query "${input.slice.trigger_family}"`,
      },
      confirmed_chain: {
        steps: confirmedChain,
      },
      guarantees: guaranteed,
      non_guarantees: nonGuaranteed,
      resource_bindings: bindings.length > 0 ? bindings : [{
        kind: 'method_triggers_method',
        source_class_pattern: 'UnknownClass',
        source_method: 'UnknownSource',
        target_class_pattern: 'UnknownClass',
        target_method: 'UnknownTarget',
        description: 'Fallback binding derived from proposal topology',
      }],
    };
  });

  return {
    run_id: input.runId,
    slice_id: input.sliceId,
    curated,
  };
}
