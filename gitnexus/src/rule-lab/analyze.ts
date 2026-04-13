import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getRuleLabPaths } from './paths.js';
import { buildCurationInput } from './curation-input-builder.js';
import type { RuleLabCandidate, RuleLabExactPair, RuleLabSlice } from './types.js';

export interface AnalyzeInput {
  repoPath: string;
  runId: string;
  sliceId: string;
}

export interface AnalyzeOutput {
  paths: ReturnType<typeof getRuleLabPaths>;
  candidates: RuleLabCandidate[];
  slice: RuleLabSlice;
}

function buildCandidateId(slice: RuleLabSlice, variant: string): string {
  return createHash('sha1')
    .update(`${slice.id}:${slice.trigger_family}:${slice.resource_types.join('|')}:${slice.host_base_type.join('|')}:${variant}`)
    .digest('hex')
    .slice(0, 12);
}

function normalizeToken(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function inferRuleStem(slice: RuleLabSlice, pair: RuleLabExactPair): string {
  const source = normalizeToken(pair.source_anchor.symbol || pair.source_anchor.file || `${slice.id}-source`);
  const target = normalizeToken(pair.target_anchor.symbol || pair.target_anchor.file || `${slice.id}-target`);
  const joined = [source, target].filter(Boolean).join('-');
  return joined || normalizeToken(slice.id) || 'runtime-rule';
}

function buildProposalTopology(slice: RuleLabSlice): Array<{
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

function buildExactPairCandidates(slice: RuleLabSlice): RuleLabCandidate[] {
  const pairs = Array.isArray(slice.exact_pairs) ? slice.exact_pairs : [];
  if (pairs.length === 0) {
    throw new Error('exact_pairs must be non-empty for reduced rule-lab analyze flow');
  }
  const seenPairIds = new Set<string>();
  for (const pair of pairs) {
    const pairId = String(pair.id || '').trim();
    if (!pairId) continue;
    if (seenPairIds.has(pairId)) {
      throw new Error(`duplicate_exact_pair_id: ${pairId}`);
    }
    seenPairIds.add(pairId);
  }

  const topology = buildProposalTopology(slice);
  return pairs.map((pair, index) => {
    const pairKey = String(pair.id || `${index + 1}`).trim();
    const sourceAnchor = `${String(pair.source_anchor.file || '').trim()}:${Number(pair.source_anchor.line || 1)}`;
    const targetAnchor = `${String(pair.target_anchor.file || '').trim()}:${Number(pair.target_anchor.line || 1)}`;
    const draftRuleId = String(pair.draft_rule_id || '').trim() || `unity.event.${inferRuleStem(slice, pair)}.v1`;
    const bindingKind = pair.binding_kind || 'method_triggers_method';
    return {
      id: buildCandidateId(slice, `exact:${pairKey}`),
      title: `${slice.trigger_family} exact pair ${pairKey}`,
      rule_hint: `${slice.trigger_family}.${slice.id}.exact.${pairKey}`,
      proposal_kind: 'per_anchor_rule',
      aggregation_mode: 'per_anchor_rules',
      binding_kind: bindingKind,
      draft_rule_id: draftRuleId,
      topology,
      closure: {
        required_hops: topology.map((hop) => hop.hop),
        failure_map: {
          missing_evidence: 'rule_matched_but_evidence_missing',
        },
      },
      claims: {
        guarantees: [`exact pair linked: ${sourceAnchor} -> ${targetAnchor}`],
        non_guarantees: ['sparse gap path only; no exhaustive discovery semantics'],
        next_action: `gitnexus query "${slice.trigger_family}"`,
      },
      exact_pair: pair,
      evidence: {
        hops: [
          {
            hop_type: 'code_runtime',
            anchor: sourceAnchor,
            snippet: String(pair.source_anchor.symbol || 'source'),
          },
          {
            hop_type: 'code_runtime',
            anchor: targetAnchor,
            snippet: String(pair.target_anchor.symbol || 'target'),
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
  const slice = JSON.parse(raw) as RuleLabSlice;

  const candidates = buildExactPairCandidates(slice);
  const curation = buildCurationInput({
    runId: input.runId,
    sliceId: input.sliceId,
    slice,
    candidates,
  });

  await fs.mkdir(path.dirname(paths.candidatesPath), { recursive: true });
  await fs.writeFile(paths.candidatesPath, `${candidates.map((candidate) => JSON.stringify(candidate)).join('\n')}\n`, 'utf-8');
  await fs.writeFile(slicePath, `${JSON.stringify(slice, null, 2)}\n`, 'utf-8');
  await fs.writeFile(
    path.join(path.dirname(paths.candidatesPath), 'curation-input.json'),
    `${JSON.stringify(curation, null, 2)}\n`,
    'utf-8',
  );

  return {
    paths,
    candidates,
    slice,
  };
}
