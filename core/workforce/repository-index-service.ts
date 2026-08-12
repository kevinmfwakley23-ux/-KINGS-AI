import type {
  ID,
} from "./types";

import type {
  SourceInspectionResult,
} from "./source-inspection";

import {
  RepositoryIndex,
  RepositoryIndexBuilder,
} from "./repository-index";

export interface RepositoryIndexBuildRequest {
  indexId: ID;
  sourceId: ID;
  repositoryRoot: string;
  inspections: SourceInspectionResult[];
  indexedAt?: string;
}

export class RepositoryIndexService {
  constructor(
    private readonly builder:
      RepositoryIndexBuilder =
        new RepositoryIndexBuilder(),
  ) {}

  build(
    request:
      RepositoryIndexBuildRequest,
  ): RepositoryIndex {
    const snapshot =
      this.builder.build(
        request.indexId,
        request.sourceId,
        request.repositoryRoot,
        request.inspections,
        request.indexedAt,
      );

    return new RepositoryIndex(
      snapshot,
    );
  }

  rebuild(
    request:
      RepositoryIndexBuildRequest,
  ): RepositoryIndex {
    return this.build(
      request,
    );
  }
}
