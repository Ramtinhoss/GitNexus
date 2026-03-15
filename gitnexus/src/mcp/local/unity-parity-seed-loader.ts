import fs from 'node:fs/promises';
import path from 'node:path';
import type { UnityParitySeed } from '../../core/ingestion/unity-parity-seed.js';

const SEED_FILENAME = 'unity-parity-seed.json';

export async function loadUnityParitySeed(storagePath: string): Promise<UnityParitySeed | null> {
  const seedPath = path.join(storagePath, SEED_FILENAME);
  let raw = '';
  try {
    raw = await fs.readFile(seedPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  try {
    const parsed = JSON.parse(raw) as UnityParitySeed;
    if (
      !parsed
      || parsed.version !== 1
      || typeof parsed.symbolToScriptPath !== 'object'
      || typeof parsed.scriptPathToGuid !== 'object'
      || typeof parsed.guidToResourcePaths !== 'object'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
