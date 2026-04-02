import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..', '..');
const repoRoot = path.resolve(packageRoot, '..');

async function readRepoFile(relPath: string): Promise<string> {
  return fs.readFile(path.join(repoRoot, relPath), 'utf-8');
}

async function readPackageFile(relPath: string): Promise<string> {
  return fs.readFile(path.join(packageRoot, relPath), 'utf-8');
}

describe('rule-lab docs/contracts', () => {
  it('docs and contract tests reflect rule-lab ownership and lifecycle artifacts', async () => {
    const cfg = await readRepoFile('docs/gitnexus-config-files.md');
    expect(cfg).toMatch(/rule-lab-discover/);
    expect(cfg).toMatch(/rules\/lab\/runs/);

    const truth = await readRepoFile('docs/unity-runtime-process-source-of-truth.md');
    expect(truth).toMatch(/Phase 5 Offline Rule Lab/i);
    expect(truth).toMatch(/rule_lab_discover|rule_lab_promote/i);
  });

  it('phase5 runner enforces semantic authenticity gate contract', async () => {
    const runner = await readPackageFile('src/benchmark/u2-e2e/phase5-rule-lab-acceptance-runner.ts');
    expect(runner).toMatch(/static_hardcode_detected/);
    expect(runner).toMatch(/dsl_lint_failed/);
    expect(runner).toMatch(/probe_pass_rate_below_threshold/);
  });
});
