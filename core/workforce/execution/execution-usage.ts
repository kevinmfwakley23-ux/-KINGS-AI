export interface ExecutionUsage {
  elapsedMs: number;
  tokensUsed: number;
  iterationsUsed: number;
  estimatedCost?: number;
}
