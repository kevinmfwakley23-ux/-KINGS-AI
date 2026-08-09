import type {
  RuntimeDefinition,
  RuntimeRegistry,
} from "./runtime";

export class WorkforceRuntimeRegistry
  implements RuntimeRegistry
{
  private readonly runtimes =
    new Map<string, RuntimeDefinition>();

  register(
    runtime: RuntimeDefinition,
  ): void {
    if (
      this.runtimes.has(runtime.id)
    ) {
      throw new Error(
        `K.I.N.G.S. Runtime Registry: runtime "${runtime.id}" is already registered`,
      );
    }

    this.runtimes.set(
      runtime.id,
      runtime,
    );
  }

  get(
    id: string,
  ): RuntimeDefinition | undefined {
    return this.runtimes.get(id);
  }

  list(): RuntimeDefinition[] {
    return [
      ...this.runtimes.values(),
    ];
  }
}
