import { describe, it, expect } from 'vitest';
import { loadParser, loadLanguage, parseContent } from '../../src/core/tree-sitter/parser-loader.js';
import { SupportedLanguages } from '../../src/config/supported-languages.js';

describe('parseContent (chunked callback)', () => {
  it('exports parseContent function', async () => {
    expect(typeof parseContent).toBe('function');
  });

  it('parses simple C# content without error', async () => {
    await loadParser();
    await loadLanguage(SupportedLanguages.CSharp);
    const code = `
namespace MyApp {
  public class Foo {
    public void Bar() {}
  }
}
`;
    const tree = parseContent(code);
    expect(tree).toBeDefined();
    expect(tree.rootNode).toBeDefined();
    expect(tree.rootNode.hasError).toBe(false);
  });

  it('does not throw on large file (> 36 KB)', async () => {
    await loadParser();
    await loadLanguage(SupportedLanguages.CSharp);
    // Generate ~40 KB synthetic C# content
    const lines: string[] = ['namespace BigFile {', '  public class BigClass {'];
    for (let i = 0; i < 1000; i++) {
      lines.push(`    public void Method${i}() { int x = ${i}; }`);
    }
    lines.push('  }', '}');
    const largeCode = lines.join('\n');
    expect(largeCode.length).toBeGreaterThan(36 * 1024);

    let tree: any;
    expect(() => { tree = parseContent(largeCode); }).not.toThrow();
    expect(tree).toBeDefined();
    expect(tree.rootNode.type).toBe('compilation_unit');
  });

  it('accepts optional oldTree parameter', async () => {
    await loadParser();
    await loadLanguage(SupportedLanguages.CSharp);
    const code = 'namespace A { public class B {} }';
    const tree1 = parseContent(code);
    // Incremental parse with oldTree — should not throw
    expect(() => parseContent(code, tree1)).not.toThrow();
  });
});
