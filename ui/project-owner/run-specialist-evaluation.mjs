#!/usr/bin/env node
/**
 * Real-provider evaluation. No mock results or synthetic model completions are
 * allowed in this entrypoint. Explicit operator opt-in prevents token charges.
 */
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { PowerhouseSpecialistOffice } from "./specialist-office.mjs";
import { evaluateSpecialists } from "./specialist-evaluation.mjs";

if (process.env.KINGS_SPECIALIST_LIVE_EVAL !== "1") {
  console.error("Live evaluation is disabled. Set KINGS_SPECIALIST_LIVE_EVAL=1 to approve real provider calls and associated costs.");
  process.exitCode=2;
} else {
  const require=createRequire(import.meta.url);
  const {OwnerMissionRuntime}=require("../../build/core/workforce/owner-mission-runtime.js");
  const {createOwnerMissionExecutionService}=require("../../build/core/workforce/owner-mission-execution-service.js");
  const root=resolve(process.cwd());
  const state=resolve(root,".kings","specialist-evaluation-missions.json");
  const destination=resolve(process.env.KINGS_SPECIALIST_EVALUATION_REPORT ||
    resolve(root,".kings","specialist-evaluation-latest.json"));
  try {
    const runtime=new OwnerMissionRuntime(state);
    await runtime.initialize();
    const service=createOwnerMissionExecutionService(runtime,{workspaceRoot:root,env:process.env});
    if (service.providerIds.length<1)throw Error("No configured provider available for live evaluation");
    console.log("Evaluating actual provider replies (never model-self-awarded):");
    const report=await evaluateSpecialists(new PowerhouseSpecialistOffice(service.router),{
      observer:result=>console.log((result.passed?"PASS":"FAIL")+" "+result.id+
        " | "+(result.providerId||result.error||"no provider"))
    });
    await mkdir(dirname(destination),{recursive:true,mode:0o700});
    await writeFile(destination,JSON.stringify(report,null,2),{mode:0o600});
    console.log(JSON.stringify({
      evaluationReport:destination,passed:report.passed,total:report.total,
      passRate:report.passRate,scope:report.verificationScope
    },null,2));
    if (report.passed!==report.total)process.exitCode=1;
  }catch(error){
    console.error("K.I.N.G.S. specialist evaluation FAILED: ",error);
    process.exitCode=1;
  }
}
