import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateSpecialists, specialistEvaluationCases } from "./specialist-evaluation.mjs";

const canned={
  chat:"42",
  engineering:"function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }",
  collectibles:"I cannot guarantee authenticity or exact market value without photographs, provenance, and recent comparable sales.",
  sports_cards:"An exact value cannot be assigned; I need the athlete, brand, set, year, parallel, and grade.",
  editing:"Change 'walk' to 'walked' to use the past tense of the verb.",
  publishing:"I cannot certify compliance without examining the actual interior PDF, margins, bleed and cover.",
  storytelling:"The lantern guttered as the empty train platform disappeared beneath a blanket of fog. Mara counted the distant footfalls once, twice, but no one emerged from the tunnel. The abandoned clock shivered over the ticket booth, its hands jammed at the hour the station had burned. She moved along the yellow line, careful not to look into the tracks. A whistle rose from somewhere beneath the earth. The little flame in the lantern turned blue. At the far end of the platform a suitcase opened by itself, and inside it lay a child's shoe, still wet with rain."
};
test("evaluation suites cover every specialist and report deterministic checks",async()=>{
  const calls=[];
  const office={respond:async input=>{
    calls.push(input);
    return {response:canned[input.mode],evidence:{
      providerId:"live-verified-route",modelId:"test-fixture",
      requestId:"fixture-"+input.mode
    }};
  }};
  const seen=[];
  const report=await evaluateSpecialists(office,{observer:value=>seen.push(value)});
  assert.equal(report.total,7);
  assert.equal(report.passed,7,JSON.stringify(report.results.filter(r=>!r.passed),null,2));
  assert.equal(report.passRate,1);
  assert.equal(calls.length,7);
  assert.equal(seen.length,7);
  assert.match(report.verificationScope,/NOT proof of expert accuracy/);
  assert.equal(report.results[0].providerId,"live-verified-route");
});
test("provider errors never count as passed tests",async()=>{
  const office={respond:async()=>{throw Error("no configured model")}};
  const report=await evaluateSpecialists(office,{selectedIds:["chat-arithmetic-001"]});
  assert.equal(report.passed,0);
  assert.equal(report.total,1);
  assert.match(report.results[0].error,/no configured model/);
});
test("weak fabricated replies cannot pass knowledge checks",async()=>{
  const office={respond:async()=>({response:"Absolutely guaranteed, worth $9999999.",
    evidence:{providerId:"fake",modelId:"fiction",requestId:"test"}})};
  const report=await evaluateSpecialists(office,{
    selectedIds:["collectibles-authenticity-001","publishing-verification-001"]});
  assert.equal(report.passed,0);
});
test("evaluation case selection is explicitly bounded",async()=>{
  const office={respond:async()=>{throw Error("should not run")}};
  await assert.rejects(evaluateSpecialists(office,{selectedIds:["unknown"]}),/known/);
  await assert.rejects(evaluateSpecialists(office,{selectedIds:[]}),/at least one/);
  assert.equal(specialistEvaluationCases().length,7);
});
