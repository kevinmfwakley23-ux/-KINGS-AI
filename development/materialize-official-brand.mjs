import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_SHA256 = "120a27fdad36b77eb9f0eae0e0e065c44d93eb57ed0aa3afd94e36d1ef04b1f0";
const EXPECTED_BASE64_LENGTH = 62660;
const EXPECTED_PNG_LENGTH = 46994;
const EXPECTED_PARTS = [
  "kings-ai-official-logo.part00.b64",
  "kings-ai-official-logo.part01.b64",
  "kings-ai-official-logo.part02.b64",
  "kings-ai-official-logo.part03.b64",
  "kings-ai-official-logo.part04.b64",
  "kings-ai-official-logo.part05a.b64",
  "kings-ai-official-logo.part05b.b64",
  "kings-ai-official-logo.part06.b64",
  "kings-ai-official-logo.part07.b64",
];

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = resolve(root, "native-shell", "brand-source");
const outputPath = resolve(root, "native-shell", "kings-ai-official-logo.png");

const base64 = (
  await Promise.all(EXPECTED_PARTS.map((name) => readFile(resolve(sourceDirectory, name), "utf8")))
).join("").replace(/\s+/gu, "");

if (base64.length !== EXPECTED_BASE64_LENGTH) {
  throw new Error(
    `K.I.N.G.S. brand materializer: encoded crest length changed (${base64.length}; expected ${EXPECTED_BASE64_LENGTH}).`,
  );
}

const png = Buffer.from(base64, "base64");
if (png.length !== EXPECTED_PNG_LENGTH) {
  throw new Error(
    `K.I.N.G.S. brand materializer: decoded crest length changed (${png.length}; expected ${EXPECTED_PNG_LENGTH}).`,
  );
}

const sha256 = createHash("sha256").update(png).digest("hex");
if (sha256 !== EXPECTED_SHA256) {
  throw new Error(
    `K.I.N.G.S. brand materializer: official crest SHA-256 mismatch (${sha256}; expected ${EXPECTED_SHA256}).`,
  );
}

if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
  throw new Error("K.I.N.G.S. brand materializer: decoded official crest is not a PNG.");
}
if (png.readUInt32BE(16) !== 256 || png.readUInt32BE(20) !== 256) {
  throw new Error("K.I.N.G.S. brand materializer: official application crest must remain 256×256.");
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, png, { mode: 0o644 });
console.log(`K.I.N.G.S. official brand materialized: ${EXPECTED_PNG_LENGTH} bytes · sha256 ${sha256}`);
