import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(repoRoot, 'src');
const distRoot = path.join(repoRoot, 'dist');

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
}

const sourceTests = [];
walk(srcRoot, sourceTests);

const nodeTests = sourceTests
  .filter((filePath) => {
    const content = readFileSync(filePath, 'utf8');
    return content.includes("from 'node:test'") || content.includes('from "node:test"');
  })
  .map((filePath) => {
    const rel = path.relative(srcRoot, filePath).replace(/\.ts$/, '.js');
    return path.join(distRoot, rel);
  })
  .sort();

if (nodeTests.length === 0) {
  console.error('No node:test suites detected under src/**/*.test.ts');
  process.exit(1);
}

const missing = nodeTests.filter((filePath) => !existsSync(filePath));
if (missing.length > 0) {
  console.error('Missing compiled node:test files in dist/. Run build first.');
  for (const filePath of missing.slice(0, 20)) {
    console.error(`- ${filePath}`);
  }
  if (missing.length > 20) {
    console.error(`... and ${missing.length - 20} more`);
  }
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...nodeTests], {
  stdio: 'inherit',
  cwd: repoRoot,
});

process.exit(result.status ?? 1);
