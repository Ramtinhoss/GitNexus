import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';

export interface UnityResourceGuidHit {
  resourcePath: string;
  resourceType: 'prefab' | 'scene';
  line: number;
  lineText: string;
}

export async function findGuidHits(repoRoot: string, guid: string): Promise<UnityResourceGuidHit[]> {
  const resourceFiles = (await glob(['**/*.prefab', '**/*.unity'], {
    cwd: repoRoot,
    nodir: true,
    dot: false,
  })).sort((left, right) => left.localeCompare(right));

  const hits: UnityResourceGuidHit[] = [];

  for (const resourcePath of resourceFiles) {
    const absolutePath = path.join(repoRoot, resourcePath);
    const content = await fs.readFile(absolutePath, 'utf-8');
    const lines = content.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].includes(guid)) continue;
      hits.push({
        resourcePath: resourcePath.replace(/\\/g, '/'),
        resourceType: resourcePath.endsWith('.prefab') ? 'prefab' : 'scene',
        line: index + 1,
        lineText: lines[index],
      });
    }
  }

  return hits;
}
