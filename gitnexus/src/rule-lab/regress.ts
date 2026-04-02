import fs from 'node:fs/promises';
import path from 'node:path';

export interface RuleLabRegressInput {
  precision: number;
  coverage: number;
  probes?: Array<{
    id: string;
    pass: boolean;
    replay_command: string;
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
  lines.push('');
  lines.push('## Gate');
  lines.push(`- pass: ${output.pass}`);
  lines.push(`- failures: ${output.failures.join(', ') || 'none'}`);
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
  const probePassRate = probes.length > 0
    ? passedProbes / probes.length
    : 0;
  if (probePassRate < PROBE_PASS_RATE_THRESHOLD) {
    failures.push('probe_pass_rate_below_threshold');
  }

  const output: RuleLabRegressOutput = {
    pass: failures.length === 0,
    failures,
    metrics: {
      precision: input.precision,
      coverage: input.coverage,
      probe_pass_rate: probePassRate,
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
