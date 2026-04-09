import path from 'node:path';

export type ResponseProfile = 'slim' | 'full';

export function resolveResponseProfile(value: unknown): ResponseProfile {
  return String(value || '').trim().toLowerCase() === 'full' ? 'full' : 'slim';
}

export function buildSlimQueryResult(
  full: Record<string, any>,
  input: { repoName?: string; queryText: string },
): Record<string, unknown> {
  const candidates = buildCandidates(full, {
    queryText: input.queryText,
  });
  const processHints = buildProcessHints(full.processes);
  const resourceHints = buildResourceHints(full.next_hops);
  const runtimePreview = buildRuntimePreview(full.runtime_claim);
  const suggestedContextTargets = buildSuggestedContextTargets({
    candidates,
    processHints,
  });
  const upgradeHints = buildUpgradeHints({
    mode: 'query',
    nextHops: full.next_hops,
    repoName: input.repoName,
    subject: input.queryText,
    suggestedContextTargets,
  });
  const missingProofTargets = buildMissingProofTargets({
    resourceHints,
    processHints,
    runtimeClaim: full.runtime_claim,
  });

  return {
    summary: chooseTopSummary({
      candidates,
      processHints,
      runtimePreview,
      fallback: String(candidates[0]?.name || 'no_match'),
    }),
    candidates,
    process_hints: processHints,
    resource_hints: resourceHints,
    decision: {
      primary_candidate: candidates[0]?.name || null,
      recommended_follow_up: chooseRecommendedFollowUp(upgradeHints),
      response_profile: 'slim',
    },
    missing_proof_targets: missingProofTargets,
    suggested_context_targets: suggestedContextTargets,
    fallback_candidates: candidates.slice(1, 4),
    upgrade_hints: upgradeHints,
    runtime_preview: runtimePreview,
  };
}

export function buildSlimContextResult(
  full: Record<string, any>,
  input: { repoName?: string; symbolName: string },
): Record<string, unknown> {
  const processHints = buildProcessHints(full.processes);
  const resourceHints = buildResourceHints(full.next_hops);
  const runtimePreview = buildRuntimePreview(full.runtime_claim);
  const suggestedContextTargets = buildSuggestedContextTargets({
    processHints,
    symbolName: input.symbolName,
    symbol: full.symbol,
  });
  const upgradeHints = buildUpgradeHints({
    mode: 'context',
    nextHops: full.next_hops,
    repoName: input.repoName,
    subject: input.symbolName,
    suggestedContextTargets,
  });
  const missingProofTargets = buildMissingProofTargets({
    resourceHints,
    processHints,
    runtimeClaim: full.runtime_claim,
  });

  return {
    summary: chooseTopSummary({
      processHints,
      runtimePreview,
      fallback: String(full?.symbol?.name || input.symbolName || 'no_match'),
    }),
    status: full.status,
    symbol: full.symbol,
    incoming: trimRelationBuckets(full.incoming),
    outgoing: trimRelationBuckets(full.outgoing),
    processes: processHints,
    resource_hints: resourceHints,
    missing_proof_targets: missingProofTargets,
    suggested_context_targets: suggestedContextTargets,
    verification_hint: Array.isArray(full.processes)
      ? full.processes.find((row: any) => row?.verification_hint)?.verification_hint
      : undefined,
    upgrade_hints: upgradeHints,
    runtime_preview: runtimePreview,
  };
}

function buildCandidates(
  full: Record<string, any>,
  input: { queryText: string },
): Array<Record<string, unknown>> {
  const rows = [
    ...(Array.isArray(full.process_symbols) ? full.process_symbols : []),
    ...(Array.isArray(full.definitions) ? full.definitions : []),
  ];
  const preferredResourceTargets = extractPreferredResourceTargets(full.next_hops);
  const seen = new Set<string>();
  const out: Array<{ score: number; index: number; candidate: Record<string, unknown> }> = [];
  for (const [index, row] of rows.entries()) {
    const key = String(row?.id || `${row?.name}:${row?.filePath || ''}`);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      score: scoreCandidateRow(row, {
        queryText: input.queryText,
        preferredResourceTargets,
      }),
      index,
      candidate: {
        id: row?.id,
        name: row?.name,
        kind: resolveCandidateKind(row),
        filePath: row?.filePath,
        module: row?.module,
      },
    });
  }
  return out
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .slice(0, 5)
    .map((entry) => entry.candidate);
}

function scoreCandidateRow(
  row: Record<string, any>,
  input: { queryText: string; preferredResourceTargets: string[] },
): number {
  const name = String(row?.name || '').trim();
  const filePath = String(row?.filePath || '').trim();
  const nameLower = name.toLowerCase();
  const queryLower = String(input.queryText || '').trim().toLowerCase();
  const fileBase = path.basename(filePath, path.extname(filePath)).toLowerCase();
  const kind = resolveCandidateKind(row);
  const exactLexicalMatch = Boolean(nameLower && queryLower.includes(nameLower));
  const fileBaseMatch = Boolean(fileBase && fileBase === nameLower);
  const kindBonus = (kind === 'Class' || kind === 'Interface' || kind === 'Struct') ? 8 : 0;
  const classAnchorBonus = (kind === 'Class' && exactLexicalMatch) ? 18 : 0;
  const lexicalBonus = exactLexicalMatch ? 80 : 0;
  const fileAffinityBonus = (exactLexicalMatch && fileBaseMatch) ? 14 : 0;
  const evidenceBonus = scoreEvidenceMode(String(row?.process_evidence_mode || ''));
  const confidenceBonus = scoreConfidence(String(row?.process_confidence || ''));
  const resourceAffinityBonus = hasPreferredResourceAffinity(row, input.preferredResourceTargets) ? 35 : 0;
  const heuristicLowPenalty = isLowConfidenceHeuristic(row) && !exactLexicalMatch ? 25 : 0;

  return lexicalBonus
    + fileAffinityBonus
    + kindBonus
    + classAnchorBonus
    + resourceAffinityBonus
    + evidenceBonus
    + confidenceBonus
    - heuristicLowPenalty;
}

function extractPreferredResourceTargets(nextHops: unknown): string[] {
  if (!Array.isArray(nextHops)) return [];
  const targets = new Set<string>();
  for (const hop of nextHops) {
    if (!hop || typeof hop !== 'object') continue;
    const kind = String((hop as Record<string, unknown>)?.kind || '').trim();
    if (kind !== 'resource' && kind !== 'verify') continue;
    const target = String((hop as Record<string, unknown>)?.target || '').trim();
    if (target) targets.add(target);
  }
  return [...targets];
}

function hasPreferredResourceAffinity(row: Record<string, any>, preferredResourceTargets: string[]): boolean {
  if (preferredResourceTargets.length === 0) return false;
  const bindings = Array.isArray(row?.resourceBindings) ? row.resourceBindings : [];
  const bindingSet = new Set(
    bindings
      .map((binding: any) => String(binding?.resourcePath || '').trim())
      .filter(Boolean),
  );
  return preferredResourceTargets.some((target) => bindingSet.has(target));
}

function isLowConfidenceHeuristic(row: Record<string, any>): boolean {
  return String(row?.process_evidence_mode || '').trim() === 'resource_heuristic'
    && String(row?.process_confidence || '').trim() === 'low';
}

function scoreEvidenceMode(value: string): number {
  const normalized = String(value || '').trim();
  if (normalized === 'direct_step') return 18;
  if (normalized === 'method_projected') return 10;
  if (normalized === 'resource_heuristic') return -12;
  return 0;
}

function scoreConfidence(value: string): number {
  const normalized = String(value || '').trim();
  if (normalized === 'high') return 18;
  if (normalized === 'medium') return 8;
  if (normalized === 'low') return -8;
  return 0;
}

function resolveCandidateKind(row: Record<string, any>): string | undefined {
  const explicit = String(row?.type || row?.kind || '').trim();
  if (explicit) return explicit;
  const id = String(row?.id || '').trim();
  if (!id.includes(':')) return undefined;
  return id.split(':', 1)[0] || undefined;
}

function buildProcessHints(processes: any): Array<Record<string, unknown>> {
  if (!Array.isArray(processes)) return [];
  const scored = processes.map((row: any, index: number) => {
    const hint = {
      id: row?.id,
      summary: row?.summary || row?.name,
      confidence: row?.confidence || row?.process_confidence,
      process_subtype: row?.process_subtype,
      evidence_mode: row?.evidence_mode || row?.process_evidence_mode,
      verification_hint: row?.verification_hint,
    };
    return {
      hint,
      index,
      score: scoreProcessHint(hint),
    };
  });
  return scored
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .slice(0, 5)
    .map((entry) => entry.hint);
}

function isLowConfidenceHeuristicProcessHint(hint: Record<string, unknown> | undefined): boolean {
  if (!hint) return false;
  return String(hint?.evidence_mode || '').trim() === 'resource_heuristic'
    && String(hint?.confidence || '').trim() === 'low';
}

function scoreProcessHint(hint: Record<string, unknown> | undefined): number {
  if (!hint) return Number.NEGATIVE_INFINITY;
  const evidenceMode = String(hint?.evidence_mode || '').trim();
  const confidence = String(hint?.confidence || '').trim();
  let score = 0;

  if (evidenceMode === 'direct_step') score += 60;
  else if (evidenceMode === 'method_projected') score += 40;
  else if (evidenceMode === 'resource_heuristic') score += 5;
  else score += 20;

  if (confidence === 'high') score += 20;
  else if (confidence === 'medium') score += 10;
  else if (confidence === 'low') score -= 10;

  if (evidenceMode === 'resource_heuristic' && confidence === 'low') score -= 20;
  return score;
}

function chooseTopSummary(input: {
  candidates?: Array<Record<string, unknown>>;
  processHints?: Array<Record<string, unknown>>;
  runtimePreview?: Record<string, unknown>;
  fallback: string;
}): string {
  const processHints = Array.isArray(input.processHints) ? input.processHints : [];
  const topProcess = processHints[0];
  const topProcessSummary = String(topProcess?.summary || '').trim();
  const topProcessScore = scoreProcessHint(topProcess);
  const candidateName = String(input.candidates?.[0]?.name || '').trim();
  const candidateScore = candidateName ? 45 : Number.NEGATIVE_INFINITY;

  if (topProcessSummary && !isLowConfidenceHeuristicProcessHint(topProcess) && topProcessScore >= candidateScore) {
    return topProcessSummary;
  }
  if (candidateName && candidateScore > topProcessScore) {
    return candidateName;
  }
  if (topProcessSummary) {
    return topProcessSummary;
  }
  const runtimeStatus = String(input.runtimePreview?.status || '').trim();
  if (runtimeStatus) {
    return runtimeStatus;
  }
  return input.fallback;
}

function buildResourceHints(nextHops: any): Array<Record<string, unknown>> {
  if (!Array.isArray(nextHops)) return [];
  return nextHops
    .filter((hop: any) => hop?.kind === 'resource' || hop?.kind === 'verify')
    .slice(0, 5)
    .map((hop: any) => ({
      kind: hop.kind,
      target: hop.target,
      why: hop.why,
      next_command: hop.next_command,
    }));
}

function buildUpgradeHints(input: {
  mode: 'query' | 'context';
  nextHops: any;
  repoName?: string;
  subject: string;
  suggestedContextTargets?: Array<Record<string, unknown>>;
}): Array<Record<string, unknown>> {
  const repoArg = input.repoName ? ` --repo "${input.repoName}"` : '';
  const subject = String(input.subject || '').trim();
  const fullCommand = input.mode === 'query'
    ? `gitnexus query${repoArg} --response-profile full "${subject}"`
    : `gitnexus context${repoArg} --response-profile full "${subject}"`;

  const hints: Array<Record<string, unknown>> = [];

  if (Array.isArray(input.nextHops)) {
    for (const hop of input.nextHops.slice(0, 4)) {
      const paramDelta = inferParamDelta(hop);
      hints.push({
        kind: hop.kind,
        target: hop.target,
        why: hop.why,
        param_delta: paramDelta,
        next_command: resolveNarrowNextCommand({
          mode: input.mode,
          repoArg,
          subject,
          hop,
          paramDelta,
        }),
      });
    }
  }

  if (Array.isArray(input.suggestedContextTargets)) {
    for (const target of input.suggestedContextTargets.slice(0, 3)) {
      const uid = String(target?.uid || '').trim();
      if (!uid) continue;
      const filePath = String(target?.filePath || '').trim();
      hints.push({
        kind: 'symbol',
        target: target?.name,
        why: target?.why || 'Use the exact symbol UID to avoid same-name ambiguity.',
        param_delta: `uid=${uid}`,
        next_command: `gitnexus context${repoArg} --uid "${uid}"${filePath ? ` --file "${filePath}"` : ''}`,
      });
    }
  }

  hints.push({
    kind: 'full',
    target: input.mode,
    why: 'Expand back to the legacy heavy payload when deeper evidence is required.',
    param_delta: 'response_profile=full',
    next_command: fullCommand,
  });

  return hints;
}

function inferParamDelta(hop: any): string {
  if (hop?.kind === 'resource' && hop?.target) {
    return `resource_path_prefix=${hop.target}`;
  }
  if (hop?.kind === 'symbol' && hop?.target) {
    return `name=${hop.target}`;
  }
  return 'follow_next_hop';
}

function resolveNarrowNextCommand(input: {
  mode: 'query' | 'context';
  repoArg: string;
  subject: string;
  hop: any;
  paramDelta: string;
}): string | null {
  if (input.paramDelta.startsWith('resource_path_prefix=')) {
    const target = String(input.hop?.target || '').trim();
    if (!target) return input.hop?.next_command || null;
    return `gitnexus query${input.repoArg} "${input.subject}" # resource_path_prefix=${target}`;
  }
  if (input.paramDelta.startsWith('name=')) {
    const target = String(input.hop?.target || '').trim();
    if (!target) return input.hop?.next_command || null;
    return `gitnexus context${input.repoArg} "${target}"`;
  }
  return input.hop?.next_command || null;
}

function chooseRecommendedFollowUp(upgradeHints: Array<Record<string, unknown>>): string | null {
  if (!Array.isArray(upgradeHints) || upgradeHints.length === 0) {
    return null;
  }
  const ranked = upgradeHints
    .filter((hint) => hint?.kind !== 'full')
    .map((hint, index) => ({
      hint,
      index,
      score: scoreRecommendedFollowUpHint(hint),
    }))
    .filter((entry) => entry.score > Number.NEGATIVE_INFINITY)
    .sort((a, b) => (b.score - a.score) || (a.index - b.index));
  const selected = ranked[0]?.hint;
  if (selected) {
    return String(selected.param_delta || selected.next_command || '') || null;
  }
  return String(upgradeHints[0]?.next_command || upgradeHints[0]?.param_delta || '') || null;
}

function scoreRecommendedFollowUpHint(hint: Record<string, unknown>): number {
  const paramDelta = String(hint?.param_delta || '').trim();
  const nextCommand = String(hint?.next_command || '').trim();
  if (paramDelta.startsWith('resource_path_prefix=')) return 40;
  if (paramDelta.startsWith('uid=')) return 30;
  if (paramDelta.startsWith('name=')) return 20;
  if (paramDelta === 'follow_next_hop') return Number.NEGATIVE_INFINITY;
  if (nextCommand) return 5;
  return Number.NEGATIVE_INFINITY;
}

function buildMissingProofTargets(input: {
  resourceHints: Array<Record<string, unknown>>;
  processHints: Array<Record<string, unknown>>;
  runtimeClaim: any;
}): string[] {
  const targets = new Set<string>();
  for (const hint of input.resourceHints) {
    if (typeof hint.target === 'string' && hint.target.trim()) {
      targets.add(`resource:${hint.target.trim()}`);
    }
  }
  for (const process of input.processHints) {
    const verification = process?.verification_hint as Record<string, unknown> | undefined;
    const target = typeof verification?.target === 'string' ? verification.target.trim() : '';
    if (target) {
      targets.add(`symbol:${target}`);
    }
  }
  const runtimeReason = String(input.runtimeClaim?.reason || '');
  if (runtimeReason.includes('evidence_missing')) {
    targets.add('telemetry:evidence_rows');
  }
  return [...targets].slice(0, 5);
}

function buildSuggestedContextTargets(input: {
  candidates?: Array<Record<string, unknown>>;
  processHints: Array<Record<string, unknown>>;
  symbolName?: string;
  symbol?: Record<string, unknown>;
}): Array<Record<string, unknown>> {
  const targets = new Map<string, Record<string, unknown>>();
  const addTarget = (target: Record<string, unknown>) => {
    const name = String(target.name || '').trim();
    if (!name) return;
    const uid = String(target.uid || '').trim();
    const filePath = String(target.filePath || '').trim();
    const key = uid || `${name}:${filePath}`;
    if (!key || targets.has(key)) return;
    targets.set(key, {
      name,
      ...(uid ? { uid } : {}),
      ...(filePath ? { filePath } : {}),
      why: target.why,
    });
  };
  if (Array.isArray(input.candidates)) {
    for (const candidate of input.candidates) {
      addTarget({
        name: candidate?.name,
        uid: candidate?.id,
        filePath: candidate?.filePath,
        why: 'Query returned this ranked symbol candidate for direct context disambiguation.',
      });
    }
  }
  if (input.symbol && typeof input.symbol === 'object') {
    addTarget({
      name: input.symbol.name,
      uid: input.symbol.uid,
      filePath: input.symbol.filePath,
      why: 'Current context symbol can be revisited via exact UID to avoid same-name ambiguity.',
    });
  }
  for (const process of input.processHints) {
    const verification = process?.verification_hint as Record<string, unknown> | undefined;
    const target = typeof verification?.target === 'string' ? verification.target.trim() : '';
    if (target) {
      addTarget({
        name: target,
        why: 'Verification guidance references this symbol as the next disambiguation target.',
      });
    }
  }
  if (input.symbolName?.trim()) {
    addTarget({
      name: input.symbolName.trim(),
      why: 'Current symbol name remains available as a fallback context target.',
    });
  }
  return [...targets.values()].slice(0, 5);
}

function buildRuntimePreview(runtimeClaim: any): Record<string, unknown> | undefined {
  if (!runtimeClaim || typeof runtimeClaim !== 'object') return undefined;
  return {
    status: runtimeClaim.status,
    evidence_level: runtimeClaim.evidence_level,
    reason: runtimeClaim.reason,
    next_action: runtimeClaim.next_action,
  };
}

function trimRelationBuckets(buckets: any): Record<string, Array<Record<string, unknown>>> {
  if (!buckets || typeof buckets !== 'object') return {};
  const out: Record<string, Array<Record<string, unknown>>> = {};
  for (const [key, rows] of Object.entries(buckets)) {
    if (!Array.isArray(rows)) continue;
    out[key] = rows.slice(0, 10).map((row: any) => ({
      uid: row?.uid,
      name: row?.name,
      filePath: row?.filePath,
      kind: row?.kind,
    }));
  }
  return out;
}
