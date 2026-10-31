import {
  POWERHOUSE_DOMAIN_POLICY_VERSION,
  PowerhouseServiceDomainError,
  applyPowerhouseServiceDomain,
  listPowerhouseServiceDomains,
  resolvePowerhouseServiceDomain,
} from "./powerhouse-service-domain";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function main(): void {
  const profiles = listPowerhouseServiceDomains();
  assert(profiles.length === 7, "All seven locked K.I.N.G.S. Powerhouse service domains must be registered.");
  assert(new Set(profiles.map((profile) => profile.id)).size === 7, "Service-domain ids must be unique.");
  assert(profiles.every((profile) => profile.requiredCapabilities.length > 0), "Every service domain must require explicit model capabilities.");
  assert(profiles.every((profile) => profile.instruction.length > 80), "Every service domain must contain a substantive server-owned contract.");

  const coding = resolvePowerhouseServiceDomain("CODING");
  const routed = applyPowerhouseServiceDomain({
    appId: "kings.ai",
    messages: [{ role: "user", content: "Repair the failing project." }],
    requiredCapabilities: ["reasoning"],
    temperature: 1.7,
    allowToolProposals: true,
  }, coding);
  assert(routed.requiredCapabilities?.includes("coding") === true, "Coding service must require coding capability.");
  assert(routed.requiredCapabilities?.includes("verification") === true, "Coding service must require verification capability.");
  assert(routed.temperature === 0.2, "Coding service must clamp temperature to its deterministic ceiling.");
  assert(routed.allowToolProposals === false, "Responses service must not silently grant tool authority.");
  assert(routed.messages.length === 2, "Domain policy must preserve the user request behind one server-owned system message.");
  assert(routed.messages[0]?.content.includes(POWERHOUSE_DOMAIN_POLICY_VERSION) === true, "Domain policy evidence must include its version.");
  assert(routed.messages[1]?.content === "Repair the failing project.", "Domain policy must preserve user content.");

  const collectibles = resolvePowerhouseServiceDomain("collectibles");
  assert(collectibles.requiredCapabilities.includes("research"), "Collectibles service must require research capability.");
  assert(collectibles.instruction.includes("official grade"), "Collectibles policy must prohibit false official grading claims.");

  let invalidRejected = false;
  try {
    resolvePowerhouseServiceDomain("unlimited-expert-mode");
  } catch (error) {
    invalidRejected = error instanceof PowerhouseServiceDomainError && error.code === "INVALID_SERVICE_DOMAIN";
  }
  assert(invalidRejected, "Unknown service domains must fail closed.");

  console.log("K.I.N.G.S. Powerhouse seven-domain routing policy: SUCCESS");
}

main();
