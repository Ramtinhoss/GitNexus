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

describe('rule-lab docs/contracts (direct flow)', () => {
  it('documents direct public flow in architecture and source-of-truth docs', async () => {
    const architecture = await readRepoFile('docs/gap-lab-rule-lab-architecture.md');
    expect(architecture).toMatch(/approved.*compile.*analyze.*CLI validation/i);

    const truth = await readRepoFile('docs/unity-runtime-process-source-of-truth.md');
    expect(truth).toMatch(/compile.*analyze.*CLI validation/i);
    expect(truth).toMatch(/query-time runtime closure.*graph-only/i);
  });

  it('does not list gap-lab runs as active config ownership', async () => {
    const cfg = await readRepoFile('docs/gitnexus-config-files.md');
    expect(cfg).not.toMatch(/\|\s*`gap-lab\/runs\/\*\*`\s*\|/i);
    expect(cfg).toMatch(/migration\/audit state only/i);
  });

  it('keeps rule-lab artifacts and direct-flow guidance documented', async () => {
    const cfg = await readRepoFile('docs/gitnexus-config-files.md');
    expect(cfg).toMatch(/rules\/lab\/runs/i);
    expect(cfg).toMatch(/approved\s*->\s*compile\s*->\s*analyze\s*->\s*CLI validation/i);
  });

  it('guide references direct authoring flow instead of gap-lab orchestration', async () => {
    const guide = await readRepoFile('gitnexus/skills/gitnexus-guide.md');
    expect(guide).toMatch(/approved\s*->\s*compile\s*->\s*analyze\s*->\s*CLI validation/i);
    expect(guide).not.toMatch(/gap-lab workflow is an offline authoring\/orchestration layer/i);
  });
});
