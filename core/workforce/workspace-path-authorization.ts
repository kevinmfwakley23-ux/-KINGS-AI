import {
  isAbsolute,
  relative,
  resolve,
} from "node:path";

export interface WorkspacePathAuthorizationInput {
  candidatePath: string;
  allowedPaths: readonly string[];
  workspaceRoot?: string;
}

/**
 * Authorize a proposal path against governed path roots without confusing
 * workspace-relative model output with absolute runtime paths.
 *
 * When a workspace root is available, both relative proposal paths and relative
 * allow-list entries are resolved beneath that root. Absolute paths are accepted
 * only when they remain inside the same workspace root. Traversal outside the
 * root is rejected before any filesystem mutation can occur.
 *
 * Without a workspace root, relative paths are compared inside a synthetic root
 * so legacy callers retain deterministic subtree authorization while traversal
 * remains blocked. Absolute and relative paths are not mixed in that mode.
 */
export function isWorkspacePathAuthorized(
  input: WorkspacePathAuthorizationInput,
): boolean {
  const candidate = input.candidatePath.trim();
  if (!candidate || input.allowedPaths.length === 0) {
    return false;
  }

  if (input.workspaceRoot?.trim()) {
    const workspaceRoot = resolve(input.workspaceRoot);
    const candidateAbsolute = resolveAgainstRoot(candidate, workspaceRoot);

    if (!isPathWithin(candidateAbsolute, workspaceRoot)) {
      return false;
    }

    return input.allowedPaths.some((allowedPath) => {
      const allowed = allowedPath.trim();
      if (!allowed) return false;

      const allowedAbsolute = resolveAgainstRoot(allowed, workspaceRoot);
      if (!isPathWithin(allowedAbsolute, workspaceRoot)) {
        return false;
      }

      return isPathWithin(candidateAbsolute, allowedAbsolute);
    });
  }

  const candidateIsAbsolute = isAbsolute(candidate);
  const comparisonRoot = resolve("/");
  const candidateAbsolute = candidateIsAbsolute
    ? resolve(candidate)
    : resolve(comparisonRoot, candidate);

  if (!candidateIsAbsolute && !isPathWithin(candidateAbsolute, comparisonRoot)) {
    return false;
  }

  return input.allowedPaths.some((allowedPath) => {
    const allowed = allowedPath.trim();
    if (!allowed || isAbsolute(allowed) !== candidateIsAbsolute) {
      return false;
    }

    const allowedAbsolute = candidateIsAbsolute
      ? resolve(allowed)
      : resolve(comparisonRoot, allowed);

    return isPathWithin(candidateAbsolute, allowedAbsolute);
  });
}

function resolveAgainstRoot(
  value: string,
  workspaceRoot: string,
): string {
  return isAbsolute(value)
    ? resolve(value)
    : resolve(workspaceRoot, value);
}

function isPathWithin(
  candidate: string,
  allowedRoot: string,
): boolean {
  const relativePath = relative(
    resolve(allowedRoot),
    resolve(candidate),
  );

  return (
    relativePath === "" ||
    (
      !relativePath.startsWith("..") &&
      !isAbsolute(relativePath)
    )
  );
}
