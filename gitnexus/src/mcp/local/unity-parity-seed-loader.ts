import fs from 'node:fs/promises';
import path from 'node:path';
import type { UnityParitySeed } from '../../core/ingestion/unity-parity-seed.js';

const SEED_FILENAME = 'unity-parity-seed.json';
const DEFAULT_IDLE_MS = 30_000;
const DEFAULT_MAX_ENTRIES = 2;

interface LoadUnityParitySeedOptions {
  indexedCommit?: string;
}

interface SeedCacheEntry {
  value: UnityParitySeed | null;
  lastAccessMs: number;
  idleTimer?: NodeJS.Timeout;
}

const seedCache = new Map<string, SeedCacheEntry>();
const inFlightLoads = new Map<string, Promise<UnityParitySeed | null>>();

export async function loadUnityParitySeed(
  storagePath: string,
  options?: LoadUnityParitySeedOptions,
): Promise<UnityParitySeed | null> {
  const seedPath = path.join(storagePath, SEED_FILENAME);

  const cacheKey = await buildSeedCacheKey(seedPath, storagePath, options?.indexedCommit);
  if (!cacheKey) {
    return null;
  }

  const cached = seedCache.get(cacheKey);
  if (cached) {
    touchCacheEntry(cacheKey, cached);
    return cached.value;
  }

  const pending = inFlightLoads.get(cacheKey);
  if (pending) {
    return pending;
  }

  const loadPromise = (async () => {
    let raw = '';
    try {
      raw = await fs.readFile(seedPath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }

    const parsed = parseSeed(raw);
    setCacheEntry(cacheKey, parsed);
    return parsed;
  })().finally(() => {
    inFlightLoads.delete(cacheKey);
  });
  inFlightLoads.set(cacheKey, loadPromise);

  return loadPromise;
}

function parseSeed(raw: string): UnityParitySeed | null {
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

async function buildSeedCacheKey(
  seedPath: string,
  storagePath: string,
  indexedCommit?: string,
): Promise<string | null> {
  try {
    const stat = await fs.stat(seedPath);
    const commitKey = String(indexedCommit || '').trim() || 'no-commit';
    return `${storagePath}::${commitKey}::${Math.trunc(stat.mtimeMs)}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function setCacheEntry(cacheKey: string, value: UnityParitySeed | null): void {
  const now = Date.now();
  const existing = seedCache.get(cacheKey);
  if (existing?.idleTimer) {
    clearTimeout(existing.idleTimer);
  }
  const entry: SeedCacheEntry = {
    value,
    lastAccessMs: now,
  };
  seedCache.set(cacheKey, entry);
  scheduleEviction(cacheKey, entry);
  pruneOldestEntries(resolveMaxEntries());
}

function touchCacheEntry(cacheKey: string, entry: SeedCacheEntry): void {
  entry.lastAccessMs = Date.now();
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
  }
  scheduleEviction(cacheKey, entry);
}

function scheduleEviction(cacheKey: string, entry: SeedCacheEntry): void {
  const idleMs = resolveIdleMs();
  entry.idleTimer = setTimeout(() => {
    const current = seedCache.get(cacheKey);
    if (!current || current !== entry) {
      return;
    }
    seedCache.delete(cacheKey);
  }, idleMs);
  entry.idleTimer.unref?.();
}

function pruneOldestEntries(maxEntries: number): void {
  if (seedCache.size <= maxEntries) {
    return;
  }
  const rows = [...seedCache.entries()].sort((left, right) => left[1].lastAccessMs - right[1].lastAccessMs);
  const removeCount = rows.length - maxEntries;
  for (let index = 0; index < removeCount; index += 1) {
    const [key, entry] = rows[index];
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
    }
    seedCache.delete(key);
  }
}

function resolveIdleMs(): number {
  const parsed = Number.parseInt(String(process.env.GITNEXUS_UNITY_PARITY_SEED_CACHE_IDLE_MS || '').trim(), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_IDLE_MS;
}

function resolveMaxEntries(): number {
  const parsed = Number.parseInt(String(process.env.GITNEXUS_UNITY_PARITY_SEED_CACHE_MAX_ENTRIES || '').trim(), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_MAX_ENTRIES;
}

export function __resetUnityParitySeedLoaderCacheForTest(): void {
  for (const entry of seedCache.values()) {
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
    }
  }
  seedCache.clear();
  inFlightLoads.clear();
}
