(() => {
  "use strict";

  const STORAGE_KEY = "kings-owner-origin";
  const form = document.querySelector("#connect-form");
  const urlInput = document.querySelector("#owner-url");
  const tokenInput = document.querySelector("#owner-token");
  const toggleToken = document.querySelector("#toggle-token");
  const openSaved = document.querySelector("#open-saved");
  const forgetHost = document.querySelector("#forget-host");
  const status = document.querySelector("#status");

  function setStatus(message, kind = "info") {
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function normalizeOwnerOrigin(raw) {
    const value = String(raw ?? "").trim();
    if (!value) throw new Error("Enter your K.I.N.G.S. owner runtime URL.");

    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error("Enter a valid HTTPS URL, for example https://kings.example.com.");
    }

    if (parsed.protocol !== "https:") {
      throw new Error("Remote K.I.N.G.S. connections must use HTTPS.");
    }
    if (parsed.username || parsed.password) {
      throw new Error("Do not put credentials in the owner runtime URL.");
    }
    if (parsed.search || parsed.hash) {
      throw new Error("The owner runtime URL cannot contain query parameters or fragments.");
    }
    if (parsed.pathname !== "/" && parsed.pathname !== "") {
      throw new Error("Use the owner runtime origin only, without an extra path.");
    }

    parsed.pathname = "/";
    return parsed.origin;
  }

  function ownerToken(raw) {
    const value = String(raw ?? "").trim();
    if (value.length < 24) throw new Error("The K.I.N.G.S. owner token must contain at least 24 characters.");
    if (/\r|\n/.test(value)) throw new Error("The K.I.N.G.S. owner token cannot contain line breaks.");
    return value;
  }

  function saveOrigin(origin) {
    localStorage.setItem(STORAGE_KEY, origin);
    renderSavedOrigin();
  }

  function savedOrigin() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return normalizeOwnerOrigin(raw);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  function renderSavedOrigin() {
    const origin = savedOrigin();
    openSaved.hidden = !origin;
    forgetHost.hidden = !origin;
    if (origin && !urlInput.value.trim()) urlInput.value = origin;
    if (origin) openSaved.textContent = `Open saved host · ${new URL(origin).host}`;
  }

  function navigate(url) {
    window.location.assign(url);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const origin = normalizeOwnerOrigin(urlInput.value);
      const token = ownerToken(tokenInput.value);
      saveOrigin(origin);
      setStatus("Opening the authenticated K.I.N.G.S. owner runtime…", "success");

      // Deliberately do not persist the reusable owner token. The owner server
      // accepts it once, redirects to a clean URL, and establishes its own
      // Secure + HttpOnly session cookie that this JavaScript cannot read.
      const bootstrap = new URL("/", `${origin}/`);
      bootstrap.searchParams.set("access", token);
      tokenInput.value = "";
      navigate(bootstrap.href);
    } catch (error) {
      tokenInput.value = "";
      setStatus(error instanceof Error ? error.message : String(error), "error");
    }
  });

  openSaved.addEventListener("click", () => {
    const origin = savedOrigin();
    if (!origin) return renderSavedOrigin();
    setStatus("Opening the saved secure host. If its owner session expired, return here and bootstrap again with your owner token.", "info");
    navigate(`${origin}/`);
  });

  forgetHost.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    urlInput.value = "";
    tokenInput.value = "";
    renderSavedOrigin();
    setStatus("Saved host removed. No owner token was stored.", "success");
  });

  toggleToken.addEventListener("click", () => {
    const revealing = tokenInput.type === "password";
    tokenInput.type = revealing ? "text" : "password";
    toggleToken.textContent = revealing ? "Hide" : "Show";
    toggleToken.setAttribute("aria-pressed", String(revealing));
  });

  window.addEventListener("pageshow", () => {
    tokenInput.value = "";
    tokenInput.type = "password";
    toggleToken.textContent = "Show";
    toggleToken.setAttribute("aria-pressed", "false");
  });

  renderSavedOrigin();
})();
