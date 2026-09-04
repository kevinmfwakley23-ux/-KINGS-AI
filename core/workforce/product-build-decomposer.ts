import type { ID } from "./types";

export interface ProductBuildTaskDefinition {
  id: ID;
  name: string;
  description: string;
  requiredCapabilities: string[];
  requiredToolIds: ID[];
  dependencyIds: ID[];
  inputReferences: string[];
  expectedOutputs: string[];
}

export interface ProductBuildDecomposition {
  productName: string;
  tasks: ProductBuildTaskDefinition[];
}

export interface ProductBuildDecompositionRequest {
  missionId: ID;
  productName: string;
  ownerVision: string;
}

/**
 * Produces a deterministic, dependency-ordered product build graph.
 * The graph is intentionally framework-independent; workforce policy still
 * decides which qualified agents and tools may execute each task.
 */
export class ProductBuildDecomposer {
  decompose(request: ProductBuildDecompositionRequest): ProductBuildDecomposition {
    if (!request.missionId.trim()) throw new Error("K.I.N.G.S. Product Build Decomposer: mission id is required");
    if (!request.productName.trim()) throw new Error("K.I.N.G.S. Product Build Decomposer: product name is required");
    if (!request.ownerVision.trim()) throw new Error("K.I.N.G.S. Product Build Decomposer: owner vision is required");

    const prefix = request.missionId.replace(/[^a-zA-Z0-9_-]/g, "-");
    const task = (
      suffix: string,
      name: string,
      description: string,
      capabilities: string[],
      dependencies: string[],
      outputs: string[],
    ): ProductBuildTaskDefinition => ({
      id: `${prefix}-${suffix}`,
      name,
      description,
      requiredCapabilities: capabilities,
      requiredToolIds: [],
      dependencyIds: dependencies.map((id) => `${prefix}-${id}`),
      inputReferences: dependencies.map((id) => `${prefix}-${id}`),
      expectedOutputs: outputs,
    });

    return {
      productName: request.productName,
      tasks: [
        task("architecture", "Architecture", `Define architecture for: ${request.ownerVision}`, ["architecture"], [], ["architecture"]),
        task("research", "Product Research", `Research requirements and constraints for ${request.productName}.`, ["research"], ["architecture"], ["research"]),
        task("backend", "Backend Implementation", `Implement backend services for ${request.productName}.`, ["coding"], ["architecture", "research"], ["backend-code"]),
        task("frontend", "Frontend Implementation", `Implement the user-facing application for ${request.productName}.`, ["coding"], ["architecture", "research"], ["frontend-code"]),
        task("integration", "Application Integration", `Integrate frontend and backend for ${request.productName}.`, ["coding"], ["backend", "frontend"], ["integrated-build"]),
        task("testing", "Verification and Testing", `Verify the integrated ${request.productName} application.`, ["testing"], ["integration"], ["verification"]),
        task("hardening", "Production Hardening", `Resolve verification findings and harden ${request.productName}.`, ["coding"], ["testing"], ["hardened-build"]),
        task("release", "Release Preparation", `Prepare the verified ${request.productName} build for release.`, ["coding"], ["hardening"], ["release"]),
      ],
    };
  }
}
