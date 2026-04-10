import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';

export interface PrefabSourceScanRow {
  sourceResourcePath: string;
  targetGuid: string;
  targetResourcePath?: string;
  fileId?: string;
  fieldName: 'm_SourcePrefab';
  sourceLayer: 'scene' | 'prefab';
}

const PREFAB_INSTANCE_PATTERN = /^\s*PrefabInstance:\s*$/;
const YAML_OBJECT_BOUNDARY_PATTERN = /^\s*---\s*!u!\d+\s+&/;
const SOURCE_PREFAB_LINE_PATTERN =
  /m_SourcePrefab\s*:\s*\{[^}]*fileID\s*:\s*([^,\s}]+)[^}]*guid\s*:\s*([0-9a-fA-F]{32})[^}]*\}/;
const ZERO_GUID = '00000000000000000000000000000000';

export interface StreamPrefabSourceRefsInput {
  repoRoot: string;
  resourceFiles: string[];
  assetGuidToPath: Map<string, string>;
  queue?: {
    enabled?: boolean;
    maxDepth?: number;
  };
  hooks?: {
    onFileOpen?: (resourcePath: string) => void;
    onYield?: (row: PrefabSourceScanRow) => void;
    onQueueDepth?: (depth: number) => void;
    onFileError?: (resourcePath: string, error: unknown) => void;
  };
}

export async function collectPrefabSourceRefs(args: StreamPrefabSourceRefsInput): Promise<PrefabSourceScanRow[]> {
  const rows: PrefabSourceScanRow[] = [];
  for await (const row of streamPrefabSourceRefs(args)) {
    rows.push(row);
  }
  return rows;
}

export async function* streamPrefabSourceRefs(
  args: StreamPrefabSourceRefsInput,
): AsyncGenerator<PrefabSourceScanRow> {
  const resources = [...new Set((args.resourceFiles || []).map((value) => normalizePath(value)))]
    .filter((value) => value.endsWith('.unity') || value.endsWith('.prefab'));
  if (!args.queue?.enabled) {
    for await (const row of streamPrefabSourceRefsSequential(resources, args)) {
      yield row;
    }
    return;
  }

  const maxDepth = Math.max(1, Number(args.queue.maxDepth || 64));
  const queue: PrefabSourceScanRow[] = [];
  const waitingReaders: Array<(value: PrefabSourceScanRow | null) => void> = [];
  const waitingWriters: Array<() => void> = [];
  let producerDone = false;
  let producerError: unknown;

  const notifyDepth = () => args.hooks?.onQueueDepth?.(queue.length);

  const push = async (row: PrefabSourceScanRow): Promise<void> => {
    while (queue.length >= maxDepth) {
      await new Promise<void>((resolve) => waitingWriters.push(resolve));
    }
    if (waitingReaders.length > 0) {
      const resolveReader = waitingReaders.shift()!;
      resolveReader(row);
      return;
    }
    queue.push(row);
    notifyDepth();
  };

  const shift = async (): Promise<PrefabSourceScanRow | null> => {
    if (queue.length > 0) {
      const value = queue.shift()!;
      notifyDepth();
      const resolveWriter = waitingWriters.shift();
      if (resolveWriter) resolveWriter();
      return value;
    }
    if (producerDone) {
      return null;
    }
    return await new Promise<PrefabSourceScanRow | null>((resolve) => waitingReaders.push(resolve));
  };

  const finishReaders = () => {
    while (waitingReaders.length > 0) {
      const resolveReader = waitingReaders.shift()!;
      resolveReader(null);
    }
  };
  const finishWriters = () => {
    while (waitingWriters.length > 0) {
      const resolveWriter = waitingWriters.shift()!;
      resolveWriter();
    }
  };

  const producer = (async () => {
    try {
      for await (const row of streamPrefabSourceRefsSequential(resources, args)) {
        await push(row);
      }
    } catch (error) {
      producerError = error;
    } finally {
      producerDone = true;
      finishReaders();
      finishWriters();
    }
  })();

  while (true) {
    const row = await shift();
    if (!row) break;
    yield row;
  }
  await producer;
  if (producerError) {
    throw producerError;
  }
}

async function* streamPrefabSourceRefsSequential(
  resources: string[],
  args: StreamPrefabSourceRefsInput,
): AsyncGenerator<PrefabSourceScanRow> {
  const hooks = args.hooks;

  for (const resourcePath of resources) {
    hooks?.onFileOpen?.(resourcePath);
    const absolutePath = path.join(args.repoRoot, resourcePath);
    const stream = createReadStream(absolutePath, { encoding: 'utf-8' });
    const reader = createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    try {
      let inPrefabInstance = false;
      for await (const line of reader) {
        if (YAML_OBJECT_BOUNDARY_PATTERN.test(line)) {
          inPrefabInstance = false;
        }
        if (PREFAB_INSTANCE_PATTERN.test(line)) {
          inPrefabInstance = true;
          continue;
        }
        if (!inPrefabInstance) continue;

        const match = line.match(SOURCE_PREFAB_LINE_PATTERN);
        if (!match) continue;

        const fileId = String(match[1] || '').trim();
        const guid = String(match[2] || '').trim().toLowerCase();
        if (!guid || guid === ZERO_GUID) continue;

        const targetResourcePath = normalizePath(
          args.assetGuidToPath.get(guid) || args.assetGuidToPath.get(guid.toLowerCase()) || '',
        );
        if (!targetResourcePath || !targetResourcePath.endsWith('.prefab')) continue;

        const row: PrefabSourceScanRow = {
          sourceResourcePath: resourcePath,
          targetGuid: guid,
          targetResourcePath,
          fileId: fileId || undefined,
          fieldName: 'm_SourcePrefab',
          sourceLayer: resourcePath.endsWith('.unity') ? 'scene' : 'prefab',
        };
        hooks?.onYield?.(row);
        yield row;
        inPrefabInstance = false;
      }
    } catch (error) {
      hooks?.onFileError?.(resourcePath, error);
      continue;
    } finally {
      reader.close();
      stream.destroy();
    }
  }
}

function normalizePath(value: string): string {
  return String(value || '').replace(/\\/g, '/').trim();
}
