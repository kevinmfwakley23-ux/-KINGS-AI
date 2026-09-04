import ts = require("typescript");

export type RepositorySymbolKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "variable"
  | "method";

export interface RepositorySymbolSource {
  path: string;
  content: string;
}

export interface RepositoryImportEdge {
  fromPath: string;
  specifier: string;
  importedNames: string[];
  resolvedPath?: string;
}

export interface RepositorySymbolRecord {
  path: string;
  name: string;
  kind: RepositorySymbolKind;
  exported: boolean;
  start: number;
  end: number;
  startLine: number;
  endLine: number;
  text: string;
}

export interface RepositorySymbolSnapshot {
  files: string[];
  symbols: RepositorySymbolRecord[];
  imports: RepositoryImportEdge[];
}

export interface RepositorySymbolSelectionRequest {
  objective: string;
  requirements: readonly string[];
  maxSymbols?: number;
  maxContextCharacters?: number;
  dependencyDepth?: number;
}

export interface RepositorySymbolSelection {
  context: string;
  selectedSymbols: RepositorySymbolRecord[];
  dependencyFiles: string[];
  totalSymbols: number;
  totalImportEdges: number;
  truncated: boolean;
}

const SUPPORTED = /\.(?:[cm]?[jt]sx?)$/i;

function normalizePath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\/+/, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error(`K.I.N.G.S. Repository Symbol Map: invalid repository path "${path}"`);
  }
  return normalized;
}

function queryTerms(value: string): string[] {
  return [...new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9_$-]+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3)
      .filter((term) => ![
        "the", "and", "for", "with", "that", "this", "from", "into",
        "build", "code", "project", "application", "fix", "make", "must",
      ].includes(term)),
  )];
}

function scriptKindFor(path: string): ts.ScriptKind {
  const lower = path.toLowerCase();
  if (lower.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (lower.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.(?:mjs|cjs|js)$/.test(lower)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function hasExportModifier(node: ts.Node): boolean {
  return Boolean(
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
  );
}

function declarationName(node: ts.Node): string | undefined {
  const named = node as ts.Node & { name?: ts.DeclarationName };
  if (!named.name) return undefined;
  if (ts.isIdentifier(named.name) || ts.isStringLiteral(named.name) || ts.isNumericLiteral(named.name)) {
    return named.name.text;
  }
  return named.name.getText();
}

function kindOf(node: ts.Node): RepositorySymbolKind | undefined {
  if (ts.isFunctionDeclaration(node)) return "function";
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isTypeAliasDeclaration(node)) return "type";
  if (ts.isEnumDeclaration(node)) return "enum";
  if (ts.isMethodDeclaration(node)) return "method";
  return undefined;
}

function moduleCandidates(fromPath: string, specifier: string): string[] {
  if (!specifier.startsWith(".")) return [];
  const fromParts = fromPath.split("/");
  fromParts.pop();
  const parts = [...fromParts];
  for (const segment of specifier.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  const base = parts.join("/");
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];
  return [
    base,
    ...extensions.map((extension) => `${base}${extension}`),
    ...extensions.map((extension) => `${base}/index${extension}`),
  ];
}

export class RepositorySymbolDependencyMap {
  build(sources: readonly RepositorySymbolSource[]): RepositorySymbolSnapshot {
    const files = new Map<string, string>();
    for (const source of sources) {
      const path = normalizePath(source.path);
      if (!SUPPORTED.test(path)) continue;
      if (files.has(path)) {
        throw new Error(`K.I.N.G.S. Repository Symbol Map: duplicate source path "${path}"`);
      }
      files.set(path, source.content);
    }

    const symbols: RepositorySymbolRecord[] = [];
    const unresolvedImports: Array<Omit<RepositoryImportEdge, "resolvedPath">> = [];

    for (const [path, content] of files) {
      const sourceFile = ts.createSourceFile(
        path,
        content,
        ts.ScriptTarget.Latest,
        true,
        scriptKindFor(path),
      );

      const addNode = (node: ts.Node, kind: RepositorySymbolKind, name: string, exported: boolean) => {
        const start = node.getStart(sourceFile);
        const end = node.getEnd();
        const startLine = sourceFile.getLineAndCharacterOfPosition(start).line + 1;
        const endLine = sourceFile.getLineAndCharacterOfPosition(end).line + 1;
        symbols.push({
          path,
          name,
          kind,
          exported,
          start,
          end,
          startLine,
          endLine,
          text: content.slice(start, end),
        });
      };

      for (const statement of sourceFile.statements) {
        if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) {
          const moduleSpecifier = statement.moduleSpecifier;
          if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
            const importedNames: string[] = [];
            if (ts.isImportDeclaration(statement) && statement.importClause) {
              const clause = statement.importClause;
              if (clause.name) importedNames.push(clause.name.text);
              if (clause.namedBindings) {
                if (ts.isNamespaceImport(clause.namedBindings)) {
                  importedNames.push(clause.namedBindings.name.text);
                } else {
                  for (const element of clause.namedBindings.elements) {
                    importedNames.push(element.name.text);
                  }
                }
              }
            }
            unresolvedImports.push({
              fromPath: path,
              specifier: moduleSpecifier.text,
              importedNames,
            });
          }
        }

        if (ts.isVariableStatement(statement)) {
          const exported = hasExportModifier(statement);
          for (const declaration of statement.declarationList.declarations) {
            if (ts.isIdentifier(declaration.name)) {
              addNode(statement, "variable", declaration.name.text, exported);
            }
          }
          continue;
        }

        const kind = kindOf(statement);
        const name = declarationName(statement);
        if (kind && name) {
          addNode(statement, kind, name, hasExportModifier(statement));
          if (ts.isClassDeclaration(statement)) {
            for (const member of statement.members) {
              if (!ts.isMethodDeclaration(member)) continue;
              const memberName = declarationName(member);
              if (memberName) addNode(member, "method", `${name}.${memberName}`, hasExportModifier(statement));
            }
          }
        }
      }
    }

    const fileSet = new Set(files.keys());
    const imports = unresolvedImports.map((edge): RepositoryImportEdge => {
      const resolvedPath = moduleCandidates(edge.fromPath, edge.specifier)
        .find((candidate) => fileSet.has(candidate));
      return { ...edge, resolvedPath };
    });

    symbols.sort((left, right) =>
      left.path.localeCompare(right.path) || left.start - right.start || left.name.localeCompare(right.name),
    );
    imports.sort((left, right) =>
      left.fromPath.localeCompare(right.fromPath) || left.specifier.localeCompare(right.specifier),
    );

    return {
      files: [...files.keys()].sort(),
      symbols,
      imports,
    };
  }

  select(
    snapshot: RepositorySymbolSnapshot,
    request: RepositorySymbolSelectionRequest,
  ): RepositorySymbolSelection {
    const maxSymbols = Math.max(1, Math.min(request.maxSymbols ?? 14, 50));
    const maxContextCharacters = Math.max(
      2_000,
      Math.min(request.maxContextCharacters ?? 18_000, 80_000),
    );
    const dependencyDepth = Math.max(0, Math.min(request.dependencyDepth ?? 1, 3));
    const terms = queryTerms(`${request.objective} ${request.requirements.join(" ")}`);

    const score = (symbol: RepositorySymbolRecord): number => {
      const name = symbol.name.toLowerCase();
      const path = symbol.path.toLowerCase();
      const text = symbol.text.toLowerCase();
      let value = 0;
      let matchedTerms = 0;
      for (const term of terms) {
        const nameMatch = name.includes(term);
        const pathMatch = path.includes(term);
        const textMatch = text.includes(term);
        if (nameMatch || pathMatch || textMatch) matchedTerms += 1;
        if (name === term) value += 90;
        else if (nameMatch) value += 55;
        if (pathMatch) value += 24;
        if (textMatch) value += 10;
      }
      // Exported/public surface is useful as a tie-breaker, but never sufficient
      // by itself to make an unrelated declaration task-relevant. For richer
      // multi-term missions require overlap with at least two distinct task terms
      // so filename decoys cannot crowd out the actual implementation symbol.
      if (terms.length >= 3 && matchedTerms < 2) return 0;
      if (terms.length > 0 && matchedTerms === 0) return 0;
      if (symbol.exported) value += 8;
      if (symbol.kind === "function" || symbol.kind === "class" || symbol.kind === "method") value += 5;
      value -= Math.min(16, Math.floor(symbol.text.length / 2500));
      return Math.max(0, value);
    };

    const ranked = [...snapshot.symbols]
      .map((symbol) => ({ symbol, score: score(symbol) }))
      .filter((entry) => entry.score > 0 || terms.length === 0)
      .sort((left, right) =>
        right.score - left.score ||
        Number(right.symbol.exported) - Number(left.symbol.exported) ||
        left.symbol.text.length - right.symbol.text.length ||
        left.symbol.name.localeCompare(right.symbol.name),
      );

    const selectedSymbols: RepositorySymbolRecord[] = [];
    const selectedKeys = new Set<string>();
    const addSymbol = (symbol: RepositorySymbolRecord) => {
      const key = `${symbol.path}:${symbol.start}:${symbol.end}`;
      if (selectedKeys.has(key) || selectedSymbols.length >= maxSymbols) return;
      selectedKeys.add(key);
      selectedSymbols.push(symbol);
    };

    for (const entry of ranked) {
      addSymbol(entry.symbol);
      if (selectedSymbols.length >= maxSymbols) break;
    }

    const dependencyFiles = new Set<string>();
    let frontier = new Set(selectedSymbols.map((symbol) => symbol.path));
    for (let depth = 0; depth < dependencyDepth; depth += 1) {
      const next = new Set<string>();
      for (const edge of snapshot.imports) {
        if (!edge.resolvedPath || !frontier.has(edge.fromPath)) continue;
        if (!dependencyFiles.has(edge.resolvedPath)) next.add(edge.resolvedPath);
        dependencyFiles.add(edge.resolvedPath);
        for (const importedName of edge.importedNames) {
          const exact = snapshot.symbols.find(
            (symbol) => symbol.path === edge.resolvedPath &&
              (symbol.name === importedName || symbol.name.endsWith(`.${importedName}`)),
          );
          if (exact) addSymbol(exact);
        }
      }
      frontier = next;
    }

    selectedSymbols.sort((left, right) =>
      left.path.localeCompare(right.path) || left.start - right.start,
    );

    const lines: string[] = [
      "K.I.N.G.S. SYMBOL + DEPENDENCY CONTEXT",
      "Source below is bounded to task-relevant TypeScript/JavaScript declarations and directly resolved repository dependencies. Full repository verification remains authoritative; unseen source must not be invented.",
      `Indexed files: ${snapshot.files.length}`,
      `Indexed symbols: ${snapshot.symbols.length}`,
      `Import edges: ${snapshot.imports.length}`,
      "",
    ];

    let used = lines.join("\n").length;
    let truncated = false;
    for (const symbol of selectedSymbols) {
      const header = `SYMBOL: ${symbol.path}:${symbol.startLine}-${symbol.endLine} ${symbol.kind} ${symbol.name}${symbol.exported ? " [exported]" : ""}`;
      const block = `${header}\n${symbol.text}\n`;
      if (used + block.length > maxContextCharacters) {
        truncated = true;
        break;
      }
      lines.push(block);
      used += block.length;
    }

    if (dependencyFiles.size > 0) {
      const dependencySection = [
        "DIRECT DEPENDENCY FILES:",
        ...[...dependencyFiles].sort().map((path) => `- ${path}`),
      ].join("\n");
      if (used + dependencySection.length <= maxContextCharacters) {
        lines.push(dependencySection);
      } else {
        truncated = true;
      }
    }

    if (ranked.length > selectedSymbols.length) truncated = true;
    if (truncated) {
      lines.push("CONTEXT NOTICE: Additional symbols exist but were omitted by the bounded context budget.");
    }

    return {
      context: lines.join("\n"),
      selectedSymbols,
      dependencyFiles: [...dependencyFiles].sort(),
      totalSymbols: snapshot.symbols.length,
      totalImportEdges: snapshot.imports.length,
      truncated,
    };
  }
}
