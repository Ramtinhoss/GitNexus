import fs from 'node:fs/promises';
import path from 'node:path';
import { getRuleLabPaths } from './paths.js';

const PLACEHOLDER_RE = /TODO|TBD|placeholder|<[^>]+>/i;

export interface CurateInput {
  repoPath: string;
  runId: string;
  sliceId: string;
  inputPath: string;
}

export interface CuratedStep {
  hop_type?: string;
  anchor: string;
  snippet: string;
}

export interface CuratedItem {
  id: string;
  rule_id?: string;
  title?: string;
  confirmed_chain: {
    steps: CuratedStep[];
  };
  guarantees: string[];
  non_guarantees: string[];
}

export interface CurateOutput {
  paths: ReturnType<typeof getRuleLabPaths>;
  curated: CuratedItem[];
}

function hasPlaceholderText(value: unknown): boolean {
  return PLACEHOLDER_RE.test(String(value || ''));
}

function normalizeForSet(values: string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toLowerCase()));
}

function validateCuratedItem(item: CuratedItem): void {
  if (!Array.isArray(item.confirmed_chain?.steps) || item.confirmed_chain.steps.length === 0) {
    throw new Error('confirmed_chain.steps must be non-empty for promotion');
  }

  item.confirmed_chain.steps.forEach((step, index) => {
    if (!String(step.anchor || '').trim()) {
      throw new Error(`confirmed_chain.steps[${index}].anchor must be non-empty`);
    }
    if (!String(step.snippet || '').trim()) {
      throw new Error(`confirmed_chain.steps[${index}].snippet must be non-empty`);
    }
    if (hasPlaceholderText(step.anchor) || hasPlaceholderText(step.snippet)) {
      throw new Error(`confirmed_chain.steps[${index}] contains placeholder text`);
    }
  });

  if (!Array.isArray(item.guarantees) || item.guarantees.length === 0) {
    throw new Error('guarantees must be non-empty');
  }
  if (!Array.isArray(item.non_guarantees) || item.non_guarantees.length === 0) {
    throw new Error('non_guarantees must be non-empty');
  }

  if (item.guarantees.some((entry) => !String(entry || '').trim()) || item.non_guarantees.some((entry) => !String(entry || '').trim())) {
    throw new Error('guarantees/non_guarantees entries must be non-empty strings');
  }

  if (hasPlaceholderText(JSON.stringify(item))) {
    throw new Error('curated item contains placeholder text');
  }

  const guaranteeSet = normalizeForSet(item.guarantees);
  const nonGuaranteeSet = normalizeForSet(item.non_guarantees);
  const overlap = [...guaranteeSet].filter((entry) => nonGuaranteeSet.has(entry));
  if (overlap.length === guaranteeSet.size && overlap.length === nonGuaranteeSet.size) {
    throw new Error('guarantees and non_guarantees must have semantic distinction');
  }
}

export async function curateRuleLabSlice(input: CurateInput): Promise<CurateOutput> {
  const normalizedRepoPath = path.resolve(input.repoPath);
  const paths = getRuleLabPaths(normalizedRepoPath, input.runId, input.sliceId);
  const raw = await fs.readFile(path.resolve(input.inputPath), 'utf-8');
  const parsed = JSON.parse(raw) as { curated?: CuratedItem[] };

  const curated = Array.isArray(parsed.curated) ? parsed.curated : [];
  if (curated.length === 0) {
    throw new Error('curated must contain at least one candidate');
  }

  curated.forEach(validateCuratedItem);

  await fs.mkdir(path.dirname(paths.curatedPath), { recursive: true });
  await fs.writeFile(
    paths.curatedPath,
    `${JSON.stringify({ run_id: input.runId, slice_id: input.sliceId, curated }, null, 2)}\n`,
    'utf-8',
  );

  return {
    paths,
    curated,
  };
}
