import type { LocalBackend } from './local-backend.js';

export async function getDerivedProcessDetailResource(
  id: string,
  _backend: LocalBackend,
  repoName?: string,
): Promise<string> {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) {
    return 'error: derived-process id is required';
  }

  const lines: string[] = [
    `id: "${normalizedId}"`,
    'kind: derived',
    'origin: method_projected',
    `reader_uri: "gitnexus://repo/${encodeURIComponent(String(repoName || ''))}/derived-process/${encodeURIComponent(normalizedId)}"`,
    'readable: true',
    'note: "Derived process references are synthesized at query/context runtime from symbol + evidence fingerprints."',
  ];

  return lines.join('\n');
}
