import { writeReports } from '../report.js';
import type { AgentContextBenchmarkResult } from './runner.js';

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
  ].join('\n');

  await writeReports(reportDir, jsonReport, markdown);
}
