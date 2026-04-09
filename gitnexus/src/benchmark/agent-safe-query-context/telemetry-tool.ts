import fs from 'node:fs/promises';
import { writeSync } from 'node:fs';
import path from 'node:path';
import { closeLbug } from '../../mcp/core/lbug-adapter.js';
import { LocalBackend } from '../../mcp/local/local-backend.js';
import { estimateTokens } from '../u2-e2e/metrics.js';

type TelemetryToolName = 'query' | 'context' | 'cypher';

interface TelemetryToolOptions {
  runDir: string;
  tool: TelemetryToolName;
  input: Record<string, unknown>;
}

export async function invokeTelemetryTool(options: TelemetryToolOptions): Promise<unknown> {
  const backend = new LocalBackend();
  const ok = await backend.init();
  if (!ok) {
    throw new Error('No indexed repositories found. Run analyze first.');
  }

  const started = performance.now();
  try {
    const output = await backend.callTool(options.tool, options.input);
    const durationMs = Number((performance.now() - started).toFixed(1));
    const row = {
      tool: options.tool,
      input: options.input,
      output,
      durationMs,
      totalTokensEst: estimateTokens(JSON.stringify(options.input)) + estimateTokens(JSON.stringify(output)),
      timestamp: new Date().toISOString(),
    };
    await fs.mkdir(options.runDir, { recursive: true });
    await fs.appendFile(path.join(options.runDir, 'telemetry.jsonl'), `${JSON.stringify(row)}\n`, 'utf-8');
    return output;
  } finally {
    await closeLbug();
  }
}

export async function telemetryToolMain(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  const output = await invokeTelemetryTool(parsed);
  writeSync(1, `${JSON.stringify(output, null, 2)}\n`);
}

function parseArgs(argv: string[]): TelemetryToolOptions {
  let runDir = '';
  let tool = '' as TelemetryToolName;
  let inputText = '';

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--run-dir') {
      runDir = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (token === '--tool') {
      tool = (argv[index + 1] || '') as TelemetryToolName;
      index += 1;
      continue;
    }
    if (token === '--input') {
      inputText = argv[index + 1] || '';
      index += 1;
      continue;
    }
  }

  if (!runDir || !tool || !inputText) {
    throw new Error('Usage: telemetry-tool --run-dir <dir> --tool <query|context|cypher> --input <json>');
  }
  if (!['query', 'context', 'cypher'].includes(tool)) {
    throw new Error(`Unsupported tool: ${tool}`);
  }

  return {
    runDir,
    tool,
    input: JSON.parse(inputText) as Record<string, unknown>,
  };
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  telemetryToolMain(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
