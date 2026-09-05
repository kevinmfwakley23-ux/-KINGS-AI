import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  EngineeringLanguageRegistry,
  createDefaultEngineeringLanguages,
} from "./engineering-language";

import {
  LocalProjectLanguageDetector,
} from "./project-language-detector";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "kings-project-detect-"));

  try {
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "scripts"), { recursive: true });
    await mkdir(join(root, "node_modules", "ignored"), { recursive: true });

    await writeFile(join(root, "src", "index.ts"), "export const one = 1;\n");
    await writeFile(join(root, "src", "worker.ts"), "export const two = 2;\n");
    await writeFile(join(root, "scripts", "verify.py"), "print('ok')\n");
    await writeFile(join(root, "package-lock.json"), "{}\n");
    await writeFile(join(root, "tsconfig.json"), "{}\n");
    await writeFile(join(root, "Makefile"), "test:\n\t@echo ok\n");
    await writeFile(join(root, "node_modules", "ignored", "fake.py"), "print('ignored')\n");

    const registry = new EngineeringLanguageRegistry();
    for (const language of createDefaultEngineeringLanguages()) {
      registry.register(language);
    }

    const detector = new LocalProjectLanguageDetector(registry);
    const result = await detector.detect(root);

    assert(
      result.primaryLanguage === "typescript",
      "TypeScript must be selected as the primary project language by real source-file evidence.",
    );

    assert(
      result.languages.find((item) => item.language === "typescript")?.fileCount === 2,
      "TypeScript source count must reflect files outside ignored build/dependency directories.",
    );

    assert(
      result.languages.find((item) => item.language === "python")?.fileCount === 1,
      "Python source detection must preserve secondary project languages.",
    );

    assert(
      result.packageManagers.includes("npm"),
      "package-lock.json must identify npm package-management evidence.",
    );

    assert(
      result.buildSystems.includes("typescript") && result.buildSystems.includes("make"),
      "Project markers must identify TypeScript and Make build-system evidence.",
    );

    assert(
      result.manifestFiles.includes("package-lock.json") &&
        result.manifestFiles.includes("tsconfig.json") &&
        result.manifestFiles.includes("Makefile"),
      "Detected environment evidence must preserve the manifest files that established it.",
    );

    console.log("08.PROJECT real source-language detection: SUCCESS");
    console.log("08.PROJECT package/build environment detection: SUCCESS");
    console.log("08.PROJECT dependency/build output exclusion: SUCCESS");
    console.log("TREE-08 PROJECT ENGINEERING DETECTION: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
