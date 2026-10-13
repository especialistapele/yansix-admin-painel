import fs from "node:fs/promises";
import { runChecks } from "./engine.mjs";
import { createSupabaseAdapter } from "./supabase.mjs";
import { resolveServices, configurationSummary } from "./config.mjs";
import { buildEvents, summarize, toMarkdown } from "./report.mjs";
import { canRecover } from "./recovery-policy.mjs";
import { createSupabaseRecoveryAdapter } from "./recovery-supabase.mjs";
import { createNeo4jAuraAdapter } from "./neo4j-aura.mjs";
import { createNeo4jAuraRecoveryAdapter } from "./recovery-neo4j-aura.mjs";

const configPath = new URL("../config/services.example.json", import.meta.url);
const config = JSON.parse(await fs.readFile(configPath, "utf8"));
const services = resolveServices(config);

const adapters = {
  supabase: createSupabaseAdapter(),
  neo4j_aura: createNeo4jAuraAdapter()
};

const recoveryEnabled = process.env.WATCHDOG_ENABLE_RECOVERY === "true";
// Recovery is opt-in per service. An empty allowlist intentionally authorizes no recovery.
const recoveryAllowlist = new Set((process.env.WATCHDOG_RECOVERY_ALLOW_SERVICES || "")
  .split(",").map((id) => id.trim()).filter(Boolean));
const recoveryAdapters = {
  supabase: createSupabaseRecoveryAdapter(),
  neo4j_aura: createNeo4jAuraRecoveryAdapter()
};

const run = await runChecks(services, adapters);

if (recoveryEnabled) {
  for (const result of run.results) {
    if (result.state !== "paused") continue;

    // Preserve the original detection so the report can log sleep and recovery as separate events.
    result.detectedState = result.state;
    result.sleepDetectedAt = result.checkedAt;

    const service = services.find((item) => item.id === result.serviceId);
    if (!service) continue;

    const authorization = canRecover(service, result, recoveryAllowlist);
    if (!authorization.allowed) {
      result.recovery = { attempted: false, reason: authorization.reason };
      continue;
    }

    const recoveryAdapter = recoveryAdapters[service.provider];
    if (!recoveryAdapter) {
      result.recovery = { attempted: false, reason: "recovery_adapter_not_implemented" };
      continue;
    }

    result.recoveryAttemptedAt = new Date().toISOString();
    result.recovery = { attempted: true, ...(await recoveryAdapter(service)) };
    result.recoveryCompletedAt = new Date().toISOString();

    if (result.recovery.state === "healthy") {
      result.state = "recovered";
      result.reason = result.recovery.reason;
    } else {
      result.state = "recovery_failed";
      result.reason = result.recovery.reason;
    }
  }
}

const summary = summarize(run);
const events = buildEvents(summary);
const configuration = configurationSummary(services);

console.log(JSON.stringify({ summary, configuration, events }, null, 2));

await fs.writeFile(
  new URL("../report.md", import.meta.url),
  toMarkdown(summary, configuration),
  "utf8"
);

await fs.writeFile(
  new URL("../report.json", import.meta.url),
  JSON.stringify({ summary, configuration, events }, null, 2),
  "utf8"
);
