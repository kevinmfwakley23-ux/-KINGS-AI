(() => {
  const MODES = [
    {
      value: "economy",
      label: "Economy",
      help: "Prefer local and verified-free intelligence before known paid routes.",
    },
    {
      value: "free-only",
      label: "Never Paid",
      help: "Hard filter: no paid model route may execute.",
    },
    {
      value: "local-only",
      label: "Local Only",
      help: "Hard filter: use only local/self-hosted intelligence.",
    },
    {
      value: "quality",
      label: "Quality First",
      help: "Rank capability/reliability ahead of price while preserving hard ceilings.",
    },
  ];

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }

  function selectedMode() {
    return document.querySelector('input[name="kings-cost-policy"]:checked')?.value || "economy";
  }

  function injectPolicy(body) {
    if (!body || body.action !== "execute-next") return body;
    const maximumEstimatedCost = number(document.getElementById("kings-max-route-cost")?.value);
    return {
      ...body,
      costPreference: selectedMode(),
      ...(maximumEstimatedCost === undefined ? {} : { maximumEstimatedCost }),
    };
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    try {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (
        url.includes("/api/project-owner/missions") &&
        String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase() === "POST" &&
        typeof init.body === "string"
      ) {
        const parsed = JSON.parse(init.body);
        const next = injectPolicy(parsed);
        init = { ...init, body: JSON.stringify(next) };
      }
    } catch {
      // Request parsing failure must not break the existing owner UI. The server
      // remains authoritative and will validate whatever request it receives.
    }
    return originalFetch(input, init);
  };

  function createControls() {
    const routing = document.querySelector(".routing-box");
    if (!routing || document.getElementById("kings-economics-controls")) return;

    const wrapper = document.createElement("div");
    wrapper.id = "kings-economics-controls";
    wrapper.style.cssText = "margin-top:14px;padding-top:14px;border-top:1px solid var(--soft-line);";

    const title = document.createElement("label");
    title.textContent = "Cost policy for this build";
    wrapper.appendChild(title);

    const options = document.createElement("div");
    options.style.cssText = "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px;";
    for (const [index, mode] of MODES.entries()) {
      const item = document.createElement("label");
      item.style.cssText = "display:block;margin:0;padding:10px;border:1px solid var(--line);border-radius:13px;background:var(--panel-strong);cursor:pointer;";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "kings-cost-policy";
      radio.value = mode.value;
      radio.checked = index === 0;
      radio.style.cssText = "width:auto;margin:0 7px 0 0;vertical-align:middle;";
      const strong = document.createElement("strong");
      strong.textContent = mode.label;
      const help = document.createElement("small");
      help.textContent = mode.help;
      help.style.cssText = "display:block;color:var(--muted);margin:5px 0 0 24px;line-height:1.3;";
      item.append(radio, strong, help);
      options.appendChild(item);
    }
    wrapper.appendChild(options);

    const ceilingLabel = document.createElement("label");
    ceilingLabel.htmlFor = "kings-max-route-cost";
    ceilingLabel.textContent = "Optional hard maximum estimated cost per model route (USD)";
    const ceiling = document.createElement("input");
    ceiling.id = "kings-max-route-cost";
    ceiling.type = "number";
    ceiling.min = "0";
    ceiling.step = "0.001";
    ceiling.inputMode = "decimal";
    ceiling.placeholder = "Blank = no per-route dollar ceiling";
    wrapper.append(ceilingLabel, ceiling);

    const note = document.createElement("div");
    note.style.cssText = "font-size:11px;color:var(--muted);margin-top:6px;line-height:1.45;";
    note.textContent = "Never Paid and Local Only are hard routing filters. Unknown provider pricing is never treated as free. Paid mission/day/month budgets remain a server-side enforcement boundary.";
    wrapper.appendChild(note);
    routing.appendChild(wrapper);
  }

  function telemetryCard() {
    const stack = document.querySelector(".status-stack");
    if (!stack || document.getElementById("kings-economics-telemetry")) return;
    const card = document.createElement("div");
    card.id = "kings-economics-telemetry";
    card.className = "metric";
    const title = document.createElement("div");
    title.className = "metric-title";
    title.textContent = "Token + cost economy";
    const value = document.createElement("div");
    value.id = "kings-economics-value";
    value.className = "metric-value";
    value.textContent = "Loading provider-reported usage…";
    card.append(title, value);
    stack.appendChild(card);
  }

  async function refreshUsage() {
    const target = document.getElementById("kings-economics-value");
    if (!target) return;
    try {
      const response = await originalFetch("/api/usage", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const summary = payload.summary || {};
      const cached = Number(summary.cachedTokens || 0).toLocaleString();
      const saved = Number(summary.savedTokens || 0).toLocaleString();
      const tokens = Number(summary.totalTokens || 0).toLocaleString();
      const cost = Number(summary.knownCostUsd || 0).toFixed(4);
      const unknown = Number(summary.unknownCostRequests || 0).toLocaleString();
      target.textContent = `${tokens} model tokens · ${cached} cached · ${saved} provider-reported saved · $${cost} known spend · ${unknown} requests with unknown cost`;
    } catch (error) {
      target.textContent = `Usage telemetry unavailable: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  function initialize() {
    createControls();
    telemetryCard();
    void refreshUsage();
    document.getElementById("refresh-models")?.addEventListener("click", () => void refreshUsage());
    document.getElementById("execute")?.addEventListener("click", () => {
      window.setTimeout(() => void refreshUsage(), 750);
      window.setTimeout(() => void refreshUsage(), 3_000);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
