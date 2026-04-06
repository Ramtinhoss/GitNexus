#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const planArg = process.argv[2];
if (!planArg) {
  console.error('Usage: node gitnexus/scripts/check-sync-manifest-traceability.mjs <plan.md>');
  process.exit(1);
}

const root = process.cwd();
const planPath = path.resolve(root, planArg);

const requiredCriticalDc = {
  'DC-01': {
    semanticCases: [
      {
        id: 'directive parsing',
        file: 'gitnexus/src/cli/analyze-options.test.ts',
        pattern: "resolveEffectiveAnalyzeOptions reads @extensions/@repoAlias/@embeddings from manifest",
      },
      {
        id: 'unknown directive fail-fast',
        file: 'gitnexus/src/cli/analyze-options.test.ts',
        pattern: 'resolveEffectiveAnalyzeOptions rejects unknown manifest directives',
      },
    ],
    commandMustInclude: ['gitnexus/dist/cli/analyze-options.test.js'],
  },
  'DC-02': {
    semanticCases: [
      {
        id: 'precedence merge case',
        file: 'gitnexus/src/cli/analyze-options.test.ts',
        pattern: 'resolveEffectiveAnalyzeOptions enforces precedence CLI > manifest > meta',
      },
    ],
    commandMustInclude: ['gitnexus/dist/cli/analyze-options.test.js'],
  },
  'DC-03': {
    semanticCases: [
      {
        id: 'auto default sync-manifest load case',
        file: 'gitnexus/src/cli/analyze.test.ts',
        pattern: 'analyze auto-loads .gitnexus/sync-manifest.txt when CLI scope options are omitted',
      },
    ],
    commandMustInclude: ['gitnexus/dist/cli/analyze.test.js'],
  },
  'DC-04': {
    semanticCases: [
      {
        id: 'mismatch prompt decision case',
        file: 'gitnexus/src/cli/sync-manifest.test.ts',
        pattern: 'when explicit CLI values differ from manifest, TTY mode asks whether to update manifest',
      },
      {
        id: 'update decision case',
        file: 'gitnexus/src/cli/sync-manifest.test.ts',
        pattern: 'policy=update rewrites manifest with normalized directives',
      },
    ],
    commandMustInclude: [
      'gitnexus/dist/cli/sync-manifest.test.js',
      'gitnexus/dist/cli/analyze.test.js',
    ],
  },
  'DC-05': {
    semanticCases: [
      {
        id: 'unknown directive fail-fast case',
        file: 'gitnexus/src/cli/analyze-options.test.ts',
        pattern: 'resolveEffectiveAnalyzeOptions rejects unknown manifest directives',
      },
    ],
    commandMustInclude: ['gitnexus/dist/cli/analyze-options.test.js'],
  },
  'DC-08': {
    semanticCases: [
      {
        id: 'placeholder rejection case',
        file: 'gitnexus/src/cli/sync-manifest.test.ts',
        pattern: 'rejects placeholder manifest path values',
      },
      {
        id: 'non-TTY policy gate case',
        file: 'gitnexus/src/cli/sync-manifest.test.ts',
        pattern: 'non-TTY without explicit policy exits with actionable error',
      },
    ],
    commandMustInclude: [
      'gitnexus/dist/cli/sync-manifest.test.js',
      'gitnexus/dist/cli/analyze.test.js',
    ],
  },
};

function normalizeCell(value) {
  return value.trim().replace(/^`|`$/g, '').trim();
}

function parseTraceabilityRows(planText) {
  const rows = [];
  for (const line of planText.split(/\r?\n/)) {
    if (!line.startsWith('DC-')) continue;
    const parts = line.split(' | ').map((p) => p.trim());
    if (parts.length < 6) continue;

    const idMatch = parts[0].match(/^(DC-\d+)/);
    if (!idMatch) continue;

    rows.push({
      id: idMatch[1],
      criticality: parts[1],
      mappedTasks: normalizeCell(parts[2]),
      verificationCommand: normalizeCell(parts[3]),
      artifactEvidenceField: normalizeCell(parts[4]),
      failureSignal: normalizeCell(parts.slice(5).join(' | ')),
      raw: line,
    });
  }
  return rows;
}

function validateCriticalRowShape(row, errors) {
  if (!row.mappedTasks || row.mappedTasks === '-') {
    errors.push(`${row.id}: missing mapped tasks`);
  }
  if (!/Task\s*\d+/i.test(row.mappedTasks)) {
    errors.push(`${row.id}: mapped tasks do not reference concrete task ids`);
  }
  if (!row.verificationCommand || row.verificationCommand === '-') {
    errors.push(`${row.id}: missing verification command`);
  }
  if (!row.artifactEvidenceField || row.artifactEvidenceField === '-') {
    errors.push(`${row.id}: missing artifact evidence field`);
  }
  if (!row.failureSignal || row.failureSignal === '-') {
    errors.push(`${row.id}: missing failure signal`);
  }
}

async function validateSemanticCases(dcId, config, errors) {
  for (const semanticCase of config.semanticCases) {
    const casePath = path.resolve(root, semanticCase.file);
    let content = '';
    try {
      content = await fs.readFile(casePath, 'utf-8');
    } catch {
      errors.push(`${dcId}: missing semantic case file ${semanticCase.file}`);
      continue;
    }
    if (!content.includes(semanticCase.pattern)) {
      errors.push(`${dcId}: missing semantic case '${semanticCase.id}' in ${semanticCase.file}`);
    }
  }
}

function validateCommandCoverage(row, config, errors) {
  for (const requiredFragment of config.commandMustInclude) {
    if (!row.verificationCommand.includes(requiredFragment)) {
      errors.push(`${row.id}: verification command missing '${requiredFragment}'`);
    }
  }
}

async function main() {
  const planText = await fs.readFile(planPath, 'utf-8');
  const rows = parseTraceabilityRows(planText);
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const errors = [];

  for (const dcId of Object.keys(requiredCriticalDc)) {
    const row = rowById.get(dcId);
    if (!row) {
      errors.push(`missing critical row ${dcId} in Design Traceability Matrix`);
      continue;
    }

    if (row.criticality !== 'critical') {
      errors.push(`${dcId}: expected critical criticality, got '${row.criticality}'`);
    }

    validateCriticalRowShape(row, errors);
    validateCommandCoverage(row, requiredCriticalDc[dcId], errors);
    await validateSemanticCases(dcId, requiredCriticalDc[dcId], errors);
  }

  if (errors.length > 0) {
    console.error('Sync-manifest traceability check failed:\n');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('Sync-manifest traceability check passed.');
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
