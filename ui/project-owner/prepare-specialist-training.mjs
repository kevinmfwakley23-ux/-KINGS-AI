#!/usr/bin/env node
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { buildSpecialistTrainingExport } from "./specialist-training-data.mjs";

const args=process.argv.slice(2);
function flag(name){const i=args.indexOf(name);return i<0?null:args[i+1]}
const input=flag("--input"),output=flag("--output");
if(!input||!output||args.length!==4||!args.includes("--input")||!args.includes("--output")) {
  console.error("Usage: node ui/project-owner/prepare-specialist-training.mjs --input <owner-reviewed.json> --output <private-output-directory>");
  process.exitCode=2;
} else {
  try {
    const source=JSON.parse(await readFile(resolve(input),"utf8"));
    const exported=buildSpecialistTrainingExport(source);
    const dir=resolve(output);
    await mkdir(dir,{recursive:true,mode:0o700});
    async function atomic(name,body){
      const to=resolve(dir,name),temp=to+"."+randomUUID()+".tmp";
      await writeFile(temp,body,{mode:0o600});
      await rename(temp,to);
    }
    await atomic("train.jsonl",exported.trainJsonl);
    await atomic("validation.jsonl",exported.validationJsonl);
    await atomic("manifest.json",JSON.stringify(exported.manifest,null,2)+"\n");
    console.log(JSON.stringify({output:dir, ...exported.manifest},null,2));
    console.log("Dataset only: no training process was started and no provider upload occurred.");
  } catch(error) {
    console.error("Specialist training data export refused:",error instanceof Error?error.message:error);
    process.exitCode=1;
  }
}
