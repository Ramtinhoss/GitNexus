import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { UnityContextPayload } from './unity-enrichment.js';
import { resolveUnityConfig } from '../../core/config/unity-config.js';

interface UnityParityCacheEntry {
  symbolUid: string;
  payload: UnityContextPayload;
  updatedAt: string;
}

interface UnityParityCacheDocument {
  version: 1;
  indexedCommit: string;
  entries: Record<string, UnityParityCacheEntry>;
}

interface UnityParityCacheOptions {
  maxEntries?: number;
}

const PARITY_CACHE_DIRNAME = 'unity-parity-cache';
const DEFAULT_MAX_PARITY_CACHE_ENTRIES = 500;

function buildKey(symbolUid: string): string {
  return symbolUid;
}

function shardKeyForEntry(symbolUid: string): string {
  return createHash('sha1').update(buildKey(symbolUid)).digest('hex').slice(0, 2);
}

function getShardPath(storagePath: string, shardKey: string): string {
  return path.join(storagePath, PARITY_CACHE_DIRNAME, `${shardKey}.json`);
}

async function readParityCacheDocument(
  storagePath: string,
  indexedCommit: string,
  shardKey: string,
): Promise<UnityParityCacheDocument> {
  const cachePath = getShardPath(storagePath, shardKey);
  try {
    const raw = await fs.readFile(cachePath, 'utf-8');
    const parsed = JSON.parse(raw) as UnityParityCacheDocument;
    if (!parsed || parsed.version !== 1 || !parsed.entries || typeof parsed.entries !== 'object') {
      return { version: 1, indexedCommit, entries: {} };
    }
    if (parsed.indexedCommit !== indexedCommit) {
      return { version: 1, indexedCommit, entries: {} };
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, indexedCommit, entries: {} };
    }
    throw error;
  }
}

async function writeParityCacheDocument(
  storagePath: string,
  shardKey: string,
  doc: UnityParityCacheDocument,
): Promise<void> {
  const cacheDir = path.join(storagePath, PARITY_CACHE_DIRNAME);
  const cachePath = getShardPath(storagePath, shardKey);
  const tmpPath = `${cachePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(tmpPath, JSON.stringify(doc), 'utf-8');
  await fs.rename(tmpPath, cachePath);
}

export async function readUnityParityCache(
  storagePath: string,
  indexedCommit: string,
  symbolUid: string,
): Promise<UnityContextPayload | null> {
  const shardKey = shardKeyForEntry(symbolUid);
  const doc = await readParityCacheDocument(storagePath, indexedCommit, shardKey);
  const key = buildKey(symbolUid);
  const entry = doc.entries[key];
  if (!entry || !entry.payload) {
    return null;
  }
  return entry.payload;
}

export async function upsertUnityParityCache(
  storagePath: string,
  indexedCommit: string,
  symbolUid: string,
  payload: UnityContextPayload,
  options?: UnityParityCacheOptions,
): Promise<void> {
  const shardKey = shardKeyForEntry(symbolUid);
  const doc = await readParityCacheDocument(storagePath, indexedCommit, shardKey);
  const key = buildKey(symbolUid);
  doc.entries[key] = {
    symbolUid,
    payload,
    updatedAt: new Date().toISOString(),
  };
  doc.entries = pruneOldestEntries(doc.entries, resolveMaxEntries(options));
  await writeParityCacheDocument(storagePath, shardKey, doc);
}

function resolveMaxEntries(options?: UnityParityCacheOptions): number {
  if (Number.isFinite(options?.maxEntries) && Number(options?.maxEntries) > 0) {
    return Math.floor(Number(options?.maxEntries));
  }
  return resolveUnityConfig().config.parityCacheMaxEntries ?? DEFAULT_MAX_PARITY_CACHE_ENTRIES;
}

function pruneOldestEntries(
  entries: Record<string, UnityParityCacheEntry>,
  maxEntries: number,
): Record<string, UnityParityCacheEntry> {
  const rows = Object.entries(entries);
  if (rows.length <= maxEntries) {
    return entries;
  }

  rows.sort(([, a], [, b]) => toMillis(a.updatedAt) - toMillis(b.updatedAt));
  const keep = rows.slice(rows.length - maxEntries);
  return Object.fromEntries(keep);
}

function toMillis(updatedAt: string): number {
  const ts = Date.parse(updatedAt);
  return Number.isFinite(ts) ? ts : 0;
}
