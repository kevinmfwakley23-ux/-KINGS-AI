import type {
  EngineeringLanguage,
  EngineeringToolchain,
  ToolchainOperation,
} from "./engineering-toolchain";

import {
  EngineeringToolchainRegistry,
} from "./engineering-toolchain";

import type {
  ToolchainVerificationResult,
} from "./toolchain-verification";

export interface DynamicToolchainRegistrationRequest {
  toolchain:
    EngineeringToolchain;
  verification:
    ToolchainVerificationResult;
  requiredOperations:
    ToolchainOperation[];
}

export interface DynamicToolchainRegistrationResult {
  language:
    EngineeringLanguage;
  registered:
    boolean;
  supportedOperations:
    ToolchainOperation[];
}

export class DynamicToolchainRegistrationAuthority {
  constructor(
    private readonly registry:
      EngineeringToolchainRegistry,
  ) {}

  register(
    request:
      DynamicToolchainRegistrationRequest,
  ):
    DynamicToolchainRegistrationResult {
    if (
      !request.verification.verified
    ) {
      throw new Error(
        `K.I.N.G.S. Dynamic Toolchain Registration: toolchain "${request.toolchain.id}" has not been verified`,
      );
    }

    if (
      request.verification.language !==
      request.toolchain.language
    ) {
      throw new Error(
        "K.I.N.G.S. Dynamic Toolchain Registration: verification language does not match toolchain language",
      );
    }

    const supported =
      request.toolchain.commands.map(
        (command) =>
          command.operation,
      );

    for (
      const operation of
      request.requiredOperations
    ) {
      if (
        !supported.includes(
          operation,
        )
      ) {
        throw new Error(
          `K.I.N.G.S. Dynamic Toolchain Registration: required operation "${operation}" is not supported by verified toolchain`,
        );
      }
    }

    this.registry.register(
      request.toolchain,
    );

    return {
      language:
        request.toolchain.language,
      registered:
        true,
      supportedOperations: [
        ...supported,
      ],
    };
  }
}
