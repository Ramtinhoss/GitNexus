export interface FallbackInsertStats {
  attempted: number;
  succeeded: number;
  failed: number;
}

export interface ReplayFallbackInsert {
  fromId: string;
  toId: string;
  fromLabel: string;
  toLabel: string;
  relType: string;
  confidence: number;
  reason: string;
  step: number;
}

export interface ReplayFallbackOptions {
  validTables: Set<string>;
  getNodeLabel: (id: string) => string;
  insertRelationship: (input: ReplayFallbackInsert) => Promise<void>;
}

const FALLBACK_REL_LINE_RE = /"([^"]*)","([^"]*)","([^"]*)",([0-9.]+),"([^"]*)",([0-9-]+)/;

export async function replayFallbackRelationships(
  validRelLines: string[],
  options: ReplayFallbackOptions,
): Promise<FallbackInsertStats> {
  const stats: FallbackInsertStats = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
  };

  for (let i = 1; i < validRelLines.length; i++) {
    const line = validRelLines[i];
    const match = line.match(FALLBACK_REL_LINE_RE);
    if (!match) {
      continue;
    }

    const [, fromId, toId, relType, confidenceStr, reason, stepStr] = match;
    const fromLabel = options.getNodeLabel(fromId);
    const toLabel = options.getNodeLabel(toId);
    if (!options.validTables.has(fromLabel) || !options.validTables.has(toLabel)) {
      continue;
    }

    stats.attempted += 1;

    try {
      await options.insertRelationship({
        fromId,
        toId,
        fromLabel,
        toLabel,
        relType,
        confidence: Number.parseFloat(confidenceStr) || 1.0,
        reason,
        step: Number.parseInt(stepStr, 10) || 0,
      });
      stats.succeeded += 1;
    } catch {
      stats.failed += 1;
    }
  }

  return stats;
}
