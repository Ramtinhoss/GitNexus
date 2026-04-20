import fs from 'node:fs/promises';
import path from 'node:path';

export interface RuleLabRegressInput {
  precision: number;
  coverage: number;
  probes?: Array<{
    id: string;
    pass: boolean;
    replay_command: string;
    bucket?: 'anchor' | 'holdout' | 'negative';
    key_resource_hit?: boolean;
    next_hop_usable?: boolean;
    hint_drift?: boolean;
    false_positive_anchor_leak?: boolean;
  }>;
  repoPath?: string;
  runId?: string;
}

export interface RuleLabRegressOutput {
  pass: boolean;
  failures: string[];
  metrics: {
    precision: number;
    coverage: number;
    probe_pass_rate: number;
    key_resource_hit_rate: number;
    next_hop_usability_rate: number;
    hint_drift_rate: number;
  };
  bucket_metrics: {
    anchor: { total: number; passed: number; anchor_pass_rate: number };
    holdout: { total: number; usable: number; next_hop_usability_rate: number };
    negative: { total: number; false_positive: number; false_positive_rate: number };
  };
  threshold_checks: {
    precision_pass: boolean;
    coverage_pass: boolean;
    probe_pass_rate_pass: boolean;
    anchor_pass: boolean;
    holdout_pass: boolean;
    negative_pass: boolean;
  };
  probe_results: Array<{
    id: string;
    pass: boolean;
    replay_command: string;
  }>;
  reportPath?: string;
}

const PRECISION_THRESHOLD = 0.9;
const COVERAGE_THRESHOLD = 0.8;
const PROBE_PASS_RATE_THRESHOLD = 0.85;

function buildReportMarkdown(output: RuleLabRegressOutput): string {
  const lines: string[] = [];
  lines.push('# Rule Lab Regression Report');
  lines.push('');
  lines.push('## Metrics');
  lines.push(`- metrics.precision: ${output.metrics.precision}`);
  lines.push(`- metrics.coverage: ${output.metrics.coverage}`);
  lines.push(`- metrics.probe_pass_rate: ${output.metrics.probe_pass_rate}`);
  lines.push(`- metrics.key_resource_hit_rate: ${output.metrics.key_resource_hit_rate}`);
  lines.push(`- metrics.next_hop_usability_rate: ${output.metrics.next_hop_usability_rate}`);
  lines.push(`- metrics.hint_drift_rate: ${output.metrics.hint_drift_rate}`);
  lines.push('');
  lines.push('## Gate');
  lines.push(`- pass: ${output.pass}`);
  lines.push(`- failures: ${output.failures.join(', ') || 'none'}`);
  lines.push(`- threshold_checks: ${JSON.stringify(output.threshold_checks)}`);
  lines.push('');
  lines.push('## Buckets');
  lines.push(`- anchor: ${JSON.stringify(output.bucket_metrics.anchor)}`);
  lines.push(`- holdout: ${JSON.stringify(output.bucket_metrics.holdout)}`);
  lines.push(`- negative: ${JSON.stringify(output.bucket_metrics.negative)}`);
  lines.push('');
  lines.push('## Probe Results');
  if (output.probe_results.length === 0) {
    lines.push('- none');
  } else {
    for (const probe of output.probe_results) {
      lines.push(`- ${probe.id}: pass=${probe.pass} | replay_command=${probe.replay_command}`);
    }
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export async function runRuleLabRegress(input: RuleLabRegressInput): Promise<RuleLabRegressOutput> {
  const failures: string[] = [];
  const probes = Array.isArray(input.probes) ? input.probes : [];

  if (input.precision < PRECISION_THRESHOLD) {
    failures.push('precision_below_threshold');
  }
  if (input.coverage < COVERAGE_THRESHOLD) {
    failures.push('coverage_below_threshold');
  }
  const passedProbes = probes.filter((probe) => probe.pass).length;
  const keyResourceProbeCount = probes.filter((probe) => typeof probe.key_resource_hit === 'boolean').length;
  const keyResourceHitCount = probes.filter((probe) => probe.key_resource_hit === true).length;
  const nextHopProbeCount = probes.filter((probe) => typeof probe.next_hop_usable === 'boolean').length;
  const nextHopUsableCount = probes.filter((probe) => probe.next_hop_usable === true).length;
  const hintDriftProbeCount = probes.filter((probe) => typeof probe.hint_drift === 'boolean').length;
  const hintDriftCount = probes.filter((probe) => probe.hint_drift === true).length;
  const probePassRate = probes.length > 0
    ? passedProbes / probes.length
    : 0;
  if (probePassRate < PROBE_PASS_RATE_THRESHOLD) {
    failures.push('probe_pass_rate_below_threshold');
  }

  const anchorProbes = probes.filter((probe) => probe.bucket === 'anchor');
  const holdoutProbes = probes.filter((probe) => probe.bucket === 'holdout');
  const negativeProbes = probes.filter((probe) => probe.bucket === 'negative');
  const anchorPassed = anchorProbes.filter((probe) => probe.pass).length;
  const holdoutUsable = holdoutProbes.filter((probe) => probe.next_hop_usable === true).length;
  const negativeFalsePositive = negativeProbes.filter((probe) => probe.false_positive_anchor_leak === true).length;
  const anchorPassRate = anchorProbes.length > 0 ? anchorPassed / anchorProbes.length : 0;
  const holdoutUsabilityRate = holdoutProbes.length > 0 ? holdoutUsable / holdoutProbes.length : 0;
  const negativeFalsePositiveRate = negativeProbes.length > 0 ? negativeFalsePositive / negativeProbes.length : 0;
  if (anchorProbes.length === 0) {
    failures.push('anchor_bucket_missing');
  }
  if (holdoutProbes.length === 0) {
    failures.push('holdout_bucket_missing');
  }
  if (negativeProbes.length === 0) {
    failures.push('negative_bucket_missing');
  }
  if (anchorProbes.length > 0 && anchorPassRate < 1) {
    failures.push('anchor_pass_rate_below_threshold');
  }
  if (holdoutProbes.length > 0 && holdoutUsabilityRate < 0.85) {
    failures.push('holdout_next_hop_usability_below_threshold');
  }
  if (negativeProbes.length > 0 && negativeFalsePositiveRate > 0.1) {
    failures.push('negative_false_positive_rate_above_threshold');
  }

  const output: RuleLabRegressOutput = {
    pass: failures.length === 0,
    failures,
    metrics: {
      precision: input.precision,
      coverage: input.coverage,
      probe_pass_rate: probePassRate,
      key_resource_hit_rate: keyResourceProbeCount > 0 ? keyResourceHitCount / keyResourceProbeCount : 0,
      next_hop_usability_rate: nextHopProbeCount > 0 ? nextHopUsableCount / nextHopProbeCount : 0,
      hint_drift_rate: hintDriftProbeCount > 0 ? hintDriftCount / hintDriftProbeCount : 0,
    },
    bucket_metrics: {
      anchor: { total: anchorProbes.length, passed: anchorPassed, anchor_pass_rate: anchorPassRate },
      holdout: { total: holdoutProbes.length, usable: holdoutUsable, next_hop_usability_rate: holdoutUsabilityRate },
      negative: { total: negativeProbes.length, false_positive: negativeFalsePositive, false_positive_rate: negativeFalsePositiveRate },
    },
    threshold_checks: {
      precision_pass: input.precision >= PRECISION_THRESHOLD,
      coverage_pass: input.coverage >= COVERAGE_THRESHOLD,
      probe_pass_rate_pass: probePassRate >= PROBE_PASS_RATE_THRESHOLD,
      anchor_pass: anchorProbes.length > 0 && anchorPassRate >= 1,
      holdout_pass: holdoutProbes.length > 0 && holdoutUsabilityRate >= 0.85,
      negative_pass: negativeProbes.length > 0 && negativeFalsePositiveRate <= 0.1,
    },
    probe_results: probes,
  };

  if (input.repoPath && input.runId) {
    const reportPath = path.join(path.resolve(input.repoPath), '.gitnexus', 'rules', 'reports', `${input.runId}-regress.md`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, buildReportMarkdown(output), 'utf-8');
    output.reportPath = reportPath;
  }

  return output;
}
