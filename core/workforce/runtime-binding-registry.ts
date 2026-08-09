import type {
  RuntimeDefinition,
} from "./runtime";

import type {
  RuntimeBinding,
} from "./runtime-binding";

export class WorkforceRuntimeBindingRegistry {
  private readonly bindings =
    new Map<string, RuntimeBinding>();

  register(
    definition: RuntimeDefinition,
    implementation: unknown,
  ): void {
    if (
      this.bindings.has(definition.id)
    ) {
      throw new Error(
        `K.I.N.G.S. Runtime Binding Registry: runtime "${definition.id}" is already bound`,
      );
    }

    this.bindings.set(
      definition.id,
      {
        definition,
        implementation,
      },
    );
  }

  get(
    id: string,
  ): RuntimeBinding | undefined {
    return this.bindings.get(id);
  }

  list(): RuntimeBinding[] {
    return [
      ...this.bindings.values(),
    ];
  }
}
