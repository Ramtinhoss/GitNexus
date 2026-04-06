#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const CONTAINER_KEYS = ['class', 'interface', 'struct', 'record', 'delegate', 'enum'];

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function normalizeContainerCounts(record) {
  const counts = {
    class: toNumber(record.class_count),
    interface: toNumber(record.interface_count),
    struct: toNumber(record.struct_count),
    record: toNumber(record.record_count),
    delegate: toNumber(record.delegate_count),
    enum: toNumber(record.enum_count),
  };

  if (record.container_counts && typeof record.container_counts === 'object') {
    for (const key of CONTAINER_KEYS) {
      counts[key] = toNumber(record.container_counts[key] ?? counts[key]);
    }
  }

  return counts;
}

function computeClassifiedType(record, containerCounts) {
  const methodCount = toNumber(record.method_count);
  const rootHasError = Boolean(record.root_has_error);
  const rawErrorType = String(record.error_type || '');
  const totalContainers = CONTAINER_KEYS.reduce((sum, key) => sum + containerCounts[key], 0);
  const legacyMissingClass = methodCount > 0 && containerCounts.class === 0;
  const missingContainer = methodCount > 0 && totalContainers === 0;
  const isFalsePositiveLikely = legacyMissingClass && !missingContainer;

  let errorType = 'ok';
  if (rawErrorType === 'parse_throw') {
    errorType = 'parse_throw';
  } else if (rootHasError || rawErrorType === 'root_has_error') {
    errorType = 'root_has_error';
  } else if (missingContainer) {
    errorType = 'missing_container_with_methods';
  }

  return {
    errorType,
    legacyMissingClass,
    missingContainer,
    isFalsePositiveLikely,
  };
}

export function classifyTreeSitterAuditRecords(records) {
  const byType = {
    parse_throw: 0,
    root_has_error: 0,
    missing_container_with_methods: 0,
    ok: 0,
  };

  const containerTotals = {
    class: 0,
    interface: 0,
    struct: 0,
    record: 0,
    delegate: 0,
    enum: 0,
  };

  let compatibilityMissingClassCount = 0;
  let falsePositiveLikelyCount = 0;

  const classified = records.map((record) => {
    const containerCounts = normalizeContainerCounts(record);
    const classification = computeClassifiedType(record, containerCounts);
    const compatibilityTags = [];

    if (classification.legacyMissingClass) {
      compatibilityTags.push('missing_class_with_methods');
      compatibilityMissingClassCount += 1;
    }
    if (classification.isFalsePositiveLikely) {
      falsePositiveLikelyCount += 1;
    }

    for (const key of CONTAINER_KEYS) {
      containerTotals[key] += containerCounts[key];
    }

    byType[classification.errorType] += 1;

    return {
      ...record,
      container_counts: containerCounts,
      classified_error_type: classification.errorType,
      compatibility_tags: compatibilityTags,
      is_false_positive_likely: classification.isFalsePositiveLikely,
    };
  });

  return {
    summary: {
      total: classified.length,
      byType,
      compatibility: {
        missing_class_with_methods: compatibilityMissingClassCount,
      },
      falsePositiveLikely: falsePositiveLikelyCount,
      containerTotals,
    },
    records: classified,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') args.input = argv[i + 1];
    if (arg === '--output') args.output = argv[i + 1];
  }
  return args;
}

async function readJsonl(inputPath) {
  const raw = await fs.readFile(inputPath, 'utf-8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function writeOutput(outputPath, data) {
  const resolved = path.resolve(outputPath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.input) {
    console.error('Usage: node scripts/tree-sitter-audit-classify.mjs --input <diagnostics.jsonl> [--output <report.json>]');
    process.exitCode = 1;
    return;
  }

  const records = await readJsonl(path.resolve(args.input));
  const report = classifyTreeSitterAuditRecords(records);

  if (args.output) {
    await writeOutput(args.output, report);
  } else {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
