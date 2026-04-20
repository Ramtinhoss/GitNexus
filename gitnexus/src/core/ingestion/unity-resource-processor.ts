import { performance } from 'node:perf_hooks';
import { generateId } from '../../lib/utils.js';
import type { KnowledgeGraph, GraphNode } from '../graph/types.js';
import type { UnityScanContext, UnitySymbolDeclaration } from '../unity/scan-context.js';
import { buildUnityScanContext } from '../unity/scan-context.js';
import { resolveUnityBindings } from '../unity/resolver.js';
import { buildUnityParitySeed, type UnityParitySeed } from './unity-parity-seed.js';
import { resolveUnityConfig } from '../config/unity-config.js';

export interface UnityResourceProcessingResult {
  processedSymbols: number;
  bindingCount: number;
  componentCount: number;
  diagnostics: string[];
  prefabSourceStats: PrefabSourcePassStats;
  paritySeed?: UnityParitySeed;
  timingsMs: {
    scanContext: number;
    resolve: number;
    graphWrite: number;
    total: number;
  };
}

export type UnityPayloadMode = 'compact' | 'full';

export interface UnityResourceProcessingOptions {
  repoPath: string;
  scopedPaths?: string[];
  payloadMode?: UnityPayloadMode;
}

export interface UnityResourceProcessingDeps {
  buildScanContext?: typeof buildUnityScanContext;
  resolveBindings?: typeof resolveUnityBindings;
}

interface PrefabSourcePassStats {
  rowsParsed: number;
  rowsFilteredZeroGuid: number;
  rowsFilteredPlaceholder: number;
  rowsFilteredUnresolved: number;
  rowsDeduped: number;
  rowsEmitted: number;
  fileErrors: number;
}

const UNITY_DIAGNOSTIC_SAMPLE_LIMIT = 3;
const PREFAB_SOURCE_PASS_DISABLE_ENV = 'GITNEXUS_DISABLE_PREFAB_SOURCE_PASS';

export async function processUnityResources(
  graph: KnowledgeGraph,
  options: UnityResourceProcessingOptions,
  deps?: UnityResourceProcessingDeps,
): Promise<UnityResourceProcessingResult> {
  const tStart = performance.now();
  const buildScanContextFn = deps?.buildScanContext || buildUnityScanContext;
  const resolveBindingsFn = deps?.resolveBindings || resolveUnityBindings;
  const payloadMode = resolveUnityPayloadMode(options.payloadMode);
  const classNodes = [...graph.iterNodes()].filter(
    (node) => node.label === 'Class' && String(node.properties.filePath || '').endsWith('.cs'),
  );
  const symbolDeclarations: UnitySymbolDeclaration[] = classNodes
    .map((node) => ({
      symbol: String(node.properties.name || '').trim(),
      scriptPath: String(node.properties.filePath || '').trim(),
    }))
    .filter((entry) => entry.symbol.length > 0 && entry.scriptPath.length > 0);
  let processedSymbols = 0;
  let bindingCount = 0;
  let componentCount = 0;
  const diagnostics: string[] = [];
  const issueDiagnostics: string[] = [];
  let scanContext: UnityScanContext | undefined;
  let symbolsWithResourceHits = new Set<string>();
  let skippedNoGuidHit = 0;
  let skippedMissingCanonical = 0;
  let skippedNonCanonical = 0;
  let canonicalSelected = 0;
  let serializedTypeEdgeCount = 0;
  let serializedTypeMissCount = 0;
  const serializedTypeSymbols = new Set<string>();
  const resolvedBySymbol = new Map<string, Awaited<ReturnType<typeof resolveUnityBindings>>>();
  const resolveErrorBySymbol = new Map<string, string>();
  let scanContextMs = 0;
  let resolveMs = 0;
  let graphWriteMs = 0;
  let prefabSourceStats: PrefabSourcePassStats = initPrefabSourcePassStats();

  try {
    const tScanContextStart = performance.now();
    scanContext = await buildScanContextFn({
      repoRoot: options.repoPath,
      scopedPaths: options.scopedPaths,
      symbolDeclarations,
    });
    scanContextMs += performance.now() - tScanContextStart;

    const uniqueResourcePaths = new Set<string>();
    for (const hits of scanContext.guidToResourceHits.values()) {
      for (const hit of hits) {
        uniqueResourcePaths.add(hit.resourcePath);
      }
    }

    diagnostics.push(
      `scanContext: scripts=${scanContext.symbolToScriptPath.size}, guids=${scanContext.scriptPathToGuid.size}, resources=${uniqueResourcePaths.size}`,
    );
    if (isPrefabSourcePassDisabledByEnv()) {
      diagnostics.push(`prefab-source: skipped (env ${PREFAB_SOURCE_PASS_DISABLE_ENV}=1)`);
    } else {
      const tPrefabSourceStart = performance.now();
      prefabSourceStats = await emitPrefabSourceGuidRefsFromScanContext(graph, scanContext);
      graphWriteMs += performance.now() - tPrefabSourceStart;
      diagnostics.push(`prefab-source: emitted=${prefabSourceStats.rowsEmitted}`);
      diagnostics.push(`prefab_source.rows_parsed=${prefabSourceStats.rowsParsed}`);
      diagnostics.push(`prefab_source.rows_filtered_zero_guid=${prefabSourceStats.rowsFilteredZeroGuid}`);
      diagnostics.push(`prefab_source.rows_filtered_placeholder=${prefabSourceStats.rowsFilteredPlaceholder}`);
      diagnostics.push(`prefab_source.rows_filtered_unresolved=${prefabSourceStats.rowsFilteredUnresolved}`);
      diagnostics.push(`prefab_source.rows_deduped=${prefabSourceStats.rowsDeduped}`);
      diagnostics.push(`prefab_source.rows_emitted=${prefabSourceStats.rowsEmitted}`);
      diagnostics.push(`prefab_source.file_errors=${prefabSourceStats.fileErrors}`);
    }
    symbolsWithResourceHits = collectSymbolsWithResourceHits(scanContext);
  } catch (error) {
    if (scanContextMs === 0) {
      scanContextMs = performance.now() - tStart;
    }
    diagnostics.push(error instanceof Error ? error.message : String(error));
  }

  const canonicalClassNodeBySymbol = buildCanonicalClassNodeIndex(classNodes, scanContext);

  for (const classNode of classNodes) {
    const symbol = String(classNode.properties.name || '').trim();
    if (!symbol) continue;

    if (scanContext) {
      const canonicalScriptPath = getCanonicalScriptPath(scanContext, symbol);
      if (!canonicalScriptPath) {
        skippedMissingCanonical += 1;
        continue;
      }

      const classNodePath = normalizePath(String(classNode.properties.filePath || '').trim());
      if (classNodePath !== canonicalScriptPath) {
        skippedNonCanonical += 1;
        continue;
      }
      canonicalSelected += 1;

      if (!symbolsWithResourceHits.has(symbol)) {
        skippedNoGuidHit += 1;
        continue;
      }
    }

    try {
      const resolveError = resolveErrorBySymbol.get(symbol);
      if (resolveError) {
        issueDiagnostics.push(resolveError);
        continue;
      }

      let resolved = resolvedBySymbol.get(symbol);
      if (!resolved) {
        const tResolveStart = performance.now();
        resolved = await resolveBindingsFn({ repoRoot: options.repoPath, symbol, scanContext });
        resolveMs += performance.now() - tResolveStart;
        resolvedBySymbol.set(symbol, resolved);
      }

      issueDiagnostics.push(...resolved.unityDiagnostics);
      if (resolved.resourceBindings.length === 0) {
        continue;
      }

      processedSymbols += 1;

      const tWriteStart = performance.now();
      const summaryBySource = new Map<string, Map<string, { resourceType: string; bindingKinds: Set<string>; lightweight: boolean }>>();
      const appendSummary = (
        sourceNodeId: string,
        binding: Awaited<ReturnType<typeof resolveUnityBindings>>['resourceBindings'][number],
      ) => {
        const normalizedPath = normalizePath(binding.resourcePath);
        const perPath = summaryBySource.get(sourceNodeId) || new Map<string, { resourceType: string; bindingKinds: Set<string>; lightweight: boolean }>();
        const existing = perPath.get(normalizedPath) || {
          resourceType: binding.resourceType,
          bindingKinds: new Set<string>(),
          lightweight: true,
        };
        existing.resourceType = binding.resourceType || existing.resourceType;
        existing.bindingKinds.add(binding.bindingKind);
        existing.lightweight = existing.lightweight && Boolean(binding.lightweight);
        perPath.set(normalizedPath, existing);
        summaryBySource.set(sourceNodeId, perPath);
      };

      for (const binding of resolved.resourceBindings) {
        bindingCount += 1;
        componentCount += 1;
        const resourceFileId = ensureResourceFileNode(graph, binding.resourcePath);
        const componentPayload = buildUnityPayload(binding, payloadMode);
        graph.addRelationship({
          id: generateId('UNITY_COMPONENT_INSTANCE', `${classNode.id}->${resourceFileId}:${binding.componentObjectId}`),
          type: 'UNITY_COMPONENT_INSTANCE',
          sourceId: classNode.id,
          targetId: resourceFileId,
          confidence: 1.0,
          reason: JSON.stringify(componentPayload),
        });
        graph.addRelationship({
          id: generateId('UNITY_GRAPH_NODE_SCRIPT_REF', `${resourceFileId}->${classNode.id}`),
          type: 'UNITY_GRAPH_NODE_SCRIPT_REF',
          sourceId: resourceFileId,
          targetId: classNode.id,
          confidence: 1.0,
          reason: JSON.stringify({
            resourcePath: normalizePath(binding.resourcePath),
            resourceType: binding.resourceType,
            bindingKind: binding.bindingKind,
            componentObjectId: binding.componentObjectId,
          }),
        });

        for (const ref of binding.resolvedReferences || []) {
          const targetAssetPath = normalizePath(String(ref.target?.assetPath || '').trim());
          const referenceGuid = String(ref.guid || '').trim();
          if (!targetAssetPath || !referenceGuid) continue;
          const sourceFileId = ensureResourceFileNode(graph, binding.resourcePath);
          const targetFileId = ensureResourceFileNode(graph, targetAssetPath);
          graph.addRelationship({
            id: generateId('UNITY_ASSET_GUID_REF', `${sourceFileId}->${targetFileId}:${ref.fieldName}:${referenceGuid}:${String(ref.fileId || '')}`),
            type: 'UNITY_ASSET_GUID_REF',
            sourceId: sourceFileId,
            targetId: targetFileId,
            confidence: 1.0,
            reason: JSON.stringify({
              resourcePath: normalizePath(binding.resourcePath),
              targetResourcePath: targetAssetPath,
              guid: referenceGuid.toLowerCase(),
              fileId: String(ref.fileId || ''),
              fieldName: ref.fieldName,
              sourceLayer: ref.sourceLayer || 'unknown',
            }),
          });
        }

        appendSummary(classNode.id, binding);

        const serializableTypeLinking = collectSerializableTypeTargetsForBinding(
          symbol,
          binding,
          scanContext,
          canonicalClassNodeBySymbol,
        );
        serializedTypeEdgeCount += serializableTypeLinking.edgeCount;
        serializedTypeMissCount += serializableTypeLinking.missCount;
        for (const hitSymbol of serializableTypeLinking.symbols) {
          serializedTypeSymbols.add(hitSymbol);
        }
        for (const link of serializableTypeLinking.links) {
          appendSummary(link.targetClassId, binding);
          graph.addRelationship({
            id: generateId('UNITY_SERIALIZED_TYPE_IN', `${classNode.id}->${link.targetClassId}:${normalizePath(binding.resourcePath)}:${link.fieldName}`),
            type: 'UNITY_SERIALIZED_TYPE_IN',
            sourceId: classNode.id,
            targetId: link.targetClassId,
            confidence: 1.0,
            reason: JSON.stringify({
              hostSymbol: symbol,
              declaredType: link.declaredType,
              fieldName: link.fieldName,
              sourceLayer: link.sourceLayer,
              resourcePath: normalizePath(binding.resourcePath),
            }),
          });
        }
      }

      for (const [sourceNodeId, perPath] of summaryBySource.entries()) {
        for (const [resourcePath, summary] of perPath.entries()) {
          const resourceFileId = generateId('File', resourcePath);
          graph.addRelationship({
            id: generateId('UNITY_RESOURCE_SUMMARY', `${sourceNodeId}->${resourceFileId}`),
            type: 'UNITY_RESOURCE_SUMMARY',
            sourceId: sourceNodeId,
            targetId: resourceFileId,
            confidence: 1.0,
            reason: JSON.stringify({
              resourceType: summary.resourceType,
              bindingKinds: [...summary.bindingKinds.values()].sort(),
              lightweight: true,
            }),
          });
        }
      }
      graphWriteMs += performance.now() - tWriteStart;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      resolveErrorBySymbol.set(symbol, message);
      issueDiagnostics.push(message);
    }
  }

  if (skippedNoGuidHit > 0) {
    diagnostics.push(`prefilter: skipped ${skippedNoGuidHit} symbol(s) without guid resource hits`);
  }
  diagnostics.push(
    `canonical: selected=${canonicalSelected}, skip-non-canonical=${skippedNonCanonical}, missing-canonical=${skippedMissingCanonical}`,
  );
  diagnostics.push(
    `serialized-type: edges=${serializedTypeEdgeCount}, symbols=${serializedTypeSymbols.size}, misses=${serializedTypeMissCount}`,
  );
  if (skippedMissingCanonical > 0) {
    diagnostics.push(`prefilter: skipped ${skippedMissingCanonical} symbol(s) missing canonical script mapping`);
  }
  diagnostics.push(...aggregateUnityDiagnostics(issueDiagnostics));

  return {
    processedSymbols,
    bindingCount,
    componentCount,
    diagnostics,
    prefabSourceStats,
    paritySeed: scanContext ? buildUnityParitySeed(scanContext) : undefined,
    timingsMs: {
      scanContext: roundMs(scanContextMs),
      resolve: roundMs(resolveMs),
      graphWrite: roundMs(graphWriteMs),
      total: roundMs(performance.now() - tStart),
    },
  };
}

function collectSymbolsWithResourceHits(scanContext: UnityScanContext): Set<string> {
  const symbols = new Set<string>();

  const canonicalEntries = scanContext.symbolToCanonicalScriptPath?.entries() || scanContext.symbolToScriptPath.entries();
  for (const [symbol, scriptPath] of canonicalEntries) {
    const guid = scanContext.scriptPathToGuid.get(scriptPath);
    if (!guid) continue;
    if ((scanContext.guidToResourceHits.get(guid) || []).length === 0) continue;
    symbols.add(symbol);
  }

  return symbols;
}

function getCanonicalScriptPath(scanContext: UnityScanContext, symbol: string): string | undefined {
  const canonicalPath = scanContext.symbolToCanonicalScriptPath?.get(symbol);
  if (canonicalPath) {
    return normalizePath(canonicalPath);
  }
  const fallbackPath = scanContext.symbolToScriptPath.get(symbol);
  if (fallbackPath) {
    return normalizePath(fallbackPath);
  }
  return undefined;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function resolveUnityPayloadMode(explicit?: UnityPayloadMode): UnityPayloadMode {
  if (explicit) return explicit;
  return resolveUnityConfig().config.payloadMode ?? 'compact';
}

function buildUnityPayload(
  binding: Awaited<ReturnType<typeof resolveUnityBindings>>['resourceBindings'][number],
  mode: UnityPayloadMode,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    bindingKind: binding.bindingKind,
    componentObjectId: binding.componentObjectId,
  };
  if (binding.lightweight) {
    payload.lightweight = true;
  }

  const serializedFields = compactSerializedFieldsForStorage(binding.serializedFields);
  if (serializedFields.scalarFields.length > 0 || serializedFields.referenceFields.length > 0) {
    payload.serializedFields = serializedFields;
  }
  if (binding.resolvedReferences && binding.resolvedReferences.length > 0) {
    payload.resolvedReferences = binding.resolvedReferences;
  }
  if (binding.assetRefPaths && binding.assetRefPaths.length > 0) {
    payload.assetRefPaths = binding.assetRefPaths;
  }

  if (mode === 'full') {
    payload.resourcePath = binding.resourcePath;
    payload.resourceType = binding.resourceType;
    payload.evidence = binding.evidence;
  }

  return payload;
}

function compactSerializedFieldsForStorage(
  input: Awaited<ReturnType<typeof resolveUnityBindings>>['resourceBindings'][number]['serializedFields'],
): Awaited<ReturnType<typeof resolveUnityBindings>>['resourceBindings'][number]['serializedFields'] {
  return {
    scalarFields: input.scalarFields.map((field) => ({
      name: field.name,
      sourceLayer: field.sourceLayer,
      value: field.value,
      valueType: field.valueType,
    })),
    referenceFields: input.referenceFields.map((field) => ({
      name: field.name,
      guid: field.guid,
      fileId: field.fileId,
      sourceLayer: field.sourceLayer,
    })),
  };
}

function buildCanonicalClassNodeIndex(
  classNodes: GraphNode[],
  scanContext?: UnityScanContext,
): Map<string, GraphNode> {
  const index = new Map<string, GraphNode>();
  for (const classNode of classNodes) {
    const symbol = String(classNode.properties.name || '').trim();
    if (!symbol || index.has(symbol)) continue;

    const classPath = normalizePath(String(classNode.properties.filePath || '').trim());
    const canonicalPath = scanContext ? getCanonicalScriptPath(scanContext, symbol) : undefined;
    if (canonicalPath && classPath !== canonicalPath) {
      continue;
    }
    index.set(symbol, classNode);
  }
  return index;
}

interface SerializableTypeLinkingStats {
  edgeCount: number;
  missCount: number;
  symbols: Set<string>;
  links: Array<{
    targetClassId: string;
    fieldName: string;
    declaredType: string;
    sourceLayer: string;
  }>;
}

function collectSerializableTypeTargetsForBinding(
  hostSymbol: string,
  binding: Awaited<ReturnType<typeof resolveUnityBindings>>['resourceBindings'][number],
  scanContext: UnityScanContext | undefined,
  canonicalClassNodeBySymbol: Map<string, GraphNode>,
): SerializableTypeLinkingStats {
  const stats: SerializableTypeLinkingStats = {
    edgeCount: 0,
    missCount: 0,
    symbols: new Set<string>(),
    links: [],
  };
  if (!scanContext) return stats;

  const serializableSymbols = (scanContext as { serializableSymbols?: Set<string> }).serializableSymbols;
  const hostFieldTypeHints = (scanContext as { hostFieldTypeHints?: Map<string, Map<string, string>> }).hostFieldTypeHints;
  if (!serializableSymbols || !hostFieldTypeHints) return stats;

  const hostHints = hostFieldTypeHints.get(hostSymbol);
  if (!hostHints || hostHints.size === 0) return stats;

  const fieldSourceLayer = collectBindingFieldSources(binding);
  if (fieldSourceLayer.size === 0) return stats;

  for (const [fieldName, declaredType] of hostHints.entries()) {
    if (!serializableSymbols.has(declaredType)) continue;

    const sourceLayer = fieldSourceLayer.get(fieldName);
    if (!sourceLayer) continue;

    const serializableNode = canonicalClassNodeBySymbol.get(declaredType);
    if (!serializableNode) {
      stats.missCount += 1;
      continue;
    }

    stats.links.push({
      targetClassId: serializableNode.id,
      fieldName,
      declaredType,
      sourceLayer,
    });
    stats.edgeCount += 1;
    stats.symbols.add(declaredType);
  }

  return stats;
}

function collectBindingFieldSources(
  binding: Awaited<ReturnType<typeof resolveUnityBindings>>['resourceBindings'][number],
): Map<string, string> {
  const fieldSources = new Map<string, string>();
  for (const field of binding.serializedFields.scalarFields) {
    if (!fieldSources.has(field.name)) {
      fieldSources.set(field.name, field.sourceLayer || 'unknown');
    }
  }
  for (const field of binding.serializedFields.referenceFields) {
    if (!fieldSources.has(field.name)) {
      fieldSources.set(field.name, field.sourceLayer || 'unknown');
    }
  }
  return fieldSources;
}

function ensureResourceFileNode(graph: KnowledgeGraph, resourcePath: string): string {
  const normalizedPath = normalizePath(resourcePath);
  const fileId = generateId('File', normalizedPath);
  if (!graph.getNode(fileId)) {
    graph.addNode({
      id: fileId,
      label: 'File',
      properties: {
        name: normalizedPath.split('/').pop() || normalizedPath,
        filePath: normalizedPath,
      },
    });
  }
  return fileId;
}

function collectResourceSummaryRows(
  bindings: Awaited<ReturnType<typeof resolveUnityBindings>>['resourceBindings'],
): Array<{ resourcePath: string; resourceType: string; bindingKinds: string[]; lightweight: boolean }> {
  const summaryByPath = new Map<string, { resourceType: string; bindingKinds: Set<string>; lightweight: boolean }>();
  for (const binding of bindings) {
    const resourcePath = normalizePath(binding.resourcePath);
    const row = summaryByPath.get(resourcePath) || {
      resourceType: binding.resourceType,
      bindingKinds: new Set<string>(),
      lightweight: true,
    };
    row.resourceType = binding.resourceType || row.resourceType;
    row.bindingKinds.add(binding.bindingKind);
    row.lightweight = row.lightweight && Boolean(binding.lightweight);
    summaryByPath.set(resourcePath, row);
  }

  return [...summaryByPath.entries()].map(([resourcePath, value]) => ({
    resourcePath,
    resourceType: value.resourceType,
    bindingKinds: [...value.bindingKinds.values()].sort(),
    lightweight: value.lightweight,
  }));
}

function roundMs(value: number): number {
  return Number(value.toFixed(1));
}

type UnityDiagnosticCategory =
  | 'no-monobehaviour-match'
  | 'ambiguous-symbol'
  | 'symbol-not-found'
  | 'missing-meta-guid'
  | 'other';

interface UnityDiagnosticBucket {
  count: number;
  samples: string[];
}

function aggregateUnityDiagnostics(messages: string[]): string[] {
  if (messages.length === 0) {
    return [];
  }

  const buckets = new Map<UnityDiagnosticCategory, UnityDiagnosticBucket>();
  for (const message of messages) {
    const category = classifyUnityDiagnostic(message);
    const bucket = buckets.get(category) || { count: 0, samples: [] };
    bucket.count += 1;
    if (bucket.samples.length < UNITY_DIAGNOSTIC_SAMPLE_LIMIT && !bucket.samples.includes(message)) {
      bucket.samples.push(message);
    }
    buckets.set(category, bucket);
  }

  const ordered = [...buckets.entries()].sort((left, right) => right[1].count - left[1].count);
  const lines: string[] = [
    `diagnostics: aggregated ${messages.length} issue(s) across ${ordered.length} category(ies); sampleLimit=${UNITY_DIAGNOSTIC_SAMPLE_LIMIT}`,
  ];

  for (const [category, bucket] of ordered) {
    lines.push(
      `diagnostics: category=${category} count=${bucket.count} sampleCount=${bucket.samples.length}`,
    );
    for (const sample of bucket.samples) {
      lines.push(`diagnostics: sample[${category}] ${sample}`);
    }
  }

  return lines;
}

function classifyUnityDiagnostic(message: string): UnityDiagnosticCategory {
  if (message.startsWith('No MonoBehaviour block matched script guid ')) {
    return 'no-monobehaviour-match';
  }
  if (message.startsWith('Unity symbol "') && message.endsWith('" is ambiguous.')) {
    return 'ambiguous-symbol';
  }
  if (message.startsWith('Unity symbol "') && message.includes('" was not found under ')) {
    return 'symbol-not-found';
  }
  if (message.startsWith('No .meta guid found for ')) {
    return 'missing-meta-guid';
  }
  return 'other';
}

async function emitPrefabSourceGuidRefsFromScanContext(
  graph: KnowledgeGraph,
  scanContext: UnityScanContext,
): Promise<PrefabSourcePassStats> {
  const stats = initPrefabSourcePassStats();
  const dedupeBySource = new Map<string, Set<string>>();
  const iterable: AsyncIterable<UnityScanContext['prefabSourceRefs'][number]> =
    typeof scanContext.streamPrefabSourceRefs === 'function'
      ? scanContext.streamPrefabSourceRefs({
        hooks: {
          onFileError: () => {
            stats.fileErrors += 1;
          },
        },
      })
      : (async function* () {
        for (const row of scanContext.prefabSourceRefs || []) {
          yield row;
        }
      })();

  for await (const row of iterable) {
    stats.rowsParsed += 1;
    const source = normalizePath(String(row.sourceResourcePath || '').trim());
    const guid = String(row.targetGuid || '').trim().toLowerCase();
    if (!guid || guid === '00000000000000000000000000000000') {
      stats.rowsFilteredZeroGuid += 1;
      continue;
    }

    const hintedTarget = normalizePath(String(row.targetResourcePath || '').trim());
    if (hintedTarget === '__PLACEHOLDER__') {
      stats.rowsFilteredPlaceholder += 1;
      continue;
    }

    const resolvedTarget = hintedTarget
      || normalizePath(scanContext.assetGuidToPath?.get(guid) || scanContext.assetGuidToPath?.get(guid.toLowerCase()) || '');
    if (!resolvedTarget || !resolvedTarget.endsWith('.prefab')) {
      stats.rowsFilteredUnresolved += 1;
      continue;
    }
    if (!source) {
      stats.rowsFilteredUnresolved += 1;
      continue;
    }

    const perSourceDedupe = dedupeBySource.get(source) || new Set<string>();
    const dedupeKey = `${resolvedTarget}|m_SourcePrefab|${guid}|${String(row.fileId || '').trim()}|${row.sourceLayer === 'scene' ? 'scene' : 'prefab'}`;
    if (perSourceDedupe.has(dedupeKey)) {
      stats.rowsDeduped += 1;
      continue;
    }
    perSourceDedupe.add(dedupeKey);
    dedupeBySource.set(source, perSourceDedupe);

    const sourceFileId = ensureResourceFileNode(graph, source);
    const targetFileId = ensureResourceFileNode(graph, resolvedTarget);
    graph.addRelationship({
      id: generateId(
        'UNITY_ASSET_GUID_REF',
        `${sourceFileId}->${targetFileId}:m_SourcePrefab:${guid}:${String(row.fileId || '')}`,
      ),
      type: 'UNITY_ASSET_GUID_REF',
      sourceId: sourceFileId,
      targetId: targetFileId,
      confidence: 1.0,
      reason: JSON.stringify({
        resourcePath: source,
        targetResourcePath: resolvedTarget,
        guid,
        fileId: String(row.fileId || ''),
        fieldName: 'm_SourcePrefab',
        sourceLayer: row.sourceLayer === 'scene' ? 'scene' : 'prefab',
      }),
    });
    stats.rowsEmitted += 1;
  }
  return stats;
}

function initPrefabSourcePassStats(): PrefabSourcePassStats {
  return {
    rowsParsed: 0,
    rowsFilteredZeroGuid: 0,
    rowsFilteredPlaceholder: 0,
    rowsFilteredUnresolved: 0,
    rowsDeduped: 0,
    rowsEmitted: 0,
    fileErrors: 0,
  };
}

function isPrefabSourcePassDisabledByEnv(): boolean {
  const value = String(process.env[PREFAB_SOURCE_PASS_DISABLE_ENV] || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}
