import path from 'node:path';
import fs from 'node:fs/promises';

const DEFINE_CONSTANTS_RE = /<DefineConstants>\s*([\s\S]*?)\s*<\/DefineConstants>/gi;
const CSHARP_SYMBOL_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface CSharpDefineProfile {
  symbols: Set<string>;
  sourcePath: string;
  rawDefineConstants: string[];
}

function parseSymbols(rawDefineConstants: string[]): Set<string> {
  const symbols = new Set<string>();

  for (const raw of rawDefineConstants) {
    for (const token of raw.split(';')) {
      const symbol = token.trim();
      if (!symbol) continue;

      // Drop MSBuild placeholders such as $(DefineConstants)
      if (symbol.includes('$(')) continue;
      if (!CSHARP_SYMBOL_RE.test(symbol)) continue;
      symbols.add(symbol);
    }
  }

  return symbols;
}

export async function loadCSharpDefineProfileFromCsproj(
  csprojPath: string,
): Promise<CSharpDefineProfile> {
  const sourcePath = path.resolve(csprojPath);
  let content: string;

  try {
    content = await fs.readFile(sourcePath, 'utf-8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read C# csproj: ${sourcePath} (${message})`);
  }

  const rawDefineConstants: string[] = [];
  for (const match of content.matchAll(DEFINE_CONSTANTS_RE)) {
    const raw = (match[1] || '').trim();
    if (raw) rawDefineConstants.push(raw);
  }

  return {
    symbols: parseSymbols(rawDefineConstants),
    sourcePath,
    rawDefineConstants,
  };
}
