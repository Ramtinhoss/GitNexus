import { createHash } from 'node:crypto';

export type ProcessRefKind = 'persistent' | 'derived';
export type ProcessRefOrigin = 'step_in_process' | 'method_projected';

export interface ProcessRef {
  id: string;
  kind: ProcessRefKind;
  readable: boolean;
  reader_uri: string;
  origin: ProcessRefOrigin;
}

export interface BuildDerivedProcessIdInput {
  indexedCommit: string;
  symbolUid: string;
  evidenceFingerprint: string;
}

export function buildDerivedProcessId(input: BuildDerivedProcessIdInput): string {
  const key = `${input.indexedCommit}::${input.symbolUid}::${input.evidenceFingerprint}`;
  const hash = createHash('sha1').update(key).digest('hex').slice(0, 16);
  return `derived:${hash}`;
}

export interface BuildProcessRefInput {
  repoName: string;
  processId?: string;
  origin: ProcessRefOrigin;
  indexedCommit: string;
  symbolUid: string;
  evidenceFingerprint: string;
}

function isPersistentProcessId(processId: string): boolean {
  return processId.length > 0 && !processId.startsWith('proc:heuristic:');
}

export function buildProcessRef(input: BuildProcessRefInput): ProcessRef {
  const processId = String(input.processId || '').trim();
  if (isPersistentProcessId(processId)) {
    return {
      id: processId,
      kind: 'persistent',
      readable: true,
      reader_uri: `gitnexus://repo/${encodeURIComponent(input.repoName)}/process/${encodeURIComponent(processId)}`,
      origin: input.origin,
    };
  }

  const id = buildDerivedProcessId({
    indexedCommit: input.indexedCommit,
    symbolUid: input.symbolUid,
    evidenceFingerprint: input.evidenceFingerprint,
  });
  return {
    id,
    kind: 'derived',
    readable: true,
    reader_uri: `gitnexus://repo/${encodeURIComponent(input.repoName)}/derived-process/${encodeURIComponent(id)}`,
    origin: input.origin,
  };
}
