export interface UxmlRefEvidence {
  guid: string;
  line: number;
  snippet: string;
}

export interface ParsedUxmlRefs {
  templates: UxmlRefEvidence[];
  styles: UxmlRefEvidence[];
}

const GUID_PARAM_PATTERN = /\bguid=([0-9a-f]{32})\b/i;

export function parseUxmlRefs(content: string): ParsedUxmlRefs {
  const templates: UxmlRefEvidence[] = [];
  const styles: UxmlRefEvidence[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const guidMatch = line.match(GUID_PARAM_PATTERN);
    if (!guidMatch) continue;

    const entry: UxmlRefEvidence = {
      guid: guidMatch[1].toLowerCase(),
      line: i + 1,
      snippet: line.trim(),
    };

    if (/<\s*Template\b/i.test(line)) templates.push(entry);
    if (/<\s*Style\b/i.test(line)) styles.push(entry);
  }

  return { templates, styles };
}
