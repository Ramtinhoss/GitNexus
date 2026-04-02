import fs from 'node:fs/promises';
import path from 'node:path';
import { getRuleLabPaths } from './paths.js';

interface PromotableItem {
  id: string;
  rule_id?: string;
  title?: string;
  confirmed_chain: {
    steps: Array<{
      hop_type?: string;
      anchor: string;
      snippet: string;
    }>;
  };
  guarantees: string[];
  non_guarantees: string[];
}

interface CatalogEntry {
  id: string;
  version: string;
  enabled: boolean;
  file: string;
}

interface CatalogShape {
  version: number;
  rules: CatalogEntry[];
}

export interface PromoteInput {
  repoPath: string;
  runId: string;
  sliceId: string;
  version?: string;
}

export interface PromoteOutput {
  catalog: CatalogShape;
  promotedFiles: string[];
  paths: ReturnType<typeof getRuleLabPaths>;
}

function quoteYaml(value: string): string {
  const raw = String(value || '');
  if (/^[a-zA-Z0-9._-]+$/.test(raw)) return raw;
  return `'${raw.replace(/'/g, "''")}'`;
}

function inferTriggerFamily(item: PromotableItem): string {
  const fromTitle = String(item.title || '').trim().split(/\s+/)[0];
  if (fromTitle) return fromTitle.toLowerCase();
  return 'unknown';
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function buildRuleYaml(ruleId: string, version: string, item: PromotableItem): string {
  const requiredHops = unique(item.confirmed_chain.steps.map((step) => step.hop_type || 'resource'));
  const triggerFamily = inferTriggerFamily(item);

  const lines: string[] = [
    `id: ${quoteYaml(ruleId)}`,
    `version: ${quoteYaml(version)}`,
    `trigger_family: ${quoteYaml(triggerFamily)}`,
    'resource_types:',
    `  - ${quoteYaml('unknown')}`,
    'host_base_type:',
    `  - ${quoteYaml('unknown')}`,
    'required_hops:',
  ];

  requiredHops.forEach((hop) => lines.push(`  - ${quoteYaml(hop)}`));

  lines.push('guarantees:');
  unique(item.guarantees).forEach((entry) => lines.push(`  - ${quoteYaml(entry)}`));

  lines.push('non_guarantees:');
  unique(item.non_guarantees).forEach((entry) => lines.push(`  - ${quoteYaml(entry)}`));

  return `${lines.join('\n')}\n`;
}

async function readCatalog(catalogPath: string): Promise<CatalogShape> {
  try {
    const raw = await fs.readFile(catalogPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<CatalogShape>;
    return {
      version: Number(parsed.version || 1),
      rules: Array.isArray(parsed.rules) ? parsed.rules as CatalogEntry[] : [],
    };
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return { version: 1, rules: [] };
    }
    throw error;
  }
}

export async function promoteCuratedRules(input: PromoteInput): Promise<PromoteOutput> {
  const normalizedRepoPath = path.resolve(input.repoPath);
  const paths = getRuleLabPaths(normalizedRepoPath, input.runId, input.sliceId);
  const version = String(input.version || '1.0.0');

  const curatedRaw = await fs.readFile(paths.curatedPath, 'utf-8');
  const curatedDoc = JSON.parse(curatedRaw) as { curated?: PromotableItem[] };
  const curatedItems = Array.isArray(curatedDoc.curated) ? curatedDoc.curated : [];
  if (curatedItems.length === 0) {
    throw new Error('No curated candidates available for promotion');
  }

  const catalogPath = path.join(paths.rulesRoot, 'catalog.json');
  const catalog = await readCatalog(catalogPath);
  const promotedFiles: string[] = [];

  await fs.mkdir(paths.promotedRoot, { recursive: true });

  for (const item of curatedItems) {
    const ruleId = String(item.rule_id || item.id || '').trim();
    if (!ruleId) {
      throw new Error('curated item missing rule id');
    }

    const relativeFile = path.join('approved', `${ruleId}.yaml`).split(path.sep).join('/');
    const absoluteFile = path.join(paths.rulesRoot, relativeFile);
    const yaml = buildRuleYaml(ruleId, version, item);
    await fs.writeFile(absoluteFile, yaml, 'utf-8');
    promotedFiles.push(absoluteFile);

    const nextEntry: CatalogEntry = {
      id: ruleId,
      version,
      enabled: true,
      file: relativeFile,
    };

    const existingIndex = catalog.rules.findIndex((entry) => entry.id === ruleId);
    if (existingIndex >= 0) {
      catalog.rules[existingIndex] = nextEntry;
    } else {
      catalog.rules.push(nextEntry);
    }
  }

  await fs.mkdir(path.dirname(catalogPath), { recursive: true });
  await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf-8');

  return {
    catalog,
    promotedFiles,
    paths,
  };
}
