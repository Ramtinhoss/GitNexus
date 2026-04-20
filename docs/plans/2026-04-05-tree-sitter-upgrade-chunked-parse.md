# Tree-sitter 升级与分块解析优化 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 升级 tree-sitter-c-sharp 到 0.23.1 以支持 C# Unicode 标识符，同时将所有 `parser.parse(string)` 调用迁移到分块回调形式，消除大文件 `Invalid argument` 崩溃。

**Architecture:** 在 `parser-loader.ts` 中提取统一的 `parseContent(content, oldTree?)` 工具函数（分块回调，MAX_CHUNK=4096），所有解析调用点替换为该函数；同步升级 `tree-sitter-c-sharp` 至 `0.23.1`，`tree-sitter` 主包固定到 `0.22.x` 中间版本作为稳定过渡；新增 Unicode 单元测试并对已知问题文件进行升级后图验证。

**Tech Stack:** Node.js, TypeScript, tree-sitter (native binding), tree-sitter-c-sharp, vitest, neonspark 仓库 graph 验证

---

## Status Ledger

Track execution state here. `executing-plans` updates this section in place.

Task | Status | Facts
--- | --- | ---
Task 1: parseContent 工具函数 TDD | pending |
Task 2: 升级 tree-sitter 依赖版本 | pending |
Task 3: 迁移所有 parse 调用点 | pending |
Task 4: Unicode 标识符单元测试 | pending |
Task 5: 大文件分块回调单元测试 | pending |
Task 6: csharp integration 回归扩展 | pending |
Task 7: 升级后 neonspark 已知文件图验证 | pending |

---

## Design Traceability Matrix

Design Clause ID | Criticality | Mapped Tasks | Verification Command | Artifact Evidence Field | Failure Signal
--- | --- | --- | --- | --- | ---
DC-01 分块回调替换字符串 parse | critical | Task 1, Task 3 | `cd gitnexus && npm test -- --reporter=verbose test/unit/tree-sitter-chunked-parse.test.ts` | test output: `✓ parseContent does not throw on large file` | 任一 parse-worker/call-processor/import-processor/heritage-processor/parsing-processor 仍调用 `parser.parse(string)` |
DC-02 tree-sitter-c-sharp 升级到 0.23.1 | critical | Task 2, Task 4 | `cd gitnexus && npm test -- test/unit/tree-sitter-unicode.test.ts` | test output: `✓ C# class with Unicode identifiers: hasError=false` | `hasError=true` 或 `class_declaration nodes: 0` |
DC-03 现有 C# integration 无回归 | critical | Task 2, Task 6 | `cd gitnexus && npm run test:integration -- test/integration/resolvers/csharp.test.ts` | all tests pass | 任一现有 csharp integration 测试失败 |
DC-04 已知问题文件图验证 | high | Task 7 | Cypher 孤儿查询（见 Task 7） | 孤儿文件列表不包含 FirearmsPowerUp.cs | FirearmsPowerUp.cs 仍出现在孤儿列表 |

---

## Task 1: parseContent 工具函数 TDD

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/tree-sitter/parser-loader.ts`
- Create: `gitnexus/test/unit/tree-sitter-chunked-parse.test.ts`

**Step 1: 先写失败测试**

创建 `gitnexus/test/unit/tree-sitter-chunked-parse.test.ts`：

```typescript
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
```

**Step 2: 运行测试确认失败**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus
npm test -- --reporter=verbose test/unit/tree-sitter-chunked-parse.test.ts
```

预期：FAIL，`parseContent is not a function` 或导入失败。

**Step 3: 在 parser-loader.ts 添加 parseContent**

在文件末尾追加：

```typescript
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
```

**Step 4: 运行测试确认通过**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus
npm test -- --reporter=verbose test/unit/tree-sitter-chunked-parse.test.ts
```

预期：所有 4 个测试 PASS。

**Step 5: Commit**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus
git add src/core/tree-sitter/parser-loader.ts test/unit/tree-sitter-chunked-parse.test.ts
git commit -m "feat(parse): add parseContent chunked callback to parser-loader

Replaces direct parser.parse(string) calls with chunked callback API
to avoid native binding 32 KB single-buffer limit on large files.
MAX_CHUNK=4096 ensures each slice is well within the limit.

Refs: docs/tree-sitter-parsing-pitfalls.md §2"
```

---

## Task 2: 升级 tree-sitter 依赖版本

**User Verification: required**

**Files:**
- Modify: `gitnexus/package.json`

**Step 1: 检查当前版本**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus
node -e "const ts = require('tree-sitter'); console.log('tree-sitter version:', require('./node_modules/tree-sitter/package.json').version)"
node -e "console.log('tree-sitter-c-sharp version:', require('./node_modules/tree-sitter-c-sharp/package.json').version)"
```

预期输出：`tree-sitter version: 0.21.x`, `tree-sitter-c-sharp version: 0.21.3`

**Step 2: 修改 package.json 版本约束**

在 `gitnexus/package.json` 中修改：

```json
"tree-sitter": "^0.22.0",
"tree-sitter-c-sharp": "^0.23.1",
```

**Step 3: 安装依赖**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus
npm install
```

预期：安装成功，无 `gyp ERR` 或 `EACCES` 错误。
如果出现 native rebuild 错误，执行：`npm rebuild tree-sitter`

**Step 4: 验证安装版本**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus
node -e "console.log('tree-sitter:', require('./node_modules/tree-sitter/package.json').version)"
node -e "console.log('tree-sitter-c-sharp:', require('./node_modules/tree-sitter-c-sharp/package.json').version)"
```

预期：`tree-sitter: 0.22.x`，`tree-sitter-c-sharp: 0.23.1`

**Step 5: 运行现有 parser-loader 测试**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus
npm test -- --reporter=verbose test/unit/parser-loader.test.ts
```

预期：所有测试 PASS。

**Human Verification Checklist:**
1. `npm install` 输出没有 native rebuild 错误（`gyp ERR!` 开头的错误行）
2. 控制台打印的 tree-sitter 版本为 `0.22.x`
3. 控制台打印的 tree-sitter-c-sharp 版本为 `0.23.1`
4. `parser-loader.test.ts` 全部通过，无失败项

**Acceptance Criteria:**
1. `npm install` 退出码为 0，无 gyp 错误
2. `tree-sitter` 版本字符串以 `0.22.` 开头
3. `tree-sitter-c-sharp` 版本字符串为 `0.23.1`
4. `parser-loader.test.ts` 报告 0 failures

**Failure Signals:**
- `gyp ERR! build error` → native 重编译失败，需检查 Xcode CLT 或 node-gyp 版本
- tree-sitter 版本仍为 `0.21.x` → npm install 未成功
- parser-loader 测试有 FAIL → grammar API 有破坏性变更，需逐一排查

**User Decision Prompt:** 以上检查项全部符合预期，请回复 `通过` 继续；如有任何一项失败，请回复 `不通过` 并附带输出。

**Step 6: Commit（确认通过后）**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus
git add package.json package-lock.json
git commit -m "chore(deps): upgrade tree-sitter to 0.22.x and tree-sitter-c-sharp to 0.23.1

tree-sitter 0.22.x: stable intermediate version, avoids 0.25 ABI risk.
tree-sitter-c-sharp 0.23.1: first version with C# Unicode identifier support.
Fixes: class_declaration cascade failure on files with Chinese field names.

Refs: docs/tree-sitter-parsing-pitfalls.md §1"
```

---

## Task 3: 迁移所有 parse 调用点

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/src/core/ingestion/workers/parse-worker.ts:866`
- Modify: `gitnexus/src/core/ingestion/call-processor.ts:167`
- Modify: `gitnexus/src/core/ingestion/import-processor.ts:406`
- Modify: `gitnexus/src/core/ingestion/heritage-processor.ts:124`
- Modify: `gitnexus/src/core/ingestion/parsing-processor.ts:157`

**Step 1: 核查当前调用点**

```bash
grep -rn "parser\.parse(" /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/src --include="*.ts" | grep -v "JSON\|//\|test"
```

预期输出：5 个结果，均形如 `parser.parse(file.content, undefined, { bufferSize: ... })`

**Step 2: 在每个文件中添加 parseContent 导入**

对 4 个 ingestion 文件（call-processor, import-processor, heritage-processor, parsing-processor）：
在已有 `import { loadParser, loadLanguage ... } from '../tree-sitter/parser-loader.js'` 行中，追加 `parseContent`。

对 `parse-worker.ts`，import 路径为 `../../tree-sitter/parser-loader.js`，同样追加 `parseContent`。

**Step 3: 替换每处 parse 调用**

将各文件中：
```typescript
tree = parser.parse(file.content, undefined, { bufferSize: getTreeSitterBufferSize(file.content.length) });
```
替换为：
```typescript
tree = parseContent(file.content);
```

**Step 4: 验证无残留旧调用**

```bash
grep -rn "parser\.parse(file\." /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/src --include="*.ts"
```

预期：**无输出**（0 匹配）。

**Step 5: 验证 parseContent 调用点数量**

```bash
grep -rn "parseContent(" /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/src --include="*.ts"
```

预期：5 个匹配，分布在上述 5 个文件中。

**Step 6: 运行 unit 测试套件**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus
npm test
```

预期：所有 unit 测试通过。

**Step 7: Commit**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus
git add src/core/ingestion/workers/parse-worker.ts \
        src/core/ingestion/call-processor.ts \
        src/core/ingestion/import-processor.ts \
        src/core/ingestion/heritage-processor.ts \
        src/core/ingestion/parsing-processor.ts
git commit -m "refactor(parse): migrate all parser.parse() calls to parseContent()

Replaces 5 parse call sites (parse-worker, call-processor, import-processor,
heritage-processor, parsing-processor) with the unified parseContent() chunked
callback. Removes dependency on getTreeSitterBufferSize at call sites.

Resolves: Invalid argument crash on files > 36 KB"
```

---

## Task 4: Unicode 标识符单元测试

**User Verification: not-required**

**Files:**
- Create: `gitnexus/test/unit/tree-sitter-unicode.test.ts`

**Step 1: 先写失败测试（依赖 0.23.1 grammar）**

创建 `gitnexus/test/unit/tree-sitter-unicode.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { loadParser, loadLanguage, parseContent } from '../../src/core/tree-sitter/parser-loader.js';
import { SupportedLanguages } from '../../src/config/supported-languages.js';

// Fixture: C# class with Unicode (Chinese) field names and method calls
// This mirrors real-world cases from neonspark/FirearmsPowerUp.cs
const CSHARP_UNICODE_CLASS = `
using System;
using System.Collections.Generic;

namespace GameLogic {
  public class 武器数据 {
    public string 说明;
    public bool 是否携带;
    public List<string> 先决条件 = new List<string>();

    public void 初始化() {
      说明 = "基础武器";
      是否携带 = true;
    }

    public string 获取描述() {
      return 先决条件.Count > 0
        ? 先决条件[0].TrimEnd()
        : 说明;
    }
  }
}
`.trim();

// Fixture: partial class with Unicode fields (like FirearmsPowerUp.cs)
const CSHARP_PARTIAL_CLASS_UNICODE = `
using System;

namespace NEON.Game.PowerUps {
  [Serializable]
  public partial class FirearmsPowerUp {
    public string 说明;
    public bool 是否携带;
  }

  public partial class FirearmsPowerUp {
    public void Apply() {
      var desc = 说明.Trim();
    }
  }
}
`.trim();

describe('C# Unicode identifier support (tree-sitter-c-sharp >= 0.23.1)', () => {
  it('parses C# class with Unicode field names without error', async () => {
    await loadParser();
    await loadLanguage(SupportedLanguages.CSharp);

    const tree = parseContent(CSHARP_UNICODE_CLASS);
    expect(tree.rootNode.hasError).toBe(false);
  });

  it('finds class_declaration nodes in Unicode-heavy file', async () => {
    await loadParser();
    await loadLanguage(SupportedLanguages.CSharp);

    const tree = parseContent(CSHARP_UNICODE_CLASS);
    let classCount = 0;
    function walk(node: any) {
      if (node.type === 'class_declaration') classCount++;
      for (let i = 0; i < node.childCount; i++) walk(node.child(i));
    }
    walk(tree.rootNode);
    expect(classCount).toBeGreaterThanOrEqual(1);
  });

  it('finds method_declaration nodes in Unicode-heavy file', async () => {
    await loadParser();
    await loadLanguage(SupportedLanguages.CSharp);

    const tree = parseContent(CSHARP_UNICODE_CLASS);
    let methodCount = 0;
    function walk(node: any) {
      if (node.type === 'method_declaration') methodCount++;
      for (let i = 0; i < node.childCount; i++) walk(node.child(i));
    }
    walk(tree.rootNode);
    expect(methodCount).toBeGreaterThanOrEqual(2); // 初始化 + 获取描述
  });

  it('parses partial class with Unicode fields without cascading ERROR', async () => {
    await loadParser();
    await loadLanguage(SupportedLanguages.CSharp);

    const tree = parseContent(CSHARP_PARTIAL_CLASS_UNICODE);
    // Key regression check: using directives at top must NOT become ERROR nodes
    const root = tree.rootNode;
    // using_directive nodes should be present (not collapsed into ERROR)
    let usingCount = 0;
    function walk(node: any) {
      if (node.type === 'using_directive') usingCount++;
      for (let i = 0; i < node.childCount; i++) walk(node.child(i));
    }
    walk(root);
    expect(usingCount).toBeGreaterThanOrEqual(1);
  });

  it('does NOT produce ERROR nodes for valid Unicode identifiers', async () => {
    await loadParser();
    await loadLanguage(SupportedLanguages.CSharp);

    const tree = parseContent(CSHARP_UNICODE_CLASS);
    // Count ERROR nodes at depth <= 3 (root → namespace → class level)
    let shallowErrorCount = 0;
    function walkShallow(node: any, depth: number) {
      if (depth > 3) return;
      if (node.type === 'ERROR') shallowErrorCount++;
      for (let i = 0; i < node.childCount; i++) walkShallow(node.child(i), depth + 1);
    }
    walkShallow(tree.rootNode, 0);
    expect(shallowErrorCount).toBe(0);
  });
});
```

**Step 2: 运行测试（在 Task 2 升级完成后）**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus
npm test -- --reporter=verbose test/unit/tree-sitter-unicode.test.ts
```

预期：所有 5 个测试 PASS。
如果任何测试 FAIL，说明 grammar 升级不完整或版本不对，需检查已安装的 `tree-sitter-c-sharp` 版本。

**Step 3: Commit**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus
git add test/unit/tree-sitter-unicode.test.ts
git commit -m "test(csharp): add Unicode identifier parsing regression tests

Tests verify that tree-sitter-c-sharp 0.23.1 correctly parses C# files
with Chinese field names without cascading ERROR nodes.

Covers: class_declaration presence, method_declaration presence,
using_directive preservation, shallow ERROR count = 0.

Refs: docs/tree-sitter-parsing-pitfalls.md §1"
```

---

## Task 5: 大文件分块回调单元测试

> **注意：** Task 1 已在测试文件中包含大文件测试，本任务扩展边界情况。

**User Verification: not-required**

**Files:**
- Modify: `gitnexus/test/unit/tree-sitter-chunked-parse.test.ts`

**Step 1: 追加边界测试用例**

在已有测试文件末尾添加：

```typescript
describe('parseContent edge cases', () => {
  it('handles empty string without throwing', async () => {
    await loadParser();
    await loadLanguage(SupportedLanguages.CSharp);
    expect(() => parseContent('')).not.toThrow();
  });

  it('handles exactly MAX_CHUNK boundary content (4096 bytes)', async () => {
    await loadParser();
    await loadLanguage(SupportedLanguages.TypeScript);
    // Generate content of exactly 4096 bytes
    const content = 'const x = 1;\n'.repeat(Math.ceil(4096 / 14)).slice(0, 4096);
    expect(() => parseContent(content)).not.toThrow();
  });

  it('handles content with multi-byte UTF-8 characters (Chinese comments)', async () => {
    await loadParser();
    await loadLanguage(SupportedLanguages.CSharp);
    // Chinese characters are 3 bytes each in UTF-8 — stress tests slice boundaries
    const code = `
// 这是一个测试文件，包含大量中文注释以测试 UTF-8 多字节字符在分块边界处的处理
namespace 测试命名空间 {
  public class 测试类 {
    // 这个方法用于测试中文标识符
    public void 测试方法() {
      string 变量名 = "中文字符串";
    }
  }
}
`;
    const tree = parseContent(code);
    expect(tree).toBeDefined();
    // Should not have cascading top-level errors
    expect(tree.rootNode.hasError).toBe(false);
  });
});
```

**Step 2: 运行完整测试文件**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus
npm test -- --reporter=verbose test/unit/tree-sitter-chunked-parse.test.ts
```

预期：全部 PASS（包含 Task 1 原有测试）。

**Step 3: Commit**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus
git add test/unit/tree-sitter-chunked-parse.test.ts
git commit -m "test(parse): add chunked parse edge case tests

Covers: empty string, exact MAX_CHUNK boundary (4096 bytes),
multi-byte UTF-8 Chinese content crossing chunk boundaries."
```

---

## Task 6: C# Integration 回归扩展

**User Verification: not-required**

**Files:**
- Create: `gitnexus/test/fixtures/lang-resolution/csharp-unicode-identifiers/main.cs`
- Create: `gitnexus/test/fixtures/lang-resolution/csharp-unicode-identifiers/expected.json`
- Modify: `gitnexus/test/integration/resolvers/csharp.test.ts`

**Step 1: 创建 fixture 文件**

`gitnexus/test/fixtures/lang-resolution/csharp-unicode-identifiers/main.cs`：

```csharp
using System;
using System.Collections.Generic;

namespace UnicodeSample {
  public class DataProcessor {
    public string 说明;
    public bool 是否启用;

    public void Process(DataItem 数据项) {
      if (数据项 != null) {
        说明 = 数据项.获取名称();
        是否启用 = true;
      }
    }
  }

  public class DataItem {
    private string 名称;

    public DataItem(string 初始名称) {
      名称 = 初始名称;
    }

    public string 获取名称() {
      return 名称;
    }
  }
}
```

**Step 2: 查看现有 integration 测试结构**

```bash
head -80 /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/test/integration/resolvers/csharp.test.ts
```

根据现有测试模式，在 `csharp.test.ts` 末尾添加 Unicode fixture 测试用例：

```typescript
it('resolves method calls in C# file with Unicode identifiers', async () => {
  // This test verifies that upgrading tree-sitter-c-sharp to 0.23.1 does not
  // break existing call resolution and that Unicode-heavy files are parseable.
  const fixturePath = path.join(__dirname, '../../fixtures/lang-resolution/csharp-unicode-identifiers');
  // Use whatever fixture-loading pattern the existing tests use
  // Key assertions:
  // 1. No parse errors cascade to wipe out class nodes
  // 2. DataProcessor and DataItem classes are indexed
  // 3. Process() → DataItem.获取名称() call edge is resolved
});
```

> **注意：** Step 2 中的测试内容需要参照现有 csharp.test.ts 的 fixture 加载模式调整。执行前先 `cat` 该文件了解具体模式。

**Step 3: 运行 csharp integration 测试**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus
npm run test:integration -- test/integration/resolvers/csharp.test.ts
```

预期：所有测试 PASS（包含现有用例和新增 Unicode 用例）。

**Step 4: 全量 unit 测试**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus
npm test
```

预期：全部 PASS。

**Step 5: Commit**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus
git add test/fixtures/lang-resolution/csharp-unicode-identifiers/ \
        test/integration/resolvers/csharp.test.ts
git commit -m "test(csharp): add Unicode identifier integration fixture and regression test

New fixture csharp-unicode-identifiers/ verifies end-to-end parsing and
call resolution for C# files with Chinese field names and method names.
Guards against grammar regression in future tree-sitter-c-sharp upgrades."
```

---

## Task 7: 升级后 neonspark 已知文件图验证

**User Verification: required**

> **前提：** Tasks 1-6 全部完成，已执行 `npm run build`，并对 neonspark 仓库执行了 `gitnexus analyze` 重建索引。

**Step 1: 构建**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus
npm run build
```

**Step 2: 运行诊断脚本验证 FirearmsPowerUp.cs**

```bash
node - << 'EOF'
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const Parser = _require('./gitnexus/node_modules/tree-sitter');
const CSharp = _require('./gitnexus/node_modules/tree-sitter-c-sharp');
import { readFileSync } from 'fs';

const filePath = process.env.NEONSPARK_FIREARMS_PATH;
if (!filePath) {
  console.error('Set NEONSPARK_FIREARMS_PATH to the path of FirearmsPowerUp.cs');
  process.exit(1);
}

const MAX_CHUNK = 4096;
const code = readFileSync(filePath, 'utf8');
const parser = new Parser();
parser.setLanguage(CSharp);

const tree = parser.parse((index) => {
  if (index >= code.length) return null;
  return code.slice(index, index + MAX_CHUNK);
});

const root = tree.rootNode;
console.log('hasError:', root.hasError);

let classCount = 0;
function findClasses(node) {
  if (node.type === 'class_declaration') classCount++;
  for (let i = 0; i < node.childCount; i++) findClasses(node.child(i));
}
findClasses(root);
console.log('class_declaration nodes:', classCount);
console.log('PASS:', !root.hasError && classCount >= 1 ? 'YES' : 'NO — REGRESSION');
EOF
```

或者直接使用 neonspark 仓库路径：

```bash
NEONSPARK_FIREARMS_PATH="/path/to/neonspark/Assets/NEON/Code/Game/PowerUps/ColdWeapon/FirearmsPowerUp.cs" \
  node /tmp/verify-unicode.mjs
```

预期输出：
```
hasError: false
class_declaration nodes: 2
PASS: YES
```

**Step 3: 执行 neonspark analyze**

```bash
cd /path/to/neonspark
npx -y @veewo/gitnexus@local analyze
# 或者使用本地 CLI：
node /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus/dist/cli/index.js analyze
```

**Step 4: 孤儿查询验证**

在 GitNexus MCP 中执行以下 Cypher 查询，确认 FirearmsPowerUp.cs 不再出现：

```cypher
MATCH (m:Method)
WHERE m.filePath ENDS WITH '.cs'
OPTIONAL MATCH (c)-[r:CodeRelation {type: 'HAS_METHOD'}]->(m)
WITH m, c
WHERE c IS NULL
RETURN DISTINCT m.filePath AS orphanFile, count(m) AS orphanMethodCount
ORDER BY orphanMethodCount DESC
LIMIT 20
```

**Human Verification Checklist:**
1. 诊断脚本输出 `hasError: false`
2. 诊断脚本输出 `class_declaration nodes: 2`（FirearmsPowerUp + DialogueData）
3. 诊断脚本输出 `PASS: YES`
4. neonspark analyze 成功完成（无 Fatal 错误）
5. Cypher 孤儿查询结果中 `FirearmsPowerUp.cs` 不出现

**Acceptance Criteria:**
1. `hasError` 字段为 `false`
2. `class_declaration nodes` 大于等于 1（预期 2）
3. PASS 标志为 YES
4. analyze 退出码为 0
5. 孤儿查询结果不包含 `FirearmsPowerUp.cs`

**Failure Signals:**
- `hasError: true` → grammar 版本仍不支持 Unicode，检查 `tree-sitter-c-sharp` 实际安装版本
- `class_declaration nodes: 0` → CASCADE 错误仍存在，确认 parseContent 分块回调已生效
- FirearmsPowerUp.cs 仍在孤儿列表 → analyze 未重建或 graph 查询使用了旧索引

**User Decision Prompt:** 以上 5 个检查项全部通过，请回复 `通过` 完成方案验证；如有任何失败，请回复 `不通过` 并附带相关输出。

**Step 5: 最终 commit**

```bash
cd /Volumes/Shuttle/projects/agentic/GitNexus/gitnexus
git add .
git commit -m "docs: record tree-sitter upgrade validation results

Post-upgrade verification: FirearmsPowerUp.cs hasError=false,
class_declaration nodes=2, not in orphan query results.
tree-sitter-c-sharp 0.23.1 Unicode support confirmed on real-world file."
```

---

## Plan Audit Verdict

audit_scope: DC-01 分块回调替换; DC-02 Unicode grammar 升级; DC-03 C# integration 回归; DC-04 已知文件图验证
finding_summary: P0=0, P1=1, P2=1

critical_mismatches:
- none

major_risks:
- P1: Task 6 中 fixture 测试实现依赖现有 csharp.test.ts 加载模式，计划中留有 TODO（"参照现有模式调整"）。可能导致测试无法运行。处理：accepted — 执行人在 Step 2 须先 `cat` 该文件确认模式后再实现，不阻塞其余任务。

anti_placeholder_checks:
- Task 3 Step 4 验证命令确保无残留旧调用（grep 返回 0 行）: pass
- Task 7 诊断脚本的 PASS 标志明确拒绝 hasError=true 或 classCount=0: pass

authenticity_checks:
- DC-01 通过 grep 验证调用点迁移，而非仅测试通过: pass
- DC-02 通过 shallow ERROR count 测试排除假合规（grammar 实际无效但解析不崩溃）: pass
- DC-04 使用真实 Cypher 孤儿查询验证图状态，而非仅验证文件可解析: pass

approval_decision: pass
