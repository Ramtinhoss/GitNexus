import { writeReports } from '../report.js';
import type { AgentContextBenchmarkResult } from './runner.js';

function buildFailureClassRows(result: AgentContextBenchmarkResult): Array<{ id: string; count: number }> {
  const counts = new Map<string, number>();
  for (const scenario of result.scenarios) {
    for (const check of scenario.checks) {
      if (!check.pass) {
        counts.set(check.id, (counts.get(check.id) || 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count);
}

function buildTriageRows(result: AgentContextBenchmarkResult): string[] {
  const failing = result.scenarios
    .map((scenario) => {
      const failedChecks = scenario.checks.filter((check) => !check.pass).map((check) => check.id);
      return {
        scenarioId: scenario.scenarioId,
        coverage: scenario.coverage,
        failedChecks,
      };
    })
    .filter((row) => row.failedChecks.length > 0)
    .sort((a, b) => a.coverage - b.coverage || b.failedChecks.length - a.failedChecks.length);

  return failing.map(
    (row, index) =>
      `${index + 1}. ${row.scenarioId} (coverage=${row.coverage.toFixed(3)}, failed_checks=${row.failedChecks.join(', ')})`,
  );
}

export async function writeAgentContextReports(
  reportDir: string,
  result: AgentContextBenchmarkResult,
) {
  const jsonReport = {
    generatedAt: new Date().toISOString(),
    pass: result.pass,
    failures: result.failures,
    metrics: result.metrics,
    scenarios: result.scenarios,
  };

  const failureClasses = buildFailureClassRows(result);
  const triageRows = buildTriageRows(result);

  const markdown = [
    '# Agent-Context Benchmark Summary',
    '',
    `- Pass: ${result.pass ? 'YES' : 'NO'}`,
    `- Average Coverage: ${result.metrics.avgCoverage.toFixed(3)}`,
    `- Average Tool Calls: ${result.metrics.avgToolCalls.toFixed(3)}`,
    `- Mandatory Target Pass Rate: ${result.metrics.mandatoryTargetPassRate.toFixed(3)}`,
    '',
    '## Scenarios',
    ...result.scenarios.map((scenario) =>
      `- ${scenario.scenarioId}: coverage=${scenario.coverage.toFixed(3)}, calls=${scenario.toolCalls}, gate=${
        scenario.gatePass ? 'PASS' : 'FAIL'
      }`,
    ),
    '',
    '## Top Failure Classes',
    ...(failureClasses.length > 0
      ? failureClasses.map((row) => `- ${row.id}: ${row.count}`)
      : ['- none']),
    '',
    '## Recommended Triage Order',
    ...(triageRows.length > 0 ? triageRows : ['1. none']),
  ].join('\n');

  await writeReports(reportDir, jsonReport, markdown);
}
