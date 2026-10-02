import fs from "node:fs/promises";
import { runChecks } from "./engine.mjs";
import { createSupabaseAdapter } from "./supabase.mjs";
import { resolveServices, configurationSummary } from "./config.mjs";
import { buildEvents, summarize, toMarkdown } from "./report.mjs";

const configPath = new URL("../config/services.example.json", import.meta.url);
const config = JSON.parse(await fs.readFile(configPath, "utf8"));
const services = resolveServices(config);

const adapters = {
  supabase: createSupabaseAdapter()
};

const run = await runChecks(services, adapters);
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
