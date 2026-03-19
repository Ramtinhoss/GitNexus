import path from 'node:path';
import { resolveUnityBindings } from '../core/unity/resolver.js';

export async function unityBindingsCommand(
  symbol: string,
  options: { targetPath?: string; json?: boolean },
  deps?: {
    resolver?: typeof resolveUnityBindings;
    writeLine?: (line: string) => void;
  },
): Promise<void> {
  const resolver = deps?.resolver || resolveUnityBindings;
  const writeLine = deps?.writeLine || ((line: string) => process.stderr.write(`${line}\n`));
  const repoRoot = path.resolve(options.targetPath || process.cwd());
  const result = await resolver({ repoRoot, symbol });

  if (options.json) {
    writeLine(JSON.stringify(result, null, 2));
    return;
  }

  writeLine(`Unity bindings for ${result.symbol}`);
  writeLine(`Script: ${result.scriptPath}`);
  writeLine(`GUID: ${result.scriptGuid}`);
  writeLine(`Resource bindings: ${result.resourceBindings.length}`);

  for (const binding of result.resourceBindings) {
    writeLine(`- ${binding.resourceType} ${binding.resourcePath} [${binding.bindingKind}] component=${binding.componentObjectId}`);
  }

  writeLine(`Scalar fields: ${result.serializedFields.scalarFields.length}`);
  for (const field of result.serializedFields.scalarFields) {
    writeLine(`- ${field.name} = ${field.value} (${field.sourceLayer})`);
  }

  writeLine(`Reference fields: ${result.serializedFields.referenceFields.length}`);
  for (const field of result.serializedFields.referenceFields) {
    writeLine(`- ${field.name} -> ${field.guid || field.fileId || 'unresolved'} (${field.sourceLayer})`);
  }

  if (result.unityDiagnostics.length > 0) {
    writeLine(`Diagnostics: ${result.unityDiagnostics.length}`);
    for (const diagnostic of result.unityDiagnostics) {
      writeLine(`- ${diagnostic}`);
    }
  }
}
