import path from 'node:path';
import { glob } from 'glob';
import { buildAssetMetaIndex } from './meta-index.js';

export interface UnityUiMetaIndex {
  uxmlGuidToPath: Map<string, string>;
  ussGuidToPath: Map<string, string>;
}

export interface BuildUnityUiMetaIndexOptions {
  scopedPaths?: string[];
}

export async function buildUnityUiMetaIndex(
  repoRoot: string,
  options: BuildUnityUiMetaIndexOptions = {},
): Promise<UnityUiMetaIndex> {
  const metaFiles = await resolveUiMetaFiles(repoRoot, options.scopedPaths);
  if (metaFiles.length === 0) {
    return {
      uxmlGuidToPath: new Map<string, string>(),
      ussGuidToPath: new Map<string, string>(),
    };
  }

  const guidToAssetPath = await buildAssetMetaIndex(repoRoot, { metaFiles });
  const uxmlGuidToPath = new Map<string, string>();
  const ussGuidToPath = new Map<string, string>();

  for (const [guid, assetPath] of guidToAssetPath.entries()) {
    const normalizedPath = assetPath.replace(/\\/g, '/');
    if (normalizedPath.endsWith('.uxml')) {
      uxmlGuidToPath.set(guid, normalizedPath);
      uxmlGuidToPath.set(guid.toLowerCase(), normalizedPath);
    }
    if (normalizedPath.endsWith('.uss')) {
      ussGuidToPath.set(guid, normalizedPath);
      ussGuidToPath.set(guid.toLowerCase(), normalizedPath);
    }
  }

  return {
    uxmlGuidToPath,
    ussGuidToPath,
  };
}

async function resolveUiMetaFiles(repoRoot: string, scopedPaths?: string[]): Promise<string[]> {
  if (!scopedPaths || scopedPaths.length === 0) {
    return (await glob(['**/*.uxml.meta', '**/*.uss.meta'], {
      cwd: repoRoot,
      nodir: true,
      dot: false,
    })).sort((left, right) => left.localeCompare(right));
  }

  const out = new Set<string>();
  for (const scopedPath of scopedPaths) {
    const normalized = normalizeRelativePath(repoRoot, scopedPath);
    if (!normalized) continue;
    if (normalized.endsWith('.uxml.meta') || normalized.endsWith('.uss.meta')) {
      out.add(normalized);
      continue;
    }
    if (normalized.endsWith('.uxml') || normalized.endsWith('.uss')) {
      out.add(`${normalized}.meta`);
    }
  }

  return [...out].sort((left, right) => left.localeCompare(right));
}

function normalizeRelativePath(repoRoot: string, filePath: string): string | null {
  const relativePath = path.isAbsolute(filePath) ? path.relative(repoRoot, filePath) : filePath;
  const normalized = relativePath.replace(/\\/g, '/');
  if (normalized.startsWith('../')) return null;
  return normalized;
}
