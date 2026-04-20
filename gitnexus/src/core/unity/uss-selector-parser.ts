export interface UssSelectorEvidence {
  selector: string;
  line: number;
  snippet: string;
}

export function parseUssSelectors(content: string): UssSelectorEvidence[] {
  const out: UssSelectorEvidence[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes('{')) continue;
    const selectorChunk = line.split('{', 1)[0];
    const rawSelectors = selectorChunk.split(',').map((item) => item.trim()).filter(Boolean);
    for (const selector of rawSelectors) {
      if (!selector.startsWith('.')) continue;
      out.push({
        selector,
        line: i + 1,
        snippet: line.trim(),
      });
    }
  }

  return out;
}
