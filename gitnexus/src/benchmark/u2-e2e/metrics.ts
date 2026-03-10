export interface StepMetric {
  stepId: string;
  tool: string;
  durationMs: number;
  inputChars: number;
  outputChars: number;
  inputTokensEst: number;
  outputTokensEst: number;
  totalTokensEst: number;
}

export interface DurationSummary {
  count: number;
  minMs: number;
  maxMs: number;
  meanMs: number;
  medianMs: number;
  spreadMs: number;
}

function round1(value: number): number {
  return Number(value.toFixed(1));
}

export function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 4);
}

export function summarizeDurations(values: number[]): DurationSummary {
  if (values.length === 0) {
    return {
      count: 0,
      minMs: 0,
      maxMs: 0,
      meanMs: 0,
      medianMs: 0,
      spreadMs: 0,
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;

  return {
    count: sorted.length,
    minMs: round1(min),
    maxMs: round1(max),
    meanMs: round1(mean),
    medianMs: round1(median),
    spreadMs: round1(max - min),
  };
}
