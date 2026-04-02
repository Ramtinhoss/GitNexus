import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getRuleLabPaths } from './paths.js';
import type { RuleLabCandidate, RuleLabSlice } from './types.js';

export interface AnalyzeInput {
  repoPath: string;
  runId: string;
  sliceId: string;
}

export interface AnalyzeOutput {
  paths: ReturnType<typeof getRuleLabPaths>;
  candidates: RuleLabCandidate[];
}

function buildCandidateId(slice: RuleLabSlice, variant: string): string {
  return createHash('sha1')
    .update(`${slice.id}:${slice.trigger_family}:${slice.resource_types.join('|')}:${slice.host_base_type.join('|')}:${variant}`)
    .digest('hex')
    .slice(0, 12);
}

function toRate(numerator: number, denominator: number): number {
  return numerator / Math.max(denominator, 1);
}

function buildTopologyCandidateSet(slice: RuleLabSlice, anchorFile: string): RuleLabCandidate[] {
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

export async function analyzeRuleLabSlice(input: AnalyzeInput): Promise<AnalyzeOutput> {
  const normalizedRepoPath = path.resolve(input.repoPath);
  const paths = getRuleLabPaths(normalizedRepoPath, input.runId, input.sliceId);
  const slicePath = path.join(paths.slicesRoot, input.sliceId, 'slice.json');
  const raw = await fs.readFile(slicePath, 'utf-8');
  const slice = JSON.parse(raw) as RuleLabSlice;

  const anchorFile = path.relative(normalizedRepoPath, slicePath).split(path.sep).join('/');
  const candidates = buildTopologyCandidateSet(slice, anchorFile);

  await fs.mkdir(path.dirname(paths.candidatesPath), { recursive: true });
  await fs.writeFile(paths.candidatesPath, `${candidates.map((candidate) => JSON.stringify(candidate)).join('\n')}\n`, 'utf-8');

  return {
    paths,
    candidates,
  };
}
