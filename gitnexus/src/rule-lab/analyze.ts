import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getRuleLabPaths } from './paths.js';
import { loadGapHandoff, type GapCandidateRow } from './gap-handoff.js';
import type { RuleLabCandidate, RuleLabSliceWithHandoff } from './types.js';

export interface AnalyzeInput {
  repoPath: string;
  runId: string;
  sliceId: string;
}

export interface AnalyzeOutput {
  paths: ReturnType<typeof getRuleLabPaths>;
  candidates: RuleLabCandidate[];
  slice: RuleLabSliceWithHandoff;
}

function buildCandidateId(slice: RuleLabSliceWithHandoff, variant: string): string {
  return createHash('sha1')
    .update(`${slice.id}:${slice.trigger_family}:${slice.resource_types.join('|')}:${slice.host_base_type.join('|')}:${variant}`)
    .digest('hex')
    .slice(0, 12);
}

function toRate(numerator: number, denominator: number): number {
  return numerator / Math.max(denominator, 1);
}

function buildTopologyCandidateSet(slice: RuleLabSliceWithHandoff, anchorFile: string): RuleLabCandidate[] {
  const title = `${slice.trigger_family} ${slice.host_base_type.join(', ') || 'runtime'}`.trim();
  const requiredHops = slice.required_hops && slice.required_hops.length > 0
    ? [...slice.required_hops]
    : ['resource', 'code_runtime'];

  const primaryTopology = requiredHops.map((hop) => ({
    hop,
    from: { entity: hop === 'resource' ? 'resource' : 'script' },
    to: { entity: hop === 'code_runtime' ? 'runtime' : 'script' },
    edge: { kind: hop === 'resource' ? 'binds_script' : 'calls' },
  }));
  const fallbackTopology = primaryTopology.slice(0, Math.max(primaryTopology.length - 1, 1));

  const primaryCovered = primaryTopology.length;
  const total = requiredHops.length;
  const fallbackCovered = Math.min(fallbackTopology.length, total);
  const fallbackMissingHop = requiredHops.find((hop) => !fallbackTopology.some((node) => node.hop === hop));

  const primary: RuleLabCandidate = {
    id: buildCandidateId(slice, 'primary'),
    title: `${title} candidate-a`,
    rule_hint: `${slice.trigger_family}.${slice.id}.primary`,
    topology: primaryTopology,
    stats: {
      covered: primaryCovered,
      total,
      conflicts: 0,
      coverage_rate: toRate(primaryCovered, total),
      conflict_rate: 0,
    },
    counter_examples: [],
    evidence: {
      hops: primaryTopology.map((hop, index) => ({
        hop_type: hop.hop,
        anchor: `${anchorFile}:${index + 1}`,
        snippet: `${slice.trigger_family}:${hop.edge.kind}`,
      })),
    },
  };

  const fallback: RuleLabCandidate = {
    id: buildCandidateId(slice, 'fallback'),
    title: `${title} candidate-b`,
    rule_hint: `${slice.trigger_family}.${slice.id}.fallback`,
    topology: fallbackTopology,
    stats: {
      covered: fallbackCovered,
      total,
      conflicts: 1,
      coverage_rate: toRate(fallbackCovered, total),
      conflict_rate: toRate(1, total),
    },
    counter_examples: fallbackMissingHop
      ? [{ reason: 'required hop missing in topology candidate', missing_hop: fallbackMissingHop, evidence_anchor: `${anchorFile}:1` }]
      : [],
    evidence: {
      hops: fallbackTopology.map((hop, index) => ({
        hop_type: hop.hop,
        anchor: `${anchorFile}:${index + 1}`,
        snippet: `${slice.trigger_family}:${hop.edge.kind}`,
      })),
    },
  };

  return [primary, fallback];
}

function normalizeToken(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function inferRuleStem(slice: RuleLabSliceWithHandoff, row: GapCandidateRow): string {
  const source = normalizeToken(row.source_anchor?.symbol || row.source_anchor?.file || `${slice.id}-source`);
  const target = normalizeToken(row.target_anchor?.symbol || row.target_anchor?.file || `${slice.id}-target`);
  const joined = [source, target].filter(Boolean).join('-');
  return joined || normalizeToken(slice.id) || 'runtime-rule';
}

function buildProposalTopology(slice: RuleLabSliceWithHandoff): Array<{
  hop: string;
  from: Record<string, unknown>;
  to: Record<string, unknown>;
  edge: { kind: string };
}> {
  const requiredHops = Array.isArray(slice.required_hops) && slice.required_hops.length > 0
    ? slice.required_hops
    : ['resource', 'code_runtime'];
  return requiredHops.map((hop) => ({
    hop,
    from: { entity: hop === 'resource' ? 'resource' : 'script' },
    to: { entity: hop === 'code_runtime' ? 'runtime' : 'script' },
    edge: { kind: hop === 'resource' ? 'binds_script' : 'calls' },
  }));
}

function buildProposalCandidates(
  slice: RuleLabSliceWithHandoff,
  handoff: NonNullable<Awaited<ReturnType<typeof loadGapHandoff>>>,
): RuleLabCandidate[] {
  const topology = buildProposalTopology(slice);
  const bindingKind = 'method_triggers_method';
  if (handoff.source_gap_handoff.aggregation_mode === 'aggregate_single_rule') {
    const seed = handoff.accepted_candidates[0];
    const draftRuleId = `unity.event.${inferRuleStem(slice, seed)}.v1`;
    return [{
      id: buildCandidateId(slice, `aggregate:${handoff.source_gap_handoff.accepted_candidate_ids.join(',')}`),
      title: `${slice.trigger_family} aggregated proposal`,
      rule_hint: `${slice.trigger_family}.${slice.id}.aggregate`,
      proposal_kind: 'aggregate_rule',
      source_gap_candidate_ids: [...handoff.source_gap_handoff.accepted_candidate_ids],
      source_slice_id: handoff.source_gap_handoff.slice_id,
      aggregation_mode: 'aggregate_single_rule',
      binding_kind: bindingKind,
      draft_rule_id: draftRuleId,
      topology,
      evidence: {
        hops: handoff.accepted_candidates.flatMap((row) => {
          const hops = [];
          if (row.source_anchor?.file) {
            hops.push({
              hop_type: 'code_runtime',
              anchor: `${row.source_anchor.file}:${Number(row.source_anchor.line || 1)}`,
              snippet: String(row.source_anchor.symbol || row.raw_match || 'source'),
            });
          }
          if (row.target_anchor?.file) {
            hops.push({
              hop_type: 'code_runtime',
              anchor: `${row.target_anchor.file}:${Number(row.target_anchor.line || 1)}`,
              snippet: String(row.target_anchor.symbol || 'target'),
            });
          }
          return hops;
        }),
      },
    }];
  }

  return handoff.accepted_candidates.map((row) => {
    const candidateId = String(row.candidate_id || '').trim();
    const draftRuleId = `unity.event.${inferRuleStem(slice, row)}.v1`;
    return {
      id: buildCandidateId(slice, `proposal:${candidateId}`),
      title: `${slice.trigger_family} proposal ${candidateId}`,
      rule_hint: `${slice.trigger_family}.${slice.id}.${candidateId}`,
      proposal_kind: 'per_anchor_rule',
      source_gap_candidate_ids: [candidateId],
      source_slice_id: handoff.source_gap_handoff.slice_id,
      aggregation_mode: 'per_anchor_rules',
      binding_kind: bindingKind,
      draft_rule_id: draftRuleId,
      topology,
      evidence: {
        hops: [
          {
            hop_type: 'code_runtime',
            anchor: `${String(row.source_anchor?.file || 'unknown')}:${Number(row.source_anchor?.line || 1)}`,
            snippet: String(row.source_anchor?.symbol || row.raw_match || 'source'),
          },
          {
            hop_type: 'code_runtime',
            anchor: `${String(row.target_anchor?.file || 'unknown')}:${Number(row.target_anchor?.line || 1)}`,
            snippet: String(row.target_anchor?.symbol || 'target'),
          },
        ],
      },
    };
  });
}

function assertNoPlaceholderIds(runId: string, sliceId: string): void {
  const placeholderRe = /<[^>]+>|placeholder|todo|tbd/i;
  if (placeholderRe.test(runId) || placeholderRe.test(sliceId)) {
    throw new Error('placeholder run/slice ids are not allowed');
  }
}

export async function analyzeRuleLabSlice(input: AnalyzeInput): Promise<AnalyzeOutput> {
  assertNoPlaceholderIds(input.runId, input.sliceId);
  const normalizedRepoPath = path.resolve(input.repoPath);
  const paths = getRuleLabPaths(normalizedRepoPath, input.runId, input.sliceId);
  const slicePath = path.join(paths.slicesRoot, input.sliceId, 'slice.json');
  const raw = await fs.readFile(slicePath, 'utf-8');
  const slice = JSON.parse(raw) as RuleLabSliceWithHandoff;

  const anchorFile = path.relative(normalizedRepoPath, slicePath).split(path.sep).join('/');
  const handoff = await loadGapHandoff({
    repoPath: normalizedRepoPath,
    runId: input.runId,
    sliceId: input.sliceId,
  });
  const candidates = handoff
    ? buildProposalCandidates(slice, handoff)
    : buildTopologyCandidateSet(slice, anchorFile);

  const nextSlice: RuleLabSliceWithHandoff = handoff
    ? {
      ...slice,
      source_gap_handoff: handoff.source_gap_handoff,
    }
    : slice;

  await fs.mkdir(path.dirname(paths.candidatesPath), { recursive: true });
  await fs.writeFile(paths.candidatesPath, `${candidates.map((candidate) => JSON.stringify(candidate)).join('\n')}\n`, 'utf-8');
  await fs.writeFile(slicePath, `${JSON.stringify(nextSlice, null, 2)}\n`, 'utf-8');

  return {
    paths,
    candidates,
    slice: nextSlice,
  };
}
