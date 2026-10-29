import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import net from "node:net";
import http from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(fileURLToPath(new URL("../../",import.meta.url)));
const accessToken="owner-"+randomUUID()+"-"+randomUUID();

function freePort(){
  return new Promise((resolvePort,reject)=>{
    const server=net.createServer();
    server.once("error",reject);
    server.listen(0,"127.0.0.1",()=>{
      const port=server.address().port;
      server.close(error=>error?reject(error):resolvePort(port));
    });
  });
}
async function waitForHealth(url,child,output){
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){
    if(child.exitCode!==null)throw Error("Owner console exited: "+output());
    try{const response=await fetch(url+"/health");if(response.ok)return}catch{}
    await new Promise(done=>setTimeout(done,50));
  }
  throw Error("Owner console did not become healthy: "+output());
}
async function stop(child){
  if(child.exitCode!==null)return;
  child.kill("SIGTERM");
  const timeout=setTimeout(()=>child.kill("SIGKILL"),3000);
  try{await once(child,"exit")}finally{clearTimeout(timeout)}
}
async function main(){
  const dir=await mkdtemp(join(tmpdir(),"kings-specialist-http-"));
  const apiPort=await freePort();
  let requests=0,readBody=null;
  const model=http.createServer(async(req,res)=>{
    try{
      assert.equal(req.url,"/v1/chat/completions");
      const chunks=[];for await(const piece of req)chunks.push(piece);
      readBody=JSON.parse(Buffer.concat(chunks).toString("utf8"));
      requests++;
      res.writeHead(200,{"content-type":"application/json"});
      res.end(JSON.stringify({
        choices:[{message:{content:"I can assist, and will identify unknowns."}}],
        usage:{prompt_tokens:40,completion_tokens:12,total_tokens:52}
      }));
    }catch(error){res.writeHead(500);res.end(String(error))}
  });
  await new Promise(done=>model.listen(0,"127.0.0.1",done));
  const providerPort=model.address().port;
  const env={
    ...process.env,
    KINGS_CODING_MACHINE_PORT:String(apiPort),
    KINGS_CODING_MACHINE_BIND:"0.0.0.0",
    KINGS_CODING_MACHINE_TOKEN:accessToken,
    KINGS_CODING_MACHINE_WORKSPACE:root,
    KINGS_OWNER_MISSION_STORE:join(dir,"missions.json"),
    KINGS_OWNER_CONTEXT_STORE:join(dir,"context.json"),
    KINGS_COLLECTIBLES_REPORT_STORE:join(dir,"collectibles.json"),
    KINGS_OMNIROUTE_BASE_URL:"http://127.0.0.1:"+providerPort+"/v1",
    KINGS_OMNIROUTE_MODELS:"auto/coding",
    KINGS_APP_ROUTER_PROVIDER_ORDER:"omniroute"
  };
  for(const name of ["KINGS_9ROUTER_BASE_URL","KINGS_9ROUTER_MODELS","KINGS_9ROUTER_HOSTPORT",
    "KINGS_9ROUTER_VISION_MODELS","KINGS_OLLAMA_BASE_URL","KINGS_OLLAMA_MODEL",
    "KINGS_OLLAMA_MODELS"])delete env[name];
  const child=spawn(process.execPath,["ui/project-owner/server.mjs"],{
    cwd:root,env,stdio:["ignore","pipe","pipe"]});
  let output="";
  child.stdout.on("data",chunk=>{output+=chunk});
  child.stderr.on("data",chunk=>{output+=chunk});
  const url="http://127.0.0.1:"+apiPort;
  const auth={authorization:"Bearer "+accessToken};
  try{
    await waitForHealth(url,child,()=>output);
    assert.equal((await fetch(url+"/specialists")).status,401,"Unauthorized office UI must be blocked");
    assert.equal((await fetch(url+"/api/specialists")).status,401,"Unauthorized office metadata must be blocked");
    assert.equal((await fetch(url+"/api/specialists/chat",{
      method:"POST",headers:{"content-type":"application/json","x-kings-owner-action":"chat-specialist"},
      body:JSON.stringify({mode:"chat",messages:[{role:"user",content:"hello"}]})
    })).status,401,"Unauthorized provider requests must be blocked");
    assert.equal(requests,0);
    const page=await fetch(url+"/specialists",{headers:auth});
    assert.equal(page.status,200);
    assert.match(await page.text(),/Specialist Offices/);
    const available=await(await fetch(url+"/api/specialists",{headers:auth})).json();
    assert.equal(available.modes.length,7);
    const payload={mode:"editing",messages:[
      {role:"user",content:"Can you critique this dialogue?"}
    ]};
    const notConfirmed=await fetch(url+"/api/specialists/chat",{
      method:"POST",headers:{...auth,"content-type":"application/json"},body:JSON.stringify(payload)
    });
    assert.equal(notConfirmed.status,400);
    assert.equal(requests,0);
    const invalid=await fetch(url+"/api/specialists/chat",{
      method:"POST",headers:{...auth,"content-type":"application/json","x-kings-owner-action":"chat-specialist"},
      body:JSON.stringify({...payload,providerId:"unapproved"})
    });
    assert.equal(invalid.status,400);
    assert.equal(requests,0);
    const accepted=await fetch(url+"/api/specialists/chat",{
      method:"POST",headers:{...auth,"content-type":"application/json","x-kings-owner-action":"chat-specialist"},
      body:JSON.stringify(payload)
    });
    const data=await accepted.json();
    assert.equal(accepted.status,200,JSON.stringify(data));
    assert.equal(data.result.mode,"editing");
    assert.equal(data.result.evidence.providerId,"omniroute");
    assert.equal(data.result.evidence.modelId,"auto/coding");
    assert.equal(data.result.actionTaken,false);
    assert.equal(requests,1,"Exactly one model request should be sent");
    assert.equal(readBody.messages[0].role,"system");
    assert.match(readBody.messages[0].content,/never silently rewrite/i);
    assert.equal(readBody.messages[1].role,"user");
    assert.equal(readBody.messages[1].content,payload.messages[0].content);
    assert.equal(readBody.model,"auto/coding");
    console.log("Owner-authenticated specialist office HTTP/provider integration: PASSED");
  }finally{
    await stop(child);
    await new Promise(done=>model.close(done));
    await rm(dir,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
