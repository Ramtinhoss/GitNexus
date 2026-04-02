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

function buildCandidateId(slice: RuleLabSlice): string {
  return createHash('sha1')
    .update(`${slice.id}:${slice.trigger_family}:${slice.resource_types.join('|')}:${slice.host_base_type.join('|')}`)
    .digest('hex')
    .slice(0, 12);
}

function buildCandidate(slice: RuleLabSlice, anchorFile: string): RuleLabCandidate {
  const id = buildCandidateId(slice);
  const title = `${slice.trigger_family} ${slice.host_base_type.join(', ') || 'runtime'}`.trim();

  return {
    id,
    title,
    rule_hint: `${slice.trigger_family}.${slice.id}`,
    evidence: {
      hops: [
        {
          hop_type: 'resource',
          anchor: `${anchorFile}:1`,
          snippet: slice.trigger_family,
        },
      ],
    },
  };
}

export async function analyzeRuleLabSlice(input: AnalyzeInput): Promise<AnalyzeOutput> {
  const normalizedRepoPath = path.resolve(input.repoPath);
  const paths = getRuleLabPaths(normalizedRepoPath, input.runId, input.sliceId);
  const slicePath = path.join(paths.slicesRoot, input.sliceId, 'slice.json');
  const raw = await fs.readFile(slicePath, 'utf-8');
  const slice = JSON.parse(raw) as RuleLabSlice;

  const anchorFile = path.relative(normalizedRepoPath, slicePath).split(path.sep).join('/');
  const candidate = buildCandidate(slice, anchorFile);

  await fs.mkdir(path.dirname(paths.candidatesPath), { recursive: true });
  await fs.writeFile(paths.candidatesPath, `${JSON.stringify(candidate)}\n`, 'utf-8');

  return {
    paths,
    candidates: [candidate],
  };
}
