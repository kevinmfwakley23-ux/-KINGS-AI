import type {
  ID,
} from "./types";

export type RuntimePlatform =
  | "linux"
  | "chromeos"
  | "windows"
  | "macos"
  | "unknown";

export interface RuntimeEnvironment {
  id:
    ID;
  platform:
    RuntimePlatform;
  hostname:
    string;
  shell:
    string;
  workingDirectory:
    string;
  terminalId:
    ID;
  capabilities:
    string[];
}

export interface RuntimeSession {
  id:
    ID;
  ownerId:
    ID;
  environment:
    RuntimeEnvironment;
  createdAt:
    string;
  updatedAt:
    string;
  active:
    boolean;
}

export class RuntimeSessionRegistry {
  private readonly sessions =
    new Map<
      ID,
      RuntimeSession
    >();

  register(
    session:
      RuntimeSession,
  ): void {
    if (
      !session.id.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Runtime Session: session id is required",
      );
    }

    if (
      !session.ownerId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Runtime Session: owner id is required",
      );
    }

    if (
      this.sessions.has(
        session.id,
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Runtime Session: session "${session.id}" already exists`,
      );
    }

    this.sessions.set(
      session.id,
      {
        ...session,
        environment: {
          ...session.environment,
          capabilities: [
            ...session.environment.capabilities,
          ],
        },
      },
    );
  }

  get(
    sessionId:
      ID,
  ):
    RuntimeSession |
    undefined {
    const session =
      this.sessions.get(
        sessionId,
      );

    return session
      ? {
          ...session,
          environment: {
            ...session.environment,
            capabilities: [
              ...session.environment
                .capabilities,
            ],
          },
        }
      : undefined;
  }

  list():
    RuntimeSession[] {
    return [
      ...this.sessions.values(),
    ].map(
      (session) => ({
        ...session,
        environment: {
          ...session.environment,
          capabilities: [
            ...session.environment
              .capabilities,
          ],
        },
      }),
    );
  }

  deactivate(
    sessionId:
      ID,
  ): RuntimeSession {
    const session =
      this.sessions.get(
        sessionId,
      );

    if (!session) {
      throw new Error(
        `K.I.N.G.S. Runtime Session: session "${sessionId}" was not found`,
      );
    }

    session.active =
      false;
    session.updatedAt =
      new Date().toISOString();

    return {
      ...session,
      environment: {
        ...session.environment,
        capabilities: [
          ...session.environment
            .capabilities,
        ],
      },
    };
  }
}
