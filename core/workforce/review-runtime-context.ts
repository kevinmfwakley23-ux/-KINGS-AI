import type {
  ID,
} from "./types";

import {
  OwnerIdentityAuthority,
  type OwnerIdentity,
} from "./owner-identity";

import {
  RuntimeSessionRegistry,
  type RuntimeSession,
} from "./runtime-session";

export interface ReviewRuntimeContextRequest {
  ownerLogin:
    string;
  sessionId:
    ID;
}

export interface ReviewRuntimeContext {
  owner:
    OwnerIdentity;
  runtime:
    RuntimeSession;
}

export class ReviewRuntimeContextAuthority {
  constructor(
    private readonly ownerAuthority:
      OwnerIdentityAuthority,
    private readonly sessions:
      RuntimeSessionRegistry,
  ) {}

  resolve(
    request:
      ReviewRuntimeContextRequest,
  ): ReviewRuntimeContext {
    if (
      !this.ownerAuthority.matches({
        verifiedEmail:
          request.ownerLogin,
      })
    ) {
      throw new Error(
        "K.I.N.G.S. Review Runtime Context: owner identity is not authorized",
      );
    }

    const runtime =
      this.sessions.get(
        request.sessionId,
      );

    if (
      !runtime
    ) {
      throw new Error(
        `K.I.N.G.S. Review Runtime Context: runtime session "${request.sessionId}" was not found`,
      );
    }

    const owner =
      this.ownerAuthority.getOwner();

    if (
      runtime.ownerId !==
      owner.id
    ) {
      throw new Error(
        "K.I.N.G.S. Review Runtime Context: runtime session is not owned by the authenticated K.I.N.G.S. owner",
      );
    }

    if (
      !runtime.active
    ) {
      throw new Error(
        `K.I.N.G.S. Review Runtime Context: runtime session "${request.sessionId}" is inactive`,
      );
    }

    return {
      owner,
      runtime,
    };
  }
}
