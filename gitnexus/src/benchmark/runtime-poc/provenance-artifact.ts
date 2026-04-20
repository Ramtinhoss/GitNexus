import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface RuntimeProvenanceInputRecord {
  scenario_id: string;
  query_text: string;
  symbol_name?: string;
  resource_seed_path?: string;
  mapped_seed_targets?: string[];
  runtime_claim: {
    status: string;
    evidence_level: string;
    reason?: string;
    hops_count?: number;
    gaps_count?: number;
  };
}

export interface RuntimeProvenanceArtifact {
  generated_at: string;
  repo: string;
  mode: 'offline_provenance_only';
  records: RuntimeProvenanceInputRecord[];
}

export interface RuntimeProvenanceIndexEntry {
  generated_at: string;
  repo: string;
  artifact_path: string;
  sha256: string;
  record_count: number;
  generator: 'runtime-poc-provenance-v1';
}

export interface RuntimeProvenanceIndex {
  version: '1.0.0';
  entries: RuntimeProvenanceIndexEntry[];
}

function normalizeRecord(input: RuntimeProvenanceInputRecord): RuntimeProvenanceInputRecord {
  return {
    scenario_id: String(input.scenario_id || '').trim(),
    query_text: String(input.query_text || '').trim(),
    ...(String(input.symbol_name || '').trim() ? { symbol_name: String(input.symbol_name).trim() } : {}),
    ...(String(input.resource_seed_path || '').trim()
      ? { resource_seed_path: String(input.resource_seed_path).trim() }
      : {}),
    mapped_seed_targets: Array.isArray(input.mapped_seed_targets)
      ? input.mapped_seed_targets.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
    runtime_claim: {
      status: String(input.runtime_claim?.status || 'failed').trim(),
      evidence_level: String(input.runtime_claim?.evidence_level || 'none').trim(),
      ...(String(input.runtime_claim?.reason || '').trim()
        ? { reason: String(input.runtime_claim?.reason).trim() }
        : {}),
      ...(Number.isFinite(Number(input.runtime_claim?.hops_count))
        ? { hops_count: Number(input.runtime_claim?.hops_count) }
        : {}),
      ...(Number.isFinite(Number(input.runtime_claim?.gaps_count))
        ? { gaps_count: Number(input.runtime_claim?.gaps_count) }
        : {}),
    },
  };
}

function toIsoStamp(date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function buildRuntimeProvenanceArtifact(input: {
  repo: string;
  records: RuntimeProvenanceInputRecord[];
  generatedAt?: string;
}): RuntimeProvenanceArtifact {
  return {
    generated_at: String(input.generatedAt || toIsoStamp()),
    repo: String(input.repo || '').trim(),
    mode: 'offline_provenance_only',
    records: (input.records || []).map((record) => normalizeRecord(record)),
  };
}

function buildSha256(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function writeRuntimeProvenanceArtifact(input: {
  reportDir: string;
  repo: string;
  records: RuntimeProvenanceInputRecord[];
}): Promise<{
  artifactPath: string;
  indexPath: string;
  sha256: string;
  artifact: RuntimeProvenanceArtifact;
}> {
  const reportDir = path.resolve(input.reportDir);
  await fs.mkdir(reportDir, { recursive: true });

  const artifact = buildRuntimeProvenanceArtifact({
    repo: input.repo,
    records: input.records,
  });
  const stampForFile = artifact.generated_at.replace(/[:]/g, '-');
  const artifactPath = path.join(reportDir, `provenance-${stampForFile}.json`);
  const artifactRaw = JSON.stringify(artifact, null, 2);
  await fs.writeFile(artifactPath, `${artifactRaw}\n`, 'utf-8');

  const sha256 = buildSha256(artifactRaw);
  const indexPath = path.join(reportDir, 'provenance-index.json');
  let index: RuntimeProvenanceIndex = {
    version: '1.0.0',
    entries: [],
  };
  try {
    const existing = JSON.parse(await fs.readFile(indexPath, 'utf-8')) as RuntimeProvenanceIndex;
    if (existing && Array.isArray(existing.entries)) {
      index = {
        version: '1.0.0',
        entries: existing.entries,
      };
    }
  } catch {
    // Keep default empty index.
  }

  const entry: RuntimeProvenanceIndexEntry = {
    generated_at: artifact.generated_at,
    repo: artifact.repo,
    artifact_path: artifactPath,
    sha256,
    record_count: artifact.records.length,
    generator: 'runtime-poc-provenance-v1',
  };

  index.entries = [entry, ...index.entries.filter((row) => String(row.artifact_path || '') !== artifactPath)];
  await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf-8');

  return {
    artifactPath,
    indexPath,
    sha256,
    artifact,
  };
}
