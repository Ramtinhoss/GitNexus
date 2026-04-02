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

function buildCards(candidates: RuleLabCandidate[]): ReviewPackCard[] {
  const cards: ReviewPackCard[] = [];
  const chunkSize = 4;

  for (let i = 0; i < candidates.length; i += chunkSize) {
    const chunk = candidates.slice(i, i + chunkSize);
    cards.push({
      card_id: `card-${Math.floor(i / chunkSize) + 1}`,
      title: `Rule Lab Card ${Math.floor(i / chunkSize) + 1}`,
      candidate_ids: chunk.map((item) => item.id),
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
