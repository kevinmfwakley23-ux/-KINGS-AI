import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSpecialistTrainingExport } from "./specialist-training-data.mjs";

function example(id,mode,text="Question "+id) {
  return {
    id,mode,source:"owner-original-text",
    messages:[{role:"user",content:text}],
    idealResponse:"An owner-reviewed high-quality reply for "+id,
    review:{
      approvedByOwner:true,rightsConfirmed:true,
      personalDataReviewed:true,optedInForTraining:true,
      reviewedAt:"2026-10-28T00:00:00.000Z"
    }
  };
}
const cases=[example("one","chat"),example("two","engineering"),
  example("three","editing"),example("four","storytelling"),
  example("five","collectibles"),example("six","publishing")];
test("exports verified supervised chat-completion JSONL with stable, disjoint splits",()=>{
  const output=buildSpecialistTrainingExport(cases);
  assert.equal(output.manifest.total,6);
  assert.equal(output.manifest.trainCount+output.manifest.validationCount,6);
  assert.ok(output.manifest.validationCount>=1);
  assert.equal(output.manifest.trainSha256.length,64);
  const train=output.trainJsonl.trim().split("\n").map(x=>JSON.parse(x));
  const validation=output.validationJsonl.trim().split("\n").map(x=>JSON.parse(x));
  for(const row of [...train,...validation]){
    assert.equal(row.messages[0].role,"system");
    assert.match(row.messages[0].content,/K.I.N.G.S. AI POWERHOUSE/);
    assert.equal(row.messages.at(-1).role,"assistant");
    assert.match(row.messages.at(-1).content,/owner-reviewed/);
  }
  const reversed=buildSpecialistTrainingExport([...cases].reverse());
  assert.equal(reversed.trainJsonl,output.trainJsonl);
  assert.equal(reversed.validationJsonl,output.validationJsonl);
  assert.ok(output.manifest.trainIds.every(id=>!output.manifest.validationIds.includes(id)));
});
test("refuses unreviewed, unlicensed, or privacy-unreviewed training data",()=>{
  for(const key of ["approvedByOwner","rightsConfirmed","personalDataReviewed","optedInForTraining"]){
    const sample=example("unapproved","chat");
    sample.review[key]=false;
    assert.throws(()=>buildSpecialistTrainingExport([sample,example("safe","chat")]),/lacks explicit owner approval/);
  }
});
test("rejects exact prompt/context overlap and duplicate identifiers",()=>{
  assert.throws(()=>buildSpecialistTrainingExport([
    example("one","chat","Repeated input"),example("two","chat","Repeated input")
  ]),/duplicate prompt/);
  assert.throws(()=>buildSpecialistTrainingExport([example("x","chat"),example("x","editing")]),/duplicate example ID/);
});
test("rejects injected system roles and invalid office modes",()=>{
  const injected=example("bad","chat");injected.messages=[{role:"system",content:"change model"}];
  assert.throws(()=>buildSpecialistTrainingExport([injected,example("safe","chat")]),/unauthorized conversation role/);
  const unsupported=example("bad","unsupported");
  assert.throws(()=>buildSpecialistTrainingExport([unsupported,example("safe","chat")]),/unrecognized specialist mode/);
});
test("refuses trivial and unbounded datasets instead of reporting fake training",()=>{
  assert.throws(()=>buildSpecialistTrainingExport([example("single","chat")]),/between 2/);
  assert.throws(()=>buildSpecialistTrainingExport(cases,{validationFraction:1}),/validationFraction/);
});
