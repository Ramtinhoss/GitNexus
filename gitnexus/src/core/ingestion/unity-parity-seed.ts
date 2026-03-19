import type { UnityScanContext } from '../unity/scan-context.js';

export interface UnityParitySeed {
  version: 1;
  symbolToScriptPath: Record<string, string>;
  scriptPathToGuid: Record<string, string>;
  guidToResourcePaths: Record<string, string[]>;
  assetGuidToPath?: Record<string, string>;
}

export function buildUnityParitySeed(scanContext: UnityScanContext): UnityParitySeed {
  const canonicalMap = scanContext.symbolToCanonicalScriptPath instanceof Map
    ? scanContext.symbolToCanonicalScriptPath
    : new Map<string, string>();
  const fallbackMap = scanContext.symbolToScriptPath instanceof Map
    ? scanContext.symbolToScriptPath
    : new Map<string, string>();
  const canonical = canonicalMap.size > 0 ? canonicalMap : fallbackMap;

  const symbolToScriptPath: Record<string, string> = {};
  for (const [symbol, scriptPath] of canonical.entries()) {
    const key = String(symbol || '').trim();
    const value = normalizePath(scriptPath);
    if (!key || !value) continue;
    symbolToScriptPath[key] = value;
  }

  const scriptPathToGuid: Record<string, string> = {};
  const scriptPathToGuidMap = scanContext.scriptPathToGuid instanceof Map
    ? scanContext.scriptPathToGuid
    : new Map<string, string>();
  for (const [scriptPath, guid] of scriptPathToGuidMap.entries()) {
    const key = normalizePath(scriptPath);
    const value = String(guid || '').trim();
    if (!key || !value) continue;
    scriptPathToGuid[key] = value;
  }

  const guidToResourcePaths: Record<string, string[]> = {};
  const guidToResourceHitsMap = scanContext.guidToResourceHits instanceof Map
    ? scanContext.guidToResourceHits
    : new Map<string, Array<{ resourcePath: string }>>();
  for (const [guid, hits] of guidToResourceHitsMap.entries()) {
    const key = String(guid || '').trim();
    if (!key) continue;
    const uniquePaths = new Set<string>();
    for (const hit of hits || []) {
      const resourcePath = normalizePath(hit?.resourcePath || '');
      if (resourcePath) uniquePaths.add(resourcePath);
    }
    if (uniquePaths.size > 0) {
      guidToResourcePaths[key] = [...uniquePaths].sort((left, right) => left.localeCompare(right));
    }
  }

  const assetGuidToPath: Record<string, string> = {};
  if (scanContext.assetGuidToPath instanceof Map) {
    for (const [guid, assetPath] of scanContext.assetGuidToPath.entries()) {
      const key = String(guid || '').trim();
      const value = normalizePath(assetPath);
      if (!key || !value) continue;
      assetGuidToPath[key] = value;
    }
  }

  return {
    version: 1,
    symbolToScriptPath: sortRecord(symbolToScriptPath),
    scriptPathToGuid: sortRecord(scriptPathToGuid),
    guidToResourcePaths: sortRecord(guidToResourcePaths),
    assetGuidToPath: Object.keys(assetGuidToPath).length > 0 ? sortRecord(assetGuidToPath) : undefined,
  };
}

function normalizePath(input: string): string {
  return String(input || '').replace(/\\/g, '/').trim();
}

function sortRecord<T>(input: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)));
}
