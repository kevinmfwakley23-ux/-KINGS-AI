#!/usr/bin/env node
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const out = path.join(root, ".kings-ui-build", "ui", "project-owner", "local-server.js");

if (!fs.existsSync(out)) {
  console.error("KINGS CODING MACHINE: compiled server missing:", out);
  console.error("Run ui/project-owner/start-local.sh once to build the service runtime.");
  process.exit(1);
}

process.env.KINGS_CODING_MACHINE_PORT ||= "8787";
process.env.KINGS_CODING_MACHINE_HOST ||= "kings.local";
process.env.KINGS_CODING_MACHINE_MODEL ||= "qwen2.5-coder:1.5b";
process.env.KINGS_CODING_MACHINE_WORKSPACE ||= root;

execFileSync(process.execPath, [out], {
  cwd: root,
  stdio: "inherit",
});
