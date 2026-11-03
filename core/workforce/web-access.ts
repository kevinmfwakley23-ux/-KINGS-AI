import {
  lookup,
} from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";

import type {
  ID,
} from "./types";

import type {
  ToolAdapter,
  ToolExecutionRequest,
} from "./tool-gateway";

export const WEB_ACCESS_TOOL_ID =
  "tool-web-access";

export interface WebAccessPolicy {
  allowedHosts?: string[];
  allowedMethods: string[];
  allowedSchemes: string[];
  maxResponseBytes: number;
  timeoutMs: number;
  maxRedirects: number;
  blockPrivateNetworks: boolean;
}

export interface WebAccessRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
}

export interface WebAccessResult {
  url: string;
  finalUrl: string;
  status: number;
  statusText: string;
  contentType: string;
  content: string;
  contentLengthBytes: number;
  fetchedAt: string;
}

export interface WebAccessHostResolver {
  resolve(
    hostname: string,
  ): Promise<string[]>;
}

export interface WebAccessResponse {
  status: number;
  statusText: string;
  url: string;
  headers: {
    get(
      name: string,
    ): string | null;
  };
  body?: {
    getReader(): {
      read(): Promise<{
        done: boolean;
        value?: Uint8Array;
      }>;
      cancel(): Promise<void>;
      releaseLock(): void;
    };
  };
}

export type WebAccessFetcher = (
  url: string,
  options: {
    method: string;
    headers?: Record<string, string>;
    redirect: "manual";
    signal: AbortSignal;
    validatedAddresses: string[];
  },
) => Promise<WebAccessResponse>;

/**
 * Connect to the IP address that passed the policy check, rather than letting
 * fetch resolve the hostname a second time (DNS rebinding / TOCTOU SSRF).
 * TLS SNI and certificate hostname verification still use the original host.
 * Never use the process-wide connection pool for an owner research request.
 */
async function pinnedWebFetch(
  rawUrl: string,
  options: Parameters<WebAccessFetcher>[1],
): Promise<WebAccessResponse> {
  const original = new URL(rawUrl);
  const address = options.validatedAddresses[0];
  const family = isIP(address ?? "");
  if (!family) throw new WebAccessPolicyError("no validated IP address for outbound connection");
  const pinned = new URL(rawUrl);
  pinned.hostname = family === 6 ? `[${address}]` : address;
  const headers = { ...options.headers, host: original.host };
  // Reject a caller's Host override by always setting it from the URL.
  const requestFn = original.protocol === "https:" ? httpsRequest : httpRequest;
  const hostname = original.hostname.startsWith("[") ? original.hostname.slice(1, -1) : original.hostname;
  return await new Promise<WebAccessResponse>((resolve, reject) => {
    const request = requestFn(pinned, {
      method: options.method,
      headers,
      agent: false,
      signal: options.signal,
      ...(original.protocol === "https:" && isIP(hostname) === 0
        ? { servername: hostname }
        : {}),
    }, (response) => {
      resolve({
        status: response.statusCode ?? 0,
        statusText: response.statusMessage ?? "",
        url: original.toString(),
        headers: {
          get(name: string) {
            const value = response.headers[name.toLowerCase()];
            return Array.isArray(value) ? value.join(", ") : value ?? null;
          },
        },
        body: Readable.toWeb(response) as unknown as WebAccessResponse["body"],
      });
    });
    request.once("error", reject);
    request.end();
  });
}

export class NodeWebAccessHostResolver
  implements WebAccessHostResolver {
  async resolve(
    hostname: string,
  ): Promise<string[]> {
    const addresses =
      await lookup(
        hostname,
        {
          all: true,
        },
      );

    return addresses.map(
      (
        address,
      ) =>
        address.address,
    );
  }
}

export class WebAccessPolicyError
  extends Error {
  constructor(
    message: string,
  ) {
    super(
      `K.I.N.G.S. Web Access: ${message}`,
    );

    this.name =
      "WebAccessPolicyError";
  }
}

function ipv4ToNumber(
  value: string,
): number {
  return value
    .split(".")
    .map(Number)
    .reduce(
      (
        result,
        octet,
      ) =>
        result * 256 +
        octet,
      0,
    );
}

function ipv4InRange(
  value: string,
  start: string,
  end: string,
): boolean {
  const numeric =
    ipv4ToNumber(
      value,
    );

  return (
    numeric >=
      ipv4ToNumber(
        start,
      ) &&
    numeric <=
      ipv4ToNumber(
        end,
      )
  );
}

function isBlockedIPv4(
  address: string,
): boolean {
  return (
    ipv4InRange(
      address,
      "10.0.0.0",
      "10.255.255.255",
    ) ||
    ipv4InRange(
      address,
      "100.64.0.0",
      "100.127.255.255",
    ) ||
    ipv4InRange(
      address,
      "172.16.0.0",
      "172.31.255.255",
    ) ||
    ipv4InRange(
      address,
      "192.168.0.0",
      "192.168.255.255",
    ) ||
    ipv4InRange(
      address,
      "127.0.0.0",
      "127.255.255.255",
    ) ||
    ipv4InRange(
      address,
      "169.254.0.0",
      "169.254.255.255",
    ) ||
    ipv4InRange(
      address,
      "0.0.0.0",
      "0.255.255.255",
    ) ||
    ipv4InRange(
      address,
      "192.0.0.0",
      "192.0.0.255",
    ) ||
    ipv4InRange(
      address,
      "192.0.2.0",
      "192.0.2.255",
    ) ||
    ipv4InRange(
      address,
      "198.18.0.0",
      "198.19.255.255",
    ) ||
    ipv4InRange(
      address,
      "198.51.100.0",
      "198.51.100.255",
    ) ||
    ipv4InRange(
      address,
      "203.0.113.0",
      "203.0.113.255",
    ) ||
    ipv4InRange(
      address,
      "224.0.0.0",
      "255.255.255.255",
    )
  );
}

function isBlockedIPv6(
  address: string,
): boolean {
  const normalized =
    address
      .toLowerCase()
      .replace(
        /^\[|\]$/g,
        "",
      );

  // Fail closed for non-global-unicast IPv6, including IPv4-mapped,
  // link-local, unique-local, NAT64 and other translation/tunnel prefixes.
  // IPv4-mapped addresses can otherwise smuggle 127.0.0.1 or 169.254/16.
  const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
  if (!(first >= 0x2000 && first <= 0x3fff)) return true;
  // 6to4, Teredo and documentation addresses are not ordinary public hosts.
  const second = Number.parseInt(normalized.split(":")[1] || "0", 16);
  return first === 0x2002 ||
    (first === 0x2001 && (second === 0 || second === 0xdb8));
}

function isBlockedAddress(
  address: string,
): boolean {
  const family = isIP(address);
  if (family === 4) return isBlockedIPv4(address);
  if (family === 6) return isBlockedIPv6(address);
  // Invalid resolver output must never be treated as a public address.
  return true;
}

function normalizeHost(
  hostname: string,
): string {
  return hostname
    .toLowerCase()
    .replace(
      /\.$/,
      "",
    );
}

function hostMatches(
  hostname: string,
  allowedHost: string,
): boolean {
  const host =
    normalizeHost(
      hostname,
    );

  const allowed =
    normalizeHost(
      allowedHost,
    );

  return (
    host === allowed ||
    host.endsWith(
      `.${allowed}`,
    )
  );
}

export class WebAccessAdapter
  implements ToolAdapter {
  readonly toolId =
    WEB_ACCESS_TOOL_ID;

  private readonly resolver:
    WebAccessHostResolver;

  private readonly fetcher:
    WebAccessFetcher;

  constructor(
    private readonly policy:
      WebAccessPolicy,
    resolver?:
      WebAccessHostResolver,
    fetcher?:
      WebAccessFetcher,
  ) {
    if (
      policy.allowedMethods.length ===
        0
    ) {
      throw new Error(
        "K.I.N.G.S. Web Access: at least one HTTP method must be allowed",
      );
    }

    if (
      policy.allowedSchemes.length ===
        0
    ) {
      throw new Error(
        "K.I.N.G.S. Web Access: at least one URL scheme must be allowed",
      );
    }

    if (
      policy.maxResponseBytes <
        1
    ) {
      throw new Error(
        "K.I.N.G.S. Web Access: maxResponseBytes must be at least 1",
      );
    }

    if (
      policy.timeoutMs <
        1
    ) {
      throw new Error(
        "K.I.N.G.S. Web Access: timeoutMs must be at least 1",
      );
    }

    if (
      policy.maxRedirects !==
        0
    ) {
      throw new Error(
        "K.I.N.G.S. Web Access: automatic redirects must remain disabled",
      );
    }

    this.resolver =
      resolver ??
      new NodeWebAccessHostResolver();

    this.fetcher = fetcher ?? pinnedWebFetch;
  }

  async execute(
    request:
      ToolExecutionRequest,
  ): Promise<unknown> {
    const input =
      this.parseRequest(
        request,
      );

    const { url, addresses } =
      await this.validateUrl(
        input.url,
      );

    const method =
      (
        input.method ??
        "GET"
      ).toUpperCase();

    if (
      !this.policy.allowedMethods
        .map(
          (
            item,
          ) =>
            item.toUpperCase(),
        )
        .includes(
          method,
        )
    ) {
      throw new WebAccessPolicyError(
        `HTTP method "${method}" is not authorized`,
      );
    }

    // Owner research must not forward application credentials or caller-selected
    // routing headers to an arbitrary public research destination.
    const forbiddenHeaders = new Set([
      "authorization", "proxy-authorization", "cookie", "cookie2",
      "host", "forwarded", "x-forwarded-for", "x-forwarded-host",
      "x-forwarded-proto", "proxy-connection",
    ]);
    for (const [name, value] of Object.entries(input.headers ?? {})) {
      if (forbiddenHeaders.has(name.toLowerCase())) {
        throw new WebAccessPolicyError(
          `request header "${name}" is not permitted for public research`,
        );
      }
      if (typeof value !== "string") {
        throw new WebAccessPolicyError(
          `request header "${name}" must be a string`,
        );
      }
    }

    const response =
      await this.fetcher(
        url.toString(),
        {
          method,
          headers:
            input.headers,
          redirect:
            "manual",
          signal:
            AbortSignal.timeout(
              this.policy
                .timeoutMs,
            ),
          validatedAddresses: addresses,
        },
      );

    if (
      response.status >=
        300 &&
      response.status <
        400
    ) {
      throw new WebAccessPolicyError(
        `redirect response ${response.status} was rejected`,
      );
    }

    const content =
      await this.readBoundedBody(
        response,
      );

    return {
      url:
        input.url,
      finalUrl:
        response.url ||
        url.toString(),
      status:
        response.status,
      statusText:
        response.statusText,
      contentType:
        response.headers.get(
          "content-type",
        ) ??
        "unknown",
      content,
      contentLengthBytes:
        Buffer.byteLength(
          content,
          "utf8",
        ),
      fetchedAt:
        new Date().toISOString(),
    } satisfies WebAccessResult;
  }

  private parseRequest(
    request:
      ToolExecutionRequest,
  ): WebAccessRequest {
    const url =
      request.arguments.url;

    if (
      typeof url !==
      "string"
    ) {
      throw new WebAccessPolicyError(
        "web request requires a string url",
      );
    }

    const method =
      request.arguments.method;

    if (
      method !==
        undefined &&
      typeof method !==
        "string"
    ) {
      throw new WebAccessPolicyError(
        "web request method must be a string",
      );
    }

    const headers =
      request.arguments.headers;

    if (
      headers !==
        undefined &&
      (
        typeof headers !==
          "object" ||
        headers ===
          null ||
        Array.isArray(
          headers,
        )
      )
    ) {
      throw new WebAccessPolicyError(
        "web request headers must be an object",
      );
    }

    return {
      url,
      method,
      headers:
        headers as
          | Record<
              string,
              string
            >
          | undefined,
    };
  }

  private async validateUrl(
    rawUrl: string,
  ): Promise<{ url: URL; addresses: string[] }> {
    let url: URL;

    try {
      url =
        new URL(
          rawUrl,
        );
    } catch {
      throw new WebAccessPolicyError(
        "invalid URL",
      );
    }

    const scheme =
      url.protocol
        .replace(
          /:$/,
          "",
        )
        .toLowerCase();

    if (
      !this.policy.allowedSchemes
        .map(
          (
            item,
          ) =>
            item
              .toLowerCase()
              .replace(
                /:$/,
                "",
              ),
        )
        .includes(
          scheme,
        )
    ) {
      throw new WebAccessPolicyError(
        `URL scheme "${scheme}" is not authorized`,
      );
    }

    if (
      scheme !==
        "http" &&
      scheme !==
        "https"
    ) {
      throw new WebAccessPolicyError(
        `URL scheme "${scheme}" is not an allowed web scheme`,
      );
    }

    if (
      url.username ||
      url.password
    ) {
      throw new WebAccessPolicyError(
        "embedded URL credentials are not permitted",
      );
    }

    const hostname =
      normalizeHost(
        url.hostname.replace(/^\[|\]$/gu, ""),
      );

    if (
      hostname.length ===
      0
    ) {
      throw new WebAccessPolicyError(
        "URL hostname is required",
      );
    }

    if (
      this.policy.allowedHosts &&
      this.policy.allowedHosts.length >
        0 &&
      !this.policy.allowedHosts.some(
        (
          allowed,
        ) =>
          hostMatches(
            hostname,
            allowed,
          ),
      )
    ) {
      throw new WebAccessPolicyError(
        `host "${hostname}" is not authorized`,
      );
    }

    const addresses =
      await this.resolver.resolve(
        hostname,
      );

    if (
      addresses.length ===
      0
    ) {
      throw new WebAccessPolicyError(
        `host "${hostname}" did not resolve to an address`,
      );
    }

    if (
      this.policy
        .blockPrivateNetworks &&
      addresses.some(
        (
          address,
        ) =>
          isBlockedAddress(
            address,
          ),
      )
    ) {
      throw new WebAccessPolicyError(
        `host "${hostname}" resolves to a blocked network address`,
      );
    }

    return { url, addresses };
  }

  private async readBoundedBody(
    response:
      WebAccessResponse,
  ): Promise<string> {
    const declaredLength =
      response.headers.get(
        "content-length",
      );

    if (
      declaredLength
    ) {
      const length =
        Number(
          declaredLength,
        );

      if (
        Number.isFinite(
          length,
        ) &&
        length >
          this.policy
            .maxResponseBytes
      ) {
        throw new WebAccessPolicyError(
          "response exceeds configured size limit",
        );
      }
    }

    if (
      !response.body
    ) {
      return "";
    }

    const reader =
      response.body.getReader();

    const decoder =
      new TextDecoder();

    let total =
      0;

    let content =
      "";

    try {
      while (true) {
        const {
          done,
          value,
        } =
          await reader.read();

        if (done) {
          break;
        }

        if (!value) {
          continue;
        }

        total +=
          value.byteLength;

        if (
          total >
          this.policy
            .maxResponseBytes
        ) {
          await reader.cancel();

          throw new WebAccessPolicyError(
            "response exceeded configured size limit",
          );
        }

        content +=
          decoder.decode(
            value,
            {
              stream:
                true,
            },
          );
      }

      content +=
        decoder.decode();

      return content;
    } finally {
      reader.releaseLock();
    }
  }
}
