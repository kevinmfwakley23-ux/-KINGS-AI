import { spawnSync } from "node:child_process";
import { platform, arch } from "node:os";

const requiredMajor = 22;
const major = Number(process.versions.node.split(".")[0]);
const results = [];
results.push(["Node >= 22", major >= requiredMajor, process.version]);

function probe(name, command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", shell: false });
  const detail = (
    result.stdout ||
    result.stderr ||
    result.error?.message ||
    (result.status === null ? "process did not start" : `exit ${result.status}`)
  ).trim();
  results.push([name, result.status === 0, detail]);
}

const npmExecPath = process.env.npm_execpath;
if (npmExecPath) {
  probe("npm", process.execPath, [npmExecPath, "--version"]);
} else if (process.platform === "win32") {
  probe("npm", "cmd.exe", ["/d", "/s", "/c", "npm --version"]);
} else {
  probe("npm", "npm", ["--version"]);
}

probe("Python", process.platform === "win32" ? "python" : "python3", ["--version"]);

console.log(`Platform: ${platform()} ${arch()}`);
for (const [name, ok, detail] of results) console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
if (results.some(([, ok]) => !ok)) process.exitCode = 1;
