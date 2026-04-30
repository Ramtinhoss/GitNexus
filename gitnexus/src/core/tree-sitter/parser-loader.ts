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
import { getTreeSitterBufferSize } from '../ingestion/constants.js';

const _require = createRequire(import.meta.url);

let parser: Parser | null = null;

const requiredLanguageMap: Record<string, any> = {
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
  [SupportedLanguages.PHP]: PHP.php_only,
  [SupportedLanguages.Ruby]: Ruby,
};

const optionalLanguagePackages: Partial<Record<SupportedLanguages, string>> = {
  [SupportedLanguages.GDScript]: 'tree-sitter-gdscript',
  [SupportedLanguages.Swift]: 'tree-sitter-swift',
  [SupportedLanguages.Kotlin]: 'tree-sitter-kotlin',
};

const optionalLanguageCache = new Map<SupportedLanguages, any | null>();
const optionalAvailabilityCache = new Map<SupportedLanguages, boolean>();

const isOptionalLanguageInstalled = (language: SupportedLanguages): boolean => {
  if (optionalAvailabilityCache.has(language)) {
    return optionalAvailabilityCache.get(language)!;
  }
  const packageName = optionalLanguagePackages[language];
  if (!packageName) {
    optionalAvailabilityCache.set(language, false);
    return false;
  }
  try {
    _require.resolve(packageName);
    optionalAvailabilityCache.set(language, true);
    return true;
  } catch {
    optionalAvailabilityCache.set(language, false);
    return false;
  }
};

const loadOptionalLanguage = (language: SupportedLanguages): any | null => {
  if (optionalLanguageCache.has(language)) {
    return optionalLanguageCache.get(language);
  }
  const packageName = optionalLanguagePackages[language];
  if (!packageName) {
    optionalLanguageCache.set(language, null);
    return null;
  }
  try {
    const grammar = _require(packageName);
    optionalLanguageCache.set(language, grammar);
    return grammar;
  } catch {
    optionalLanguageCache.set(language, null);
    optionalAvailabilityCache.set(language, false);
    return null;
  }
};

const resolveLanguage = (key: string, language: SupportedLanguages): any | null => {
  if (key in requiredLanguageMap) {
    return requiredLanguageMap[key];
  }
  return loadOptionalLanguage(language);
};

export const isLanguageAvailable = (language: SupportedLanguages): boolean =>
  language in requiredLanguageMap || isOptionalLanguageInstalled(language);

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

  const lang = resolveLanguage(key, language);
  if (!lang) {
    throw new Error(`Unsupported language: ${language}`);
  }
  parser!.setLanguage(lang);
};

/**
 * Parse source code using tree-sitter's string input path with an adaptive
 * native buffer size.
 *
 * The callback input API receives byte offsets. Returning JavaScript string
 * slices from those byte offsets is unsafe for UTF-8/multi-byte content and has
 * caused native tree-sitter crashes in large repositories. Use the stable string
 * input path instead and raise tree-sitter's internal buffer for large files.
 *
 * @param content - Full source file content as UTF-8 string
 * @param oldTree - Optional previous tree for incremental parsing (must call tree.edit() first)
 * @returns Parsed syntax tree
 */
export const parseContent = (content: string, oldTree?: any): any => {
  if (!parser) throw new Error('Parser not initialized — call loadParser() first');
  const bufferSize = getTreeSitterBufferSize(Buffer.byteLength(content, 'utf8'));
  return parser.parse(content, oldTree ?? null, { bufferSize });
};
