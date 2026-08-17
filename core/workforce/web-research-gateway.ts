import type {
  Evidence,
  ID,
  KnowledgeRecord,
  KnowledgeSource,
} from "./types";

import {
  KnowledgeRegistry,
} from "./knowledge-registry";

export interface WebResearchRequest {
  id:
    ID;

  url:
    string;

  title:
    string;

  description:
    string;

  authoritative:
    boolean;

  sourceType:
    KnowledgeSource["type"];

  knowledgeSummary:
    string;

  knowledgeContent:
    string;
}

export interface WebResearchResult {
  source:
    KnowledgeSource;

  evidence:
    Evidence;

  record:
    KnowledgeRecord;
}

export interface WebResearchFetcher {
  fetch(
    url:
      string,
  ):
    Promise<{
      body:
        string;
      finalUrl:
        string;
    }>;
}

export class NodeWebResearchFetcher
  implements WebResearchFetcher {
  constructor(
    private readonly timeoutMs:
      number =
        15_000,
  ) {}

  async fetch(
    url:
      string,
  ):
    Promise<{
      body:
        string;
      finalUrl:
        string;
    }> {
    let parsed:
      URL;

    try {
      parsed =
        new URL(
          url,
        );
    } catch {
      throw new Error(
        `K.I.N.G.S. Web Research: invalid URL "${url}"`,
      );
    }

    if (
      parsed.protocol !==
        "http:" &&
      parsed.protocol !==
        "https:"
    ) {
      throw new Error(
        "K.I.N.G.S. Web Research: only HTTP and HTTPS sources are supported",
      );
    }

    const controller =
      new AbortController();

    const timer =
      setTimeout(
        () =>
          controller.abort(),
        this.timeoutMs,
      );

    try {
      const response =
        await fetch(
          parsed,
          {
            method:
              "GET",
            redirect:
              "follow",
            signal:
              controller.signal,
            headers: {
              "user-agent":
                "KINGS-AI-Research-Gateway/1.0",
              accept:
                "text/plain,text/html,application/json;q=0.9,*/*;q=0.5",
            },
          },
        );

      if (
        !response.ok
      ) {
        throw new Error(
          `K.I.N.G.S. Web Research: source returned HTTP ${response.status}`,
        );
      }

      return {
        body:
          await response.text(),
        finalUrl:
          response.url ||
          parsed.toString(),
      };
    } finally {
      clearTimeout(
        timer,
      );
    }
  }
}

export class WebResearchGateway {
  constructor(
    private readonly registry:
      KnowledgeRegistry,
    private readonly fetcher:
      WebResearchFetcher =
        new NodeWebResearchFetcher(),
  ) {}

  async research(
    request:
      WebResearchRequest,
  ):
    Promise<WebResearchResult> {
    this.validateRequest(
      request,
    );

    const fetched =
      await this.fetcher.fetch(
        request.url,
      );

    if (
      !fetched.body.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Web Research: source returned empty content",
      );
    }

    const now =
      new Date().toISOString();

    const source:
      KnowledgeSource = {
        id:
          request.id,
        type:
          request.sourceType,
        name:
          request.title,
        description:
          request.description,
        location:
          fetched.finalUrl,
        authoritative:
          request.authoritative,
        createdAt:
          now,
        updatedAt:
          now,
      };

    this.registry.registerSource(
      source,
    );

    const evidence:
      Evidence = {
      id:
        `evidence-${request.id}`,
      sourceId:
        source.id,
      description:
        `Web research evidence captured from ${fetched.finalUrl}.`,
      location:
        fetched.finalUrl,
      excerpt:
        fetched.body.slice(
          0,
          2_000,
        ),
      createdAt:
        now,
    };

    this.registry.registerEvidence(
      evidence,
    );

    const record:
      KnowledgeRecord = {
      id:
        `knowledge-${request.id}`,
      sourceId:
        source.id,
      memoryType:
        "semantic",
      summary:
        request.knowledgeSummary,
      content:
        request.knowledgeContent,
      evidenceIds: [
        evidence.id,
      ],
      authoritative:
        false,
      createdAt:
        now,
      updatedAt:
        now,
    };

    this.registry.registerRecord(
      record,
    );

    return {
      source,
      evidence,
      record,
    };
  }

  private validateRequest(
    request:
      WebResearchRequest,
  ): void {
    if (
      !request.id.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Web Research: research id is required",
      );
    }

    if (
      !request.url.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Web Research: URL is required",
      );
    }

    if (
      !request.title.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Web Research: title is required",
      );
    }

    if (
      !request.knowledgeSummary.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Web Research: knowledge summary is required",
      );
    }

    if (
      !request.knowledgeContent.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Web Research: knowledge content is required",
      );
    }
  }
}
