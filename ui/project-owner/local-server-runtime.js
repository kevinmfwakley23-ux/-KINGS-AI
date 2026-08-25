#!/usr/bin/env node
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const port = Number(process.env.KINGS_CODING_MACHINE_PORT || 8787);
const host = "127.0.0.1";
const root = process.env.KINGS_CODING_MACHINE_WORKSPACE || process.cwd();
const uiFile = path.join(root, "ui", "project-owner", "index.html");
const model = process.env.KINGS_CODING_MACHINE_MODEL || "qwen2.5-coder:1.5b";

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(res, status, type, body) {
  res.writeHead(status, { "content-type": type });
  res.end(body);
}

async function main() {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        send(res, 200, "application/json; charset=utf-8", JSON.stringify({
          ok: true,
          name: "kings.local",
          model,
          workspace: root,
        }));
        return;
      }

      if (req.method === "GET" && req.url === "/") {
        const html = await fs.readFile(uiFile, "utf8");
        send(res, 200, "text/html; charset=utf-8", html);
        return;
      }

      if (req.method === "POST" && req.url === "/api/project-owner/missions") {
        const input = await readBody(req);
        send(res, 501, "application/json; charset=utf-8", JSON.stringify({
          ok: false,
          message: "Standalone runtime bootstrap is active. Mission execution remains delegated to the compiled TypeScript machine runtime.",
          receivedAction: input?.action || null,
        }));
        return;
      }

      send(res, 404, "text/plain; charset=utf-8", "Not Found");
    } catch (error) {
      send(res, 500, "application/json; charset=utf-8", JSON.stringify({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  });

  server.listen(port, host, () => {
    console.log(`KINGS CODING MACHINE UI: http://127.0.0.1:${port}`);
    console.log(`Workspace: ${root}`);
    console.log(`Model: ${model}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
