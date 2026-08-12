import type {
  ID,
} from "./types";

export interface OwnerIdentity {
  id:
    ID;
  provider:
    "kings-email";
  email:
    string;
  githubLogin?:
    string;
  displayName:
    string;
  role:
    "owner";
}

export interface OwnerIdentityConfig {
  ownerEmail:
    string;
  displayName:
    string;
  githubLogin?:
    string;
}

export interface OwnerAuthenticationIdentity {
  verifiedEmail?:
    string;
  githubLogin?:
    string;
}

export const DEFAULT_OWNER_IDENTITY_CONFIG:
  OwnerIdentityConfig = {
    ownerEmail:
      "",
    displayName:
      "K.I.N.G.S. Owner",
  };

export class OwnerIdentityAuthority {
  private readonly owner:
    OwnerIdentity;

  constructor(
    config:
      OwnerIdentityConfig,
  ) {
    const email =
      config.ownerEmail
        .trim()
        .toLowerCase();

    if (
      !email
    ) {
      throw new Error(
        "K.I.N.G.S. Owner Identity: verified owner email is required",
      );
    }

    if (
      !email.includes(
        "@",
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Owner Identity: owner email must be valid",
      );
    }

    if (
      !config.displayName.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Owner Identity: display name is required",
      );
    }

    this.owner = {
      id:
        `owner-email-${this.normalizeEmail(
          email,
        )}`,
      provider:
        "kings-email",
      email,
      ...(config.githubLogin?.trim()
        ? {
            githubLogin:
              config.githubLogin.trim(),
          }
        : {}),
      displayName:
        config.displayName.trim(),
      role:
        "owner",
    };
  }

  getOwner():
    OwnerIdentity {
    return {
      ...this.owner,
    };
  }

  matchesVerifiedEmail(
    email:
      string,
  ): boolean {
    return (
      this.normalizeEmail(
        email,
      ) ===
      this.owner.email
    );
  }

  matchesGitHubLogin(
    login:
      string,
  ): boolean {
    return (
      !!this.owner.githubLogin &&
      login.trim() ===
        this.owner.githubLogin
    );
  }

  matches(
    identity:
      OwnerAuthenticationIdentity,
  ): boolean {
    return (
      (
        !!identity.verifiedEmail &&
        this.matchesVerifiedEmail(
          identity.verifiedEmail,
        )
      ) ||
      (
        !!identity.githubLogin &&
        this.matchesGitHubLogin(
          identity.githubLogin,
        )
      )
    );
  }

  private normalizeEmail(
    email:
      string,
  ): string {
    return email
      .trim()
      .toLowerCase();
  }
}
