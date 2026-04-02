import fs from 'node:fs/promises';
import path from 'node:path';
import { getRuleLabPaths } from './paths.js';
import type { RuleLabCandidate } from './types.js';

export interface ReviewPackInput {
  repoPath: string;
  runId: string;
  sliceId: string;
  maxTokens: number;
}

export interface ReviewPackCard {
  card_id: string;
  title: string;
  candidate_ids: string[];
  decision_inputs: {
    required_hops: string[];
    failure_map: Record<string, string>;
    guarantees: string[];
    non_guarantees: string[];
  };
}

export interface ReviewPackMeta {
  token_budget: number;
  token_budget_estimate: number;
  truncated: boolean;
  total_candidates: number;
  included_candidates: number;
}

export interface ReviewPackOutput {
  paths: ReturnType<typeof getRuleLabPaths>;
  meta: ReviewPackMeta;
  cards: ReviewPackCard[];
}

function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}

function parseCandidates(raw: string): RuleLabCandidate[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RuleLabCandidate);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function mergeFailureMaps(candidates: RuleLabCandidate[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const candidate of candidates as Array<RuleLabCandidate & { closure?: { failure_map?: Record<string, string> } }>) {
    const failureMap = candidate.closure?.failure_map || {};
    for (const [key, value] of Object.entries(failureMap)) {
      if (String(key || '').trim() && String(value || '').trim()) {
        out[key] = value;
      }
    }
  }
  return out;
}

function collectRequiredHops(candidates: RuleLabCandidate[]): string[] {
  const fromClosure = candidates.flatMap((candidate) => {
    const closure = (candidate as RuleLabCandidate & { closure?: { required_hops?: string[] } }).closure;
    return Array.isArray(closure?.required_hops) ? closure.required_hops : [];
  });
  if (fromClosure.length > 0) return unique(fromClosure);
  return unique(
    candidates.flatMap((candidate) => (candidate.topology || []).map((hop) => hop.hop)),
  );
}

function collectClaims(
  candidates: RuleLabCandidate[],
): { guarantees: string[]; non_guarantees: string[] } {
  const guarantees = unique(candidates.flatMap((candidate) => {
    const claims = (candidate as RuleLabCandidate & { claims?: { guarantees?: string[] } }).claims;
    return Array.isArray(claims?.guarantees) ? claims.guarantees : [];
  }));
  const nonGuarantees = unique(candidates.flatMap((candidate) => {
    const claims = (candidate as RuleLabCandidate & { claims?: { non_guarantees?: string[] } }).claims;
    return Array.isArray(claims?.non_guarantees) ? claims.non_guarantees : [];
  }));
  return {
    guarantees,
    non_guarantees: nonGuarantees,
  };
}

function buildCards(candidates: RuleLabCandidate[]): ReviewPackCard[] {
  const cards: ReviewPackCard[] = [];
  const chunkSize = 4;

  for (let i = 0; i < candidates.length; i += chunkSize) {
    const chunk = candidates.slice(i, i + chunkSize);
    const claims = collectClaims(chunk);
    cards.push({
      card_id: `card-${Math.floor(i / chunkSize) + 1}`,
      title: `Rule Lab Card ${Math.floor(i / chunkSize) + 1}`,
      candidate_ids: chunk.map((item) => item.id),
      decision_inputs: {
        required_hops: collectRequiredHops(chunk),
        failure_map: mergeFailureMaps(chunk),
        guarantees: claims.guarantees,
        non_guarantees: claims.non_guarantees,
      },
    });
  }

  return cards;
}

function renderReviewPack(meta: ReviewPackMeta, cards: ReviewPackCard[]): string {
  const lines: string[] = [];
  lines.push('# Rule Lab Review Pack');
  lines.push('');
  lines.push('## Meta');
  lines.push(`- token_budget: ${meta.token_budget}`);
  lines.push(`- token_budget_estimate: ${meta.token_budget_estimate}`);
  lines.push(`- truncated: ${meta.truncated}`);
  lines.push(`- total_candidates: ${meta.total_candidates}`);
  lines.push(`- included_candidates: ${meta.included_candidates}`);
  lines.push('');

  for (const card of cards) {
    lines.push(`## ${card.title}`);
    lines.push(`- card_id: ${card.card_id}`);
    lines.push(`- candidate_ids: ${card.candidate_ids.join(', ')}`);
    lines.push(`- required_hops: ${card.decision_inputs.required_hops.join(', ')}`);
    lines.push(`- guarantees: ${card.decision_inputs.guarantees.join(', ')}`);
    lines.push(`- non_guarantees: ${card.decision_inputs.non_guarantees.join(', ')}`);
    lines.push(`- failure_map: ${JSON.stringify(card.decision_inputs.failure_map)}`);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

export async function buildReviewPack(input: ReviewPackInput): Promise<ReviewPackOutput> {
  const normalizedRepoPath = path.resolve(input.repoPath);
  const paths = getRuleLabPaths(normalizedRepoPath, input.runId, input.sliceId);
  const raw = await fs.readFile(paths.candidatesPath, 'utf-8');
  const candidates = parseCandidates(raw);

  const included: RuleLabCandidate[] = [];
  let tokenEstimate = 0;

  for (const candidate of candidates) {
    const nextTokens = estimateTokens(candidate);
    if (tokenEstimate + nextTokens > input.maxTokens) {
      break;
    }
    included.push(candidate);
    tokenEstimate += nextTokens;
  }

  const meta: ReviewPackMeta = {
    token_budget: input.maxTokens,
    token_budget_estimate: tokenEstimate,
    truncated: included.length < candidates.length,
    total_candidates: candidates.length,
    included_candidates: included.length,
  };

  const cards = buildCards(included);
  await fs.mkdir(path.dirname(paths.reviewCardsPath), { recursive: true });
  await fs.writeFile(paths.reviewCardsPath, renderReviewPack(meta, cards), 'utf-8');

  return {
    paths,
    meta,
    cards,
  };
}
