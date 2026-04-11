import fs from 'node:fs/promises';
import path from 'node:path';

export interface SlimArtifactsInput {
  repoPath: string;
  runId: string;
  sliceId: string;
}

export interface SlimArtifactsResult {
  runRoot: string;
  requiredFiles: string[];
  removedFiles: string[];
}

async function ensureFile(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, '', 'utf-8');
  }
}

async function removeIfExists(filePath: string): Promise<boolean> {
  try {
    await fs.rm(filePath, { force: true, recursive: true });
    return true;
  } catch {
    return false;
  }
}

export async function ensureBalancedSlimArtifacts(input: SlimArtifactsInput): Promise<SlimArtifactsResult> {
  const repoPath = path.resolve(input.repoPath);
  const runRoot = path.join(repoPath, '.gitnexus', 'gap-lab', 'runs', input.runId);
  const slicesRoot = path.join(runRoot, 'slices');

  const requiredFiles = [
    path.join(runRoot, 'inventory.jsonl'),
    path.join(runRoot, 'decisions.jsonl'),
    path.join(slicesRoot, `${input.sliceId}.json`),
    path.join(slicesRoot, `${input.sliceId}.candidates.jsonl`),
  ];

  for (const filePath of requiredFiles) {
    await ensureFile(filePath);
  }

  const redundantStageArtifacts = [
    path.join(slicesRoot, `${input.sliceId}.universe.json`),
    path.join(slicesRoot, `${input.sliceId}.scope.json`),
    path.join(slicesRoot, `${input.sliceId}.coverage.json`),
    path.join(slicesRoot, input.sliceId, 'universe.json'),
    path.join(slicesRoot, input.sliceId, 'scope.json'),
    path.join(slicesRoot, input.sliceId, 'coverage.json'),
  ];

  const removedFiles: string[] = [];
  for (const filePath of redundantStageArtifacts) {
    const removed = await removeIfExists(filePath);
    if (removed) removedFiles.push(filePath);
  }

  return { runRoot, requiredFiles, removedFiles };
}

