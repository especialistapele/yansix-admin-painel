import test from "node:test";
import { readFileSync } from "node:fs";
import { resolveServices } from "../src/config.mjs";
import assert from "node:assert/strict";
import { canRecover, recoveryPolicySummary } from "../src/recovery-policy.mjs";
import { createSupabaseRecoveryAdapter, RECOVERY_STATES } from "../src/recovery-supabase.mjs";
import { STATES } from "../src/engine.mjs";

const baseService={id:"supabase-banco-cashback",name:"Banco Cashback",provider:"supabase",enabled:true,projectRef:"uaqbnwwjqhhnqzsavbkh",managementToken:"secret-token",recovery:{enabled:true,maxAttempts:1,timeoutMs:15000,verifyDelayMs:10000,allowProjectRefs:["uaqbnwwjqhhnqzsavbkh"]}};

test("não recupera se recovery estiver desabilitado",()=>assert.deepEqual(canRecover({...baseService,recovery:{...baseService.recovery,enabled:false}},{state:STATES.PAUSED},new Set(["supabase-banco-cashback"])),{allowed:false,reason:"recovery_disabled"}));
test("não recupera serviço saudável",()=>assert.deepEqual(canRecover(baseService,{state:STATES.HEALTHY},new Set(["supabase-banco-cashback"])),{allowed:false,reason:"state_not_recoverable"}));
test("não recupera serviço com provider não suportado",()=>assert.deepEqual(canRecover({...baseService,provider:"outro"},{state:STATES.PAUSED},new Set(["supabase-banco-cashback"])),{allowed:false,reason:"provider_not_supported"}));
test("não recupera sem token",()=>assert.deepEqual(canRecover({...baseService,managementToken:undefined},{state:STATES.PAUSED},new Set(["supabase-banco-cashback"])),{allowed:false,reason:"management_credentials_missing"}));
test("não recupera sem project ref",()=>assert.deepEqual(canRecover({...baseService,projectRef:undefined},{state:STATES.PAUSED},new Set(["supabase-banco-cashback"])),{allowed:false,reason:"management_credentials_missing"}));
test("não recupera projeto fora da allowlist",()=>assert.deepEqual(canRecover({...baseService,projectRef:"evqbhkrjguramcphdjtk"},{state:STATES.PAUSED},new Set(["supabase-banco-cashback"])),{allowed:false,reason:"target_not_allowlisted"}));
test("autoriza Cashback pausado com configuração correta",()=>assert.deepEqual(canRecover(baseService,{state:STATES.PAUSED},new Set(["supabase-banco-cashback"])),{allowed:true,reason:"paused_project_restore_authorized"}));
test("resume a política sem expor credenciais",()=>{const summary=recoveryPolicySummary(baseService); assert.deepEqual(summary,{serviceId:"supabase-banco-cashback",enabled:true,maxAttempts:1,timeoutMs:15000,verifyDelayMs:10000,allowProjectRefs:["uaqbnwwjqhhnqzsavbkh"]}); assert.equal("managementToken" in summary,false);});

test("envia POST para /restore e Authorization Bearer sem expor token",async()=>{
 let requestedUrl=null,requestedOptions=null;
 const adapter=createSupabaseRecoveryAdapter({fetchImpl:async(url,options)=>{
   if(url.endsWith("/restore")){requestedUrl=url;requestedOptions=options;return {status:202,ok:true,text:async()=>""};}
   return {status:200,ok:true,text:async()=>JSON.stringify([{ref:"uaqbnwwjqhhnqzsavbkh",status:"ACTIVE_HEALTHY"}])};
 }});
 const result=await adapter({...baseService,recovery:{...baseService.recovery,verifyDelayMs:0}});
 assert.equal(result.state,STATES.HEALTHY); assert.equal(requestedUrl,"https://api.supabase.com/v1/projects/uaqbnwwjqhhnqzsavbkh/restore"); assert.equal(requestedOptions.method,"POST"); assert.equal(requestedOptions.headers.Authorization,"Bearer secret-token"); assert.equal(JSON.stringify(result).includes("secret-token"),false);
});

test("verifica o estado do projeto após o restore pelo endpoint documentado",async()=>{
 let calls=0,verificationUrl=null;
 const adapter=createSupabaseRecoveryAdapter({fetchImpl:async(url)=>{
   calls++;
   if(url.endsWith("/restore")) return {status:202,ok:true,text:async()=>""};
   verificationUrl=url;
   return {status:200,ok:true,text:async()=>JSON.stringify([{ref:"uaqbnwwjqhhnqzsavbkh",status:"ACTIVE_HEALTHY"}])};
 }});
 const result=await adapter({...baseService,recovery:{...baseService.recovery,verifyDelayMs:0}});
 assert.equal(result.state,STATES.HEALTHY); assert.equal(result.verificationAttempt,1); assert.equal(calls,2); assert.equal(verificationUrl,"https://api.supabase.com/v1/projects");
});

test("403 vira erro de autenticação/permissão",async()=>{const adapter=createSupabaseRecoveryAdapter({fetchImpl:async()=>({status:403,ok:false})}); assert.equal((await adapter(baseService)).state,STATES.AUTHENTICATION_ERROR);});
test("429 é tratado como rate limited",async()=>{const adapter=createSupabaseRecoveryAdapter({fetchImpl:async()=>({status:429,ok:false})}); assert.equal((await adapter(baseService)).state,RECOVERY_STATES.RATE_LIMITED);});
test("erro 5xx é tratado como unavailable",async()=>{const adapter=createSupabaseRecoveryAdapter({fetchImpl:async()=>({status:503,ok:false})}); assert.equal((await adapter(baseService)).state,STATES.UNAVAILABLE);});
test("timeout é tratado sem expor token",async()=>{const error=new Error("timed out");error.name="TimeoutError";const adapter=createSupabaseRecoveryAdapter({fetchImpl:async()=>{throw error;}});const result=await adapter(baseService);assert.equal(result.state,STATES.TIMEOUT);assert.equal(JSON.stringify(result).includes("secret-token"),false);});

test("não recupera serviço que não esteja na allowlist global de recuperação",()=>assert.deepEqual(canRecover(baseService,{state:STATES.PAUSED},new Set(["neo4j-kalatrace"])),{allowed:false,reason:"service_not_allowlisted"}));

test("allowlist vazia não autoriza recuperação",()=>assert.deepEqual(canRecover(baseService,{state:STATES.PAUSED},new Set()),{allowed:false,reason:"service_not_allowlisted"}));


const servicesConfig = JSON.parse(readFileSync(new URL("../config/services.example.json", import.meta.url), "utf8"));
const testServices = resolveServices(servicesConfig, {
  WATCHDOG_SUPABASE_ACCOUNT_1_TOKEN: "test-token-account-1",
  WATCHDOG_SUPABASE_ACCOUNT_2_TOKEN: "test-token-account-2",
  WATCHDOG_SUPABASE_ACCOUNT_2_ENEM_TOKEN: "test-token-enem",
  WATCHDOG_SUPABASE_ACCOUNT_3_TOKEN: "test-token-account-3",
  WATCHDOG_SUPABASE_ACCOUNT_4_TOKEN: "test-token-account-4",
  WATCHDOG_SUPABASE_ACCOUNT_5_TOKEN: "test-token-account-5",
  WATCHDOG_NEO4J_URI: "neo4j+s://test.databases.neo4j.io",
  WATCHDOG_NEO4J_CLIENT_ID: "test-client-id",
  WATCHDOG_NEO4J_CLIENT_SECRET: "test-client-secret"
});
const cnpjService = testServices.find((service) => service.id === "supabase-buscador-cnpj");
const cashbackService = testServices.find((service) => service.id === "supabase-banco-cashback");
const buscadorSiteService = testServices.find((service) => service.id === "supabase-buscador-site");

test("Buscador CNPJ continua habilitado para monitoramento, mas tem recuperação desabilitada na configuração real", () => {
  assert.equal(cnpjService.enabled, true);
  assert.equal(cnpjService.projectRef, "qoecysrghxghoybervyw");
  assert.equal(cnpjService.recovery.enabled, false);
  assert.equal(cnpjService.recovery.maxAttempts, 0);
});

test("Buscador CNPJ pausado não é recuperado mesmo se for adicionado à allowlist global", () => {
  assert.deepEqual(
    canRecover(cnpjService, { state: STATES.PAUSED }, new Set(["supabase-buscador-cnpj"])),
    { allowed: false, reason: "recovery_disabled" }
  );
});

test("Buscador CNPJ pausado também é bloqueado pela allowlist global de recuperação", () => {
  assert.deepEqual(
    canRecover(cnpjService, { state: STATES.PAUSED }, new Set(["supabase-banco-cashback"])),
    { allowed: false, reason: "service_not_allowlisted" }
  );
});

test("banco Cashback continua elegível para recuperação quando pausado e autorizado", () => {
  assert.deepEqual(
    canRecover(cashbackService, { state: STATES.PAUSED }, new Set(["supabase-banco-cashback"])),
    { allowed: true, reason: "paused_project_restore_authorized" }
  );
});

test("Buscador_site continua desabilitado e sem recuperação", () => {
  assert.equal(buscadorSiteService.enabled, false);
  assert.equal(buscadorSiteService.recovery.enabled, false);
  assert.deepEqual(
    canRecover(buscadorSiteService, { state: STATES.PAUSED }, new Set(["supabase-buscador-site"])),
    { allowed: false, reason: "recovery_disabled" }
  );
});
