import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import { parseRuleYaml } from '../mcp/local/runtime-claim-rule-registry.js';
import type { ResolvedCandidate } from './candidate-resolver.js';

export interface RuleCoverageLookupInput {
  handlerSymbol: string;
  candidate: ResolvedCandidate;
}

export type RuleArtifactCoverageCheck = (input: RuleCoverageLookupInput) => Promise<boolean>;

function splitSymbol(symbol?: string): { classPattern: string; method: string } | null {
  const value = String(symbol || '').trim();
  const splitAt = value.lastIndexOf('.');
  if (splitAt <= 0 || splitAt >= value.length - 1) return null;
  return {
    classPattern: value.slice(0, splitAt),
    method: value.slice(splitAt + 1),
  };
}

function buildCoverageKey(parts: {
  sourceClassPattern: string;
  sourceMethod: string;
  targetClassPattern: string;
  targetMethod: string;
}): string {
  return [
    parts.sourceClassPattern,
    parts.sourceMethod,
    parts.targetClassPattern,
    parts.targetMethod,
  ].join(':');
}

function buildCoverageKeyFromCandidate(candidate: ResolvedCandidate): string | null {
  const source = splitSymbol(candidate.sourceAnchor?.symbol);
  const target = splitSymbol(candidate.targetAnchor?.symbol);
  if (!source || !target) return null;
  return buildCoverageKey({
    sourceClassPattern: source.classPattern,
    sourceMethod: source.method,
    targetClassPattern: target.classPattern,
    targetMethod: target.method,
  });
}

export async function buildRuleArtifactCoverageCheck(repoPath: string): Promise<RuleArtifactCoverageCheck> {
  const approvedRulePaths = await glob('.gitnexus/rules/approved/*.yaml', {
    cwd: path.resolve(repoPath),
    absolute: true,
    nodir: true,
  });

  const coverageKeys = new Set<string>();
  for (const rulePath of approvedRulePaths) {
    const raw = await fs.readFile(rulePath, 'utf-8');
    const rule = parseRuleYaml(raw, rulePath);
    for (const binding of rule.resource_bindings || []) {
      if (binding.kind !== 'method_triggers_method') continue;
      if (!binding.source_class_pattern || !binding.source_method || !binding.target_class_pattern || !binding.target_method) {
        continue;
      }
      coverageKeys.add(buildCoverageKey({
        sourceClassPattern: binding.source_class_pattern,
        sourceMethod: binding.source_method,
        targetClassPattern: binding.target_class_pattern,
        targetMethod: binding.target_method,
      }));
    }
  }

  return async ({ candidate }) => {
    const candidateKey = buildCoverageKeyFromCandidate(candidate);
    return candidateKey ? coverageKeys.has(candidateKey) : false;
  };
}
