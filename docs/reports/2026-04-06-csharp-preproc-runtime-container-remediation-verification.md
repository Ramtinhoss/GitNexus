# C# Preproc + Runtime Container Remediation Verification

- Date: 2026-04-06
- Scope: A→B→C remediation implementation in `docs/plans/2026-04-06-csharp-preproc-runtime-container-remediation-implementation-plan.md`
- Workspace: `/Volumes/Shuttle/projects/agentic/GitNexus`

## 1. Verification Commands and Results

### 1.1 Build

Command:

```bash
cd gitnexus && npm run build
```

Result: PASS

### 1.2 Targeted unit test batch (A/B/C critical paths)

Command:

```bash
cd gitnexus && npm test -- \
  test/unit/tree-sitter-audit-classify.test.ts \
  test/unit/unity-runtime-binding-rules.test.ts \
  test/unit/csharp-define-profile.test.ts \
  test/unit/csharp-preproc-normalizer.test.ts \
  test/unit/parse-worker-csharp-preproc.test.ts \
  src/cli/analyze-runtime-summary.test.ts
```

Result: PASS (`69` files passed; `1646` tests passed; `1` skipped)

### 1.3 Integration test for C# preproc pipeline

Command:

```bash
cd gitnexus && npm run test:integration -- test/integration/csharp-preproc-pipeline.test.ts
```

Result: PASS (integration suite pass; new `csharp-preproc-pipeline` check included)

### 1.4 Neonspark analyze with csproj define profile

Command:

```bash
cd gitnexus && node dist/cli/index.js analyze /Volumes/Shuttle/projects/neonspark \
  --scope-manifest /Volumes/Shuttle/projects/neonspark/.gitnexus/sync-manifest.txt \
  --extensions .cs,.meta \
  --csharp-define-csproj /Volumes/Shuttle/projects/neonspark/Assembly-CSharp.csproj
```

Result: PASS (exit 0, 95.5s)

Key output excerpt:

- `CSharp Preproc: defines=165, normalized=1370, fallback=2, skipped=6606, exprErrors=874`
- `source: /Volumes/Shuttle/projects/neonspark/Assembly-CSharp.csproj`
- `99,895 nodes | 452,053 edges | 4974 clusters | 300 flows`

### 1.5 Key sample check (`LocalPlayerInput.cs`) raw vs normalized parse

Command (built module check):

- Load `DefineConstants` from `/Volumes/Shuttle/projects/neonspark/Assembly-CSharp.csproj`
- Parse raw C# source and normalized C# source, then compare `rootNode.hasError`

Result:

- `/Volumes/Shuttle/projects/neonspark/Assets/NEON/Code/Game/Input/LocalPlayerInput.cs`
  - `rawHasError=true`
  - `normalizedHasError=false`
  - `normalizedChanged=true`
- `/Volumes/Shuttle/projects/neonspark/Legacy/Code/Services/LocalPlayerInput.cs`
  - `rawHasError=false`
  - `normalizedHasError=false`
  - `normalizedChanged=false`

## 2. Human Verification Checklist Status

1. 使用 `--csharp-define-csproj` 运行 neonspark analyze 成功完成
- Status: PASS
- Evidence: section 1.4 command exit 0

2. analyze 输出包含 `csharpPreprocDiagnostics` 字段
- Status: PASS
- Evidence: section 1.4 output包含 `CSharp Preproc: ...`（来自 `pipelineRuntime.csharpPreprocDiagnostics`）

3. 关键样本文件（如 `LocalPlayerInput.cs`）在新审计下 `root_has_error` 下降或保持可解释
- Status: PASS
- Evidence: section 1.5 (`Assets/NEON/Code/Game/Input/LocalPlayerInput.cs` 从 `rawHasError=true` 降为 `normalizedHasError=false`)

4. `enableContainerNodes=false` 时 runtime 命中与基线一致
- Status: PASS
- Evidence: `test/unit/unity-runtime-binding-rules.test.ts` case `keeps baseline behavior when enableContainerNodes=false`

5. `enableContainerNodes=true` 时新增 struct/interface 可解释命中
- Status: PASS
- Evidence: `test/unit/unity-runtime-binding-rules.test.ts` case `matches struct/interface containers when enableContainerNodes=true`

## 3. Conclusion

- Code changes for Task 1-10 are implemented and verified with command/test evidence.
- Manual checklist items are all covered in this report.
