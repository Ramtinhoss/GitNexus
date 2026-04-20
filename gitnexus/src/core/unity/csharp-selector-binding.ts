export interface CsharpSelectorBinding {
  className: string;
  line: number;
  snippet: string;
  isDynamic: boolean;
}

const ADD_TO_CLASS_LIST_LITERAL = /\bAddToClassList\s*\(\s*"([^"]+)"\s*\)/g;
const Q_CLASS_NAME_LITERAL = /\bQ\s*<[^>]*>\s*\([^)]*\bclassName\s*:\s*"([^"]+)"[^)]*\)/g;

export function extractCsharpSelectorBindings(content: string): CsharpSelectorBinding[] {
  const out: CsharpSelectorBinding[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    ADD_TO_CLASS_LIST_LITERAL.lastIndex = 0;
    let addMatch = ADD_TO_CLASS_LIST_LITERAL.exec(line);
    while (addMatch) {
      out.push({
        className: addMatch[1],
        line: i + 1,
        snippet: line.trim(),
        isDynamic: false,
      });
      addMatch = ADD_TO_CLASS_LIST_LITERAL.exec(line);
    }

    Q_CLASS_NAME_LITERAL.lastIndex = 0;
    let qMatch = Q_CLASS_NAME_LITERAL.exec(line);
    while (qMatch) {
      out.push({
        className: qMatch[1],
        line: i + 1,
        snippet: line.trim(),
        isDynamic: false,
      });
      qMatch = Q_CLASS_NAME_LITERAL.exec(line);
    }
  }

  return out;
}
