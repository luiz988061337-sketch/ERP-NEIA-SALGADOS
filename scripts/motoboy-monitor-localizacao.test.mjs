// Testes de comportamento do monitor de localização da rota (Fase GPS).
// Usa ambiente injetável: sem navegador, sem rede, sem banco.
import assert from "node:assert/strict";
import { test } from "node:test";
import { iniciarMonitorLocalizacao } from "../src/components/admin/monitor-localizacao-rota";

const MSG = {
  indisponivel: "Localização indisponível neste dispositivo.",
  aguardando: "Aguardando sinal de localização.",
  negado: "Permissão de localização negada.",
  semConexao: "Sem conexão. A próxima posição será enviada ao reconectar.",
  atualizada: "Localização atualizada.",
  recusada: "A Central recusou esta atualização.",
  naoConfirmada: "A localização não foi confirmada pela Central.",
};

function criarGeolocalizacaoFake() {
  let proximoId = 1;
  const inscritos = new Map();
  return {
    watchPosition(sucesso, erro, opcoes) {
      const id = proximoId++;
      inscritos.set(id, { sucesso, erro, opcoes });
      return id;
    },
    clearWatch(id) {
      inscritos.delete(id);
    },
    emitir(id, posicao) {
      inscritos.get(id)?.sucesso(posicao);
    },
    falhar(id, erro) {
      inscritos.get(id)?.erro(erro);
    },
    get ultimoId() {
      return proximoId - 1;
    },
    get opcoesUltimo() {
      const ultimo = proximoId - 1;
      return inscritos.get(ultimo)?.opcoes ?? null;
    },
    get ativo() {
      return inscritos.size > 0;
    },
  };
}

function criarAmbiente({ visivel = true, online = true, agora = 1_000_000, geolocalizacao = criarGeolocalizacaoFake() } = {}) {
  return {
    geolocalizacao,
    visivel: () => visivel,
    online: () => online,
    agora: typeof agora === "function" ? agora : () => agora,
  };
}

function posicaoValida(timestamp, accuracy = 20, latitude = -23, longitude = -46) {
  return { coords: { latitude, longitude, accuracy }, timestamp };
}

test("sem geolocalização informa indisponível e parar não lança", () => {
  let estado = "";
  const monitor = iniciarMonitorLocalizacao("rota-1", async () => true, criarAmbiente({ geolocalizacao: null }), MSG, (t) => { estado = t; });
  assert.equal(estado, MSG.indisponivel);
  assert.doesNotThrow(() => monitor.parar());
});

test("consentimento ativo cria watch com alta precisão e envia amostra válida", async () => {
  const geo = criarGeolocalizacaoFake();
  const agora = { valor: 1_000_000 };
  const enviadas = [];
  const monitor = iniciarMonitorLocalizacao(
    "rota-1",
    async (amostra) => { enviadas.push(amostra); return true; },
    criarAmbiente({ geolocalizacao: geo, agora: () => agora.valor }),
    MSG,
    () => {},
  );
  assert.equal(geo.opcoesUltimo?.enableHighAccuracy, true);
  const id = geo.ultimoId;
  geo.emitir(id, posicaoValida(agora.valor - 2000));
  await new Promise((r) => setImmediate(r));
  assert.equal(enviadas.length, 1);
  assert.deepEqual(enviadas[0], {
    p_rota: "rota-1",
    p_latitude: -23,
    p_longitude: -46,
    p_precisao: 20,
    p_capturado_em: new Date(agora.valor - 2000).toISOString(),
  });
  monitor.parar();
});

test("amostra com mais de 60 s não é enviada (expiração)", async () => {
  const geo = criarGeolocalizacaoFake();
  const enviadas = [];
  const monitor = iniciarMonitorLocalizacao("rota-1", async (a) => { enviadas.push(a); return true; }, criarAmbiente({ geolocalizacao: geo }), MSG, () => {});
  geo.emitir(geo.ultimoId, posicaoValida(1_000_000 - 61_000));
  await new Promise((r) => setImmediate(r));
  assert.equal(enviadas.length, 0);
  monitor.parar();
});

test("precisão pior que 1000 m não é enviada", async () => {
  const geo = criarGeolocalizacaoFake();
  const enviadas = [];
  const monitor = iniciarMonitorLocalizacao("rota-1", async (a) => { enviadas.push(a); return true; }, criarAmbiente({ geolocalizacao: geo }), MSG, () => {});
  geo.emitir(geo.ultimoId, posicaoValida(1_000_000 - 1000, 1500));
  await new Promise((r) => setImmediate(r));
  assert.equal(enviadas.length, 0);
  monitor.parar();
});

test("frequência limitada: segunda posição em menos de 15 s não envia; após 15 s envia", async () => {
  const geo = criarGeolocalizacaoFake();
  const agora = { valor: 1_000_000 };
  const enviadas = [];
  const monitor = iniciarMonitorLocalizacao("rota-1", async (a) => { enviadas.push(a); return true; }, criarAmbiente({ geolocalizacao: geo, agora: () => agora.valor }), MSG, () => {});
  const id = geo.ultimoId;
  geo.emitir(id, posicaoValida(agora.valor));
  await new Promise((r) => setImmediate(r));
  agora.valor += 5_000;
  geo.emitir(id, posicaoValida(agora.valor));
  await new Promise((r) => setImmediate(r));
  assert.equal(enviadas.length, 1);
  agora.valor += 16_000;
  geo.emitir(id, posicaoValida(agora.valor));
  await new Promise((r) => setImmediate(r));
  assert.equal(enviadas.length, 2);
  monitor.parar();
});

test("sem conexão informa desconexão e não envia", async () => {
  const geo = criarGeolocalizacaoFake();
  const enviadas = [];
  let estado = "";
  const monitor = iniciarMonitorLocalizacao("rota-1", async (a) => { enviadas.push(a); return true; }, criarAmbiente({ geolocalizacao: geo, online: false }), MSG, (t) => { estado = t; });
  geo.emitir(geo.ultimoId, posicaoValida(1_000_000));
  await new Promise((r) => setImmediate(r));
  assert.equal(enviadas.length, 0);
  assert.equal(estado, MSG.semConexao);
  monitor.parar();
});

test("tela em segundo plano não envia amostra", async () => {
  const geo = criarGeolocalizacaoFake();
  const enviadas = [];
  const monitor = iniciarMonitorLocalizacao("rota-1", async (a) => { enviadas.push(a); return true; }, criarAmbiente({ geolocalizacao: geo, visivel: false }), MSG, () => {});
  geo.emitir(geo.ultimoId, posicaoValida(1_000_000));
  await new Promise((r) => setImmediate(r));
  assert.equal(enviadas.length, 0);
  monitor.parar();
});

test("permissão negada (código 1) informa recusa; sinal ruim (código 3) informa aguardando", () => {
  for (const [code, esperado] of [[1, MSG.negado], [3, MSG.aguardando], [2, MSG.aguardando]]) {
    const geo = criarGeolocalizacaoFake();
    let estado = "";
    const monitor = iniciarMonitorLocalizacao("rota-1", async () => true, criarAmbiente({ geolocalizacao: geo }), MSG, (t) => { estado = t; });
    geo.falhar(geo.ultimoId, { code });
    assert.equal(estado, esperado);
    monitor.parar();
  }
});

test("recusa da Central e falha de rede não travam o monitor", async () => {
  const geo = criarGeolocalizacaoFake();
  const agora = { valor: 1_000_000 };
  let estado = "";
  let resposta = { ok: false, lancar: false };
  const monitor = iniciarMonitorLocalizacao(
    "rota-1",
    async () => { if (resposta.lancar) throw new Error("rede"); return resposta.ok; },
    criarAmbiente({ geolocalizacao: geo, agora: () => agora.valor }),
    MSG,
    (t) => { estado = t; },
  );
  const id = geo.ultimoId;
  geo.emitir(id, posicaoValida(agora.valor));
  await new Promise((r) => setImmediate(r));
  assert.equal(estado, MSG.recusada);
  agora.valor += 16_000;
  resposta.lancar = true;
  geo.emitir(id, posicaoValida(agora.valor));
  await new Promise((r) => setImmediate(r));
  assert.equal(estado, MSG.naoConfirmada);
  agora.valor += 16_000;
  resposta = { ok: true, lancar: false };
  geo.emitir(id, posicaoValida(agora.valor));
  await new Promise((r) => setImmediate(r));
  assert.equal(estado, MSG.atualizada);
  monitor.parar();
});

test("parar interrompe a coleta e chama clearWatch", async () => {
  const geo = criarGeolocalizacaoFake();
  const enviadas = [];
  const monitor = iniciarMonitorLocalizacao("rota-1", async (a) => { enviadas.push(a); return true; }, criarAmbiente({ geolocalizacao: geo }), MSG, () => {});
  const id = geo.ultimoId;
  monitor.parar();
  assert.equal(geo.ativo, false);
  geo.emitir(id, posicaoValida(1_000_000));
  await new Promise((r) => setImmediate(r));
  assert.equal(enviadas.length, 0);
});

test("amostras futuras e coordenadas inválidas nunca são transmitidas", async () => {
 const geo=criarGeolocalizacaoFake(), enviadas=[];
 const monitor=iniciarMonitorLocalizacao("r",async a=>{enviadas.push(a);return true;},criarAmbiente({geolocalizacao:geo}),MSG,()=>{});
 for(const p of [posicaoValida(1006000),posicaoValida(1000000,NaN),posicaoValida(1000000,-1),posicaoValida(1000000,10,91),posicaoValida(1000000,10,0,181),posicaoValida(1000000,10,NaN)]) geo.emitir(geo.ultimoId,p);
 await new Promise(r=>setImmediate(r));assert.equal(enviadas.length,0);monitor.parar();
});
test("revogação de permissão encerra o observador e impede novos envios",async()=>{
 const geo=criarGeolocalizacaoFake();let n=0;
 const monitor=iniciarMonitorLocalizacao("r",async()=>{n++;return true;},criarAmbiente({geolocalizacao:geo}),MSG,()=>{});
 const id=geo.ultimoId;geo.falhar(id,{code:1});geo.emitir(id,posicaoValida(1000000));
 await new Promise(r=>setImmediate(r));assert.equal(n,0);assert.equal(geo.ativo,false);monitor.parar();
});
test("um envio pendente não acumula requisições e parar cancela envio ainda não iniciado",async()=>{
 const geo=criarGeolocalizacaoFake();let n=0,agora=1000000,liberar;
 const monitor=iniciarMonitorLocalizacao("r",async()=>{n++;return new Promise(r=>{liberar=r});},criarAmbiente({geolocalizacao:geo,agora:()=>agora}),MSG,()=>{});
 geo.emitir(geo.ultimoId,posicaoValida(agora));await new Promise(r=>setImmediate(r));agora+=16000;
 geo.emitir(geo.ultimoId,posicaoValida(agora));assert.equal(n,1);liberar(true);await new Promise(r=>setImmediate(r));
 agora+=16000;geo.emitir(geo.ultimoId,posicaoValida(agora));monitor.parar();await new Promise(r=>setImmediate(r));assert.equal(n,1);
});
