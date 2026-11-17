import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reaisParaCentavos } from "@/lib/financeiro-pagamentos";
import { brl } from "@/lib/format";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";

type Conferencia = {
  base_erp: {
    produtos_dinheiro_centavos: number;
    pix_loja_centavos: number;
    taxas_centavos: number;
  };
  dinheiro_declarado_centavos: number;
  contado_centavos: number;
  troco_loja_centavos: number;
  troco_proprio_declarado_centavos: number;
  esperado_centavos: number;
  diferenca_centavos: number;
  referencia: string;
};

type Acerto = {
  id: string;
  motoboy_id: string;
  numero: string;
  rota_id: string;
  user_id: string;
  conferido_por: string | null;
  conferencia: Conferencia | null;
  status: string;
};

type Turno = {
  id: string;
  motoboy_id: string;
  user_id: string;
  data_turno: string;
  status: string;
  valor_devido_motoboy: number;
  pagamento_autorizado_por: string | null;
};

const mensagens: Record<string, string> = {
  negado: "Seu perfil não pode executar essa ação.",
  inelegivel: "A operação já avançou ou ainda não cumpre as condições.",
  pedidos_ou_pagamentos_sem_confirmacao: "Confira o recebimento e o ledger dos pedidos antes de prosseguir.",
  divergencia_nao_resolvida: "O acerto tem uma divergência em aberto.",
  auto_aprovacao_nao_permitida: "A aprovação precisa ser feita por outra pessoa.",
  acerto_alterado_apos_autorizacao: "Os dados do acerto mudaram. Revise o turno com o responsável.",
  taxas_ou_rotas_alteradas_apos_autorizacao: "As rotas ou taxas mudaram. Revise o turno antes de pagar.",
  rotas_sem_acerto_independente: "Há rotas sem acerto aprovado ou conferidas pelo mesmo responsável.",
  rota_em_aberto: "O motoboy ainda tem rota aberta.",
  referencia_ja_utilizada: "Essa referência Pix já foi registrada em outro turno.",
  periodo_fechado: "A data informada pertence a um período fechado.",
  valor_incompativel: "O valor informado difere das taxas e do valor fixo calculados pelo servidor.",
  ja_pago: "O turno já tem pagamento registrado.",
};

function conferirValor(valor: number | undefined) {
  return Number.isSafeInteger(valor) && valor !== undefined ? brl(valor / 100) : "Sem confirmação";
}

export function AcertosMotoboyFinanceiro({ usuario, admin, financeiro }: {
  usuario: string;
  admin: boolean;
  financeiro: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <details className="rounded-xl border p-4" onToggle={(e) => setAberto(e.currentTarget.open)}>
      <summary className="cursor-pointer font-semibold">Acertos e pagamentos dos motoboys</summary>
      {aberto && <PainelAcertos usuario={usuario} admin={admin} financeiro={financeiro} />}
    </details>
  );
}

function PainelAcertos({ usuario, admin, financeiro }: { usuario: string; admin: boolean; financeiro: boolean }) {
  const cache = useQueryClient();
  const [pagina, setPagina] = useState(0);
  const [processando, setProcessando] = useState(false);
  const trava = useRef(false);
  const tentativas = useRef(new Map<string, string>());
  const [retorno, setRetorno] = useState("");
  const query = useQuery({
    queryKey: ["fin-acertos-motoboy", usuario, pagina],
    queryFn: async () => {
      const [acertos, turnos] = await Promise.all([
        supabase.from("acertos_rota").select("id,motoboy_id,numero,rota_id,user_id,conferido_por,conferencia,status")
          .in("status", ["solicitado", "em_conferencia", "conferido_com_divergencia"])
          .order("solicitado_em").order("id").range(pagina * 20, pagina * 20 + 19),
        supabase.from("turnos_motoboy").select("id,motoboy_id,user_id,data_turno,status,valor_devido_motoboy,pagamento_autorizado_por")
          .in("status", ["aberto", "pagamento_solicitado"])
          .order("data_turno").order("id").range(pagina * 20, pagina * 20 + 19),
      ]);
      if (acertos.error || turnos.error || !acertos.data || !turnos.data) throw new Error("A consulta de acertos falhou.");
      const ids = [...new Set<string>([...acertos.data, ...turnos.data].map((r) => r.motoboy_id))];
      const { data, error } = await supabase.rpc("identificar_motoboys_acerto", { p_ids: ids });
      if (error || !Array.isArray(data)) throw new Error("Não foi possível identificar os beneficiários.");
      const nomes = new Map((data as { id: string; nome: string }[]).map((m) => [m.id, m.nome]));
      return { acertos: acertos.data as Acerto[], turnos: turnos.data as Turno[], nomes };
    },
  });

  async function operar(nome: string, args: Record<string, unknown>, chave?: string) {
    if (trava.current) return;
    trava.current = true;
    setProcessando(true);
    setRetorno("");
    try {
      if (chave) {
        const identidade = JSON.stringify([nome, args]);
        const id = tentativas.current.get(identidade) ?? crypto.randomUUID();
        tentativas.current.set(identidade, id);
        args = { ...args, [chave]: id };
      }
      const { data, error } = await supabase.rpc(nome, args);
      if (error) throw error;
      const status = typeof data?.status === "string" ? data.status : "";
      if (!["ok", "autorizado", "registrado", "repetido"].includes(status)) {
        setRetorno(mensagens[data?.motivo] ?? mensagens[status] ?? "Operação recusada. Revise os dados do acerto.");
        return;
      }
      setRetorno(data?.status_acerto === "conferido_com_divergencia"
        ? "Contagem registrada com divergência. A aprovação está bloqueada."
        : "Registro confirmado pelo ERP.");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["fin-acertos-motoboy", usuario] }),
        cache.invalidateQueries({ queryKey: ["fin-contas"] }),
        cache.invalidateQueries({ queryKey: ["fin-eventos-pagamento-caixa"] }),
      ]);
    } catch {
      setRetorno("Não foi possível confirmar a resposta. Atualize a lista antes de repetir a operação.");
    } finally {
      trava.current = false;
      setProcessando(false);
    }
  }

  function conferir(e: FormEvent<HTMLFormElement>, acerto: Acerto) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    const contado = reaisParaCentavos(String(dados.get("contado") ?? ""));
    const troco = reaisParaCentavos(String(dados.get("troco") ?? ""));
    if (contado === null || troco === null) return setRetorno("Informe a contagem e o troco, inclusive quando o valor for zero.");
    void operar("conferir_acerto_rota_independente", {
      p_acerto_id: acerto.id, p_contado_centavos: contado, p_troco_loja_centavos: troco,
      p_referencia: dados.get("referencia"),
    }, "p_chave");
  }

  function confirmar(e: FormEvent<HTMLFormElement>, turno: Turno) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    const centavos = reaisParaCentavos(Number(turno.valor_devido_motoboy));
    const data = new Date(String(dados.get("efetivo") ?? ""));
    if (centavos === null || centavos <= 0 || Number.isNaN(data.getTime())) return setRetorno("Confira valor e data do pagamento.");
    void operar("confirmar_pagamento_turno_motoboy", {
      p_turno: turno.id, p_valor: centavos, p_meio: dados.get("meio"), p_efetivo_em: data.toISOString(),
      p_referencia: dados.get("referencia"),
    }, "p_chave");
  }

  return (
    <div className="mt-4 space-y-4">
      <Button variant="outline" disabled={processando || query.isFetching} onClick={() => void query.refetch()}>Atualizar lista</Button>
      {query.isPending && <p role="status">Carregando acertos e turnos…</p>}
      {query.isError && <p role="alert">A consulta de acertos está indisponível neste ambiente.</p>}
      {retorno && <p role="status" className="rounded-lg border p-3">{retorno}</p>}
      {query.data?.acertos.map((a) => (
        <section key={a.id} className="space-y-3 rounded-lg border p-3">
          <h3 className="break-all font-semibold">Acerto da rota {a.numero || a.rota_id}</h3>
          <p>{query.data?.nomes.get(a.motoboy_id) ?? "Motoboy não identificado"} · {a.status.replaceAll("_", " ")}</p>
          {a.conferencia && (
            <dl className="grid gap-2 sm:grid-cols-2">
              {[
                ["Produtos em dinheiro", a.conferencia.base_erp.produtos_dinheiro_centavos],
                ["Pix do cliente na loja", a.conferencia.base_erp.pix_loja_centavos],
                ["Taxas da rota", a.conferencia.base_erp.taxas_centavos],
                ["Dinheiro esperado", a.conferencia.esperado_centavos],
                ["Dinheiro declarado", a.conferencia.dinheiro_declarado_centavos],
                ["Dinheiro conferido", a.conferencia.contado_centavos],
                ["Troco da loja", a.conferencia.troco_loja_centavos],
                ["Troco próprio declarado", a.conferencia.troco_proprio_declarado_centavos],
                ["Diferença da conferência", a.conferencia.diferenca_centavos],
              ].map(([rotulo, valor]) => (
                <div key={rotulo}><dt>{rotulo}</dt><dd className="font-semibold">{conferirValor(typeof valor === "number" ? valor : undefined)}</dd></div>
              ))}
              <div><dt>Referência da conferência</dt><dd className="break-all">{a.conferencia.referencia}</dd></div>
            </dl>
          )}
          {a.user_id !== usuario && ["solicitado", "conferido_com_divergencia"].includes(a.status) && (
            <form className="grid gap-2 sm:grid-cols-3" onSubmit={(e) => conferir(e, a)}>
              <label>Contagem física (R$)<Input name="contado" inputMode="decimal" required /></label>
              <label>Troco da loja entregue ao motoboy (R$)<Input name="troco" inputMode="decimal" required /></label>
              <label>Referência da contagem e do troco<Input name="referencia" maxLength={240} required /></label>
              <Button disabled={processando}>Registrar conferência</Button>
            </form>
          )}
          {a.conferencia && a.status === "em_conferencia" && a.user_id !== usuario && a.conferido_por !== usuario && (
            <Button disabled={processando} onClick={() => void operar("aprovar_acerto_rota", {
              p_acerto_id: a.id, p_aprovado: true, p_motivo: "Aprovado após conferência do Caixa",
            }, "p_chave_idempotencia")}>Aprovar valores conferidos</Button>
          )}
          {a.conferencia && a.status === "conferido_com_divergencia" && a.user_id !== usuario && a.conferido_por !== usuario && (
            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
              e.preventDefault();
              const motivo = String(new FormData(e.currentTarget).get("motivo") ?? "").trim();
              if (!motivo) return setRetorno("Informe por que o acerto precisa ser refeito.");
              void operar("aprovar_acerto_rota", {
                p_acerto_id: a.id, p_aprovado: false, p_motivo: motivo,
              }, "p_chave_idempotencia");
            }}>
              <label>Motivo da rejeição<Input name="motivo" maxLength={240} required /></label>
              <Button variant="outline" disabled={processando}>Rejeitar e permitir novo acerto</Button>
            </form>
          )}
        </section>
      ))}
      {query.data?.turnos.map((t) => (
        <section key={t.id} className="space-y-3 rounded-lg border p-3">
          <h3 className="font-semibold">Turno de {t.data_turno} · {brl(t.valor_devido_motoboy)}</h3>
          <p>Beneficiário: {query.data?.nomes.get(t.motoboy_id) ?? "Motoboy não identificado"}</p>
          <p className="break-all">Protocolo {t.id} · {t.status === "aberto" ? "Aguardando autorização" : "Aguardando registro do pagamento"}</p>
          {t.status === "aberto" && admin && t.user_id !== usuario && (
            <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => {
              e.preventDefault();
              const dados = new FormData(e.currentTarget);
              const centavos = reaisParaCentavos(String(dados.get("valor") ?? ""));
              if (centavos === null) return setRetorno("Informe o valor conferido.");
              void operar("autorizar_pagamento_turno_motoboy", {
                p_turno: t.id, p_valor_conferido: centavos, p_referencia: dados.get("referencia"),
              });
            }}>
              <label>Valor autorizado (R$)<Input name="valor" inputMode="decimal" required /></label>
              <label>Referência da conferência do turno<Input name="referencia" maxLength={240} required /></label>
              <Button disabled={processando}>Autorizar pagamento</Button>
            </form>
          )}
          {t.status === "pagamento_solicitado" && financeiro && query.data?.nomes.get(t.motoboy_id) &&
            t.user_id !== usuario && t.pagamento_autorizado_por !== usuario && (
            <form className="grid gap-2 sm:grid-cols-3" onSubmit={(e) => confirmar(e, t)}>
              <label>Meio<select className="block w-full rounded-md border bg-background p-2" name="meio" required>
                <option value="pix">Pix</option><option value="dinheiro">Dinheiro</option>
              </select></label>
              <label>Data e hora do pagamento (horário do dispositivo)<Input name="efetivo" type="datetime-local" required /></label>
              <label>Referência Pix ou recibo de dinheiro<Input name="referencia" maxLength={240} /></label>
              <label className="flex items-center gap-2 sm:col-span-3"><input type="checkbox" required /> Conferi que o pagamento foi realizado.</label>
              <Button disabled={processando}>Registrar pagamento realizado</Button>
            </form>
          )}
        </section>
      ))}
      {query.data && query.data.acertos.length + query.data.turnos.length === 0 && <p>Nenhuma pendência nesta página.</p>}
      {query.data && (pagina > 0 || query.data.acertos.length === 20 || query.data.turnos.length === 20) && (
        <nav aria-label="Páginas de acertos e turnos" className="flex gap-2">
          <Button variant="outline" disabled={pagina === 0 || processando} onClick={() => setPagina(pagina - 1)}>Anterior</Button>
          <Button variant="outline" disabled={processando || (query.data.acertos.length < 20 && query.data.turnos.length < 20)} onClick={() => setPagina(pagina + 1)}>Próxima</Button>
        </nav>
      )}
    </div>
  );
}
