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

export async function collectPrefabSourceRefs(args: {
  repoRoot: string;
  resourceFiles: string[];
  assetGuidToPath: Map<string, string>;
}): Promise<PrefabSourceScanRow[]> {
  const rows: PrefabSourceScanRow[] = [];
  const resources = [...new Set((args.resourceFiles || []).map((value) => normalizePath(value)))]
    .filter((value) => value.endsWith('.unity') || value.endsWith('.prefab'))
    .sort((left, right) => left.localeCompare(right));

  for (const resourcePath of resources) {
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

        rows.push({
          sourceResourcePath: resourcePath,
          targetGuid: guid,
          targetResourcePath,
          fileId: fileId || undefined,
          fieldName: 'm_SourcePrefab',
          sourceLayer: resourcePath.endsWith('.unity') ? 'scene' : 'prefab',
        });
        inPrefabInstance = false;
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'EISDIR') {
        continue;
      }
      throw error;
    } finally {
      reader.close();
      stream.destroy();
    }
  }

  return rows;
}

function normalizePath(value: string): string {
  return String(value || '').replace(/\\/g, '/').trim();
}
