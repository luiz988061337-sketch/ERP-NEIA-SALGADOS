import assert from "node:assert/strict";
import { test } from "node:test";
import { homologar, papeis, validarConfiguracao } from "./homologar-auth-staging.mjs";
import { destinoPreview } from "../vite.staging.config.ts";
import { runtimePreviewIsolado } from "../src/lib/staging-runtime.ts";

const ref = "abcdefghijklmnopqrst";
const url = `https://${ref}.supabase.co`;
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const config = () => ({
  ref, chavePublica: "sb_publishable_ficticia",
  contas: Object.fromEntries(Object.keys(papeis).map((p,i) => [p,{
    id:id(i+30),email:`neia-qa+${p.toLowerCase()}@example.invalid`,senha:"fixture-local-sem-login",
  }])),
  fixture: Object.fromEntries(["protocolo","livre","pedidoA","pedidoB","rotaA","rotaB","motoboyA","motoboyB"]
    .map((p,i) => [p,id(i+1)])),
});
const env = {
  NEIA_AMBIENTE:"staging", NEIA_STAGING_REF_AUTORIZADA:ref, VERCEL_ENV:"preview",
  VITE_SUPABASE_URL:url, SUPABASE_URL:url,
  VITE_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_ficticia", SUPABASE_PUBLISHABLE_KEY:"sb_publishable_ficticia",
};

test("staging recusa projeto produtivo renomeado, chave privilegiada e fixture repetida", () => {
  assert.equal(validarConfiguracao(config(),ref),url);
  assert.throws(() => validarConfiguracao({...config(),ref:"ruioyioynwwwiqbjznoa"},"ruioyioynwwwiqbjznoa"),/distinta de produção/);
  assert.throws(() => validarConfiguracao({...config(),chavePublica:"sb_secret_ficticia"},ref),/publishable/);
  const duplicada = config();
  duplicada.fixture.pedidoB = duplicada.fixture.pedidoA;
  assert.throws(() => validarConfiguracao(duplicada,ref),/Fixture/);
});

test("marcador incorreto interrompe o runner antes de qualquer escrita", async () => {
  const cfg = config();
  const chamadas = [];
  await assert.rejects(homologar(cfg,ref,{
    informar:() => assert.fail("identidade precisa ser rejeitada"),
    cliente:() => ({
      auth:{signInWithPassword:async () => {
        chamadas.push("Auth");
        return {data:{session:{},user:{ id:cfg.contas.cliente.id,email:cfg.contas.cliente.email }}};
      }},
      rpc:async (nome) => { chamadas.push(nome); return {data:{staging:"outro",cutover:true}}; },
      from:() => assert.fail("a suíte nunca pode tocar em tabelas sem marcador"),
    }),
  }), /Marcador/);
  assert.deepEqual(chamadas,["Auth","neia_staging_identidade"]);
});

test("Preview rejeita Production, backend diferente e credencial administrativa", () => {
  assert.equal(destinoPreview(env).url,url);
  assert.throws(() => destinoPreview({...env,VERCEL_ENV:"production"}),/apenas em Preview/);
  assert.throws(() => destinoPreview({...env,SUPABASE_URL:"https://outro.invalid"}),/URLs/);
  assert.throws(() => destinoPreview({...env,SUPABASE_SERVICE_ROLE_KEY:"credencial-ficticia"}),/sem chave administrativa/);
  assert.throws(() => destinoPreview({...env,NEIA_STAGING_REF_AUTORIZADA:"ruioyioynwwwiqbjznoa"}),/distinta/);
});

test("Preview recusa configuração divergente na execução do servidor", () => {
  assert.equal(runtimePreviewIsolado(url,env.SUPABASE_PUBLISHABLE_KEY,env),true);
  assert.equal(runtimePreviewIsolado(url,env.SUPABASE_PUBLISHABLE_KEY,{...env,SUPABASE_URL:"https://outro.invalid"}),false);
  assert.equal(runtimePreviewIsolado(url,env.SUPABASE_PUBLISHABLE_KEY,{...env,SUPABASE_PUBLISHABLE_KEY:"sb_publishable_outro"}),false);
  assert.equal(runtimePreviewIsolado(url,env.SUPABASE_PUBLISHABLE_KEY,{...env,VERCEL_ENV:"production"}),false);
  assert.equal(runtimePreviewIsolado(undefined,undefined,{}),true);
});
