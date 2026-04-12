import fs from 'node:fs/promises';
import path from 'node:path';
import { getRuleLabPaths } from './paths.js';
import type { RuleDslDraft, RuleDslMatch, RuleDslTopologyHop, RuleDslClosure, RuleDslClaims, UnityResourceBinding } from './types.js';

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
  match?: RuleDslMatch;
  topology?: RuleDslTopologyHop[];
  closure?: RuleDslClosure;
  claims?: RuleDslClaims;
  resource_bindings?: UnityResourceBinding[];
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

function ensureStringArray(values: string[] | undefined, field: string): string[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${field} must be non-empty`);
  }
  if (values.some((value) => !String(value || '').trim())) {
    throw new Error(`${field} entries must be non-empty strings`);
  }
  return values.map((value) => String(value).trim());
}

function validateDslFields(item: CuratedItem): void {
  if (!item.match || !Array.isArray(item.match.trigger_tokens) || item.match.trigger_tokens.length === 0) {
    throw new Error('match.trigger_tokens must be non-empty');
  }
  ensureStringArray(item.match.trigger_tokens, 'match.trigger_tokens');

  if (!Array.isArray(item.topology) || item.topology.length === 0) {
    throw new Error('topology must be non-empty');
  }
  item.topology.forEach((hop, index) => {
    if (!String(hop.hop || '').trim()) {
      throw new Error(`topology[${index}].hop must be non-empty`);
    }
    if (!String(hop.edge?.kind || '').trim()) {
      throw new Error(`topology[${index}].edge.kind must be non-empty`);
    }
  });

  if (!item.closure || !Array.isArray(item.closure.required_hops) || item.closure.required_hops.length === 0) {
    throw new Error('closure.required_hops must be non-empty');
  }
  if (!item.closure.failure_map || Object.keys(item.closure.failure_map).length === 0) {
    throw new Error('closure.failure_map must be non-empty');
  }
  ensureStringArray(item.closure.required_hops, 'closure.required_hops');

  if (!item.claims) {
    throw new Error('claims must be present');
  }
  ensureStringArray(item.claims.guarantees, 'claims.guarantees');
  ensureStringArray(item.claims.non_guarantees, 'claims.non_guarantees');
  if (!String(item.claims.next_action || '').trim()) {
    throw new Error('claims.next_action must be non-empty');
  }
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

  validateDslFields(item);
}

function toDslDraft(item: CuratedItem): RuleDslDraft {
  return {
    id: String(item.rule_id || item.id || '').trim(),
    version: '2.0.0',
    match: item.match as RuleDslMatch,
    topology: item.topology as RuleDslTopologyHop[],
    closure: item.closure as RuleDslClosure,
    claims: item.claims as RuleDslClaims,
    ...(Array.isArray(item.resource_bindings) && item.resource_bindings.length > 0
      ? { resource_bindings: item.resource_bindings }
      : {}),
  };
}

function validateDslDraft(draft: RuleDslDraft): void {
  if (!String(draft.id || '').trim()) {
    throw new Error('dsl draft id must be non-empty');
  }
  ensureStringArray(draft.match.trigger_tokens, 'match.trigger_tokens');
  if (!Array.isArray(draft.topology) || draft.topology.length === 0) {
    throw new Error('topology must be non-empty');
  }
  ensureStringArray(draft.closure.required_hops, 'closure.required_hops');
  if (!draft.closure.failure_map || Object.keys(draft.closure.failure_map).length === 0) {
    throw new Error('closure.failure_map must be non-empty');
  }
  ensureStringArray(draft.claims.guarantees, 'claims.guarantees');
  ensureStringArray(draft.claims.non_guarantees, 'claims.non_guarantees');
  if (!String(draft.claims.next_action || '').trim()) {
    throw new Error('claims.next_action must be non-empty');
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
  const drafts = curated.map((item) => toDslDraft(item));
  drafts.forEach(validateDslDraft);
  const firstDraft = drafts[0];
  const sliceDir = path.dirname(paths.curatedPath);

  await fs.mkdir(path.dirname(paths.curatedPath), { recursive: true });
  await fs.writeFile(
    paths.curatedPath,
    `${JSON.stringify({ run_id: input.runId, slice_id: input.sliceId, curated }, null, 2)}\n`,
    'utf-8',
  );
  await fs.writeFile(
    path.join(sliceDir, 'dsl-drafts.json'),
    `${JSON.stringify({ run_id: input.runId, slice_id: input.sliceId, drafts }, null, 2)}\n`,
    'utf-8',
  );
  if (drafts.length === 1) {
    await fs.writeFile(
      path.join(sliceDir, 'dsl-draft.json'),
      `${JSON.stringify(firstDraft, null, 2)}\n`,
      'utf-8',
    );
  } else {
    await fs.writeFile(
      path.join(sliceDir, 'dsl-draft.json'),
      `${JSON.stringify({
        compatibility_warning: 'multi-draft mode active; use dsl-drafts.json for complete draft set',
        primary_draft_id: firstDraft.id,
        primary_draft: firstDraft,
      }, null, 2)}\n`,
      'utf-8',
    );
  }

  return {
    paths,
    curated,
  };
}
