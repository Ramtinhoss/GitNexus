import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listRegisteredRepos } from '../../storage/repo-manager.js';
import { LocalBackend } from '../../mcp/local/local-backend.js';
import { readResource } from '../../mcp/resources.js';

export interface Phase1ProcessRefAcceptanceReport {
  generatedAt: string;
  repoAlias: string;
  metrics: {
    process_ref: {
      total: number;
      readable_count: number;
      readable_rate: number;
      unreadable_count: number;
    };
    derived_id_stability_rate: number;
  };
  checks: {
    query: string;
    unity_resources: 'on';
    unity_hydration_mode: 'compact';
  };
}

function toRate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 1;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

function extractDerivedIds(result: any): string[] {
  const processes = Array.isArray(result?.processes) ? result.processes : [];
  return processes
    .map((entry: any) => String(entry?.id || ''))
    .filter((id: string) => id.startsWith('derived:'))
    .sort();
}

export async function buildPhase1ProcessRefAcceptanceReport(input: {
  repoAlias: string;
}): Promise<Phase1ProcessRefAcceptanceReport> {
  const repos = await listRegisteredRepos({ validate: false });
  const repo = repos.find((entry) => entry.name === input.repoAlias);
  if (!repo) {
    throw new Error(`Repo alias not found: ${input.repoAlias}`);
  }

  const backend = new LocalBackend();
  const ready = await backend.init();
  if (!ready) {
    throw new Error('LocalBackend failed to initialize for phase1 acceptance runner');
  }

  const params = {
    repo: input.repoAlias,
    query: 'Reload',
    unity_resources: 'on' as const,
    unity_hydration_mode: 'compact' as const,
  };
  const first = await backend.callTool('query', params);
  const second = await backend.callTool('query', params);

  const processes = Array.isArray((first as any)?.processes) ? (first as any).processes : [];
  const persistentReaderUris = processes
    .map((entry: any) => entry?.process_ref)
    .filter((processRef: any) => processRef?.kind === 'persistent' && typeof processRef.reader_uri === 'string')
    .map((processRef: any) => processRef.reader_uri as string);
  let readableCount = 0;
  for (const uri of persistentReaderUris) {
    try {
      await readResource(uri, backend);
      readableCount += 1;
    } catch {
      // Count as unreadable in behavior-level metric.
    }
  }
  const unreadableCount = Math.max(0, persistentReaderUris.length - readableCount);

  const firstDerived = extractDerivedIds(first);
  const secondDerived = extractDerivedIds(second);
  const derivedStable = firstDerived.length === secondDerived.length
    && firstDerived.every((id, idx) => id === secondDerived[idx]);

  return {
    generatedAt: new Date().toISOString(),
    repoAlias: input.repoAlias,
    metrics: {
      process_ref: {
        total: persistentReaderUris.length,
        readable_count: readableCount,
        readable_rate: toRate(readableCount, persistentReaderUris.length),
        unreadable_count: unreadableCount,
      },
      derived_id_stability_rate: derivedStable ? 1 : 0,
    },
    checks: {
      query: 'Reload',
      unity_resources: 'on',
      unity_hydration_mode: 'compact',
    },
  };
}

export async function writePhase1ProcessRefAcceptanceReport(
  outPath: string,
  report: Phase1ProcessRefAcceptanceReport,
): Promise<void> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(report, null, 2));
}

async function main(argv: string[]): Promise<void> {
  const repoIndex = argv.indexOf('--repo');
  const outIndex = argv.indexOf('--out');
  const repoAlias = String(argv[repoIndex + 1] || '').trim();
  const outPath = path.resolve(String(argv[outIndex + 1] || '').trim());
  if (!repoAlias || !outPath) {
    throw new Error('Usage: node dist/benchmark/u2-e2e/phase1-process-ref-acceptance-runner.js --repo <alias> --out <path>');
  }

  const report = await buildPhase1ProcessRefAcceptanceReport({ repoAlias });
  await writePhase1ProcessRefAcceptanceReport(outPath, report);
  process.stdout.write(`phase1 process_ref acceptance artifact written: ${outPath}\n`);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (entryPath === thisPath) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
