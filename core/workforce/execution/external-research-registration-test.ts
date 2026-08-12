import {
  WorkforceRegistry,
} from "../registry";

import {
  WorkUnitRegistry,
} from "../work-unit-registry";

import {
  ToolGateway,
} from "../tool-gateway";

import {
  WebAccessAdapter,
} from "../web-access";

import {
  registerExternalResearchTool,
} from "./external-research-registration";

import {
  WEB_ACCESS_TOOL_ID,
} from "../web-access";

import type {
  WebAccessHostResolver,
  WebAccessResponse,
  WebAccessFetcher,
} from "../web-access";

import type {
  ExternalResearchAuthorizer,
} from "./external-research";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

class TestResolver
  implements WebAccessHostResolver {
  async resolve(
    hostname: string,
  ): Promise<string[]> {
    return hostname ===
      "example.com"
      ? [
          "93.184.216.34",
        ]
      : [];
  }
}

function response(): WebAccessResponse {
  let consumed =
    false;

  const bytes =
    new TextEncoder().encode(
      "registered research source",
    );

  return {
    status:
      200,
    statusText:
      "OK",
    url:
      "https://example.com/",
    headers: {
      get(
        name: string,
      ): string | null {
        const normalized =
          name.toLowerCase();

        if (
          normalized ===
          "content-type"
        ) {
          return "text/plain";
        }

        if (
          normalized ===
          "content-length"
        ) {
          return String(
            bytes.byteLength,
          );
        }

        return null;
      },
    },
    body: {
      getReader() {
        return {
          async read() {
            if (
              consumed
            ) {
              return {
                done:
                  true,
              };
            }

            consumed =
              true;

            return {
              done:
                false,
              value:
                bytes,
            };
          },

          async cancel() {},

          releaseLock() {},
        };
      },
    },
  };
}

const webAccess =
  new WebAccessAdapter(
    {
      allowedHosts: [
        "example.com",
      ],
      allowedMethods: [
        "GET",
      ],
      allowedSchemes: [
        "https",
      ],
      maxResponseBytes:
        4096,
      timeoutMs:
        5000,
      maxRedirects:
        0,
      blockPrivateNetworks:
        true,
    },
    new TestResolver(),
    (async () =>
      response()) as WebAccessFetcher,
  );

const authorizer:
  ExternalResearchAuthorizer = {
  authorize() {},
};

function createGateway() {
  return new ToolGateway(
    new WorkforceRegistry(),
    new WorkUnitRegistry(),
  );
}

async function run(): Promise<void> {
  const registry =
    new WorkforceRegistry();

  const gateway =
    new ToolGateway(
      registry,
      new WorkUnitRegistry(),
    );

  const adapter =
    registerExternalResearchTool(
      registry,
      gateway,
      webAccess,
      authorizer,
    );

  assert(
    adapter.toolId ===
      "tool-external-research",
    "External research adapter was not created.",
  );

  assert(
    registry.getTool(
      WEB_ACCESS_TOOL_ID,
    ) !== undefined,
    "Web access tool was not registered.",
  );

  assert(
    registry.getTool(
      "tool-external-research",
    ) !== undefined,
    "External research tool was not registered.",
  );

  assert(
    registry
      .getTool(
        "tool-external-research",
      )
      ?.enabled ===
      true,
    "External research tool is not enabled.",
  );

  assert(
    gateway
      .listAdapters()
      .includes(
        "tool-external-research",
      ),
    "External research adapter was not registered with the tool gateway.",
  );

  registerExternalResearchTool(
    registry,
    gateway,
    webAccess,
    authorizer,
  );

  assert(
    gateway
      .listAdapters()
      .filter(
        (id) =>
          id ===
          "tool-external-research",
      )
      .length ===
      1,
    "Repeated registration created duplicate adapters.",
  );

  console.log(
    "05.8 external research tool registration: SUCCESS",
  );

  console.log(
    "TREE-05.8 EXTERNAL RESEARCH REGISTRATION: SUCCESS",
  );
}

run().catch(
  (error) => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);
