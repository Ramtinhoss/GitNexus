export function buildAnalyzeMemoryReport(input: any) {
  return {
    capturedAt: new Date().toISOString(),
    summary: {
      analyzeRealSec: input.analyze.realSec,
      analyzeMaxRssBytes: input.analyze.maxRssBytes,
      coldResourceBindings: input.queryCold.resourceBindings,
      warmResourceBindings: input.queryWarm.resourceBindings,
    },
    input,
  };
}
