import type {
  ToolDefinition,
} from "../types";

import {
  EXTERNAL_RESEARCH_TOOL_ID,
  ExternalResearchAdapter,
  type ExternalResearchAuthorizer,
} from "./external-research";

import {
  WebAccessAdapter,
  WEB_ACCESS_TOOL_ID,
} from "../web-access";

import type {
  WorkforceRegistry,
} from "../registry";

import type {
  ToolGateway,
} from "../tool-gateway";

export const EXTERNAL_RESEARCH_TOOL_DEFINITION:
  ToolDefinition = {
  id:
    EXTERNAL_RESEARCH_TOOL_ID,
  name:
    "External Research",
  description:
    "Controlled retrieval of explicitly authorized external web sources for research tasks.",
  capabilities: [
    "external-research",
    "source-retrieval",
    "source-provenance",
    "external-content",
    "untrusted-output",
  ],
  enabled:
    true,
};

export function registerExternalResearchTool(
  registry: WorkforceRegistry,
  gateway: ToolGateway,
  webAccess: WebAccessAdapter,
  authorizer: ExternalResearchAuthorizer,
): ExternalResearchAdapter {
  if (
    !registry.getTool(
      WEB_ACCESS_TOOL_ID,
    )
  ) {
    registry.registerTool({
      id:
        WEB_ACCESS_TOOL_ID,
      name:
        "Web Access",
      description:
        "Controlled HTTP retrieval through the K.I.N.G.S. web access policy.",
      capabilities: [
        "web-access",
        "source-retrieval",
        "external-content",
        "untrusted-output",
      ],
      enabled:
        true,
    });
  }

  if (
    !registry.getTool(
      EXTERNAL_RESEARCH_TOOL_ID,
    )
  ) {
    registry.registerTool(
      EXTERNAL_RESEARCH_TOOL_DEFINITION,
    );
  }

  const adapter =
    new ExternalResearchAdapter(
      webAccess,
      authorizer,
    );

  if (
    !gateway
      .listAdapters()
      .includes(
        EXTERNAL_RESEARCH_TOOL_ID,
      )
  ) {
    gateway.registerAdapter(
      adapter,
    );
  }

  return adapter;
}

export { EXTERNAL_RESEARCH_TOOL_ID };
