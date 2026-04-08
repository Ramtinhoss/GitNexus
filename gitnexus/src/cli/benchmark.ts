import fs from 'node:fs/promises';
import path from 'node:path';
import {
  writeRuntimeProvenanceArtifact,
  type RuntimeProvenanceInputRecord,
} from '../benchmark/runtime-poc/provenance-artifact.js';

export interface BenchmarkCommandOptions {
  repo?: string;
  reportDir?: string;
  recordsPath?: string;
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
  artifactPath: string;
  indexPath: string;
  sha256: string;
}> {
  const normalizedSuite = String(suite || '').trim().toLowerCase();
  if (normalizedSuite !== 'runtime-poc') {
    throw new Error(`unsupported benchmark suite: ${suite}`);
  }

  const repo = String(options.repo || 'unknown-repo').trim();
  const reportDir = path.resolve(options.reportDir || 'docs/reports/runtime-poc');
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
