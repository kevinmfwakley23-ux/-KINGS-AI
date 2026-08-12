import {
  KnowledgeRegistry,
} from "./knowledge-registry";

import {
  CapabilityRegistry,
} from "./capability-registry";

import {
  WebAccessAdapter,
  type WebAccessFetcher,
  type WebAccessHostResolver,
  type WebAccessResponse,
} from "./web-access";

import {
  ExternalResearchAdapter,
  ApprovedExternalResearchAuthorizer,
} from "./execution/external-research";

import {
  CapabilityLearningAuthority,
} from "./capability-learning";

function assert(
  condition:
    boolean,
  message:
    string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

class Resolver
  implements WebAccessHostResolver {
  async resolve(
    hostname:
      string,
  ): Promise<string[]> {
    return hostname ===
      "example.com"
      ? [
          "93.184.216.34",
        ]
      : [];
  }
}

function response(
  content:
    string,
): WebAccessResponse {
  const bytes =
    new TextEncoder().encode(
      content,
    );

  let consumed =
    false;

  return {
    status:
      200,
    statusText:
      "OK",
    url:
      "https://example.com/learning",
    headers: {
      get(
        name:
          string,
      ):
        string | null {
        if (
          name.toLowerCase() ===
          "content-type"
        ) {
          return "text/plain";
        }

        if (
          name.toLowerCase() ===
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

const fetcher:
  WebAccessFetcher =
  async () =>
    response(
      [
        "K.I.N.G.S. learning source.",
        "A reusable capability must be verified before promotion.",
        "Verified knowledge should preserve provenance.",
      ].join(
        " ",
      ),
    );

async function main(): Promise<void> {
  const web =
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
          16_384,
        timeoutMs:
          5_000,
        maxRedirects:
          0,
        blockPrivateNetworks:
          true,
      },
      new Resolver(),
      fetcher,
    );

  const research =
    new ExternalResearchAdapter(
      web,
      new ApprovedExternalResearchAuthorizer(
        new Set([
          "task-tree-learning",
        ]),
      ),
    );

  const knowledge =
    new KnowledgeRegistry();

  const capabilities =
    new CapabilityRegistry();

  const learning =
    new CapabilityLearningAuthority(
      research,
      knowledge,
      capabilities,
      {
        verify(
          proposal,
          result,
        ) {
          const source =
            result.sources[0];

          return (
            Boolean(source) &&
            source.content.includes(
              "must be verified",
            ) &&
            proposal.verificationCriteria.includes(
              "source explicitly supports the learned procedure",
            ) &&
            proposal.evidenceSourceIds.includes(
              source.sourceId,
            )
          );
        },
      },
    );

  const result =
    await learning.learn(
      {
        learningId:
          "learning-tree-11-001",
        taskId:
          "task-tree-learning",
        capabilityId:
          "capability-verified-knowledge-promotion",
        question:
          "How should K.I.N.G.S. promote learned knowledge into reusable capability?",
        urls: [
          "https://example.com/learning",
        ],
        maxSources:
          1,
      },
      {
        capability: {
          id:
            "capability-verified-knowledge-promotion",
          name:
            "Verified Knowledge Promotion",
          description:
            "Promote externally learned knowledge into reusable K.I.N.G.S. capability only after verification.",
          dependencies: [],
          allowedToolIds: [],
          allowedPaths: [],
          risk:
            "low",
          verificationRequirements: [
            "source evidence",
            "independent verification",
          ],
          enabled:
            true,
          createdAt:
            "",
          updatedAt:
            "",
        },
        summary:
          "Verified external knowledge can become reusable capability.",
        knowledge:
          "Retrieve approved external knowledge, verify the evidence, preserve provenance, and only then register the reusable capability.",
        evidenceSourceIds: [
          "learning-tree-11-001:source:1",
        ],
        verificationCriteria: [
          "source explicitly supports the learned procedure",
        ],
      },
    );

  assert(
    result.status ===
      "promoted",
    "Verified learning must be promoted.",
  );

  assert(
    result.knowledgeRecordId !==
      undefined,
    "Promoted learning must create durable knowledge registration.",
  );

  assert(
    capabilities.get(
      "capability-verified-knowledge-promotion",
    ) !==
      undefined,
    "Promoted learning must create a reusable capability.",
  );

  assert(
    knowledge.getRecord(
      result.knowledgeRecordId!,
    )?.authoritative ===
      true,
    "Promoted learning must become authoritative knowledge.",
  );

  assert(
    result.research.sources[0].content.includes(
      "must be verified",
    ),
    "External source content must reach the learning layer.",
  );

  console.log(
    "TREE-11 EXTERNAL KNOWLEDGE RETRIEVAL: SUCCESS",
  );

  console.log(
    "TREE-11 KNOWLEDGE EXTRACTION INPUT: SUCCESS",
  );

  console.log(
    "TREE-11 VERIFICATION GATE: SUCCESS",
  );

  console.log(
    "TREE-11 KNOWLEDGE PROMOTION: SUCCESS",
  );

  console.log(
    "TREE-11 REUSABLE CAPABILITY REGISTRATION: SUCCESS",
  );

  const rejected =
    new CapabilityLearningAuthority(
      research,
      new KnowledgeRegistry(),
      new CapabilityRegistry(),
      {
        verify() {
          return false;
        },
      },
    );

  const rejectedResult =
    await rejected.learn(
      {
        learningId:
          "learning-tree-11-rejected",
        taskId:
          "task-tree-learning",
        capabilityId:
          "capability-must-not-promote",
        question:
          "Should unverified knowledge become capability?",
        urls: [
          "https://example.com/learning",
        ],
        maxSources:
          1,
      },
      {
        capability: {
          id:
            "capability-must-not-promote",
          name:
            "Rejected Capability",
          description:
            "Must never be promoted without verification.",
          dependencies: [],
          allowedToolIds: [],
          allowedPaths: [],
          risk:
            "low",
          verificationRequirements: [
            "verification",
          ],
          enabled:
            true,
          createdAt:
            "",
          updatedAt:
            "",
        },
        summary:
          "Unverified learning.",
        knowledge:
          "This must not become authoritative.",
        evidenceSourceIds: [
          "learning-tree-11-rejected:source:1",
        ],
        verificationCriteria: [
          "verification",
        ],
      },
    );

  assert(
    rejectedResult.status ===
      "rejected",
    "Unverified learning must be rejected.",
  );

  console.log(
    "TREE-11 UNVERIFIED LEARNING BLOCKING: SUCCESS",
  );

  console.log(
    "TREE-11 PAID PROVIDER NOT REQUIRED: SUCCESS",
  );

  console.log(
    "K.I.N.G.S. CAPABILITY LEARNING GAP: CLOSED",
  );
}

main().catch(
  (
    error,
  ) => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);
