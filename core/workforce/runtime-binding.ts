import type {
  RuntimeDefinition,
} from "./runtime";

export interface RuntimeBinding {
  definition: RuntimeDefinition;
  implementation: unknown;
}
