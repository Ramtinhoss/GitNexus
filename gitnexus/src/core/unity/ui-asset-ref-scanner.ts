import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';

export interface UiAssetRefEvidence {
  sourceType: 'prefab' | 'asset';
  sourcePath: string;
  line: number;
  fieldName: string;
  guid: string;
  snippet: string;
}

export interface ScanUiAssetRefInput {
  repoRoot: string;
  scopedPaths?: string[];
}

const GUID_REF_PATTERN = /^\s*([A-Za-z0-9_]+)\s*:\s*\{[^}]*\bguid\s*:\s*([0-9a-f]{32})\b[^}]*\}/i;

export async function scanUiAssetRefs(input: ScanUiAssetRefInput): Promise<UiAssetRefEvidence[]> {
  const resourceFiles = await resolveFiles(input.repoRoot, input.scopedPaths);
  const all: UiAssetRefEvidence[] = [];

  for (const resourcePath of resourceFiles) {
    const sourceType: UiAssetRefEvidence['sourceType'] = resourcePath.endsWith('.prefab') ? 'prefab' : 'asset';
    const absolutePath = path.join(input.repoRoot, resourcePath);
    let content = '';
    try {
      content = await fs.readFile(absolutePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const lineText = lines[i];
      const match = lineText.match(GUID_REF_PATTERN);
      if (!match) continue;
      const fieldName = match[1];
      const guid = match[2].toLowerCase();
      all.push({
        sourceType,
        sourcePath: resourcePath,
        line: i + 1,
        fieldName,
        guid,
        snippet: lineText.trim(),
      });
    }
  }

  return all;
}

async function resolveFiles(repoRoot: string, scopedPaths?: string[]): Promise<string[]> {
  if (!scopedPaths || scopedPaths.length === 0) {
    return (await glob(['**/*.prefab', '**/*.asset'], {
      cwd: repoRoot,
      nodir: true,
      dot: false,
    })).sort((left, right) => left.localeCompare(right));
  }

  const normalized = scopedPaths
    .filter((value) => value.endsWith('.prefab') || value.endsWith('.asset'))
    .map((value) => normalizeRelativePath(repoRoot, value))
    .filter((value): value is string => value !== null)
    .sort((left, right) => left.localeCompare(right));
  return [...new Set(normalized)];
}

function normalizeRelativePath(repoRoot: string, filePath: string): string | null {
  const relativePath = path.isAbsolute(filePath) ? path.relative(repoRoot, filePath) : filePath;
  const normalized = relativePath.replace(/\\/g, '/');
  if (normalized.startsWith('../')) return null;
  return normalized;
}
