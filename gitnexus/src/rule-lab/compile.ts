import fs from 'node:fs/promises';
import path from 'node:path';
import { parseRuleYaml } from '../mcp/local/runtime-claim-rule-registry.js';
import { writeCompiledRuleBundle, type RuleBundleFamily, type StageAwareCompiledRule } from './compiled-bundles.js';

interface CatalogEntry {
  id: string;
  version: string;
  enabled: boolean;
  file: string;
  family?: string;
}

export async function compileRules(options: {
  repoPath?: string;
  family?: RuleBundleFamily;
}): Promise<void> {
  const repoPath = path.resolve(options.repoPath || process.cwd());
  const family: RuleBundleFamily = options.family || 'analyze_rules';
  const rulesRoot = path.join(repoPath, '.gitnexus', 'rules');
  const catalogPath = path.join(rulesRoot, 'catalog.json');

  let catalog: { version: number; rules: CatalogEntry[] };
  try {
    catalog = JSON.parse(await fs.readFile(catalogPath, 'utf-8'));
  } catch {
    console.error(`No catalog.json found at ${catalogPath}`);
    process.exitCode = 1;
    return;
  }

  const entries = catalog.rules.filter((e) => e.enabled !== false && e.family === family);
  if (entries.length === 0) {
    console.log(`No enabled ${family} rules in catalog.`);
    return;
  }

  const compiled: StageAwareCompiledRule[] = [];
  for (const entry of entries) {
    const yamlPath = path.join(rulesRoot, entry.file);
    const raw = await fs.readFile(yamlPath, 'utf-8');
    const rule = parseRuleYaml(raw, entry.file);
    compiled.push({
      id: rule.id,
      version: rule.version,
      trigger_family: rule.trigger_family,
      trigger_tokens: [...(rule.match?.trigger_tokens || [])],
      resource_types: [...rule.resource_types],
      host_base_type: [...rule.host_base_type],
      required_hops: [...rule.required_hops],
      guarantees: [...rule.guarantees],
      non_guarantees: [...rule.non_guarantees],
      next_action: rule.next_action || '',
      file_path: entry.file,
      match: rule.match || { trigger_tokens: [] },
      topology: [],
      closure: { required_hops: rule.required_hops, failure_map: {} },
      claims: { guarantees: rule.guarantees, non_guarantees: rule.non_guarantees, next_action: rule.next_action || '' },
      ...(rule.resource_bindings ? { resource_bindings: rule.resource_bindings } : {}),
      ...(rule.lifecycle_overrides ? { lifecycle_overrides: rule.lifecycle_overrides } : {}),
    });
  }

  const outPath = await writeCompiledRuleBundle(rulesRoot, family, compiled);
  console.log(`Compiled ${compiled.length} ${family} rules → ${outPath}`);
}
