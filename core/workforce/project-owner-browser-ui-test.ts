import {
  readFile,
} from "node:fs/promises";
import {
  join,
} from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main(): Promise<void> {
  const htmlPath = join(
    process.cwd(),
    "ui",
    "project-owner",
    "index.html",
  );
  const html = await readFile(htmlPath, "utf8");

  for (const id of [
    "repositoryUrl",
    "repositoryBaseRef",
    "repositoryPublishBranch",
    "repositoryPublish",
    "repository",
    "isolation",
    "refresh-models",
    "execute",
  ]) {
    assert(
      html.includes(`id="${id}"`),
      `owner UI is missing required production control/status id "${id}"`,
    );
  }

  assert(
    html.includes("GitHub Repository Workspace"),
    "owner UI does not expose GitHub repository mode",
  );
  assert(
    html.includes("publishVerifiedChanges"),
    "browser mission contract does not send verified publication preference",
  );
  assert(
    html.includes("p.processIsolation?.active"),
    "browser UI does not surface real host isolation state",
  );
  assert(
    html.includes("Promise.all([loadModels(),health()])"),
    "Refresh AI does not refresh both routing and runtime health",
  );

  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/i);
  assert(scriptMatch?.[1], "owner UI inline application script is missing");

  try {
    // Parse the browser application as JavaScript without executing DOM/fetch code.
    // eslint-disable-next-line no-new-func
    new Function(scriptMatch[1]);
  } catch (error) {
    throw new Error(
      `Owner browser JavaScript failed syntax compilation: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  assert(
    html.includes('@media(max-width:680px)'),
    "owner UI lost its Android/mobile responsive layout contract",
  );
  assert(
    html.includes('name="viewport"'),
    "owner UI lost its mobile viewport contract",
  );

  console.log("K.I.N.G.S. OWNER UI → BROWSER JAVASCRIPT SYNTAX: SUCCESS");
  console.log("K.I.N.G.S. OWNER UI → GITHUB WORKSPACE CONTROLS: SUCCESS");
  console.log("K.I.N.G.S. OWNER UI → HOST ISOLATION STATUS: SUCCESS");
  console.log("K.I.N.G.S. OWNER UI → CHROMEBOOK/ANDROID RESPONSIVE CONTRACT: SUCCESS");
  console.log("TREE-KCM-OWNER-BROWSER-UI: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-OWNER-BROWSER-UI: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
