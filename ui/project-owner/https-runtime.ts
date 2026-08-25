import { createServer } from "node:https";
import { readFile, access } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const certDir = process.env.KINGS_LOCAL_HTTPS_CERT_DIR ?? join(root, ".kings-local-https");
const kingsPort = Number(process.env.KINGS_CODING_MACHINE_HTTPS_PORT ?? 8787);
const forgePort = Number(process.env.AUTHORS_FORGE_HTTPS_PORT ?? 8788);
const kingsHost = process.env.KINGS_CODING_MACHINE_HTTPS_HOST ?? "kings.localhost";
const forgeHost = process.env.AUTHORS_FORGE_HOST ?? "authors-forge.localhost";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadTls(host: string): Promise<{ key: Buffer; cert: Buffer }> {
  const keyPath = join(certDir, `${host}.key.pem`);
  const certPath = join(certDir, `${host}.cert.pem`);
  if (!(await exists(keyPath)) || !(await exists(certPath))) {
    throw new Error(`Local HTTPS certificate is missing for ${host}`);
  }
  return {
    key: await readFile(keyPath),
    cert: await readFile(certPath),
  };
}

async function main(): Promise<void> {
  const [kingsTls, forgeTls] = await Promise.all([
    loadTls(kingsHost),
    loadTls(forgeHost),
  ]);

  const kingsHtml = await readFile(join(root, "ui/project-owner/index.html"), "utf8");
  const forgeHtml = await readFile(join(root, "ui/project-owner/authors-forge.html"), "utf8");

  const kingsServer = createServer(kingsTls, (_req, res) => {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("K.I.N.G.S. HTTPS runtime is reserved and ready.\n");
  });

  const forgeServer = createServer(forgeTls, (_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(forgeHtml);
  });

  await new Promise<void>((resolve, reject) => {
    let ready = 0;
    const fail = (error: Error) => reject(error);
    kingsServer.once("error", fail);
    forgeServer.once("error", fail);
    kingsServer.listen(kingsPort, "127.0.0.1", () => {
      ready += 1;
      if (ready === 2) resolve();
    });
    forgeServer.listen(forgePort, "127.0.0.1", () => {
      ready += 1;
      if (ready === 2) resolve();
    });
  });

  console.log(`K.I.N.G.S. HTTPS runtime: https://${kingsHost}:${kingsPort}`);
  console.log(`Author's Forge HTTPS runtime: https://${forgeHost}:${forgePort}`);
  console.log(`K.I.N.G.S. HTTP owner runtime remains available separately.`);
  void kingsHtml;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
