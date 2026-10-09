import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set(["https://admin.yansix.tech"]);
const allowedEmail = "yansix.tech@gmail.com";
const workflowDispatchUrl = "https://api.github.com/repos/especialistapele/yansix-admin-painel/actions/workflows/watchdog.yml/dispatches";

function response(body: Record<string, unknown>, status = 200, origin = "https://admin.yansix.tech") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin"
    }
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  if (!allowedOrigins.has(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin"
      }
    });
  }
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405, origin);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return response({ error: "Authentication required" }, 401, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return response({ error: "Authentication service is not configured" }, 500, origin);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user || user.email?.toLowerCase() !== allowedEmail) {
    return response({ error: "Not authorized to dispatch Watchdog" }, 403, origin);
  }

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return response({ error: "Invalid JSON body" }, 400, origin);
  }
  if (body?.action !== "run-checks") {
    return response({ error: "Unsupported action" }, 400, origin);
  }

  const githubToken = Deno.env.get("WATCHDOG_GITHUB_TOKEN");
  if (!githubToken) {
    return response({ error: "WATCHDOG_GITHUB_TOKEN is not configured" }, 503, origin);
  }

  const githubResponse = await fetch(workflowDispatchUrl, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ ref: "main" })
  });

  if (!githubResponse.ok) {
    // Do not return provider response bodies or credentials to the browser.
    const status = githubResponse.status;
    return response({
      error: status === 401 || status === 403
        ? "GitHub rejected the token or its Actions permission"
        : status === 404
          ? "Workflow or repository not found for this token"
          : `GitHub dispatch failed (HTTP ${status})`
    }, status === 401 ? 502 : 502, origin);
  }

  return response({
    accepted: true,
    workflow: "YANSIX Watchdog",
    ref: "main",
    message: "Workflow dispatch accepted. This does not mean checks have finished."
  }, 202, origin);
});
