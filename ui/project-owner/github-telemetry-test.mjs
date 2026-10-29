import assert from "node:assert/strict";
import { githubCommandCenterSnapshot } from "./github-telemetry.mjs";
const calls = [];
const mock = async (url, options) => {
  calls.push({url,options});
  const data = url.endsWith("/actions/runs?per_page=10")
    ? {workflow_runs:[{id:42,name:"CI",status:"completed",conclusion:"success",head_branch:"main",created_at:"2026-01-01",html_url:"https://github.com/example"}]}
    : url.endsWith("/pulls?state=open&per_page=10")
    ? [{number:3,title:"Improve tests",draft:false,updated_at:"2026-01-01",html_url:"https://github.com/example/pr"}]
    : {full_name:"owner/repo",default_branch:"main",pushed_at:"2026-01-01"};
  return {ok:true,json:async()=>data};
};
const result = await githubCommandCenterSnapshot({repository:"owner/repo",token:"secret-token",fetchImpl:mock});
assert.equal(result.repository,"owner/repo");
assert.equal(result.workflows[0].conclusion,"success");
assert.equal(result.pullRequests[0].number,3);
assert.equal(calls.length,3);
assert.ok(calls.every(c=>c.options.headers.authorization==="Bearer secret-token"));
assert.ok(!JSON.stringify(result).includes("secret-token"));
await assert.rejects(()=>githubCommandCenterSnapshot({repository:"bad/path/extra",fetchImpl:mock}),/Invalid/);
await assert.rejects(()=>githubCommandCenterSnapshot({repository:"owner/repo",fetchImpl:async()=>({ok:false,status:403})}),/HTTP 403/);
console.log("GitHub command-center telemetry tests passed");
