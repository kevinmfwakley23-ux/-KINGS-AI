import type { ModelExecutionRequest } from "./model-interface";

export type ModelTaskComplexityTier = "simple" | "medium" | "complex" | "reasoning";

export interface ModelTaskComplexityDecision {
  tier: ModelTaskComplexityTier;
  score: number;
  estimatedInputTokens: number;
  signals: string[];
}

export class ModelTaskComplexityClassifier {
  classify(request: ModelExecutionRequest): ModelTaskComplexityDecision {
    const userText = request.messages
      .filter((message) => message.role === "user")
      .map((message) => message.content)
      .join("\n")
      .trim();
    const lower = userText.toLowerCase();
    const estimatedInputTokens = Math.ceil(userText.length / 4);
    let score = 0;
    const signals: string[] = [];

    if (estimatedInputTokens > 2_000) {
      score += 0.22;
      signals.push("large user context");
    } else if (estimatedInputTokens > 600) {
      score += 0.12;
      signals.push("moderate user context");
    } else if (estimatedInputTokens > 150) {
      score += 0.05;
      signals.push("non-trivial user context");
    }

    const codePattern = /```|\b(function|class|interface|typescript|javascript|python|rust|java|kotlin|sql|compile|debug|refactor|repository|git|api|database|docker|kubernetes)\b/i;
    if (codePattern.test(userText) || request.requiredCapabilities.includes("coding") || request.requiredCapabilities.includes("debugging")) {
      score += 0.24;
      signals.push("coding or debugging work");
    }

    const reasoningPattern = /\b(analy[sz]e|evaluate|trade-?off|architecture|root cause|reason about|compare approaches|prove|derive|optimi[sz]e|design)\b/i;
    if (reasoningPattern.test(userText) || request.requiredCapabilities.includes("planning") || request.requiredCapabilities.includes("verification")) {
      score += 0.24;
      signals.push("reasoning or verification work");
    }

    const technicalPattern = /\b(concurrency|distributed|transaction|invariant|authorization|telemetry|orchestration|retrieval|embedding|circuit breaker|rate limit|latency|throughput|token budget)\b/i;
    if (technicalPattern.test(userText)) {
      score += 0.15;
      signals.push("specialized technical concepts");
    }

    const multiStepPattern = /(^|\n)\s*(\d+[.)]|[-*])\s+|\b(first|then|after that|finally|next step|multiple steps|end to end)\b/i;
    if (multiStepPattern.test(userText)) {
      score += 0.1;
      signals.push("multi-step task");
    }

    const questionCount = (userText.match(/\?/g) ?? []).length;
    if (questionCount >= 3) {
      score += 0.05;
      signals.push("multiple questions");
    }

    if ((request.maxOutputTokens ?? 0) > 4_000) {
      score += 0.08;
      signals.push("large requested output budget");
    }

    const simplePattern = /^(hi|hello|thanks|thank you|define\b|what is\b|who is\b|when is\b|where is\b)/i;
    if (simplePattern.test(lower) && estimatedInputTokens < 80) {
      score -= 0.18;
      signals.push("short simple request");
    }

    score = Math.max(0, Math.min(1, Number(score.toFixed(4))));
    const tier: ModelTaskComplexityTier = score < 0.15
      ? "simple"
      : score < 0.35
        ? "medium"
        : score < 0.6
          ? "complex"
          : "reasoning";

    return { tier, score, estimatedInputTokens, signals };
  }
}
