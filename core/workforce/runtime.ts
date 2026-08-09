export type RuntimeType =
  | "source"
  | "knowledge"
  | "agent"
  | "workflow"
  | "tool";

export interface RuntimeDefinition {
  id: string;
  name: string;
  type: RuntimeType;
  description: string;
  enabled: boolean;
}

export interface RuntimeRegistry {
  register(runtime: RuntimeDefinition): void;
  get(id: string): RuntimeDefinition | undefined;
  list(): RuntimeDefinition[];
}
