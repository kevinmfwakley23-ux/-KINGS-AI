import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, OutgoingHttpHeaders } from "node:http";

const OWNER_COOKIE = "kings_owner_token";
const MIN_OWNER_TOKEN_LENGTH = 24;

export interface OwnerHttpAuthConfig {
  bindHost: string;
  token?: string;
}

export interface OwnerHttpAuthState {
  required: boolean;
  token?: string;
}

export function isLoopbackBindHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "localhost";
}

export function createOwnerHttpAuthState(
  config: OwnerHttpAuthConfig,
): OwnerHttpAuthState {
  const token = config.token?.trim();
  const required = !isLoopbackBindHost(config.bindHost);

  if (required && (!token || token.length < MIN_OWNER_TOKEN_LENGTH)) {
    throw new Error(
      `K.I.N.G.S. Owner HTTP: non-loopback bind ${config.bindHost} requires KINGS_OWNER_TOKEN with at least ${MIN_OWNER_TOKEN_LENGTH} characters. Refusing unauthenticated LAN code-execution exposure.`,
    );
  }

  return {
    required,
    token: token || undefined,
  };
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function cookieToken(request: IncomingMessage): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== OWNER_COOKIE) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function bearerToken(request: IncomingMessage): string | undefined {
  const authorization = request.headers.authorization?.trim();
  if (!authorization) return undefined;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

function explicitHeaderToken(request: IncomingMessage): string | undefined {
  const value = request.headers["x-kings-owner-token"];
  if (Array.isArray(value)) return value[0]?.trim() || undefined;
  return value?.trim() || undefined;
}

export function isOwnerRequestAuthorized(
  request: IncomingMessage,
  state: OwnerHttpAuthState,
): boolean {
  if (!state.required) return true;
  if (!state.token) return false;

  const supplied =
    bearerToken(request) ??
    explicitHeaderToken(request) ??
    cookieToken(request);
  return Boolean(supplied && safeEqual(supplied, state.token));
}

export function pairingTokenFromUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const url = new URL(rawUrl, "http://kings.local");
    return url.searchParams.get("token")?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function pairingPathFromUrl(rawUrl: string | undefined): string {
  if (!rawUrl) return "/";
  try {
    const url = new URL(rawUrl, "http://kings.local");
    return url.pathname || "/";
  } catch {
    return "/";
  }
}

export function authorizePairingToken(
  supplied: string | undefined,
  state: OwnerHttpAuthState,
): boolean {
  if (!state.required) return true;
  return Boolean(
    supplied && state.token && safeEqual(supplied, state.token),
  );
}

export function ownerPairingCookieHeaders(input: {
  token: string;
  secure?: boolean;
}): OutgoingHttpHeaders {
  const attributes = [
    `${OWNER_COOKIE}=${encodeURIComponent(input.token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=2592000",
  ];
  if (input.secure) attributes.push("Secure");

  return {
    "set-cookie": attributes.join("; "),
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
  };
}

export function protectedApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/") || pathname === "/ready";
}
