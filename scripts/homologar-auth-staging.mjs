import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { ehProjetoProducao } from "./proteger-dev.mjs";

export const papeis = {
  cliente: "cliente", atendente: "atendente", producao: "producao", caixa: "financeiro",
  financeiro: "financeiro", responsavel: "admin", motoboyA: "motoboy", motoboyB: "motoboy",
};

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const destinos = ["protocolo", "livre", "pedidoA", "pedidoB", "rotaA", "rotaB", "motoboyA", "motoboyB"];

export function validarConfiguracao(config, refAutorizada) {
  if (!config || typeof refAutorizada !== "string" || !/^[a-z0-9]{20}$/.test(refAutorizada)
    || ehProjetoProducao(refAutorizada) || config.ref !== refAutorizada) {
    throw new Error("Informe uma referência autorizada de staging, distinta de produção.");
  }
  if (typeof config.chavePublica !== "string" || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.chavePublica)) {
    throw new Error("Use somente a chave publishable do staging.");
  }
  if (!destinos.every((nome) => uuid.test(config.fixture?.[nome] ?? ""))
    || new Set(destinos.map((nome) => config.fixture[nome])).size !== destinos.length) {
    throw new Error("Fixture incompleta ou com identificadores repetidos.");
  }
  const contas = Object.keys(papeis).map((papel) => config.contas?.[papel]);
  if (!contas.every((c) => c && uuid.test(c.id) && /^neia-qa\+[a-z0-9-]+@example\.invalid$/.test(c.email)
    && typeof c.senha === "string" && c.senha.length >= 16)
    || new Set(contas.map((c) => c.id)).size !== contas.length
    || new Set(contas.map((c) => c.email)).size !== contas.length) {
    throw new Error("São necessárias oito contas fictícias distintas.");
  }
  return `https://${refAutorizada}.supabase.co`;
}

const idempotencia = (fixture, nome) => `stg:${fixture.protocolo}:${nome}`;

function validarResultado(resposta, descricao) {
  if (resposta.error) {
    const codigo = resposta.error.code;
    const seguro = /^[A-Z0-9]{5,8}$/.test(codigo ?? "") ? codigo : "não informado";
    throw new Error(`${descricao} falhou (código ${seguro}).`);
  }
  return resposta.data;
}

function verificar(condicao, descricao) {
  if (!condicao) throw new Error(descricao);
}

export async function homologar(config, refAutorizada, { cliente = createClient, informar = console.log } = {}) {
  const url = validarConfiguracao(config, refAutorizada);
  const f = config.fixture;
  const criarCliente = () => cliente(url, config.chavePublica, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => {
      // Não seguir redirecionamentos para outro host nem enviar sessão a outro projeto.
      if (new URL(typeof input === "string" || input instanceof URL ? input : input.url).origin !== url) {
        throw new Error("Requisição fora do staging autorizado.");
      }
      return fetch(input, { ...init, redirect: "error" });
    } },
  });
  const usuarios = {};
  for (const [nome, papel] of Object.entries(papeis)) {
    const credencial = config.contas[nome];
    const api = criarCliente();
    const sessao = validarResultado(await api.auth.signInWithPassword({
      email: credencial.email, password: credencial.senha,
    }), `Auth ${nome}`);
    verificar(sessao?.session && sessao.user?.id === credencial.id && sessao.user.email === credencial.email,
      `Identidade Auth divergente para ${nome}.`);
    const identidade = validarResultado(await api.rpc("neia_staging_identidade", {
      p_protocolo: f.protocolo,
    }), `Marcador ${nome}`);
    const mapa = { livre: f.livre, pedidoA: f.pedidoA, pedidoB: f.pedidoB,
      rotaA: f.rotaA, rotaB: f.rotaB, motoboyA: f.motoboyA, motoboyB: f.motoboyB };
    verificar(identidade?.usuario === credencial.id && identidade?.papel === papel
      && identidade?.conta === nome && identidade?.staging === refAutorizada
      && Object.entries(mapa).every(([k,v]) => identidade?.fixture?.[k] === v)
      && identidade?.cutover === true, `Marcador, papéis ou fixture incompatíveis para ${nome}.`);
    usuarios[nome] = api;
    informar(`PASSOU Auth + marcador de isolamento — ${nome}`);
  }
  const { cliente: consumidor, atendente, producao, caixa, financeiro, responsavel, motoboyA: a, motoboyB: b } = usuarios;
  const rpc = async (api, nome, args) => validarResultado(await api.rpc(nome, args), nome);
  const linhas = async (api, tabela, ids) =>
    validarResultado(await api.from(tabela).select("id").in("id", ids), `RLS ${tabela}`);
  const negada = (resposta) => resposta.error
    ? resposta.error.code === "42501"
    : Array.isArray(resposta.data) && resposta.data.length === 0;

  verificar((await linhas(consumidor,"pedidos",[f.pedidoA,f.pedidoB])).map((p) => p.id).join() === f.pedidoA,
    "Cliente precisa ver apenas o pedido próprio.");
  for (const operador of [atendente, producao]) {
    verificar((await linhas(operador,"pedidos",[f.pedidoA])).length === 1, "Operador não enxerga pedido da fixture.");
    const r = await rpc(operador,"aprovar_acerto_rota",{p_acerto_id:f.protocolo,p_chave_idempotencia:"negada",p_aprovado:true});
    verificar(r?.status === "negado", "Perfil operacional obteve permissão financeira.");
  }
  const rotasA = await rpc(a,"motoboy_listar_rotas_atribuidas");
  const rotasB = await rpc(b,"motoboy_listar_rotas_atribuidas");
  verificar(rotasA.some((r) => r.id === f.rotaA) && !rotasA.some((r) => r.id === f.rotaB)
    && rotasB.some((r) => r.id === f.rotaB) && !rotasB.some((r) => r.id === f.rotaA), "Isolamento de rotas falhou.");
  verificar((await linhas(a,"pedidos",[f.livre,f.pedidoB])).length === 0, "Motoboy leu pedido sem atribuição ou alheio.");
  informar("PASSOU RLS por perfil e isolamento entre motoboys");

  verificar(negada(await a.from("pedidos").update({motoboy_id:config.contas.motoboyA.id})
    .eq("id",f.livre).select("id")), "Motoboy reivindicou pedido da Central.");
  verificar(negada(await a.from("pedidos").update({status:"em_rota"}).eq("id",f.pedidoA).select("id")),
    "Motoboy iniciou por escrita direta.");
  verificar((await rpc(b,"confirmar_retirada",{p_pedido_id:f.pedidoA})).status === "negado",
    "Motoboy retirou pedido alheio.");
  verificar((await rpc(a,"iniciar_rota",{p_rota_id:f.rotaA})).status === "bloqueado",
    "Rota iniciou sem retirada.");
  verificar((await rpc(a,"confirmar_retirada",{p_pedido_id:f.pedidoA})).status === "ok", "Retirada válida falhou.");
  verificar((await rpc(a,"liberar_rota_entrega",{p_rota_id:f.rotaA})).status === "negado", "Motoboy liberou a própria rota.");
  verificar((await rpc(a,"iniciar_rota",{p_rota_id:f.rotaA})).motivo === "liberacao_da_central_obrigatoria", "Saída sem liberação.");
  verificar((await rpc(producao,"liberar_rota_entrega",{p_rota_id:f.rotaA})).status === "ok", "Central não liberou a rota.");
  const inicios = await Promise.all([rpc(a,"iniciar_rota",{p_rota_id:f.rotaA}),rpc(a,"iniciar_rota",{p_rota_id:f.rotaA})]);
  verificar(inicios.map((r) => r.motivo).sort().join() === "rota_iniciada,rota_ja_iniciada",
    "Concorrência no início da rota retornou estado inesperado.");
  const amostra = {p_rota:f.rotaA,p_latitude:-23,p_longitude:-46,p_precisao:20,p_capturado_em:new Date().toISOString()};
  verificar((await rpc(b,"registrar_localizacao_rota",amostra)).status === "negado", "Motoboy B escreveu GPS na rota A.");
  verificar((await rpc(a,"registrar_localizacao_rota",amostra)).status === "registrado", "GPS sintético autorizado foi recusado.");
  verificar(await rpc(b,"consultar_localizacao_entrega",{p_pedido:f.pedidoA}) === null, "Motoboy B leu GPS da rota A.");
  verificar((await rpc(consumidor,"consultar_localizacao_entrega",{p_pedido:f.pedidoA}))?.latitude === -23,
    "Cliente não conseguiu consultar posição de seu pedido em rota.");
  verificar((await rpc(a,"informar_retorno_loja",{p_rota_id:f.rotaA})).motivo === "rota_com_pendentes",
    "Retorno indevido aceito com entrega pendente.");
  verificar((await rpc(a,"confirmar_entrega",{p_pedido_id:f.pedidoA})).status === "ok", "Entrega falhou.");
  verificar(await rpc(consumidor,"consultar_localizacao_entrega",{p_pedido:f.pedidoA}) === null, "GPS visível após a entrega.");
  verificar((await rpc(a,"informar_retorno_loja",{p_rota_id:f.rotaA})).status === "ok", "Retorno falhou.");
  verificar((await rpc(a,"confirmar_chegada_loja",{p_rota_id:f.rotaA})).status === "ok", "Chegada falhou.");
  informar("PASSOU retirada, início concorrente, entrega e retorno");

  const acerto = await rpc(a,"solicitar_acerto_rota",{
    p_rota_id:f.rotaA,p_chave_idempotencia:idempotencia(f,"acerto"),p_valor_caixa:50,
  });
  verificar(acerto.status === "registrado" && uuid.test(acerto.acerto_id), "Solicitação de acerto falhou.");
  const aprovacao = {p_acerto_id:acerto.acerto_id,p_chave_idempotencia:idempotencia(f,"aprovacao"),p_aprovado:true};
  verificar((await rpc(a,"aprovar_acerto_rota",aprovacao)).status === "negado", "Motoboy aprovou o próprio acerto.");
  verificar(negada(await a.from("acertos_rota").update({status:"aprovado"}).eq("id",acerto.acerto_id).select("id")),
    "Motoboy alterou acerto diretamente.");
  const conferido = await rpc(caixa,"conferir_acerto_rota_independente",{
    p_acerto_id:acerto.acerto_id,p_chave:idempotencia(f,"conferencia"),
    p_contado_centavos:5500,p_troco_loja_centavos:0,p_referencia:"Contagem fictícia R$ 55,00",
  });
  verificar(conferido.status_acerto === "em_conferencia" && conferido.conferencia?.esperado_centavos === 5500,
    "Caixa não obteve os valores do ledger.");
  verificar((await rpc(caixa,"aprovar_acerto_rota",aprovacao)).motivo === "auto_aprovacao_nao_permitida",
    "Caixa aprovou a própria conferência.");
  const aprovacoes = await Promise.all([rpc(responsavel,"aprovar_acerto_rota",aprovacao),
    rpc(responsavel,"aprovar_acerto_rota",aprovacao)]);
  verificar(aprovacoes.map((r) => r.status).sort().join() === "ok,repetido", "Aprovação concorrente não foi idempotente.");

  const data = new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date());
  const natal = data.endsWith("-12-24");
  const total = (natal ? 6000 : 4000) + 500;
  const turno = await rpc(a,"solicitar_fechamento_turno",{
    p_data_turno:data,p_tipo:natal ? "vespera_natal" : "normal",p_chave_idempotencia:idempotencia(f,"turno"),
  });
  verificar(turno.status === "registrado" && turno.valor_devido_centavos === total, "Turno não refletiu as taxas aprovadas.");
  verificar((await rpc(responsavel,"autorizar_pagamento_turno_motoboy",{
    p_turno:turno.turno_id,p_valor_conferido:total,p_referencia:"Turno de homologação conferido",
  })).status === "autorizado", "Responsável não conseguiu autorizar turno.");
  const pagamento = {p_turno:turno.turno_id,p_valor:total,p_meio:"pix",p_efetivo_em:new Date().toISOString(),
    p_referencia:idempotencia(f,"pix-simulado"),p_chave:idempotencia(f,"pagamento")};
  for (const ator of [a,responsavel]) {
    verificar((await rpc(ator,"confirmar_pagamento_turno_motoboy",pagamento)).status === "negado",
      "Perfil indevido confirmou pagamento.");
  }
  const recusado = await rpc(financeiro,"confirmar_pagamento_turno_motoboy",{...pagamento,p_valor:total + 1,p_chave:idempotencia(f,"valor-invalido")});
  verificar(recusado.status === "inelegivel", "Financeiro pagou mais que o autorizado.");
  const pagamentos = await Promise.all([rpc(financeiro,"confirmar_pagamento_turno_motoboy",pagamento),
    rpc(financeiro,"confirmar_pagamento_turno_motoboy",pagamento)]);
  verificar(pagamentos.map((r) => r.status).sort().join() === "registrado,repetido"
    && pagamentos[0].conta_id === pagamentos[1].conta_id,"Pagamento concorrente não foi idempotente.");
  const eventos = validarResultado(await financeiro.from("conta_pagamento_eventos")
    .select("id,valor_centavos").eq("conta_id",pagamentos[0].conta_id),"Ledger de pagamento");
  verificar(eventos.length === 1 && Number(eventos[0].valor_centavos) === total,"Ledger não contém um único evento correto.");
  informar("PASSOU conferência, separação de funções, aprovação, pagamento e ledger");
}

if (process.argv[1]?.replaceAll("\\","/").endsWith("/homologar-auth-staging.mjs")) {
  try {
    const arquivo = process.env.NEIA_STAGING_CONFIG;
    assert.ok(arquivo, "Informe NEIA_STAGING_CONFIG com um arquivo externo ao repositório.");
    const config = JSON.parse(readFileSync(arquivo,"utf8").replace(/^\uFEFF/,""));
    await homologar(config,process.env.NEIA_STAGING_REF_AUTORIZADA);
  } catch (erro) {
    // Erros de parse podem incluir um trecho do arquivo com credenciais.
    console.error(erro instanceof SyntaxError ? "Arquivo de configuração JSON inválido." : erro?.message ?? "Falha na homologação.");
    process.exitCode = 1;
  }
}
