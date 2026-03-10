import fs from 'node:fs/promises';
import path from 'node:path';

export interface E2EConfig {
  runIdPrefix: string;
  targetPath: string;
  repoAliasPrefix: string;
  scope: { scriptPrefixes: string[]; resourcePrefixes: string[] };
  estimateRangeSec: { lower: number; upper: number };
  symbolScenarios: SymbolScenario[];
}

export interface SymbolScenario {
  symbol: string;
  kind: 'component' | 'scriptableobject' | 'serializable-class' | 'partial-component';
  objectives: string[];
  contextFileHint?: string;
  deepDivePlan: Array<{ tool: 'query' | 'context' | 'impact' | 'cypher'; input: Record<string, unknown> }>;
}

interface RawE2EConfig {
  runIdPrefix: string;
  targetPath: string;
  repoAliasPrefix: string;
  scope: { scriptPrefixes: string[]; resourcePrefixes: string[] };
  estimateRangeSec: { lower: number; upper: number };
  symbolScenariosPath?: string;
  symbolScenarios?: SymbolScenario[];
}

function candidatePaths(inputPath: string): string[] {
  if (path.isAbsolute(inputPath)) {
    return [inputPath];
  }

  return [
    path.resolve(process.cwd(), inputPath),
    path.resolve(process.cwd(), '..', inputPath),
  ];
}

async function readJsonFile<T>(inputPath: string): Promise<T> {
  const tried: string[] = [];
  for (const filePath of candidatePaths(inputPath)) {
    tried.push(filePath);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  throw new Error(`File not found: ${inputPath}. Tried: ${tried.join(', ')}`);
}

export async function loadE2EConfig(configPath: string): Promise<E2EConfig> {
  const raw = await readJsonFile<RawE2EConfig>(configPath);

  let symbolScenarios = raw.symbolScenarios || [];
  if (raw.symbolScenariosPath) {
    symbolScenarios = await readJsonFile<SymbolScenario[]>(raw.symbolScenariosPath);
  }

  return {
    runIdPrefix: raw.runIdPrefix,
    targetPath: raw.targetPath,
    repoAliasPrefix: raw.repoAliasPrefix,
    scope: raw.scope,
    estimateRangeSec: raw.estimateRangeSec,
    symbolScenarios,
  };
}
