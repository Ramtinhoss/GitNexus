import fs from 'node:fs/promises';
import path from 'node:path';
import {
  writeRuntimeProvenanceArtifact,
  type RuntimeProvenanceInputRecord,
} from './provenance-artifact.js';

type RuntimeStatus = 'verified_full' | 'verified_partial' | 'failed';
type RuntimeEvidenceLevel = 'verified_chain' | 'verified_segment' | 'clue' | 'none';

export interface RuntimePocCase {
  case_id: string;
  query_text: string;
  symbol_name?: string;
  resource_seed_path?: string;
  mapped_seed_targets?: string[];
  baseline: {
    status: RuntimeStatus;
    evidence_level: RuntimeEvidenceLevel;
    reason?: string;
  };
  graph_only: {
    status: RuntimeStatus;
    evidence_level: RuntimeEvidenceLevel;
    reason?: string;
  };
}

interface RuntimePocComparisonRow {
  case_id: string;
  baseline_status: RuntimeStatus;
  graph_only_status: RuntimeStatus;
  baseline_evidence_level: RuntimeEvidenceLevel;
  graph_only_evidence_level: RuntimeEvidenceLevel;
  verified_full_false_positive: boolean;
  regression: boolean;
  failure_bucket: string;
}

interface RuntimePocReport {
  generated_at: string;
  repo: string;
  comparison_rows: RuntimePocComparisonRow[];
  summary: {
    total_cases: number;
    verified_full_false_positive_count: number;
    verified_full_false_positive_rate: number;
    regression_count: number;
    graph_failed_count: number;
  };
}

export interface RuntimePocBenchmarkResult {
  comparisonPath: string;
  summaryPath: string;
  provenanceArtifactPath: string;
  provenanceIndexPath: string;
}

function toIsoStamp(date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function normalizeStatus(value: unknown): RuntimeStatus {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'verified_full') return 'verified_full';
  if (normalized === 'verified_partial') return 'verified_partial';
  return 'failed';
}

function normalizeEvidence(value: unknown): RuntimeEvidenceLevel {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'verified_chain') return 'verified_chain';
  if (normalized === 'verified_segment') return 'verified_segment';
  if (normalized === 'clue') return 'clue';
  return 'none';
}

function classifyFailureBucket(input: RuntimePocCase): string {
  if (normalizeStatus(input.graph_only.status) !== 'failed') return 'none';
  const reason = String(input.graph_only.reason || '').trim().toLowerCase();
  if (reason.includes('anchor')) return 'anchor_gap';
  if (reason.includes('bind') || reason.includes('guid')) return 'bind_gap';
  if (reason.includes('bridge') || reason.includes('loader')) return 'bridge_gap';
  if (reason.includes('runtime')) return 'runtime_gap';
  if (reason.includes('policy') || reason.includes('precision')) return 'precision_penalty';
  return 'unknown_gap';
}

function buildComparisonRows(cases: RuntimePocCase[]): RuntimePocComparisonRow[] {
  return cases.map((item) => {
    const baselineStatus = normalizeStatus(item.baseline.status);
    const graphStatus = normalizeStatus(item.graph_only.status);
    const failureBucket = classifyFailureBucket(item);
    return {
      case_id: String(item.case_id || '').trim(),
      baseline_status: baselineStatus,
      graph_only_status: graphStatus,
      baseline_evidence_level: normalizeEvidence(item.baseline.evidence_level),
      graph_only_evidence_level: normalizeEvidence(item.graph_only.evidence_level),
      verified_full_false_positive: baselineStatus !== 'verified_full' && graphStatus === 'verified_full',
      regression: baselineStatus === 'verified_full' && graphStatus !== 'verified_full',
      failure_bucket: graphStatus === 'failed' ? failureBucket : 'none',
    };
  });
}

function rate(count: number, total: number): number {
  if (total <= 0) return 0;
  return Number((count / total).toFixed(6));
}

function toMarkdown(report: RuntimePocReport): string {
  return [
    '# Runtime PoC Comparison',
    '',
    `- Generated At: ${report.generated_at}`,
    `- Repo: ${report.repo}`,
    `- Total Cases: ${report.summary.total_cases}`,
    `- verified_full_false_positive_rate: ${report.summary.verified_full_false_positive_rate}`,
    `- regression_count: ${report.summary.regression_count}`,
    `- graph_failed_count: ${report.summary.graph_failed_count}`,
    '',
    '## Rows',
    '',
    '| case_id | baseline_status | graph_only_status | false_positive | regression | failure_bucket |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.comparison_rows.map((row) => (
      `| ${row.case_id} | ${row.baseline_status} | ${row.graph_only_status} | ${row.verified_full_false_positive} | ${row.regression} | ${row.failure_bucket} |`
    )),
    '',
  ].join('\n');
}

async function loadCases(casesPath?: string): Promise<RuntimePocCase[]> {
  if (!casesPath) {
    return [
      {
        case_id: 'default-case-1',
        query_text: 'Reload GunGraph',
        symbol_name: 'GunGraph',
        resource_seed_path: 'Assets/NEON/DataAssets/weapon.asset',
        mapped_seed_targets: ['Assets/NEON/Graphs/weapon_graph.asset'],
        baseline: { status: 'verified_full', evidence_level: 'verified_chain' },
        graph_only: { status: 'verified_full', evidence_level: 'verified_chain' },
      },
      {
        case_id: 'default-case-2',
        query_text: 'Reload WeaponPowerUp',
        symbol_name: 'WeaponPowerUp',
        resource_seed_path: 'Assets/NEON/DataAssets/orb.asset',
        mapped_seed_targets: ['Assets/NEON/Graphs/global.asset'],
        baseline: { status: 'failed', evidence_level: 'none', reason: 'rule_not_matched' },
        graph_only: { status: 'failed', evidence_level: 'none', reason: 'anchor_gap' },
      },
    ];
  }

  const raw = await fs.readFile(path.resolve(casesPath), 'utf-8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('runtime-poc cases file must be a JSON array');
  }
  return parsed as RuntimePocCase[];
}

function toProvenanceRecords(cases: RuntimePocCase[]): RuntimeProvenanceInputRecord[] {
  return cases.map((item) => ({
    scenario_id: String(item.case_id || '').trim(),
    query_text: String(item.query_text || '').trim(),
    ...(String(item.symbol_name || '').trim() ? { symbol_name: String(item.symbol_name).trim() } : {}),
    ...(String(item.resource_seed_path || '').trim()
      ? { resource_seed_path: String(item.resource_seed_path).trim() }
      : {}),
    mapped_seed_targets: Array.isArray(item.mapped_seed_targets) ? item.mapped_seed_targets : [],
    runtime_claim: {
      status: normalizeStatus(item.graph_only.status),
      evidence_level: normalizeEvidence(item.graph_only.evidence_level),
      ...(String(item.graph_only.reason || '').trim() ? { reason: String(item.graph_only.reason).trim() } : {}),
    },
  }));
}

export async function runRuntimePocBenchmark(input: {
  repo: string;
  reportDir: string;
  casesPath?: string;
}): Promise<RuntimePocBenchmarkResult> {
  const reportDir = path.resolve(input.reportDir);
  await fs.mkdir(reportDir, { recursive: true });

  const cases = await loadCases(input.casesPath);
  const rows = buildComparisonRows(cases);
  const falsePositiveCount = rows.filter((row) => row.verified_full_false_positive).length;
  const regressionCount = rows.filter((row) => row.regression).length;
  const graphFailedCount = rows.filter((row) => row.graph_only_status === 'failed').length;

  const report: RuntimePocReport = {
    generated_at: toIsoStamp(),
    repo: String(input.repo || '').trim(),
    comparison_rows: rows,
    summary: {
      total_cases: rows.length,
      verified_full_false_positive_count: falsePositiveCount,
      verified_full_false_positive_rate: rate(falsePositiveCount, rows.length),
      regression_count: regressionCount,
      graph_failed_count: graphFailedCount,
    },
  };

  const comparisonPath = path.join(reportDir, 'runtime-poc-comparison.json');
  await fs.writeFile(comparisonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  const summaryPath = path.join(reportDir, 'runtime-poc-summary.md');
  await fs.writeFile(summaryPath, `${toMarkdown(report)}\n`, 'utf-8');

  const provenance = await writeRuntimeProvenanceArtifact({
    reportDir,
    repo: report.repo,
    records: toProvenanceRecords(cases),
  });

  return {
    comparisonPath,
    summaryPath,
    provenanceArtifactPath: provenance.artifactPath,
    provenanceIndexPath: provenance.indexPath,
  };
}
