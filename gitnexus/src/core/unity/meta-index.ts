import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';

const GUID_PATTERN = /^guid:\s*([0-9a-f]{32})\s*$/im;

export async function buildMetaIndex(repoRoot: string): Promise<Map<string, string>> {
  const metaFiles = (await glob('**/*.cs.meta', {
    cwd: repoRoot,
    nodir: true,
    dot: false,
  })).sort((left, right) => left.localeCompare(right));

  const index = new Map<string, string>();

  for (const metaPath of metaFiles) {
    const absolutePath = path.join(repoRoot, metaPath);
    const content = await fs.readFile(absolutePath, 'utf-8');
    const match = content.match(GUID_PATTERN);
    if (!match) continue;

    const scriptPath = metaPath.slice(0, -'.meta'.length).replace(/\\/g, '/');
    index.set(match[1], scriptPath);
  }

  return index;
}
