# Runtime PoC Reports

This directory stores graph-only runtime retrieval PoC artifacts.

## Generated Files

- `runtime-poc-comparison.json`  
  Baseline vs graph-only row-level comparison, including `verified_full_false_positive_rate`.
- `runtime-poc-summary.md`  
  Human-readable summary of the comparison report.
- `provenance-*.json`  
  Offline provenance artifacts generated from graph-only claim outputs.
- `provenance-index.json`  
  Index of provenance artifacts with `artifact_path`, `sha256`, and generation metadata.

## Command

```bash
node gitnexus/dist/cli/index.js benchmark runtime-poc --repo <repo-name> --report-dir docs/reports/runtime-poc
```
