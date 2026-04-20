# Tree-sitter 解析陷阱与上层识别模式

> 文档日期：2026-04-05  
> 基于：neonspark `FirearmsPowerUp.cs` partial class HAS_METHOD 缺失调查（[完整报告](reports/2026-04-05-neonspark-partial-class-has-method-bug.md)）

---

## 1. 已知陷阱：Unicode 标识符导致级联解析失败

### 现象

某些 C# 文件在 GitNexus analyze 后，图中**没有对应的 Class 节点**，所有方法成为孤儿节点（无 `HAS_METHOD` 边），相关 `method_triggers_method` 规则无法产出合成边。

### 根因

**tree-sitter-c-sharp 0.21.3 不支持 C# Unicode 标识符**（如中文字段名、中文属性标注等）。

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

### 诊断方法

用以下脚本对目标 `.cs` 文件做快速检查（**必须使用分块回调，见第 2 节**）：

```javascript
const Parser = require('tree-sitter');
const CSharp = require('tree-sitter-c-sharp');
const fs = require('fs');

const MAX_CHUNK = 4096;
const code = fs.readFileSync(filePath, 'utf8');
const parser = new Parser();
parser.setLanguage(CSharp);

const tree = parser.parse((index) => {
  if (index >= code.length) return null;
  return code.slice(index, index + MAX_CHUNK);
});

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

**短期**：从受影响的 `.cs` 文件中移除 Unicode（中文）标识符，将其替换为 ASCII 等价命名，然后重新运行 `gitnexus analyze`。

**根本修复（两个方向）**：

- **方案 A（ingestion fallback）**：在图构建阶段，对 `hasError=true` 且 `class_declaration nodes=0` 的文件，fallback 到正则/行扫描提取 class 声明，确保 Class 节点被创建。
- **方案 B（升级 grammar）**：升级 tree-sitter-c-sharp 至支持 C# Unicode 标识符的更新版本。

---

## 2. 调用层陷阱：大文件解析崩溃（`Invalid argument`）

### 现象

直接将完整文件字符串传入 `parser.parse(fullText)` 时，对于较大的文件（实测约 36KB 以上），tree-sitter native binding 会抛出 `Error: Invalid argument`，而不是返回带错误节点的语法树。

```javascript
// ❌ 错误用法：大文件会崩溃
const source = fs.readFileSync(filePath, 'utf8');
const tree = parser.parse(source); // Invalid argument on large files
```

### 原因

tree-sitter Node.js native binding 对单次输入块有长度限制（< 32768 字节）。文件含大量多字节 UTF-8 字符（如中文注释）时更容易触发。

### 正确用法：分块回调

```javascript
// ✅ 正确用法：分块回调，MAX_CHUNK < 32768
const MAX_CHUNK = 4096; // 建议 4096 或 8192

function parseFile(filePath, oldTree = null) {
  const code = fs.readFileSync(filePath, 'utf8');
  const parser = new Parser();
  parser.setLanguage(Language);

  return parser.parse((index) => {
    if (index >= code.length) return null;
    return code.slice(index, index + MAX_CHUNK);
  }, oldTree);
}
```

> **增量解析同样适用**：`parser.parse(inputCallback, oldTree)` — 不要把完整大字符串传入增量解析。

### 其他常见调用层问题

参考 tree-sitter 仓库建议，以下情况也会导致解析异常：

| 问题 | 症状 | 解决方式 |
|------|------|----------|
| 仍有某处走了 `parse(fullText)` | 大文件 `Invalid argument` | 全局改为分块回调 |
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
- tree-sitter-c-sharp 版本：0.21.3（当前）
- 受影响文件示例：`neonspark/Assets/NEON/Code/Game/PowerUps/ColdWeapon/FirearmsPowerUp.cs`
- 修复验证结果：移除 Unicode 标识符后 `hasError=false`，`class_declaration nodes=2`（`FirearmsPowerUp` + `DialogueData`）
