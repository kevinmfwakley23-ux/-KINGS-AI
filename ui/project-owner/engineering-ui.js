(() => {
  "use strict";
  const court = document.querySelector(".court-grid");
  if (!court || document.querySelector("#engineering-command-center")) return;

  const style = document.createElement("style");
  style.textContent = `
    .engineering-command{grid-column:1/-1}.engineering-form{display:grid;grid-template-columns:minmax(180px,.55fr) minmax(260px,1.45fr);gap:12px}.engineering-field{display:grid;gap:5px}.engineering-field>span,.operation-group legend{font-size:.68rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--kings-muted)}.engineering-field input{min-height:46px;padding:10px 12px;border:1px solid var(--kings-border-strong);border-radius:9px;background:var(--kings-panel-strong);color:var(--kings-ink)}.operation-group{grid-column:1/-1;border:1px solid var(--kings-border);border-radius:10px;padding:10px 12px}.operation-list{display:flex;gap:8px 14px;flex-wrap:wrap}.operation-list label,.engineering-consent{display:flex;align-items:center;gap:7px;min-height:38px;font-size:.78rem;color:var(--kings-muted)}.operation-list input,.engineering-consent input{width:18px;height:18px;accent-color:var(--kings-gold)}.engineering-actions{grid-column:1/-1;display:flex;gap:9px;flex-wrap:wrap}.engineering-actions button{min-height:46px}.engineering-actions button:disabled{opacity:.45;cursor:not-allowed;transform:none}.engineering-output{grid-column:1/-1;display:grid;gap:10px}.engineering-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}.engineering-summary>div{padding:10px;border:1px solid var(--kings-border);border-radius:9px;background:var(--kings-panel-soft)}.engineering-summary strong{display:block;margin-bottom:3px;font-family:"Libre Baskerville",Georgia,serif;font-size:.77rem}.engineering-summary span{color:var(--kings-muted);font-size:.75rem;word-break:break-word}.engineering-plan{display:grid;gap:6px}.engineering-step{display:flex;justify-content:space-between;gap:10px;padding:9px 10px;border-left:2px solid var(--kings-gold);background:var(--kings-panel-soft);font-size:.77rem}.engineering-block{padding:10px 12px;border:1px solid rgba(157,63,63,.35);border-radius:9px;color:var(--kings-danger);background:var(--kings-panel-soft)}.engineering-ok{padding:10px 12px;border:1px solid rgba(47,118,80,.35);border-radius:9px;color:var(--kings-success);background:var(--kings-panel-soft)}.engineering-evidence details{margin:7px 0;border:1px solid var(--kings-border);border-radius:9px;padding:9px;background:var(--kings-panel-soft)}.engineering-evidence summary{cursor:pointer;font-weight:700}.engineering-evidence pre{overflow:auto;max-height:260px;padding:10px;border-radius:7px;background:var(--kings-black);color:#eee6d8;font-size:.72rem;white-space:pre-wrap;word-break:break-word}.engineering-job-state{font-weight:800;letter-spacing:.05em}.engineering-consent{grid-column:1/-1;padding:9px 10px;border:1px solid var(--kings-border);border-radius:9px;background:var(--kings-panel-soft)}
    @media(max-width:760px){.engineering-form{grid-template-columns:1fr}.operation-group,.engineering-actions,.engineering-output,.engineering-consent{grid-column:auto}.engineering-actions{display:grid}.engineering-actions button{width:100%}.engineering-step{display:grid}.engineering-summary{grid-template-columns:1fr}}
  `;
  document.head.append(style);

  const section = document.createElement("section");
  section.id = "engineering-command-center";
  section.className = "card kings-panel kings-panel-strong engineering-command";
  section.innerHTML = `
    <div class="card-head"><div><div class="kings-eyebrow">THE ENGINEERING WAR ROOM</div><h2 class="kings-serif">Owner Engineering Command Center</h2></div><span class="badge">REAL TOOLCHAINS</span></div>
    <p class="kings-muted">Inspect a repository on the K.I.N.G.S. host, review its detected languages and exact verified build/test plan, then explicitly authorize that plan. Browser input cannot supply shell commands or bypass configured engineering roots.</p>
    <form id="engineering-form" class="engineering-form">
      <label class="engineering-field"><span>Project ID</span><input id="engineering-project-id" autocomplete="off" value="owner-project" pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,79}" required></label>
      <label class="engineering-field"><span>Repository path on K.I.N.G.S. host</span><input id="engineering-project-path" autocomplete="off" placeholder="/home/me/project" required></label>
      <fieldset class="operation-group"><legend>Governed operations</legend><div class="operation-list">
        <label><input type="checkbox" name="engineering-operation" value="lint"> Lint</label>
        <label><input type="checkbox" name="engineering-operation" value="typecheck"> Typecheck</label>
        <label><input type="checkbox" name="engineering-operation" value="compile"> Compile</label>
        <label><input type="checkbox" name="engineering-operation" value="build" checked> Build</label>
        <label><input type="checkbox" name="engineering-operation" value="test" checked> Test</label>
      </div></fieldset>
      <label class="engineering-consent"><input id="engineering-authorize" type="checkbox" disabled> I reviewed this exact readiness plan and authorize K.I.N.G.S. to run only its verified operations.</label>
      <div class="engineering-actions"><button id="engineering-inspect" class="kings-button" type="submit">Inspect repository</button><button id="engineering-run" class="kings-button kings-button-primary" type="button" disabled>Authorize & run verified plan</button></div>
      <div id="engineering-output" class="engineering-output" aria-live="polite"><div class="runtime-line">Choose a repository and inspect it before execution.</div></div>
    </form>`;
  const governance = court.querySelector(".governance");
  court.insertBefore(section, governance || null);

  const form = section.querySelector("#engineering-form");
  const runButton = section.querySelector("#engineering-run");
  const consent = section.querySelector("#engineering-authorize");
  const output = section.querySelector("#engineering-output");
  let lastRequest = null;
  let lastInspection = null;
  let pollTimer = null;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const operations = () => [...section.querySelectorAll('input[name="engineering-operation"]:checked')].map((item) => item.value);
  const requestPayload = () => ({ projectId: section.querySelector("#engineering-project-id").value.trim(), projectPath: section.querySelector("#engineering-project-path").value.trim(), operations: operations() });

  function resetAuthorization() {
    consent.checked = false;
    consent.disabled = true;
    runButton.disabled = true;
    lastInspection = null;
  }
  section.querySelectorAll("#engineering-project-id,#engineering-project-path,input[name='engineering-operation']").forEach((item) => item.addEventListener("input", resetAuthorization));
  consent.addEventListener("change", () => { runButton.disabled = !(consent.checked && lastInspection && lastInspection.executionStatus === "ready"); });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearPolling();
    resetAuthorization();
    const payload = requestPayload();
    lastRequest = payload;
    output.innerHTML = '<div class="runtime-line">Inspecting real repository languages, manifests, package manager and local toolchains…</div>';
    try {
      const inspection = await jsonRequest("/api/engineering/inspect", { method: "POST", body: JSON.stringify(payload) });
      lastInspection = inspection;
      renderInspection(inspection);
      consent.disabled = inspection.executionStatus !== "ready";
    } catch (error) {
      output.innerHTML = `<div class="engineering-block">${esc(error.message)}</div>`;
    }
  });

  runButton.addEventListener("click", async () => {
    if (!lastRequest || !lastInspection || lastInspection.executionStatus !== "ready" || !consent.checked) return;
    runButton.disabled = true;
    consent.disabled = true;
    output.insertAdjacentHTML("beforeend", '<div class="runtime-line engineering-job-state">Submitting explicitly authorized governed execution…</div>');
    try {
      const job = await jsonRequest("/api/engineering/jobs", { method: "POST", body: JSON.stringify({ ...lastRequest, authorizeExecution: true }) });
      renderJob(job);
      await pollJob(job.id);
    } catch (error) {
      output.insertAdjacentHTML("beforeend", `<div class="engineering-block">${esc(error.message)}</div>`);
    }
  });

  async function jsonRequest(url, options = {}) {
    const response = await fetch(url, { cache: "no-store", credentials: "same-origin", headers: { accept: "application/json", ...(options.body ? { "content-type": "application/json" } : {}) }, ...options });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || body.error || `HTTP ${response.status}`);
    return body;
  }

  function renderInspection(value) {
    const langs = (value.languages || []).map((item) => `${item.language} (${item.fileCount})`).join(", ") || "none";
    const verified = (value.verifications || []).map((item) => `${item.language}: ${item.verified ? "verified" : "blocked"}`).join(" · ") || "none";
    const blockers = value.blockedReasons || [];
    output.innerHTML = `
      <div class="engineering-summary">
        <div><strong>Primary language</strong><span>${esc(value.primaryLanguage || "unknown")}</span></div>
        <div><strong>Detected source</strong><span>${esc(langs)}</span></div>
        <div><strong>Package/build</strong><span>${esc([...(value.packageManagers || []), ...(value.buildSystems || [])].join(", ") || "none")}</span></div>
        <div><strong>Toolchains</strong><span>${esc(verified)}</span></div>
        <div><strong>Files scanned</strong><span>${esc(value.scannedFileCount)}</span></div>
        <div><strong>Execution state</strong><span>${esc(value.executionStatus)}</span></div>
      </div>
      ${blockers.length ? `<div class="engineering-block"><strong>Execution blocked</strong><br>${blockers.map(esc).join("<br>")}</div>` : '<div class="engineering-ok">Repository readiness is verified for the selected operations. Review the exact steps below before authorizing.</div>'}
      <div class="engineering-plan">${(value.steps || []).map((step) => `<div class="engineering-step"><span>#${esc(step.sequence + 1)} · ${esc(step.language)}</span><strong>${esc(step.operation)}</strong></div>`).join("") || '<div class="engineering-block">No execution steps were produced.</div>'}</div>`;
  }

  function renderJob(job) {
    let host = section.querySelector("#engineering-job");
    if (!host) { host = document.createElement("div"); host.id = "engineering-job"; output.append(host); }
    host.innerHTML = `<div class="runtime-line engineering-job-state">Job ${esc(job.id)} · ${esc(job.status)}</div>${job.error ? `<div class="engineering-block">${esc(job.error)}</div>` : ""}${job.result ? renderEvidence(job.result) : ""}`;
  }

  function renderEvidence(result) {
    const report = result.report || {};
    const statusClass = report.status === "completed" ? "engineering-ok" : "engineering-block";
    return `<div class="${statusClass}"><strong>${esc(String(report.status || "unknown").toUpperCase())}</strong>${report.failureReason ? `<br>${esc(report.failureReason)}` : ""}</div><div class="engineering-evidence">${(report.evidence || []).map((item) => `<details ${item.succeeded ? "" : "open"}><summary>#${esc(item.sequence + 1)} ${esc(item.language)} / ${esc(item.operation)} · ${item.succeeded ? "PASS" : "FAIL"} · ${esc(item.durationMs)} ms</summary><p class="kings-muted"><code>${esc(item.resolvedExecutable)} ${esc((item.resolvedArgs || []).join(" "))}</code> · exit ${esc(item.exitCode)}</p>${item.stdout ? `<strong>stdout</strong><pre>${esc(item.stdout)}</pre>` : ""}${item.stderr ? `<strong>stderr</strong><pre>${esc(item.stderr)}</pre>` : ""}</details>`).join("")}</div>`;
  }

  async function pollJob(id) {
    clearPolling();
    const tick = async () => {
      try {
        const job = await jsonRequest(`/api/engineering/jobs/${encodeURIComponent(id)}`);
        renderJob(job);
        if (["completed", "failed", "blocked"].includes(job.status)) { clearPolling(); return; }
        pollTimer = setTimeout(tick, 750);
      } catch (error) {
        clearPolling();
        output.insertAdjacentHTML("beforeend", `<div class="engineering-block">${esc(error.message)}</div>`);
      }
    };
    await tick();
  }
  function clearPolling() { if (pollTimer) clearTimeout(pollTimer); pollTimer = null; }
})();
