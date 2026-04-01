/**
 * MCP Tool Definitions
 * 
 * Defines the tools that GitNexus exposes to external AI agents.
 * All tools support an optional `repo` parameter for multi-repo setups.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      default?: any;
      items?: { type: string };
      enum?: string[];
    }>;
    required: string[];
  };
}

export const GITNEXUS_TOOLS: ToolDefinition[] = [
  {
    name: 'list_repos',
    description: `List all indexed repositories available to GitNexus.

Returns each repo's name, path, indexed date, last commit, and stats.

WHEN TO USE: First step when multiple repos are indexed, or to discover available repos.
AFTER THIS: READ gitnexus://repo/{name}/context for the repo you want to work with.

When multiple repos are indexed, you MUST specify the "repo" parameter
on other tools (query, context, impact, etc.) to target the correct one.`,
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'query',
    description: `Query the code knowledge graph for execution flows related to a concept.
Returns processes (call chains) ranked by relevance, each with its symbols and file locations.

WHEN TO USE: Understanding how code works together. Use this when you need execution flows and relationships, not just file matches. Complements grep/IDE search.
AFTER THIS: Use context() on a specific symbol for 360-degree view (callers, callees, categorized refs).

Returns results grouped by process (execution flow):
- processes: ranked execution flows with relevance priority
- process_symbols: all symbols in those flows with file locations and module (functional area)
- definitions: standalone types/interfaces not in any process
- processes[].evidence_mode: direct_step | method_projected | resource_heuristic
- processes[].confidence: high | medium | low
- processes[].process_subtype: unity_lifecycle | static_calls (when persisted metadata exists)
- processes[].runtime_chain_confidence: high | medium | low (when GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on)
- processes[].runtime_chain_evidence_level: none | clue | verified_segment | verified_chain (when GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on)
- processes[].verification_hint: { action, target, next_command } (required when confidence=low and confidence fields flag is on)
- process_symbols[].process_evidence_mode: direct_step | method_projected | resource_heuristic
- process_symbols[].process_confidence: high | medium | low
- process_symbols[].process_subtype: unity_lifecycle | static_calls (when persisted metadata exists)
- process_symbols[].runtime_chain_confidence: high | medium | low (when GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on)
- process_symbols[].runtime_chain_evidence_level: none | clue | verified_segment | verified_chain (when GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on)
- process_symbols[].verification_hint: { action, target, next_command } (when confidence fields flag is on)

Hybrid ranking: BM25 keyword + semantic vector search, ranked by Reciprocal Rank Fusion.
Supports optional scope controls for noisy codebases:
- scope_preset=unity-gameplay to prioritize project gameplay code and suppress plugin-heavy paths.
- scope_preset=unity-all (default behavior) to keep full Unity search scope.

Includes optional Unity retrieval contract:
- Set unity_resources=on|auto to include Unity resource evidence.
- Default unity_hydration_mode=compact (fast path).
- Check response hydrationMeta: when needsParityRetry=true, rerun with unity_hydration_mode=parity for completeness.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language or keyword search query' },
        task_context: { type: 'string', description: 'What you are working on (e.g., "adding OAuth support"). Helps ranking.' },
        goal: { type: 'string', description: 'What you want to find (e.g., "existing auth validation logic"). Helps ranking.' },
        limit: { type: 'number', description: 'Max processes to return (default: 5)', default: 5 },
        max_symbols: { type: 'number', description: 'Max symbols per process (default: 10)', default: 10 },
        include_content: { type: 'boolean', description: 'Include full symbol source code (default: false)', default: false },
        scope_preset: {
          type: 'string',
          enum: ['unity-gameplay', 'unity-all'],
          description: 'Optional retrieval preset. unity-gameplay reduces plugin/package noise in Unity projects.',
        },
        unity_resources: {
          type: 'string',
          enum: ['off', 'on', 'auto'],
          description: 'Unity resource retrieval mode (default: off)',
          default: 'off',
        },
        unity_hydration_mode: {
          type: 'string',
          enum: ['parity', 'compact'],
          description: 'Unity hydration mode when unity_resources is enabled (default: compact)',
          default: 'compact',
        },
        runtime_chain_verify: {
          type: 'string',
          enum: ['off', 'on-demand'],
          description: 'Explicit runtime chain verification mode (default: off)',
          default: 'off',
        },
        repo: { type: 'string', description: 'Repository name or path. Omit if only one repo is indexed.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'cypher',
    description: `Execute Cypher query against the code knowledge graph.

WHEN TO USE: Complex structural queries that search/explore can't answer. READ gitnexus://repo/{name}/schema first for the full schema.
AFTER THIS: Use context() on result symbols for deeper context.

SCHEMA:
- Nodes: File, Folder, Function, Class, Interface, Method, CodeElement, Community, Process
- Multi-language nodes (use backticks): \`Struct\`, \`Enum\`, \`Trait\`, \`Impl\`, etc.
- All edges via single CodeRelation table with 'type' property
- Edge types: CONTAINS, DEFINES, CALLS, IMPORTS, EXTENDS, IMPLEMENTS, HAS_METHOD, OVERRIDES, MEMBER_OF, STEP_IN_PROCESS
- Edge properties: type (STRING), confidence (DOUBLE), reason (STRING), step (INT32)

EXAMPLES:
• Find callers of a function:
  MATCH (a)-[:CodeRelation {type: 'CALLS'}]->(b:Function {name: "validateUser"}) RETURN a.name, a.filePath

• Find community members:
  MATCH (f)-[:CodeRelation {type: 'MEMBER_OF'}]->(c:Community) WHERE c.heuristicLabel = "Auth" RETURN f.name

• Trace a process:
  MATCH (s)-[r:CodeRelation {type: 'STEP_IN_PROCESS'}]->(p:Process) WHERE p.heuristicLabel = "UserLogin" RETURN s.name, r.step ORDER BY r.step

• Find all methods of a class:
  MATCH (c:Class {name: "UserService"})-[r:CodeRelation {type: 'HAS_METHOD'}]->(m:Method) RETURN m.name, m.parameterCount, m.returnType

• Find method overrides (MRO resolution):
  MATCH (winner:Method)-[r:CodeRelation {type: 'OVERRIDES'}]->(loser:Method) RETURN winner.name, winner.filePath, loser.filePath, r.reason

• Detect diamond inheritance:
  MATCH (d:Class)-[:CodeRelation {type: 'EXTENDS'}]->(b1), (d)-[:CodeRelation {type: 'EXTENDS'}]->(b2), (b1)-[:CodeRelation {type: 'EXTENDS'}]->(a), (b2)-[:CodeRelation {type: 'EXTENDS'}]->(a) WHERE b1 <> b2 RETURN d.name, b1.name, b2.name, a.name

OUTPUT: Returns { markdown, row_count } — results formatted as a Markdown table for easy reading.

TIPS:
- All relationships use single CodeRelation table — filter with {type: 'CALLS'} etc.
- Community = auto-detected functional area (Leiden algorithm)
- Process = execution flow trace from entry point to terminal
- Use heuristicLabel (not label) for human-readable community/process names`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Cypher query to execute' },
        repo: { type: 'string', description: 'Repository name or path. Omit if only one repo is indexed.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'context',
description: `360-degree view of a single code symbol.
Shows categorized incoming/outgoing references (calls, imports, extends, implements), process participation, and file location.

WHEN TO USE: After query() to understand a specific symbol in depth. When you need to know all callers, callees, and what execution flows a symbol participates in.
AFTER THIS: Use impact() if planning changes, or READ gitnexus://repo/{name}/process/{processName} for full execution trace.

Handles disambiguation: if multiple symbols share the same name, returns candidates for you to pick from. Use uid param for zero-ambiguity lookup from prior results.

Process participation metadata:
- processes[].evidence_mode: direct_step | method_projected | resource_heuristic
- processes[].confidence: high | medium | low
- processes[].process_subtype: unity_lifecycle | static_calls (when persisted metadata exists)
- processes[].runtime_chain_confidence: high | medium | low (when GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on)
- processes[].runtime_chain_evidence_level: none | clue | verified_segment | verified_chain (when GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS=on)
- processes[].verification_hint: { action, target, next_command } (required when confidence=low and confidence fields flag is on)

Unity retrieval contract:
- Set unity_resources=on|auto to include Unity resource evidence.
- Default unity_hydration_mode=compact (fast path).
- Check response hydrationMeta: when needsParityRetry=true, rerun with unity_hydration_mode=parity for completeness.`,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Symbol name (e.g., "validateUser", "AuthService")' },
        uid: { type: 'string', description: 'Direct symbol UID from prior tool results (zero-ambiguity lookup)' },
        file_path: { type: 'string', description: 'File path to disambiguate common names' },
        include_content: { type: 'boolean', description: 'Include full symbol source code (default: false)', default: false },
        unity_resources: {
          type: 'string',
          enum: ['off', 'on', 'auto'],
          description: 'Unity resource retrieval mode (default: off)',
          default: 'off',
        },
        unity_hydration_mode: {
          type: 'string',
          enum: ['parity', 'compact'],
          description: 'Unity hydration mode when unity_resources is enabled (default: compact)',
          default: 'compact',
        },
        runtime_chain_verify: {
          type: 'string',
          enum: ['off', 'on-demand'],
          description: 'Explicit runtime chain verification mode (default: off)',
          default: 'off',
        },
        repo: { type: 'string', description: 'Repository name or path. Omit if only one repo is indexed.' },
      },
      required: [],
    },
  },
  {
    name: 'detect_changes',
    description: `Analyze uncommitted git changes and find affected execution flows.
Maps git diff hunks to indexed symbols, then traces which processes are impacted.

WHEN TO USE: Before committing — to understand what your changes affect. Pre-commit review, PR preparation.
AFTER THIS: Review affected processes. Use context() on high-risk symbols. READ gitnexus://repo/{name}/process/{name} for full traces.

Returns: changed symbols, affected processes, and a risk summary.`,
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: 'What to analyze: "unstaged" (default), "staged", "all", or "compare"', enum: ['unstaged', 'staged', 'all', 'compare'], default: 'unstaged' },
        base_ref: { type: 'string', description: 'Branch/commit for "compare" scope (e.g., "main")' },
        repo: { type: 'string', description: 'Repository name or path. Omit if only one repo is indexed.' },
      },
      required: [],
    },
  },
  {
    name: 'rename',
    description: `Multi-file coordinated rename using the knowledge graph + text search.
Finds all references via graph (high confidence) and regex text search (lower confidence). Preview by default.

WHEN TO USE: Renaming a function, class, method, or variable across the codebase. Safer than find-and-replace.
AFTER THIS: Run detect_changes() to verify no unexpected side effects.

Each edit is tagged with confidence:
- "graph": found via knowledge graph relationships (high confidence, safe to accept)
- "text_search": found via regex text search (lower confidence, review carefully)`,
    inputSchema: {
      type: 'object',
      properties: {
        symbol_name: { type: 'string', description: 'Current symbol name to rename' },
        symbol_uid: { type: 'string', description: 'Direct symbol UID from prior tool results (zero-ambiguity)' },
        new_name: { type: 'string', description: 'The new name for the symbol' },
        file_path: { type: 'string', description: 'File path to disambiguate common names' },
        dry_run: { type: 'boolean', description: 'Preview edits without modifying files (default: true)', default: true },
        repo: { type: 'string', description: 'Repository name or path. Omit if only one repo is indexed.' },
      },
      required: ['new_name'],
    },
  },
  {
    name: 'unity_ui_trace',
    description: `Resolve Unity UI evidence chains (query-time only, no graph writes).

Supports three goals:
- asset_refs: which prefab/asset points to a target UXML
- template_refs: which UXML templates are referenced by a target UXML
- selector_bindings: static C# selector bindings traced to USS selectors

Selector matching modes for selector_bindings:
- balanced (default): match class tokens inside composite selectors (higher recall)
- strict: only exact \`.className\` selectors (higher precision)

Output enforces unique-result policy and includes path+line evidence hops.`,
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Target C# class or UXML path' },
        goal: {
          type: 'string',
          enum: ['asset_refs', 'template_refs', 'selector_bindings'],
          description: 'Trace goal',
        },
        selector_mode: {
          type: 'string',
          enum: ['strict', 'balanced'],
          description: 'Selector matching mode for selector_bindings (default: balanced)',
        },
        repo: { type: 'string', description: 'Repository name or path. Omit if only one repo is indexed.' },
      },
      required: ['target', 'goal'],
    },
  },
  {
    name: 'impact',
    description: `Analyze the blast radius of changing a code symbol.
Returns affected symbols grouped by depth, plus risk assessment, affected execution flows, and affected modules.

WHEN TO USE: Before making code changes — especially refactoring, renaming, or modifying shared code. Shows what would break.
AFTER THIS: Review d=1 items (WILL BREAK). Use context() on high-risk symbols.

Output includes:
- risk: LOW / MEDIUM / HIGH / CRITICAL
- summary: direct callers, processes affected, modules affected
- affected_processes: which execution flows break and at which step
- affected_modules: which functional areas are hit (direct vs indirect)
- byDepth: all affected symbols grouped by traversal depth

Depth groups:
- d=1: WILL BREAK (direct callers/importers)
- d=2: LIKELY AFFECTED (indirect)
- d=3: MAY NEED TESTING (transitive)

EdgeType: CALLS, IMPORTS, EXTENDS, IMPLEMENTS, HAS_METHOD, OVERRIDES
Confidence: 1.0 = certain, <0.8 = fuzzy match`,
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Name of function, class, or file to analyze' },
        target_uid: { type: 'string', description: 'Optional exact symbol UID (preferred when target name is ambiguous)' },
        file_path: { type: 'string', description: 'Optional file path filter to disambiguate target name' },
        direction: { type: 'string', description: 'upstream (what depends on this) or downstream (what this depends on)' },
        maxDepth: { type: 'number', description: 'Max relationship depth (default: 3)', default: 3 },
        relationTypes: { type: 'array', items: { type: 'string' }, description: 'Filter: CALLS, IMPORTS, EXTENDS, IMPLEMENTS, HAS_METHOD, OVERRIDES (default: usage-based)' },
        includeTests: { type: 'boolean', description: 'Include test files (default: false)' },
        minConfidence: { type: 'number', description: 'Minimum confidence 0-1 (default: 0.3)' },
        repo: { type: 'string', description: 'Repository name or path. Omit if only one repo is indexed.' },
      },
      required: ['target', 'direction'],
    },
  },
];
