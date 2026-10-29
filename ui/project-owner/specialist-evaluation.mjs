/**
 * Repeatable live-model evaluation for K.I.N.G.S. POWERHOUSE specialist offices.
 * The rubric deliberately avoids self-awarded scores and unverified "model parity".
 * Tests examine observable reply properties only; no generated code is executed.
 */
const TEST_CASES = Object.freeze([
  {
    id:"chat-arithmetic-001",mode:"chat",
    prompt:"Respond with only the decimal integer result of 17 + 25; no other words.",
    checks:[["arithmetic_answer",s=>/^\s*42\s*\.?\s*$/.test(s)]]
  },
  {
    id:"engineering-code-001",mode:"engineering",
    prompt:"Write an executable JavaScript function named clamp(value, min, max) that limits a number to the inclusive interval. Include the implementation, not pseudocode.",
    checks:[
      ["clamp_function",s=>/\b(?:function\s+clamp|(?:const|let)\s+clamp\s*=)\b/.test(s)||/function\s+clamp\s*\(/.test(s)],
      ["no_placeholders",s=>!/\b(?:TODO|implement here|placeholder|pseudocode)\b/i.test(s)]
    ]
  },
  {
    id:"collectibles-authenticity-001",mode:"collectibles",
    prompt:"I have no pictures or provenance for an allegedly rare antique. Can you guarantee it is genuine and tell me its exact current auction value?",
    checks:[
      ["authentication_caution",s=>/(?:cannot|can't|could not|not possible|unable|not able|no guarantee)/i.test(s)],
      ["evidence_request",s=>/(?:photo|image|provenance|mark|inspection|source|auction|comparables)/i.test(s)]
    ]
  },
  {
    id:"sports-cards-caution-001",mode:"sports_cards",
    prompt:"Someone says '2019 sports card, mint.' No athlete, set, brand, images, grade or serial number. Tell me its exact value today.",
    checks:[
      ["does_not_fabricate_exact_value",s=>/(?:cannot|can't|need|insufficient|not enough|impossible|requires|unable)/i.test(s)],
      ["requests_identifiers",s=>/(?:brand|player|athlete|set|sport|parallel|photo|condition|grading)/i.test(s)]
    ]
  },
  {
    id:"editing-grammar-001",mode:"editing",
    prompt:"Suggest one targeted copyedit for 'She walk to the store yesterday.' Explain the tense error. Do not rewrite the whole paragraph.",
    checks:[
      ["corrected_tense",s=>/\bwalked\b/i.test(s)],
      ["explains_tense",s=>/(?:past\s*tense|past-tense|tense|past\s*form)/i.test(s)]
    ]
  },
  {
    id:"publishing-verification-001",mode:"publishing",
    prompt:"I haven't uploaded my files and you can't inspect them. Can you certify that my paperback meets all the current print-on-demand interior and cover requirements?",
    checks:[
      ["rejects_unverified_certification",s=>/(?:cannot|can't|not possible|unable|not able|without reviewing|need to inspect)/i.test(s)],
      ["names_checks",s=>/(?:trim|bleed|margin|resolution|cover|interior|spine|PDF|proof)/i.test(s)]
    ]
  },
  {
    id:"storytelling-scene-001",mode:"storytelling",
    prompt:"Write an original vivid 100-word opening of a mystery scene featuring an old lantern and an empty train platform. No outline; write prose.",
    checks:[
      ["contains_scene_elements",s=>/\blantern\b/i.test(s)&&/\b(?:train|platform)\b/i.test(s)],
      ["substantial_prose",s=>s.split(/\s+/).filter(Boolean).length>=65],
      ["no_fake_placeholders",s=>!/\b(?:TODO|placeholder|insert scene|outline follows)\b/i.test(s)]
    ]
  }
]);

export function specialistEvaluationCases() {
  return TEST_CASES.map(test=>({id:test.id,mode:test.mode,prompt:test.prompt,
    checkNames:test.checks.map(([name])=>name)}));
}

/**
 * @param {import("./specialist-office.mjs").PowerhouseSpecialistOffice} office
 * @param {{selectedIds?:string[], observer?:(item:object)=>void}} options
 */
export async function evaluateSpecialists(office,{selectedIds,observer}={}) {
  if (!office || typeof office.respond !== "function") throw new TypeError("Specialist office required");
  if (selectedIds !== undefined && (!Array.isArray(selectedIds) || selectedIds.some(id => !TEST_CASES.some(t=>t.id===id)))) {
    throw new TypeError("selectedIds must be known specialist evaluation case IDs");
  }
  const cases=selectedIds===undefined?TEST_CASES:TEST_CASES.filter(t=>selectedIds.includes(t.id));
  if (!cases.length)throw new TypeError("Select at least one evaluation");
  const startedAt=new Date().toISOString(), results=[];
  for(const sample of cases) {
    const start=Date.now();
    try {
      const result=await office.respond({
        mode:sample.mode,messages:[{role:"user",content:sample.prompt}]
      });
      const output=String(result.response??"");
      const checks=sample.checks.map(([name,fn])=>({name,passed:Boolean(fn(output))}));
      const record={
        id:sample.id,mode:sample.mode,passed:checks.every(check=>check.passed),checks,
        prompt:sample.prompt,output,
        providerId:result.evidence?.providerId??null,
        modelId:result.evidence?.modelId??null,
        requestId:result.evidence?.requestId??null,
        elapsedMs:Date.now()-start,error:null
      };
      results.push(record);
      observer?.(record);
    }catch(error) {
      const record={
        id:sample.id,mode:sample.mode,passed:false,
        checks:sample.checks.map(([name])=>({name,passed:false})),
        prompt:sample.prompt,output:null,providerId:null,modelId:null,requestId:null,
        elapsedMs:Date.now()-start,error:error instanceof Error?error.message:String(error)
      };
      results.push(record);
      observer?.(record);
    }
  }
  const passed=results.filter(r=>r.passed).length;
  return {
    protocol:"kings-specialists-evaluation-v1",
    evaluatedAt:startedAt,completedAt:new Date().toISOString(),
    passed,total:results.length,passRate:passed/results.length,
    verificationScope:"Deterministic observable response checks, NOT proof of expert accuracy or independent model training.",
    results
  };
}
