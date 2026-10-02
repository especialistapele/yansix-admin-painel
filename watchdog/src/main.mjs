import fs from "node:fs/promises";
import { runChecks } from "./engine.mjs";
import { buildEvents, summarize, toMarkdown } from "./report.mjs";

const configPath = new URL("../config/services.example.json", import.meta.url);
const config = JSON.parse(await fs.readFile(configPath, "utf8"));

const services = config.services.map((service) => {
  if (service.provider !== "supabase") return service;

  const url = process.env[service.url_env];
  const key = process.env[service.key_env];

  return {
    ...service,
    enabled: Boolean(url && key),
    url,
    headers: key ? { apikey: key } : undefined
  };
});

const adapters = {
  supabase: (service) => import("./engine.mjs").then(({ checkHttpService }) =>
    checkHttpService(service)
  )
};

const run = await runChecks(services, adapters);
const summary = summarize(run);
const events = buildEvents(summary);

console.log(JSON.stringify({ summary, events }, null, 2));

await fs.writeFile(
  new URL("../report.md", import.meta.url),
  toMarkdown(summary),
  "utf8"
);

await fs.writeFile(
  new URL("../report.json", import.meta.url),
  JSON.stringify({ summary, events }, null, 2),
  "utf8"
);
