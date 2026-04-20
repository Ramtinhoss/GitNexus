import fs from 'node:fs/promises';
import path from 'node:path';
import {
  writeRuntimeProvenanceArtifact,
  type RuntimeProvenanceInputRecord,
} from '../benchmark/runtime-poc/provenance-artifact.js';
import { runRuntimePocBenchmark } from '../benchmark/runtime-poc/runner.js';

export interface BenchmarkCommandOptions {
  repo?: string;
  reportDir?: string;
  recordsPath?: string;
  casesPath?: string;
}

async function loadRuntimePocRecords(recordsPath?: string): Promise<RuntimeProvenanceInputRecord[]> {
  if (!recordsPath) return [];
  const raw = await fs.readFile(path.resolve(recordsPath), 'utf-8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('runtime-poc records file must be a JSON array');
  }
  return parsed as RuntimeProvenanceInputRecord[];
}

export async function benchmarkCommand(
  suite: string,
  options: BenchmarkCommandOptions = {},
): Promise<{
  artifactPath?: string;
  indexPath?: string;
  sha256?: string;
  comparisonPath?: string;
  summaryPath?: string;
  provenanceArtifactPath?: string;
  provenanceIndexPath?: string;
}> {
  const normalizedSuite = String(suite || '').trim().toLowerCase();
  if (normalizedSuite !== 'runtime-poc') {
    throw new Error(`unsupported benchmark suite: ${suite}`);
  }

  const repo = String(options.repo || 'unknown-repo').trim();
  const reportDir = path.resolve(options.reportDir || 'docs/reports/runtime-poc');
  if (options.recordsPath) {
    const records = await loadRuntimePocRecords(options.recordsPath);
    const out = await writeRuntimeProvenanceArtifact({
      reportDir,
      repo,
      records,
    });

    process.stdout.write(`runtime-poc provenance artifact written: ${out.artifactPath}\n`);
    process.stdout.write(`runtime-poc provenance index updated: ${out.indexPath}\n`);

    return {
      artifactPath: out.artifactPath,
      indexPath: out.indexPath,
      sha256: out.sha256,
    };
  }

  const run = await runRuntimePocBenchmark({
    repo,
    reportDir,
    casesPath: options.casesPath,
  });
  process.stdout.write(`runtime-poc comparison report written: ${run.comparisonPath}\n`);
  process.stdout.write(`runtime-poc markdown summary written: ${run.summaryPath}\n`);
  process.stdout.write(`runtime-poc provenance artifact written: ${run.provenanceArtifactPath}\n`);
  process.stdout.write(`runtime-poc provenance index updated: ${run.provenanceIndexPath}\n`);

  return {
    comparisonPath: run.comparisonPath,
    summaryPath: run.summaryPath,
    provenanceArtifactPath: run.provenanceArtifactPath,
    provenanceIndexPath: run.provenanceIndexPath,
  };
}

export async function benchmarkSuiteCommand(
  suite: string,
  options: { repo?: string; reportDir?: string; recordsPath?: string; casesPath?: string },
) {
  return await benchmarkCommand(suite, options);
}
