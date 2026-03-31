import type { GraphNode, GraphRelationship, KnowledgeGraph } from '../graph/types.js';
import { generateId } from '../../lib/utils.js';

const PLACEHOLDER_RE = /(TODO|TBD|\/placeholder\/)/i;
const UNITY_MONOBEHAVIOUR = 'MonoBehaviour';
const UNITY_SCRIPTABLE_OBJECT = 'ScriptableObject';

const LIFECYCLE_CALLBACKS = new Set([
  'Awake',
  'OnEnable',
  'Start',
  'Update',
  'FixedUpdate',
  'LateUpdate',
  'OnDisable',
  'OnDestroy',
]);

const RUNTIME_LOADER_ANCHORS = new Set([
  'Equip',
  'EquipWithEvent',
  'RegisterGraphEvents',
  'RegisterEvents',
  'StartRoutineWithEvents',
  'GetValue',
  'CheckReload',
  'ReloadRoutine',
]);

const DETERMINISTIC_LOADER_BRIDGES: Array<[string, string]> = [
  ['Equip', 'EquipWithEvent'],
  ['EquipWithEvent', 'RegisterEvents'],
  ['RegisterGraphEvents', 'RegisterEvents'],
  ['RegisterEvents', 'StartRoutineWithEvents'],
  ['StartRoutineWithEvents', 'GetValue'],
  ['GetValue', 'CheckReload'],
  ['CheckReload', 'ReloadRoutine'],
];

const SYNTHETIC_RUNTIME_ROOT_NAME = 'unity-runtime-root';
const SYNTHETIC_RUNTIME_ROOT_ID = generateId('Method', SYNTHETIC_RUNTIME_ROOT_NAME);

export interface UnityLifecycleSyntheticConfig {
  enabled: boolean;
  maxSyntheticEdgesPerClass: number;
  maxSyntheticEdgesTotal: number;
  lifecycleEdgeConfidence: number;
  loaderEdgeConfidence: number;
}

export const DEFAULT_UNITY_LIFECYCLE_SYNTHETIC_CONFIG: UnityLifecycleSyntheticConfig = {
  enabled: false,
  maxSyntheticEdgesPerClass: 12,
  maxSyntheticEdgesTotal: 256,
  lifecycleEdgeConfidence: 0.72,
  loaderEdgeConfidence: 0.68,
};

export interface UnityLifecycleHost {
  classNode: GraphNode;
  baseType: 'MonoBehaviour' | 'ScriptableObject';
  lifecycleCallbacks: GraphNode[];
  loaderAnchors: GraphNode[];
  methods: GraphNode[];
}

export interface UnityLifecycleSyntheticResult {
  syntheticEdgeCount: number;
  lifecycleEdgeCount: number;
  loaderEdgeCount: number;
  hostCount: number;
  rejectedHostCount: number;
  runtimeRootNodeId?: string;
}

export const detectUnityLifecycleHosts = (graph: KnowledgeGraph): UnityLifecycleHost[] => {
  const methodsByClass = new Map<string, GraphNode[]>();
  for (const rel of graph.iterRelationships()) {
    if (rel.type !== 'HAS_METHOD') continue;
    const method = graph.getNode(rel.targetId);
    if (!method) continue;
    if (method.label !== 'Method' && method.label !== 'Function') continue;
    const methods = methodsByClass.get(rel.sourceId) ?? [];
    methods.push(method);
    methodsByClass.set(rel.sourceId, methods);
  }

  const extendsByClass = new Map<string, GraphRelationship[]>();
  for (const rel of graph.iterRelationships()) {
    if (rel.type !== 'EXTENDS' && rel.type !== 'INHERITS') continue;
    const edges = extendsByClass.get(rel.sourceId) ?? [];
    edges.push(rel);
    extendsByClass.set(rel.sourceId, edges);
  }

  const classIdsByName = new Map<string, string[]>();
  for (const node of graph.iterNodes()) {
    if (node.label !== 'Class') continue;
    const ids = classIdsByName.get(String(node.properties.name)) ?? [];
    ids.push(node.id);
    classIdsByName.set(String(node.properties.name), ids);
  }

  const hosts: UnityLifecycleHost[] = [];
  for (const node of graph.iterNodes()) {
    if (node.label !== 'Class') continue;
    const baseType = resolveUnityBaseType(graph, extendsByClass, classIdsByName, node.id);
    if (!baseType) continue;
    const methods = methodsByClass.get(node.id) ?? [];
    const lifecycleCallbacks = methods.filter((method) => LIFECYCLE_CALLBACKS.has(method.properties.name));
    const loaderAnchors = methods.filter((method) => RUNTIME_LOADER_ANCHORS.has(method.properties.name));
    hosts.push({
      classNode: node,
      baseType,
      lifecycleCallbacks: sortMethodsByName(lifecycleCallbacks),
      loaderAnchors: sortMethodsByName(loaderAnchors),
      methods: sortMethodsByName(methods),
    });
  }

  return hosts;
};

export const applyUnityLifecycleSyntheticCalls = (
  graph: KnowledgeGraph,
  config: Partial<UnityLifecycleSyntheticConfig> = {},
): UnityLifecycleSyntheticResult => {
  const cfg: UnityLifecycleSyntheticConfig = {
    ...DEFAULT_UNITY_LIFECYCLE_SYNTHETIC_CONFIG,
    ...config,
  };

  if (!cfg.enabled) {
    return {
      syntheticEdgeCount: 0,
      lifecycleEdgeCount: 0,
      loaderEdgeCount: 0,
      hostCount: 0,
      rejectedHostCount: 0,
    };
  }

  const hosts = detectUnityLifecycleHosts(graph);
  const acceptedHosts: UnityLifecycleHost[] = [];
  let rejectedHostCount = 0;

  for (const host of hosts) {
    if (isPlaceholderHost(host)) {
      rejectedHostCount += 1;
      continue;
    }
    acceptedHosts.push(host);
  }

  acceptedHosts.sort((left, right) => scoreUnityHost(right) - scoreUnityHost(left));

  if (acceptedHosts.length === 0) {
    return {
      syntheticEdgeCount: 0,
      lifecycleEdgeCount: 0,
      loaderEdgeCount: 0,
      hostCount: 0,
      rejectedHostCount,
    };
  }

  ensureRuntimeRootNode(graph);

  const hostMethodToClassId = new Map<string, string>();
  const methodsByName = new Map<string, GraphNode[]>();
  for (const host of acceptedHosts) {
    for (const method of host.methods) {
      hostMethodToClassId.set(method.id, host.classNode.id);
      const list = methodsByName.get(method.properties.name) ?? [];
      list.push(method);
      methodsByName.set(method.properties.name, list);
    }
  }

  const existingPairs = new Set<string>();
  for (const rel of graph.iterRelationships()) {
    if (rel.type === 'CALLS') existingPairs.add(`${rel.sourceId}->${rel.targetId}`);
  }

  const syntheticEdgesPerClass = new Map<string, number>();
  let syntheticEdgeCount = 0;
  let lifecycleEdgeCount = 0;
  let loaderEdgeCount = 0;
  const reservedBridgeBudget = Math.max(1, Math.floor(cfg.maxSyntheticEdgesTotal * 0.5));
  const preBridgeBudget = Math.max(0, cfg.maxSyntheticEdgesTotal - reservedBridgeBudget);

  const canAllocate = (classId: string, phase: 'pre_bridge' | 'bridge' = 'pre_bridge'): boolean => {
    if (syntheticEdgeCount >= cfg.maxSyntheticEdgesTotal) return false;
    if (phase === 'pre_bridge' && syntheticEdgeCount >= preBridgeBudget) return false;
    const classCount = syntheticEdgesPerClass.get(classId) ?? 0;
    return classCount < cfg.maxSyntheticEdgesPerClass;
  };

  const addSyntheticEdge = (
    sourceId: string,
    targetId: string,
    reason: 'unity-lifecycle-synthetic' | 'unity-runtime-loader-synthetic',
    confidence: number,
    classId: string,
    phase: 'pre_bridge' | 'bridge' = 'pre_bridge',
  ): boolean => {
    if (sourceId === targetId) return false;
    if (!canAllocate(classId, phase)) return false;
    if (PLACEHOLDER_RE.test(sourceId) || PLACEHOLDER_RE.test(targetId)) return false;

    const pairKey = `${sourceId}->${targetId}`;
    if (existingPairs.has(pairKey)) return false;

    graph.addRelationship({
      id: generateId('CALLS', `${sourceId}->${targetId}:${reason}`),
      sourceId,
      targetId,
      type: 'CALLS',
      confidence,
      reason,
    });
    existingPairs.add(pairKey);
    syntheticEdgeCount += 1;
    syntheticEdgesPerClass.set(classId, (syntheticEdgesPerClass.get(classId) ?? 0) + 1);
    if (reason === 'unity-lifecycle-synthetic') lifecycleEdgeCount += 1;
    if (reason === 'unity-runtime-loader-synthetic') loaderEdgeCount += 1;
    return true;
  };

  for (const host of acceptedHosts) {
    const classId = host.classNode.id;
    for (const callback of host.lifecycleCallbacks) {
      if (!canAllocate(classId)) break;
      addSyntheticEdge(
        SYNTHETIC_RUNTIME_ROOT_ID,
        callback.id,
        'unity-lifecycle-synthetic',
        cfg.lifecycleEdgeConfidence,
        classId,
        'pre_bridge',
      );
    }

    if (!canAllocate(classId)) continue;
    for (const callback of host.lifecycleCallbacks) {
      if (!canAllocate(classId)) break;
      for (const loader of host.loaderAnchors) {
        if (!canAllocate(classId)) break;
        addSyntheticEdge(
          callback.id,
          loader.id,
          'unity-runtime-loader-synthetic',
          cfg.loaderEdgeConfidence,
          classId,
          'pre_bridge',
        );
      }
    }
  }

  for (const [sourceName, targetName] of DETERMINISTIC_LOADER_BRIDGES) {
    const sourceMethods = [...(methodsByName.get(sourceName) ?? [])].sort(
      (left, right) => scoreRuntimeLoaderMethod(right) - scoreRuntimeLoaderMethod(left),
    );
    const targetMethods = [...(methodsByName.get(targetName) ?? [])].sort(
      (left, right) => scoreRuntimeLoaderMethod(right) - scoreRuntimeLoaderMethod(left),
    );
    if (sourceMethods.length === 0 || targetMethods.length === 0) continue;

    const topSource = sourceMethods[0];
    const topTarget = targetMethods[0];
    const topSourceClassId = topSource ? hostMethodToClassId.get(topSource.id) : undefined;
    if (topSource && topTarget && topSourceClassId) {
      addSyntheticEdge(
        topSource.id,
        topTarget.id,
        'unity-runtime-loader-synthetic',
        cfg.loaderEdgeConfidence,
        topSourceClassId,
        'bridge',
      );
    }

    for (const sourceMethod of sourceMethods) {
      const classId = hostMethodToClassId.get(sourceMethod.id);
      if (!classId || !canAllocate(classId, 'bridge')) continue;
      for (const targetMethod of targetMethods) {
        if (!canAllocate(classId, 'bridge')) break;
        addSyntheticEdge(
          sourceMethod.id,
          targetMethod.id,
          'unity-runtime-loader-synthetic',
          cfg.loaderEdgeConfidence,
          classId,
          'bridge',
        );
      }
    }
  }

  return {
    syntheticEdgeCount,
    lifecycleEdgeCount,
    loaderEdgeCount,
    hostCount: acceptedHosts.length,
    rejectedHostCount,
    runtimeRootNodeId: syntheticEdgeCount > 0 ? SYNTHETIC_RUNTIME_ROOT_ID : undefined,
  };
};

const resolveUnityBaseType = (
  graph: KnowledgeGraph,
  extendsByClass: Map<string, GraphRelationship[]>,
  classIdsByName: Map<string, string[]>,
  classId: string,
  visited = new Set<string>(),
): 'MonoBehaviour' | 'ScriptableObject' | undefined => {
  if (visited.has(classId)) return undefined;
  visited.add(classId);

  for (const edge of extendsByClass.get(classId) ?? []) {
    const targetNode = graph.getNode(edge.targetId);
    const candidates = [
      targetNode?.properties?.name ?? '',
      edge.targetId,
      edge.reason,
    ];
    for (const candidate of candidates) {
      const normalized = normalizeBaseType(candidate);
      if (normalized) return normalized;
    }

    if (targetNode?.label === 'Class') {
      const inherited = resolveUnityBaseType(graph, extendsByClass, classIdsByName, targetNode.id, visited);
      if (inherited) return inherited;
    }

    for (const candidateId of resolveNamedClassTargets(classIdsByName, edge.targetId)) {
      const inherited = resolveUnityBaseType(graph, extendsByClass, classIdsByName, candidateId, visited);
      if (inherited) return inherited;
    }
  }
  return undefined;
};

const normalizeBaseType = (value: string): 'MonoBehaviour' | 'ScriptableObject' | undefined => {
  const text = String(value || '').trim();
  if (!text) return undefined;
  if (text.endsWith(UNITY_MONOBEHAVIOUR) || text.includes(`.${UNITY_MONOBEHAVIOUR}`)) {
    return UNITY_MONOBEHAVIOUR;
  }
  if (text.endsWith(UNITY_SCRIPTABLE_OBJECT) || text.includes(`.${UNITY_SCRIPTABLE_OBJECT}`)) {
    return UNITY_SCRIPTABLE_OBJECT;
  }
  return undefined;
};

const ensureRuntimeRootNode = (graph: KnowledgeGraph): void => {
  if (graph.getNode(SYNTHETIC_RUNTIME_ROOT_ID)) return;
  graph.addNode({
    id: SYNTHETIC_RUNTIME_ROOT_ID,
    label: 'Method',
    properties: {
      name: SYNTHETIC_RUNTIME_ROOT_NAME,
      filePath: '',
    },
  });
};

const isPlaceholderHost = (host: UnityLifecycleHost): boolean => {
  if (PLACEHOLDER_RE.test(host.classNode.properties.filePath)) return true;
  for (const method of host.methods) {
    if (PLACEHOLDER_RE.test(method.properties.filePath)) return true;
  }
  return false;
};

const sortMethodsByName = (methods: GraphNode[]): GraphNode[] =>
  [...methods].sort((left, right) => {
    const byName = String(left.properties.name).localeCompare(String(right.properties.name));
    if (byName !== 0) return byName;
    return left.id.localeCompare(right.id);
  });

const scoreUnityHost = (host: UnityLifecycleHost): number => {
  const filePath = String(host.classNode.properties.filePath || '');
  let score = 0;

  score += host.loaderAnchors.length * 40;
  score += host.lifecycleCallbacks.length * 8;

  if (filePath.includes('Assets/NEON/Code/Game/')) score += 200;
  else if (filePath.includes('Assets/NEON/Code/')) score += 120;
  else if (filePath.includes('Assets/')) score += 40;

  if (filePath.includes('/Graph/')) score += 60;
  if (filePath.includes('/PowerUps/')) score += 40;
  if (filePath.includes('/Core/')) score += 30;
  if (filePath.includes('/Reload')) score += 30;

  if (filePath.includes('/Packages/')) score -= 120;
  if (filePath.includes('/Legacy/')) score -= 80;
  if (filePath.startsWith('Assets/Scripts/')) score -= 60;

  for (const method of host.loaderAnchors) {
    const methodName = String(method.properties.name || '');
    if (methodName === 'RegisterGraphEvents' || methodName === 'RegisterEvents') score += 25;
    if (methodName === 'StartRoutineWithEvents') score += 25;
    if (methodName === 'GetValue' || methodName === 'CheckReload' || methodName === 'ReloadRoutine') score += 20;
    if (methodName === 'Equip' || methodName === 'EquipWithEvent') score += 15;
  }

  return score;
};

const scoreRuntimeLoaderMethod = (method: GraphNode): number => {
  const filePath = String(method.properties.filePath || '');
  const methodName = String(method.properties.name || '');
  let score = 0;

  if (filePath.includes('GunGraphMB')) score += 200;
  if (filePath.includes('/Graph/Graphs/GunGraph.cs')) score += 220;
  if (filePath.includes('/Graph/Nodes/Reloads/')) score += 240;
  if (filePath.includes('/PowerUps/WeaponPowerUp.cs')) score += 180;
  if (filePath.includes('/Game/Core/')) score += 80;
  if (filePath.includes('/Game/Graph/')) score += 120;
  if (filePath.includes('/Packages/')) score -= 100;
  if (filePath.includes('/Legacy/')) score -= 80;
  if (filePath.includes('/MonoScript/Minion')) score -= 60;

  if (methodName === 'RegisterGraphEvents') score += 50;
  if (methodName === 'RegisterEvents') score += 60;
  if (methodName === 'StartRoutineWithEvents') score += 70;
  if (methodName === 'GetValue') score += 90;
  if (methodName === 'CheckReload') score += 90;
  if (methodName === 'ReloadRoutine') score += 90;
  if (methodName === 'Equip' || methodName === 'EquipWithEvent') score += 50;

  return score;
};

const resolveNamedClassTargets = (classIdsByName: Map<string, string[]>, rawTargetId: string): string[] => {
  const text = String(rawTargetId || '').trim();
  if (!text.startsWith('Class:')) return [];
  const className = text.slice('Class:'.length);
  return classIdsByName.get(className) ?? [];
};
