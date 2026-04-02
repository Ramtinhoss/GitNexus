import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadRuleRegistry } from '../mcp/local/runtime-claim-rule-registry.js';
import { buildRunId, getRuleLabPaths } from './paths.js';
import type { RuleLabManifest, RuleLabScope, RuleLabSlice } from './types.js';

export interface DiscoverInput {
  repoPath: string;
  scope: RuleLabScope;
  seed?: string;
}

export interface DiscoverOutput {
  runId: string;
  manifest: RuleLabManifest;
  paths: ReturnType<typeof getRuleLabPaths>;
}

function buildSliceId(rule: {
  id: string;
  trigger_family: string;
  resource_types: string[];
  host_base_type: string[];
}): string {
  const hash = createHash('sha1')
    .update(
      JSON.stringify({
        id: rule.id,
        trigger_family: rule.trigger_family,
        resource_types: [...rule.resource_types].sort(),
        host_base_type: [...rule.host_base_type].sort(),
      }),
    )
    .digest('hex')
    .slice(0, 10);
  return `slice-${hash}`;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

export async function discoverRuleLabRun(input: DiscoverInput): Promise<DiscoverOutput> {
  const normalizedRepoPath = path.resolve(input.repoPath);
  const registry = await loadRuleRegistry(normalizedRepoPath);
  const runId = buildRunId({
    repo: path.basename(normalizedRepoPath),
    scope: input.scope,
    seed: input.seed || 'default',
  });
  const runPaths = getRuleLabPaths(normalizedRepoPath, runId);

  const slices: RuleLabSlice[] = registry.activeRules.map((rule) => ({
    id: buildSliceId(rule),
    trigger_family: rule.trigger_family,
    resource_types: rule.resource_types,
    host_base_type: rule.host_base_type,
  }));

  const manifest: RuleLabManifest = {
    run_id: runId,
    repo_path: normalizedRepoPath,
    scope: input.scope,
    generated_at: new Date().toISOString(),
    slices,
    stages: ['discover'],
    next_actions: [
      `gitnexus rule-lab analyze --run-id ${runId}`,
      `gitnexus rule-lab review-pack --run-id ${runId}`,
    ],
  };

  await writeJson(runPaths.manifestPath, manifest);

  await Promise.all(
    slices.map(async (slice) => {
      const slicePath = path.join(runPaths.slicesRoot, slice.id, 'slice.json');
      await writeJson(slicePath, slice);
    }),
  );

  return {
    runId,
    manifest,
    paths: runPaths,
  };
}
