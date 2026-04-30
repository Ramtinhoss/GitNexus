# Tree-sitter 解析陷阱与上层识别模式

> 文档日期：2026-04-05；更新：2026-04-30
> 基于：neonspark `FirearmsPowerUp.cs` partial class HAS_METHOD 缺失调查（[完整报告](reports/2026-04-05-neonspark-partial-class-has-method-bug.md)）

---

## 1. 已知陷阱：Unicode 标识符导致级联解析失败 ✅ 已修复

> **状态：已通过升级 tree-sitter-c-sharp 至 0.23.1 修复。**
> 0.23.1 的 `_identifier_token` 使用 Unicode 标准的 `\\p{XID_Start}` / `\\p{XID_Continue}` 匹配（UAX #31），
> 完全支持中文等 Unicode 标识符，同时支持 `\\uXXXX` / `\\UXXXXXXXX` 转义。
> 以下内容保留作为历史参考和诊断手段。

### 现象

某些 C# 文件在 GitNexus analyze 后，图中**没有对应的 Class 节点**，所有方法成为孤儿节点（无 `HAS_METHOD` 边），相关 `method_triggers_method` 规则无法产出合成边。

### 根因（历史：0.21.3）

**tree-sitter-c-sharp 0.21.3 的 `_identifier_token` 使用 `\\p{L}` / `\\p{Nl}` 正则类，在 tree-sitter regex engine 上对特定 Unicode 标识符匹配不稳定**，导致中文命名的字段/属性被识别为 ERROR 节点。

```csharp
// 以下代码在 C# 语言规范中合法，但会触发 tree-sitter 解析错误：
public string 说明;
public bool 是否携带;
data.先决条件.TrimEnd()
```

tree-sitter grammar 将这些标识符识别为 ERROR 节点。更危险的是，**这些错误会级联向上污染整个 `compilation_unit`**，导致文件前部的 `using` 区块甚至 `class_declaration` 节点全部无法被正确解析：

```
row 1 [ERROR]: "using System;\nusing System.Collections;\n..."  // 整个 using 区块变成错误节点
class_declaration nodes: 0                                       // Class 节点完全缺失
```

### 诊断方法（历史：0.21.3 分块回调；当前使用自适应 buffer）

```javascript
// 当前（0.23.1 + 自适应 buffer）：直接字符串解析
const Parser = require('tree-sitter');
const CSharp = require('tree-sitter-c-sharp');
const fs = require('fs');

const code = fs.readFileSync(filePath, 'utf8');
const parser = new Parser();
parser.setLanguage(CSharp);

const bufferSize = Math.min(Math.max(Buffer.byteLength(code, 'utf8') * 2, 512 * 1024), 32 * 1024 * 1024);
const tree = parser.parse(code, null, { bufferSize });

const root = tree.rootNode;
console.log('hasError:', root.hasError);

// 统计 class_declaration
let classCount = 0;
function findClasses(node) {
  if (node.type === 'class_declaration') classCount++;
  for (let i = 0; i < node.childCount; i++) findClasses(node.child(i));
}
findClasses(root);
console.log('class_declaration nodes:', classCount);
```

### 上层识别模式

在 GitNexus 图查询中，可通过以下 Cypher 快速定位受影响文件：

```cypher
// 找出有 Method 节点但没有对应 Class 节点的文件
MATCH (m:Method)
WHERE m.filePath ENDS WITH '.cs'
OPTIONAL MATCH (c)-[r:CodeRelation {type: 'HAS_METHOD'}]->(m)
WITH m, c
WHERE c IS NULL
RETURN DISTINCT m.filePath AS orphanFile, count(m) AS orphanMethodCount
ORDER BY orphanMethodCount DESC
```

```cypher
// 验证特定文件是否有 Class 节点
MATCH (f:File)-[r:CodeRelation {type: 'DEFINES'}]->(c:Class)
WHERE f.filePath CONTAINS 'TargetFile.cs'
RETURN f.filePath, c.name, c.filePath
```

### 修复方案

**已完成：方案 B** — 升级 tree-sitter-c-sharp 至 **0.23.1**，使用 `\\p{XID_Start}` / `\\p{XID_Continue}` 匹配 Unicode 标识符，不再需要方案 A 的 ingestion fallback。

以下方案仅作历史记录：

- ~~方案 A（ingestion fallback）~~：在图构建阶段，对 `hasError=true` 且 `class_declaration nodes=0` 的文件，fallback 到正则/行扫描提取 class 声明。**不再需要。**
- **方案 B（升级 grammar）✅ 已完成**：升级至 tree-sitter-c-sharp 0.23.1。

---

## 2. 调用层陷阱：大文件解析与 UTF-8 multi-byte 崩溃 ✅ 已修复

> **状态：已通过自适应 buffer + 字符串输入路径修复。**
> 原分块回调方案在 UTF-8 multi-byte 内容上有 byte-offset vs JS-string-index 不一致问题，
> 已替换为 `parser.parse(content, null, { bufferSize })` 配合 `Buffer.byteLength()` 计算。

### 现象（历史）

直接将完整文件字符串传入 `parser.parse(fullText)` 时，对于较大的文件（实测约 36KB 以上），tree-sitter native binding 会抛出 `Error: Invalid argument`，而不是返回带错误节点的语法树。

```javascript
// ❌ 错误用法：大文件会崩溃
const source = fs.readFileSync(filePath, 'utf8');
const tree = parser.parse(source); // Invalid argument on large files
```

### 原因

tree-sitter Node.js native binding 对单次输入块有长度限制（< 32768 字节）。文件含大量多字节 UTF-8 字符（如中文注释）时更容易触发。

同时，**分块回调 API 传入的 `index` 是 byte offset**，而 `content.slice(index, index + MAX_CHUNK)` 按 JS string index（UTF-16 code unit）截取，对 multi-byte 字符会产生错位，导致 native 崩溃。

### 正确用法（当前：自适应 buffer + 字符串路径）

```javascript
// ✅ 当前用法：字符串输入 + 自适应 buffer（按 UTF-8 bytes 计算）
function parseFile(filePath, oldTree = null) {
  const code = fs.readFileSync(filePath, 'utf8');
  const parser = new Parser();
  parser.setLanguage(Language);

  // bufferSize 按 UTF-8 byte 长度计算，2× 放大，512KB～32MB 区间
  const byteLen = Buffer.byteLength(code, 'utf8');
  const bufferSize = Math.min(Math.max(byteLen * 2, 512 * 1024), 32 * 1024 * 1024);

  return parser.parse(code, oldTree, { bufferSize });
}
```

> **为什么弃用分块回调？** 回调的 `index` 参数是 byte offset，而返回的 `code.slice(index, index+N)` 是 JS string index。
> 对于含中文注释等 multi-byte UTF-8 字符的大文件，byte offset ≠ JS string index，导致 native 层收到错位数据并崩溃。
> 见 `parser-loader.ts` 中 `parseContent()` 的注释和 `gitnexus/test/unit/tree-sitter-chunked-parse.test.ts` 的回归测试。

### 其他常见调用层问题

| 问题 | 症状 | 解决方式 |
|------|------|----------|
| 仍有某处走了分块回调 | multi-byte 大文件 native 崩溃 | 全局改为字符串 + `{ bufferSize }` |
| 文件长度用 `content.length`（JS UTF-16） | buffer 不足，multi-byte 文件跳过或崩溃 | 改用 `Buffer.byteLength(content, 'utf8')` |
| `hasError` 当方法调用 | `node.hasError()` TypeError | 改为属性访问 `node.hasError` |
| `oldTree` 与当前文件内容不匹配 | 增量解析结果错误 | 文件变更时先调用 `tree.edit()` |
| 错误来自 `Parser.Query` 而非 `parse` | Query 抛出异常 | 独立捕获 Query 错误 |
| 文件读取编码不是 utf8 | 随机字节错误 | `readFileSync(path, 'utf8')` 显式指定 |

---

## 3. 影响范围扫描建议

发现一个文件有 Unicode 标识符解析问题后，应对整个仓库做全量扫描：

```bash
# 快速统计含中文标识符的 .cs 文件数量
grep -rl $'[\u4e00-\u9fff]' --include="*.cs" /path/to/repo | wc -l
```

配合图查询（上节 Cypher）可交叉验证哪些文件已在图中产生孤儿方法节点。

---

## 4. 参考

- 原始调查报告：`docs/reports/2026-04-05-neonspark-partial-class-has-method-bug.md`
- tree-sitter-c-sharp 版本：**0.23.1**（当前；已从 0.21.3 升级）
- 受影响文件示例：`neonspark/Assets/NEON/Code/Game/PowerUps/ColdWeapon/FirearmsPowerUp.cs`
- 修复验证结果：升级 0.23.1 后 Unicode 标识符可正常解析，`hasError=false`，`class_declaration` 节点正常
- 自适应 buffer 迁移 PR：`chanyuenpang/fix/tree-sitter-utf8-parse` (#11)
- 相关文件：`gitnexus/src/core/tree-sitter/parser-loader.ts`（`parseContent`）、`gitnexus/src/core/ingestion/constants.ts`（`getTreeSitterBufferSize`）
