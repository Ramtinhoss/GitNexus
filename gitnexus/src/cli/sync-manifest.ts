import fs from 'node:fs/promises';
import path from 'node:path';

export interface SyncManifestScopeOptions {
  scopeManifest?: string;
  scopePrefix?: string[] | string;
}

export function resolveDefaultSyncManifestPath(repoPath: string): string {
  return path.join(repoPath, '.gitnexus', 'sync-manifest.txt');
}

export function shouldAutoUseSyncManifest(options?: SyncManifestScopeOptions): boolean {
  if (options?.scopeManifest) return false;
  return parseScopePrefixCount(options?.scopePrefix) === 0;
}

export async function resolveScopeManifestForAnalyze(
  repoPath: string,
  options?: SyncManifestScopeOptions,
  pathExists: (candidatePath: string) => Promise<boolean> = fileExists,
): Promise<string | undefined> {
  if (options?.scopeManifest) {
    return options.scopeManifest;
  }

  if (!shouldAutoUseSyncManifest(options)) {
    return undefined;
  }

  const defaultManifestPath = resolveDefaultSyncManifestPath(repoPath);
  if (await pathExists(defaultManifestPath)) {
    return defaultManifestPath;
  }
  return undefined;
}

function parseScopePrefixCount(scopePrefix?: string[] | string): number {
  if (Array.isArray(scopePrefix)) return scopePrefix.length;
  if (typeof scopePrefix === 'string') return scopePrefix.trim() ? 1 : 0;
  return 0;
}

async function fileExists(candidatePath: string): Promise<boolean> {
  try {
    await fs.stat(candidatePath);
    return true;
  } catch {
    return false;
  }
}
