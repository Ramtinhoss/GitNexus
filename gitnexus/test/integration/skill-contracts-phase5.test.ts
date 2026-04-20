import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..', '..');
const repoRoot = path.resolve(packageRoot, '..');

const WORKFLOW_CONTRACT = '.agents/skills/gitnexus/_shared/workflow-contract.md';
const UNITY_BINDING_CONTRACT = '.agents/skills/gitnexus/_shared/unity-resource-binding-contract.md';

async function readRepoFile(relPath: string): Promise<string> {
  return fs.readFile(path.join(repoRoot, relPath), 'utf-8');
}

describe('phase5 confidence-aware skill contracts', () => {
  it('emptyProcessFallbackContract', async () => {
    const workflow = await readRepoFile(WORKFLOW_CONTRACT);
    const unityBinding = await readRepoFile(UNITY_BINDING_CONTRACT);

    expect(workflow).toMatch(/empty process/i);
    expect(workflow).toMatch(/resourceBindings/i);
    expect(unityBinding).toMatch(/asset\/meta/i);
  });

  it('lowConfidenceVerificationHintContract', async () => {
    const workflow = await readRepoFile(WORKFLOW_CONTRACT);
    const unityBinding = await readRepoFile(UNITY_BINDING_CONTRACT);

    expect(workflow).toMatch(/confidence.*low/i);
    expect(workflow).toMatch(/verification_hint/i);
    expect(workflow).toMatch(/action/i);
    expect(workflow).toMatch(/target/i);
    expect(workflow).toMatch(/next_command/i);
    expect(unityBinding).toMatch(/verification_hint/i);
  });

  it('chainClosureAnchorContract', async () => {
    const workflow = await readRepoFile(WORKFLOW_CONTRACT);
    const unityBinding = await readRepoFile(UNITY_BINDING_CONTRACT);

    expect(workflow).toMatch(/hop anchor|evidence anchor/i);
    expect(workflow).toMatch(/chain closure|close the chain|semantically closed/i);
    expect(unityBinding).toMatch(/hop anchor|evidence anchor/i);
  });

  it('graphOnlyRuntimeClosureDocsContract', async () => {
    const sourceOfTruth = await readRepoFile('docs/unity-runtime-process-source-of-truth.md');
    const triggerHandoff = await readRepoFile('docs/plans/2026-04-07-trigger-tokens-family-handoff.md');
    const debuggingSkill = await readRepoFile('gitnexus/skills/gitnexus-debugging.md');
    const exploringSkill = await readRepoFile('gitnexus/skills/gitnexus-exploring.md');
    const guideSkill = await readRepoFile('gitnexus/skills/gitnexus-guide.md');

    expect(sourceOfTruth).toMatch(/graph-only closure/i);
    expect(sourceOfTruth).toMatch(/query-time.*不再加载.*rule|query-time.*no longer/i);
    expect(triggerHandoff).toMatch(/archived/i);
    expect(triggerHandoff).toMatch(/no longer depends on .*trigger_tokens/i);
    expect(debuggingSkill).toMatch(/graph-only/i);
    expect(exploringSkill).toMatch(/graph-only/i);
    expect(guideSkill).toMatch(/graph-only/i);
  });
});
