import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
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
  targetGuids?: string[];
}

const YAML_INLINE_GUID_PATTERN = /\bguid\s*:\s*([0-9a-f]{32})\b/i;
const YAML_FIELD_OPEN_PATTERN = /^\s*([A-Za-z0-9_]+)\s*:\s*\{/;
const YAML_INLINE_FIELD_PATTERN = /^\s*([A-Za-z0-9_]+)\s*:\s*\{[^}]*\bguid\s*:\s*([0-9a-f]{32})\b[^}]*\}/i;
const SCAN_CONCURRENCY = 8;

export async function scanUiAssetRefs(input: ScanUiAssetRefInput): Promise<UiAssetRefEvidence[]> {
  const resourceFiles = await resolveFiles(input.repoRoot, input.scopedPaths);
  const guidFilter = toGuidFilter(input.targetGuids);
  const candidateFiles =
    guidFilter && guidFilter.size > 0
      ? await findCandidateFilesByGuid(input.repoRoot, resourceFiles, guidFilter)
      : resourceFiles;

  const perFile = await mapWithConcurrency(candidateFiles, SCAN_CONCURRENCY, async (resourcePath) => {
    const sourceType: UiAssetRefEvidence['sourceType'] = resourcePath.endsWith('.prefab') ? 'prefab' : 'asset';
    return scanResourceFileForGuidRefs(input.repoRoot, resourcePath, sourceType, guidFilter);
  });

  const all: UiAssetRefEvidence[] = [];
  for (const entries of perFile) {
    all.push(...entries);
  }

  return all;
}

async function findCandidateFilesByGuid(
  repoRoot: string,
  resourceFiles: string[],
  guidFilter: Set<string>,
): Promise<string[]> {
  const candidates = await mapWithConcurrency(resourceFiles, SCAN_CONCURRENCY, async (resourcePath) => {
    const absolutePath = path.join(repoRoot, resourcePath);
    const stream = createReadStream(absolutePath, { encoding: 'utf-8' });
    const reader = createInterface({ input: stream, crlfDelay: Infinity });
    try {
      for await (const line of reader) {
        const lower = line.toLowerCase();
        for (const guid of guidFilter) {
          if (lower.includes(guid)) return resourcePath;
        }
      }
      return null;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'EISDIR') return null;
      throw error;
    } finally {
      reader.close();
      stream.destroy();
    }
  });

  return candidates
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right));
}

async function scanResourceFileForGuidRefs(
  repoRoot: string,
  resourcePath: string,
  sourceType: UiAssetRefEvidence['sourceType'],
  guidFilter: Set<string> | null,
): Promise<UiAssetRefEvidence[]> {
  const absolutePath = path.join(repoRoot, resourcePath);
  const stream = createReadStream(absolutePath, { encoding: 'utf-8' });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  const out: UiAssetRefEvidence[] = [];

  let lineNumber = 0;
  let currentField = '';
  let currentStartLine = 0;
  let currentLines: string[] = [];
  let currentGuidLine = 0;
  let braceDepth = 0;

  const flushCurrentBlock = (): void => {
    if (!currentField || currentLines.length === 0) {
      resetCurrentBlock();
      return;
    }
    const combined = currentLines.join('\n');
    const guidMatch = combined.match(YAML_INLINE_GUID_PATTERN);
    if (!guidMatch) {
      resetCurrentBlock();
      return;
    }
    const guid = guidMatch[1].toLowerCase();
    if (guidFilter && !guidFilter.has(guid)) {
      resetCurrentBlock();
      return;
    }
    out.push({
      sourceType,
      sourcePath: resourcePath,
      line: currentGuidLine || currentStartLine || 1,
      fieldName: currentField,
      guid,
      snippet: currentLines[0].trim(),
    });
    resetCurrentBlock();
  };

  const resetCurrentBlock = (): void => {
    currentField = '';
    currentStartLine = 0;
    currentLines = [];
    currentGuidLine = 0;
    braceDepth = 0;
  };

  try {
    for await (const line of reader) {
      lineNumber += 1;
      const inlineMatch = line.match(YAML_INLINE_FIELD_PATTERN);
      if (inlineMatch) {
        const guid = inlineMatch[2].toLowerCase();
        if (!guidFilter || guidFilter.has(guid)) {
          out.push({
            sourceType,
            sourcePath: resourcePath,
            line: lineNumber,
            fieldName: inlineMatch[1],
            guid,
            snippet: line.trim(),
          });
        }
        continue;
      }

      if (currentField) {
        currentLines.push(line);
        if (!currentGuidLine && YAML_INLINE_GUID_PATTERN.test(line)) {
          currentGuidLine = lineNumber;
        }
        braceDepth += countChar(line, '{');
        braceDepth -= countChar(line, '}');
        if (braceDepth <= 0 || line.includes('}')) {
          flushCurrentBlock();
        }
        continue;
      }

      const openMatch = line.match(YAML_FIELD_OPEN_PATTERN);
      if (!openMatch) continue;

      currentField = openMatch[1];
      currentStartLine = lineNumber;
      currentLines = [line];
      currentGuidLine = YAML_INLINE_GUID_PATTERN.test(line) ? lineNumber : 0;
      braceDepth = Math.max(1, countChar(line, '{') - countChar(line, '}'));

      if (line.includes('}') || braceDepth <= 0) {
        flushCurrentBlock();
      }
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'EISDIR') {
      return [];
    }
    throw error;
  } finally {
    reader.close();
    stream.destroy();
  }

  if (currentField) {
    flushCurrentBlock();
  }

  return out;
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

function toGuidFilter(guidInputs?: string[]): Set<string> | null {
  if (!guidInputs || guidInputs.length === 0) return null;
  const normalized = guidInputs
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => /^[0-9a-f]{32}$/.test(value));
  if (normalized.length === 0) return null;
  return new Set<string>(normalized);
}

function countChar(input: string, char: string): number {
  let count = 0;
  for (let i = 0; i < input.length; i += 1) {
    if (input[i] === char) count += 1;
  }
  return count;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length || 1));
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: safeConcurrency }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) break;
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}
