import { executeEngineeringProject } from "./engineering-service.mjs";

let handled = false;

process.on("message", async (message) => {
  if (handled) return;
  handled = true;
  try {
    const result = await executeEngineeringProject(message?.request, process.env);
    process.send?.({ ok: true, result });
    process.exitCode = 0;
  } catch (error) {
    process.send?.({ ok: false, error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  } finally {
    setImmediate(() => process.disconnect?.());
  }
});

setTimeout(() => {
  if (handled) return;
  process.send?.({ ok: false, error: "Engineering worker received no execution request." });
  process.exitCode = 1;
  process.disconnect?.();
}, 10_000).unref();
