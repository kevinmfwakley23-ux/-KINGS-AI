export interface SecretRedactionResult {
  value: string;
  redactions: number;
}

const CREDENTIAL_PATTERNS: readonly RegExp[] = [
  /\b(sk-(?:proj-)?[A-Za-z0-9_-]{12,})\b/g,
  /\b(gh[pousr]_[A-Za-z0-9_]{20,})\b/g,
  /\b(github_pat_[A-Za-z0-9_]{20,})\b/g,
  /\b(AIza[A-Za-z0-9_-]{20,})\b/g,
  /\b(Bearer\s+)([A-Za-z0-9._~+\/-]{12,})\b/gi,
  /(["']?(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)["']?\s*[:=]\s*["']?)([^\s,"'}]{8,})/gi,
];

function literalPattern(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "g");
}

export function discoverProcessSecretValues(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const names = /(?:SECRET|TOKEN|PASSWORD|PASSWD|API[_-]?KEY|PRIVATE[_-]?KEY|CREDENTIAL|AUTH)/i;
  return Array.from(new Set(
    Object.entries(env)
      .filter(([name, value]) => names.test(name) && typeof value === "string")
      .map(([, value]) => value!.trim())
      .filter((value) => value.length >= 8),
  )).sort((left, right) => right.length - left.length);
}

export function redactSecrets(
  input: string,
  secretValues: readonly string[] = [],
): SecretRedactionResult {
  let value = input;
  let redactions = 0;

  for (const secret of Array.from(new Set(secretValues))) {
    const normalized = secret.trim();
    if (normalized.length < 8) continue;
    value = value.replace(literalPattern(normalized), () => {
      redactions += 1;
      return "[REDACTED_SECRET]";
    });
  }

  for (const pattern of CREDENTIAL_PATTERNS) {
    pattern.lastIndex = 0;
    value = value.replace(pattern, (...args: unknown[]) => {
      redactions += 1;
      const match = String(args[0] ?? "");
      if (/^Bearer\s+/i.test(match)) {
        return `${match.match(/^Bearer\s+/i)?.[0] ?? "Bearer "}[REDACTED_SECRET]`;
      }
      const prefix = args[1];
      if (
        typeof prefix === "string" &&
        /(?:key|token|password|secret)/i.test(prefix)
      ) {
        return `${prefix}[REDACTED_SECRET]`;
      }
      return "[REDACTED_SECRET]";
    });
  }

  return { value, redactions };
}
