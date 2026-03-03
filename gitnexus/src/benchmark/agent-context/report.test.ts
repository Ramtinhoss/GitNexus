import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeAgentContextReports } from './report.js';

test('writes benchmark-report.json and benchmark-summary.md with scenario breakdown', async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-context-report-'));
  const result = {
    pass: true,
    failures: [],
    reportDir: outDir,
    metrics: {
      avgCoverage: 1,
      avgToolCalls: 3,
      mandatoryTargetPassRate: 1,
    },
    scenarios: [
      {
        scenarioId: 'sample-refactor-context',
        targetUid: 'Class:Sample:Target',
        toolCalls: 3,
        coverage: 1,
        gatePass: true,
        checks: [
          { id: 'T', pass: true },
          { id: 'E', pass: true },
        ],
        stepOutputs: [],
      },
    ],
  };

  await writeAgentContextReports(outDir, result);

  const jsonPath = path.join(outDir, 'benchmark-report.json');
  const mdPath = path.join(outDir, 'benchmark-summary.md');
  await fs.access(jsonPath);
  await fs.access(mdPath);

  const summary = await fs.readFile(mdPath, 'utf-8');
  assert.match(summary, /sample-refactor-context/);
  assert.match(summary, /coverage/i);
});
