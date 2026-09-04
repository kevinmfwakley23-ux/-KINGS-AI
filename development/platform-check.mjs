import { spawnSync } from "node:child_process";
import { platform, arch } from "node:os";

const requiredMajor = 22;
const major = Number(process.versions.node.split(".")[0]);
const results = [];
results.push(["Node >= 22", major >= requiredMajor, process.version]);
for (const [name, command, args] of [
  ["npm", process.platform === "win32" ? "npm.cmd" : "npm", ["--version"]],
  ["Python", process.platform === "win32" ? "python" : "python3", ["--version"]],
]) {
  const r = spawnSync(command, args, { encoding: "utf8", shell: false });
  results.push([name, r.status === 0, (r.stdout || r.stderr || "").trim()]);
}
console.log(`Platform: ${platform()} ${arch()}`);
for (const [name, ok, detail] of results) console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
if (results.some(([,ok]) => !ok)) process.exitCode = 1;
