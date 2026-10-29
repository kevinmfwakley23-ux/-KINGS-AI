import { createHash } from "node:crypto";
import { specialistModes, specialistSystemPolicy } from "./specialist-office.mjs";

/**
 * Human-curated supervised fine-tuning data preparation, NOT model training.
 * All training/review artifacts stay local until the owner explicitly transfers
 * them to an approved training provider. This is not a new memory subsystem.
 */
function reject(message) { throw new Error("K.I.N.G.S. training export: " + message); }
function checkedText(value,name,max=16000) {
  if(typeof value!=="string"||!value.trim()||value.length>max)reject(name+" must contain nonempty bounded text");
  return value.trim();
}
const modes=new Set(specialistModes.map(x=>x.id));
function normalizeExample(value,index) {
  if(!value||typeof value!=="object"||Array.isArray(value))reject("example "+index+" must be an object");
  const id=checkedText(value.id,"id",120);
  if(!/^[a-zA-Z0-9._:-]+$/.test(id))reject("example "+id+" id contains unsupported characters");
  if(!modes.has(value.mode))reject("example "+id+" has unrecognized specialist mode");
  const review=value.review;
  if(!review||review.approvedByOwner!==true||review.rightsConfirmed!==true||
     review.personalDataReviewed!==true||review.optedInForTraining!==true) {
    reject("example "+id+" lacks explicit owner approval, rights attestation, privacy review, or opt-in");
  }
  if(typeof review.reviewedAt!=="string"||Number.isNaN(Date.parse(review.reviewedAt))) {
    reject("example "+id+" requires a valid reviewedAt timestamp");
  }
  const source=checkedText(value.source,"source",500);
  const response=checkedText(value.idealResponse,"idealResponse",24000);
  if(!Array.isArray(value.messages)||!value.messages.length||value.messages.length>24) {
    reject("example "+id+" requires 1-24 conversational messages");
  }
  let total=0;
  const messages=value.messages.map(message=>{
    if(!message||typeof message!=="object"||Array.isArray(message)||
        Object.keys(message).some(k=>!["role","content"].includes(k))||
        !["user","assistant"].includes(message.role)) {
      reject("example "+id+" contains an unauthorized conversation role or field");
    }
    const content=checkedText(message.content,"message.content",12000);
    total+=content.length;
    return {role:message.role,content};
  });
  if(total>48000)reject("example "+id+" context too large");
  if(messages[messages.length-1].role!=="user")reject("example "+id+" must finish with a user turn");
  const fingerprint=createHash("sha256").update(JSON.stringify({
    mode:value.mode,messages
  })).digest("hex");
  const row={
    messages:[
      {role:"system",content:specialistSystemPolicy(value.mode)},
      ...messages,
      {role:"assistant",content:response}
    ]
  };
  return {id,mode:value.mode,source,fingerprint,row,reviewedAt:review.reviewedAt};
}

export function buildSpecialistTrainingExport(examples,{validationFraction=0.2}={}) {
  if(!Array.isArray(examples)||examples.length<2||examples.length>100000) {
    reject("provide between 2 and 100000 reviewed examples");
  }
  if(!Number.isFinite(validationFraction)||validationFraction<=0||validationFraction>=0.5) {
    reject("validationFraction must be greater than 0 and less than 0.5");
  }
  const items=examples.map(normalizeExample);
  const uniqueIds=new Set(),uniquePrompts=new Set();
  for(const item of items){
    if(uniqueIds.has(item.id))reject("duplicate example ID: "+item.id);
    if(uniquePrompts.has(item.fingerprint))reject("duplicate prompt/context: "+item.id);
    uniqueIds.add(item.id);uniquePrompts.add(item.fingerprint);
  }
  // Sort by immutable prompt fingerprint, not input order, so a repeat export
  // with re-ordered files yields the same split and catches prompt leakage.
  items.sort((a,b)=>a.fingerprint.localeCompare(b.fingerprint));
  const validationCount=Math.max(1,Math.min(items.length-1,Math.round(items.length*validationFraction)));
  const validation=items.slice(0,validationCount);
  const train=items.slice(validationCount);
  const jsonl=rows=>rows.map(item=>JSON.stringify(item.row)).join("\n")+"\n";
  const totals={};
  for(const x of items)totals[x.mode]=(totals[x.mode]||0)+1;
  return {
    trainJsonl:jsonl(train),
    validationJsonl:jsonl(validation),
    manifest:{
      protocol:"kings-supervised-specialist-dataset-v1",
      exportedAt:new Date().toISOString(),
      total:items.length,trainCount:train.length,validationCount:validation.length,
      countsByOffice:totals,
      trainIds:train.map(item=>item.id),
      validationIds:validation.map(item=>item.id),
      reviewProvenance:items.map(item=>({
        id:item.id,office:item.mode,source:item.source,reviewedAt:item.reviewedAt,
        promptSha256:item.fingerprint
      })),
      trainSha256:createHash("sha256").update(jsonl(train)).digest("hex"),
      validationSha256:createHash("sha256").update(jsonl(validation)).digest("hex"),
      ownerReviewRequired:true,
      notes:"Dataset preparation only. No model weights trained, provider upload performed, or performance claim made. Explicit operator authorization and independent evaluation required before training."
    }
  };
}
