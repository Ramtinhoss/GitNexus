export type ResponseProfile = 'slim' | 'full';

export function resolveResponseProfile(value: unknown): ResponseProfile {
  return String(value || '').trim().toLowerCase() === 'full' ? 'full' : 'slim';
}

export function buildSlimQueryResult(
  full: Record<string, any>,
  input: { repoName?: string; queryText: string },
): Record<string, unknown> {
  const candidates = buildCandidates(full);
  const processHints = buildProcessHints(full.processes);
  const resourceHints = buildResourceHints(full.next_hops);
  const upgradeHints = buildUpgradeHints({
    mode: 'query',
    nextHops: full.next_hops,
    repoName: input.repoName,
    subject: input.queryText,
  });
  const suggestedContextTargets = buildSuggestedContextTargets({
    candidates,
    processHints,
  });
  const missingProofTargets = buildMissingProofTargets({
    resourceHints,
    processHints,
    runtimeClaim: full.runtime_claim,
  });

  return {
    summary:
      processHints[0]?.summary
      || candidates[0]?.name
      || 'no_match',
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
    runtime_preview: buildRuntimePreview(full.runtime_claim),
  };
}

export function buildSlimContextResult(
  full: Record<string, any>,
  input: { repoName?: string; symbolName: string },
): Record<string, unknown> {
  const processHints = buildProcessHints(full.processes);
  const resourceHints = buildResourceHints(full.next_hops);
  const upgradeHints = buildUpgradeHints({
    mode: 'context',
    nextHops: full.next_hops,
    repoName: input.repoName,
    subject: input.symbolName,
  });
  const missingProofTargets = buildMissingProofTargets({
    resourceHints,
    processHints,
    runtimeClaim: full.runtime_claim,
  });
  const suggestedContextTargets = buildSuggestedContextTargets({
    processHints,
    symbolName: input.symbolName,
  });

  return {
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
    runtime_preview: buildRuntimePreview(full.runtime_claim),
  };
}

function buildCandidates(full: Record<string, any>): Array<Record<string, unknown>> {
  const rows = [
    ...(Array.isArray(full.process_symbols) ? full.process_symbols : []),
    ...(Array.isArray(full.definitions) ? full.definitions : []),
  ];
  const seen = new Set<string>();
  const out: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const key = String(row?.id || `${row?.name}:${row?.filePath || ''}`);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: row?.id,
      name: row?.name,
      kind: row?.type,
      filePath: row?.filePath,
      module: row?.module,
    });
    if (out.length >= 5) break;
  }
  return out;
}

function buildProcessHints(processes: any): Array<Record<string, unknown>> {
  if (!Array.isArray(processes)) return [];
  return processes.slice(0, 5).map((row: any) => ({
    id: row?.id,
    summary: row?.summary || row?.name,
    confidence: row?.confidence,
    process_subtype: row?.process_subtype,
    verification_hint: row?.verification_hint,
  }));
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
  const nonFullHint = upgradeHints.find((hint) => hint?.kind !== 'full');
  if (!nonFullHint) {
    return String(upgradeHints[0]?.next_command || upgradeHints[0]?.param_delta || '') || null;
  }
  return String(nonFullHint.param_delta || nonFullHint.next_command || '') || null;
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
}): string[] {
  const targets = new Set<string>();
  if (Array.isArray(input.candidates)) {
    for (const candidate of input.candidates) {
      if (typeof candidate?.name === 'string' && candidate.name.trim()) {
        targets.add(candidate.name.trim());
      }
    }
  }
  for (const process of input.processHints) {
    const verification = process?.verification_hint as Record<string, unknown> | undefined;
    const target = typeof verification?.target === 'string' ? verification.target.trim() : '';
    if (target) {
      targets.add(target);
    }
  }
  if (input.symbolName?.trim()) {
    targets.add(input.symbolName.trim());
  }
  return [...targets].slice(0, 5);
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
