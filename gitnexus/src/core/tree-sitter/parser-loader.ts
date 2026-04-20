import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';
import TypeScript from 'tree-sitter-typescript';
import Python from 'tree-sitter-python';
import Java from 'tree-sitter-java';
import C from 'tree-sitter-c';
import CPP from 'tree-sitter-cpp';
import CSharp from 'tree-sitter-c-sharp';
import Go from 'tree-sitter-go';
import Rust from 'tree-sitter-rust';
import PHP from 'tree-sitter-php';
import Ruby from 'tree-sitter-ruby';
import { createRequire } from 'node:module';
import { SupportedLanguages } from '../../config/supported-languages.js';

const _require = createRequire(import.meta.url);

// tree-sitter-gdscript is an optionalDependency — may not be installed
let GDScript: any = null;
try { GDScript = _require('tree-sitter-gdscript'); } catch {}

// tree-sitter-swift is an optionalDependency — may not be installed
let Swift: any = null;
try { Swift = _require('tree-sitter-swift'); } catch {}

// tree-sitter-kotlin is an optionalDependency — may not be installed
let Kotlin: any = null;
try { Kotlin = _require('tree-sitter-kotlin'); } catch {}

let parser: Parser | null = null;

const languageMap: Record<string, any> = {
  [SupportedLanguages.JavaScript]: JavaScript,
  [SupportedLanguages.TypeScript]: TypeScript.typescript,
  [`${SupportedLanguages.TypeScript}:tsx`]: TypeScript.tsx,
  [SupportedLanguages.Python]: Python,
  [SupportedLanguages.Java]: Java,
  [SupportedLanguages.C]: C,
  [SupportedLanguages.CPlusPlus]: CPP,
  [SupportedLanguages.CSharp]: CSharp,
  [SupportedLanguages.Go]: Go,
  [SupportedLanguages.Rust]: Rust,
  ...(Kotlin ? { [SupportedLanguages.Kotlin]: Kotlin } : {}),
  [SupportedLanguages.PHP]: PHP.php_only,
  [SupportedLanguages.Ruby]: Ruby,
  ...(Swift ? { [SupportedLanguages.Swift]: Swift } : {}),
  ...(GDScript ? { [SupportedLanguages.GDScript]: GDScript } : {}),
};

export const isLanguageAvailable = (language: SupportedLanguages): boolean =>
  language in languageMap;

export const loadParser = async (): Promise<Parser> => {
  if (parser) return parser;
  parser = new Parser();
  return parser;
};

export const loadLanguage = async (language: SupportedLanguages, filePath?: string): Promise<void> => {
  if (!parser) await loadParser();
  const key = language === SupportedLanguages.TypeScript && filePath?.endsWith('.tsx')
    ? `${language}:tsx`
    : language;

  const lang = languageMap[key];
  if (!lang) {
    throw new Error(`Unsupported language: ${language}`);
  }
  parser!.setLanguage(lang);
};

const MAX_CHUNK = 4096;

/**
 * Parse source code using tree-sitter's chunked callback API.
 * Avoids the native binding's single-buffer size limit (< 32768 bytes)
 * that causes "Invalid argument" errors on large files.
 *
 * @param content - Full source file content as UTF-8 string
 * @param oldTree - Optional previous tree for incremental parsing (must call tree.edit() first)
 * @returns Parsed syntax tree
 */
export const parseContent = (content: string, oldTree?: any): any => {
  if (!parser) throw new Error('Parser not initialized — call loadParser() first');
  return parser.parse((index: number) => {
    if (index >= content.length) return null;
    return content.slice(index, index + MAX_CHUNK);
  }, oldTree);
};
