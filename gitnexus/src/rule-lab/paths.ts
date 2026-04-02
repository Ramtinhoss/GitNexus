import { createHash } from 'node:crypto';
import path from 'node:path';
import type { RuleLabScope } from './types.js';

export interface BuildRunIdInput {
  repo: string;
  scope: RuleLabScope;
  seed: string;
}

export interface RuleLabPaths {
  rulesRoot: string;
  runsRoot: string;
  runRoot: string;
  slicesRoot: string;
  manifestPath: string;
  candidatesPath: string;
  reviewCardsPath: string;
  curatedPath: string;
  promotedRoot: string;
  reportsRoot: string;
}

function normalizeIdPart(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

export function buildRunId(input: BuildRunIdInput): string {
  return createHash('sha1')
    .update(`${normalizeIdPart(input.repo)}:${input.scope}:${input.seed}`)
    .digest('hex')
    .slice(0, 12);
}

export function getRuleLabPaths(repoPath: string, runId: string, sliceId = 'default'): RuleLabPaths {
  const normalizedRepoPath = path.resolve(repoPath);
  const rulesRoot = path.join(normalizedRepoPath, '.gitnexus', 'rules');
  const runsRoot = path.join(rulesRoot, 'lab', 'runs');
  const runRoot = path.join(runsRoot, normalizeIdPart(runId));
  const slicesRoot = path.join(runRoot, 'slices');
  const sliceRoot = path.join(slicesRoot, normalizeIdPart(sliceId));

  return {
    rulesRoot,
    runsRoot,
    runRoot,
    slicesRoot,
    manifestPath: path.join(runRoot, 'manifest.json'),
    candidatesPath: path.join(sliceRoot, 'candidates.jsonl'),
    reviewCardsPath: path.join(sliceRoot, 'review-cards.md'),
    curatedPath: path.join(sliceRoot, 'curated.json'),
    promotedRoot: path.join(rulesRoot, 'approved'),
    reportsRoot: path.join(rulesRoot, 'reports'),
  };
}
