import type {
  ID,
} from "./types";

import type {
  RepositoryIndexEntry,
  RepositoryIndexQuery,
} from "./repository-index";

import {
  RepositoryIndex,
} from "./repository-index";

export interface ProjectBrainRepositoryReference {
  repositoryIndexId: ID;
  sourceId: ID;
  repositoryRoot: string;
  indexedAt: string;
  entryCount: number;
}

export class ProjectBrainRepositoryStore {
  private readonly references =
    new Map<
      ID,
      ProjectBrainRepositoryReference
    >();

  private readonly indexes =
    new Map<
      ID,
      RepositoryIndex
    >();

  register(
    index: RepositoryIndex,
  ): ProjectBrainRepositoryReference {
    const metadata =
      index.metadata;

    if (
      this.references.has(
        metadata.id,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Project Brain Repository: duplicate repository index "${metadata.id}"`,
      );
    }

    const reference:
      ProjectBrainRepositoryReference =
      {
        repositoryIndexId:
          metadata.id,
        sourceId:
          metadata.sourceId,
        repositoryRoot:
          metadata.root,
        indexedAt:
          metadata.indexedAt,
        entryCount:
          metadata.entries.length,
      };

    this.references.set(
      metadata.id,
      reference,
    );

    this.indexes.set(
      metadata.id,
      index,
    );

    return {
      ...reference,
    };
  }

  get(
    repositoryIndexId: ID,
  ):
    | ProjectBrainRepositoryReference
    | undefined {
    const reference =
      this.references.get(
        repositoryIndexId,
      );

    return reference
      ? {
          ...reference,
        }
      : undefined;
  }

  find(
    repositoryIndexId: ID,
    query:
      RepositoryIndexQuery = {},
  ): RepositoryIndexEntry[] {
    const index =
      this.indexes.get(
        repositoryIndexId,
      );

    if (!index) {
      throw new Error(
        `K.I.N.G.S. Project Brain Repository: unknown repository index "${repositoryIndexId}"`,
      );
    }

    return index.find(
      query,
    );
  }

  findAll(
    query:
      RepositoryIndexQuery = {},
  ): RepositoryIndexEntry[] {
    const ids = [
      ...this.indexes.keys(),
    ].sort(
      (a, b) =>
        a < b
          ? -1
          : a > b
            ? 1
            : 0,
    );

    const results:
      RepositoryIndexEntry[] = [];

    for (const id of ids) {
      results.push(
        ...this.find(
          id,
          query,
        ),
      );
    }

    return results.sort(
      (a, b) =>
        a.path < b.path
          ? -1
          : a.path > b.path
            ? 1
            : 0,
    );
  }

  list():
    ProjectBrainRepositoryReference[] {
    return [
      ...this.references.values(),
    ]
      .sort(
        (a, b) =>
          a.repositoryIndexId <
          b.repositoryIndexId
            ? -1
            : a.repositoryIndexId >
                b.repositoryIndexId
              ? 1
              : 0,
      )
      .map(
        (reference) => ({
          ...reference,
        }),
      );
  }

  clear(): void {
    this.references.clear();
    this.indexes.clear();
  }
}
