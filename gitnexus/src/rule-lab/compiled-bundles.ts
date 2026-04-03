import fs from 'node:fs/promises';
import path from 'node:path';
import type { RuleDslClaims, RuleDslClosure, RuleDslMatch, RuleDslTopologyHop } from './types.js';

export type RuleBundleFamily = 'analyze_rules' | 'retrieval_rules' | 'verification_rules';

export interface StageAwareCompiledRule {
  id: string;
  version: string;
  trigger_family: string;
  trigger_tokens: string[];
  resource_types: string[];
  host_base_type: string[];
  required_hops: string[];
  guarantees: string[];
  non_guarantees: string[];
  next_action: string;
  file_path: string;
  match: RuleDslMatch;
  topology: RuleDslTopologyHop[];
  closure: RuleDslClosure;
  claims: RuleDslClaims;
}

export interface CompiledRuleBundle {
  bundle_version: '2.0.0';
  family: RuleBundleFamily;
  generated_at: string;
  rules: StageAwareCompiledRule[];
}

export function compiledBundlePath(rulesRoot: string, family: RuleBundleFamily): string {
  return path.join(path.resolve(rulesRoot), 'compiled', `${family}.v2.json`);
}

export async function writeCompiledRuleBundle(
  rulesRoot: string,
  family: RuleBundleFamily,
  rules: StageAwareCompiledRule[],
): Promise<string> {
  const outPath = compiledBundlePath(rulesRoot, family);
  const bundle: CompiledRuleBundle = {
    bundle_version: '2.0.0',
    family,
    generated_at: new Date().toISOString(),
    rules,
  };
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf-8');
  return outPath;
}

export async function loadCompiledRuleBundle(
  repoPath: string,
  family: RuleBundleFamily,
  rulesRoot?: string,
): Promise<CompiledRuleBundle | undefined> {
  const root = rulesRoot
    ? path.resolve(rulesRoot)
    : path.join(path.resolve(repoPath), '.gitnexus', 'rules');
  const bundlePath = compiledBundlePath(root, family);
  try {
    const raw = await fs.readFile(bundlePath, 'utf-8');
    const parsed = JSON.parse(raw) as CompiledRuleBundle;
    if (parsed.family !== family || !Array.isArray(parsed.rules)) {
      throw new Error(`Invalid compiled ${family} bundle: ${bundlePath}`);
    }
    return parsed;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}
