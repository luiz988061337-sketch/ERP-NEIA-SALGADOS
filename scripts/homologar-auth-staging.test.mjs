import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { register } from "node:module";
import { homologar, papeis, validarConfiguracao } from "./homologar-auth-staging.mjs";

// Mesmo carregador usado pelos demais testes: resolve imports sem extensão
// (vite.staging.config.ts importa "./vite.config") e o alias "@/".
register(pathToFileURL(resolve("scripts/alias-loader.mjs")).href);
const { destinoPreview } = await import("../vite.staging.config.ts");
const { runtimePreviewIsolado } = await import("../src/lib/staging-runtime.ts");

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
    autorizacaoEscrita:ref,
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


test("Caixa com capacidade financeira divergente interrompe antes das operacoes", async () => {
  const cfg=config(), chamadas=[];
  const cliente=() => {
    let ator;
    return {
      auth:{signInWithPassword:async ({email}) => {
        ator=Object.keys(papeis).find((nome) => cfg.contas[nome].email===email);
        chamadas.push([ator,"Auth"]);
        return {data:{session:{},user:{id:cfg.contas[ator].id,email}},error:null};
      }},
      rpc:async (nome) => {
        chamadas.push([ator,nome]);assert.equal(nome,"neia_staging_identidade");
        return {data:{staging:ref,usuario:cfg.contas[ator].id,papel:papeis[ator],conta:ator,
          fixture:cfg.fixture,cutover:true,capacidades:ator==="caixa"?["executar_financeiro","receber_pagamento"]:[]},error:null};
      },
      from:() => assert.fail("nao operar com permissao divergente"),
    };
  };
  await assert.rejects(homologar(cfg,ref,{autorizacaoEscrita:ref,cliente,informar:() => {}}),/Marcador/);
  assert.equal(chamadas.length,8);
  assert.deepEqual(chamadas.at(-1),["caixa","neia_staging_identidade"]);
});

test("validar configuração é offline mesmo com cliente que proibiria rede", async () => {
  const resultado = await homologar(config(),ref,{
    somenteValidar:true, informar:() => {},
    cliente:() => assert.fail("não criar cliente na validação local"),
  });
  assert.deepEqual(resultado,{status:"configuracao_validada",requisicoes:0});
});

test("referência de leitura e autorização para outro projeto não autorizam Auth nem escrita", async () => {
  for (const autorizacaoEscrita of [undefined,true,"outroprojetoficticiooo"]) {
    await assert.rejects(homologar(config(),ref,{
      autorizacaoEscrita, informar:() => {},
      cliente:() => assert.fail("não iniciar Auth sem autorização específica"),
    }),/autorização específica de escrita/);
  }
});

test("CLI padrão e --validar-config ficam offline; --executar exige autorização separada", () => {
  const parent=resolve(tmpdir());
  const dir=mkdtempSync(join(parent,"neia-auth-offline-"));
  try {
    const arquivo=join(dir,"contas-sinteticas.json");
    const bloquear=join(dir,"proibir-rede.mjs");
    writeFileSync(arquivo,JSON.stringify(config()));
    writeFileSync(bloquear,'globalThis.fetch = () => { throw new Error("REDE_PROIBIDA_NESTE_TESTE"); };');
    const env={...process.env,NEIA_STAGING_CONFIG:arquivo,NEIA_STAGING_REF_AUTORIZADA:ref};
    delete env.NEIA_STAGING_ESCRITAS_AUTORIZADAS;
    for (const args of [[],["--validar-config"]]) {
      const child=spawnSync(process.execPath,["--import",pathToFileURL(bloquear).href,"scripts/homologar-auth-staging.mjs",...args],{env,encoding:"utf8",timeout:15000});
      assert.equal(child.status,0,child.stderr);
      assert.match(child.stdout,/VALIDAÇÃO LOCAL/);
      assert.doesNotMatch(child.stdout,/PASSOU Auth/);
    }
    const child=spawnSync(process.execPath,["--import",pathToFileURL(bloquear).href,"scripts/homologar-auth-staging.mjs","--executar"],{env,encoding:"utf8",timeout:15000});
    assert.equal(child.status,1);
    assert.match(child.stderr,/autorização específica de escrita/);
    assert.doesNotMatch(child.stderr,/REDE_PROIBIDA|fixture-local-sem-login/);
  } finally {
    // Apenas o diretório sintético recém-criado, nunca arquivos do ERP.
    assert.equal(dirname(dir),parent);
    assert.ok(basename(dir).startsWith("neia-auth-offline-"));
    rmSync(dir,{recursive:true});
  }
});

test("contratos locais 0123 percorrem saída sem aceite, liberação da Central e pagamento", async () => {
  const cfg = config();
  const chamadas = [];
  let retirada=false, liberada=false, iniciada=false, entregue=false;
  let aprovacoes=0, pagamentos=0;
  const conta=id(100), acerto=id(101), turno=id(102);
  let total;
  const cliente = (_url,_chave,opcoes) => {
    assert.equal(opcoes.auth.persistSession,false);
    let ator;
    const dados = (data) => Promise.resolve({data,error:null});
    return {
      auth:{signInWithPassword:async ({email}) => {
        ator=Object.keys(papeis).find((nome) => cfg.contas[nome].email===email);
        assert.ok(ator);
        chamadas.push([ator,"Auth"]);
        return {data:{session:{},user:{id:cfg.contas[ator].id,email}}};
      }},
      from:(tabela) => ({
        select:() => ({
          in:(_coluna,ids) => dados(ator==="cliente" ? [{id:cfg.fixture.pedidoA}]
            : ["atendente","producao"].includes(ator) ? ids.map((id) => ({id})) : []),
          eq:(_coluna,valor) => {
            assert.equal(tabela,"conta_pagamento_eventos");assert.equal(valor,conta);
            return dados([{id:id(103),valor_centavos:total}]);
          },
        }),
        update:() => ({eq:() => ({select:() => dados([])})}),
      }),
      rpc:async (nome,args) => {
        chamadas.push([ator,nome]);
        if(nome==="neia_staging_identidade")return dados({staging:ref,usuario:cfg.contas[ator].id,papel:papeis[ator],conta:ator,fixture:cfg.fixture,cutover:true,capacidades:ator==="caixa"?["conferir_caixa","receber_pagamento"]:ator==="financeiro"?["executar_financeiro","receber_pagamento"]:[]});
        if(nome==="motoboy_listar_rotas_atribuidas")return dados([{id:ator==="motoboyA"?cfg.fixture.rotaA:cfg.fixture.rotaB}]);
        if(nome==="confirmar_retirada"){
          if(ator!=="motoboyA")return dados({status:"negado"});
          retirada=true;return dados({status:"ok"});
        }
        if(nome==="liberar_rota_entrega"){
          if(ator!=="producao")return dados({status:"negado"});
          liberada=true;return dados({status:"ok"});
        }
        if(nome==="iniciar_rota"){
          if(!retirada)return dados({status:"bloqueado",motivo:"retirada_de_todos_os_pedidos_obrigatoria"});
          if(!liberada)return dados({status:"bloqueado",motivo:"liberacao_da_central_obrigatoria"});
          const motivo=iniciada?"rota_ja_iniciada":"rota_iniciada";iniciada=true;return dados({status:"ok",motivo});
        }
        if(nome==="registrar_localizacao_rota")return dados({status:ator==="motoboyB"?"negado":"registrado"});
        if(nome==="consultar_localizacao_entrega")return dados(ator==="motoboyB"||entregue?null:{latitude:-23});
        if(nome==="confirmar_entrega"){entregue=true;return dados({status:"ok"});}
        if(nome==="informar_retorno_loja")return dados(entregue?{status:"ok"}:{status:"bloqueado",motivo:"rota_com_pendentes"});
        if(nome==="confirmar_chegada_loja")return dados({status:"ok"});
        if(nome==="solicitar_acerto_rota")return dados({status:"registrado",acerto_id:acerto});
        if(nome==="conferir_acerto_rota_independente" && ator==="financeiro")return dados({status:"negado"});
        if(nome==="conferir_acerto_rota_independente")return dados({status_acerto:"em_conferencia",conferencia:{esperado_centavos:5500}});
        if(nome==="aprovar_acerto_rota"){
          if(ator==="caixa")return dados({status:"negado",motivo:"auto_aprovacao_nao_permitida"});
          if(ator!=="responsavel")return dados({status:"negado"});
          return dados({status:aprovacoes++===0?"ok":"repetido"});
        }
        if(nome==="solicitar_fechamento_turno"){
          total=(args.p_tipo==="vespera_natal"?6000:4000)+500;
          return dados({status:"registrado",turno_id:turno,valor_devido_centavos:total});
        }
        if(nome==="autorizar_pagamento_turno_motoboy")return dados({status:"autorizado"});
        if(nome==="confirmar_pagamento_turno_motoboy"){
          if(ator!=="financeiro")return dados({status:"negado"});
          if(args.p_valor!==total)return dados({status:"inelegivel"});
          return dados({status:pagamentos++===0?"registrado":"repetido",conta_id:conta});
        }
        assert.fail(`Contrato RPC inesperado: ${nome}`);
      },
    };
  };
  await homologar(cfg,ref,{autorizacaoEscrita:ref,cliente,informar:() => {}});
  assert.ok(!chamadas.some(([,nome]) => nome==="aceitar_rota"));
  const indice=(ator,nome) => chamadas.findIndex((c) => c[0]===ator&&c[1]===nome);
  assert.ok(indice("motoboyA","confirmar_retirada")<indice("producao","liberar_rota_entrega"));
  assert.equal(aprovacoes,2);assert.equal(pagamentos,2);
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
