import fs from "node:fs/promises";
import { runChecks } from "./engine.mjs";
import { summarize, toMarkdown } from "./report.mjs";

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

const summary = summarize(await runChecks(services, adapters));
console.log(JSON.stringify(summary, null, 2));
await fs.writeFile(
  new URL("../report.md", import.meta.url),
  toMarkdown(summary),
  "utf8"
);
