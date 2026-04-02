import fs from 'node:fs/promises';
import path from 'node:path';

export interface RuleLabRegressInput {
  precision: number;
  coverage: number;
  repoPath?: string;
  runId?: string;
}

export interface RuleLabRegressOutput {
  pass: boolean;
  failures: string[];
  metrics: {
    precision: number;
    coverage: number;
  };
  reportPath?: string;
}

const PRECISION_THRESHOLD = 0.9;
const COVERAGE_THRESHOLD = 0.8;

function buildReportMarkdown(output: RuleLabRegressOutput): string {
  const lines: string[] = [];
  lines.push('# Rule Lab Regression Report');
  lines.push('');
  lines.push('## Metrics');
  lines.push(`- metrics.precision: ${output.metrics.precision}`);
  lines.push(`- metrics.coverage: ${output.metrics.coverage}`);
  lines.push('');
  lines.push('## Gate');
  lines.push(`- pass: ${output.pass}`);
  lines.push(`- failures: ${output.failures.join(', ') || 'none'}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export async function runRuleLabRegress(input: RuleLabRegressInput): Promise<RuleLabRegressOutput> {
  const failures: string[] = [];

  if (input.precision < PRECISION_THRESHOLD) {
    failures.push('precision_below_threshold');
  }
  if (input.coverage < COVERAGE_THRESHOLD) {
    failures.push('coverage_below_threshold');
  }

  const output: RuleLabRegressOutput = {
    pass: failures.length === 0,
    failures,
    metrics: {
      precision: input.precision,
      coverage: input.coverage,
    },
  };

  if (input.repoPath && input.runId) {
    const reportPath = path.join(path.resolve(input.repoPath), '.gitnexus', 'rules', 'reports', `${input.runId}-regress.md`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, buildReportMarkdown(output), 'utf-8');
    output.reportPath = reportPath;
  }

  return output;
}
