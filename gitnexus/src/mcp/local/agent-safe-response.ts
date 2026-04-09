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
      recommended_follow_up: upgradeHints[0]?.next_command || null,
      response_profile: 'slim',
    },
    fallback_candidates: candidates.slice(1, 4),
    upgrade_hints: upgradeHints,
    runtime_preview: buildRuntimePreview(full.runtime_claim),
  };
}

export function buildSlimContextResult(
  full: Record<string, any>,
  input: { repoName?: string; symbolName: string },
): Record<string, unknown> {
  return {
    status: full.status,
    symbol: full.symbol,
    incoming: trimRelationBuckets(full.incoming),
    outgoing: trimRelationBuckets(full.outgoing),
    processes: buildProcessHints(full.processes),
    resource_hints: buildResourceHints(full.next_hops),
    verification_hint: Array.isArray(full.processes)
      ? full.processes.find((row: any) => row?.verification_hint)?.verification_hint
      : undefined,
    upgrade_hints: buildUpgradeHints({
      mode: 'context',
      nextHops: full.next_hops,
      repoName: input.repoName,
      subject: input.symbolName,
    }),
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

  const hints: Array<Record<string, unknown>> = [{
    kind: 'full',
    target: input.mode,
    why: 'Expand back to the legacy heavy payload when deeper evidence is required.',
    param_delta: 'response_profile=full',
    next_command: fullCommand,
  }];

  if (Array.isArray(input.nextHops)) {
    for (const hop of input.nextHops.slice(0, 4)) {
      hints.push({
        kind: hop.kind,
        target: hop.target,
        why: hop.why,
        param_delta: inferParamDelta(hop),
        next_command: hop.next_command,
      });
    }
  }

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
