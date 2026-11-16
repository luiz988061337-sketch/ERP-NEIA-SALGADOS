import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { EmptyState, PageHeader } from "@/components/admin/ui-admin";
import { brl } from "@/lib/format";
import { downloadCSV } from "@/lib/export";
import { dreMensal, montarDRE } from "@/lib/financeiro";
import { faixaCompetencia } from "@/lib/competencia";
import { logAdmin } from "@/lib/operacao";
import { useRoles, useSession } from "@/lib/session";

export const Route = createFileRoute("/contador")({
  head: () => ({ meta: [{ title: "Contador — Néia Salgados" }] }),
  component: Contador,
});

const FECH_LABEL: Record<string, string> = {
  aberto: "Aberto",
  enviado: "Enviado ao contador",
  conferido: "Conferido",
  fechado: "Fechado",
};

function Contador() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));

  useEffect(() => {
    if (!loading && !user)
      navigate({ to: "/auth", search: { redirect: "/contador" }, replace: true });
  }, [loading, user, navigate]);

  const permitido =
    roles?.includes("admin") || roles?.includes("financeiro") || roles?.includes("contador");
  const podeGerenciar = roles?.includes("admin") || roles?.includes("financeiro");

  const fx = faixaCompetencia(mes);
  const ini = fx.ini;
  const fim = fx.fim;

  const { data: pedidos } = useQuery({
    queryKey: ["cont-pedidos", mes],
    enabled: !!permitido,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select(
          "id, numero, total, desconto, forma_pagamento, pagamento_status, status, created_at",
        )
        .gte("created_at", ini)
        .lt("created_at", fim)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: docs } = useQuery({
    queryKey: ["cont-docs", mes],
    enabled: !!permitido,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documentos_fiscais")
        .select(
          "id, pedido_id, modelo, serie, numero, status, chave_acesso, xml, danfe_url, created_at",
        )
        .gte("created_at", ini)
        .lt("created_at", fim)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: contas } = useQuery({
    queryKey: ["cont-contas", mes],
    enabled: !!permitido,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas")
        .select("id, tipo, descricao, categoria, valor, valor_pago, status, vencimento, pago_em, anexo_url")
        .or(
          `and(pago_em.gte.${ini},pago_em.lt.${fim}),and(vencimento.gte.${ini},vencimento.lt.${fim},status.neq.paga,status.neq.cancelada)`,
        )
        .order("vencimento", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: fech } = useQuery({
    queryKey: ["cont-fech", mes],
    enabled: !!permitido,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fechamentos_mensais")
        .select("*")
        .eq("competencia", mes)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as any;
    },
  });

  const { data: solics } = useQuery({
    queryKey: ["cont-solic", mes],
    enabled: !!permitido,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_contador")
        .select("*")
        .or(`competencia.eq.${mes},status.eq.aberta`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Log de acesso ao painel (quem, quando, qual competência).
  useEffect(() => {
    if (!user?.id || !permitido) return;
    supabase
      .from("contador_acessos")
      .insert({ usuario: user.id, competencia: mes, acao: "visualizou_painel" })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["cont-acessos", mes] });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, permitido, mes]);

  const { data: acessos } = useQuery({
    queryKey: ["cont-acessos", mes],
    enabled: !!podeGerenciar,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contador_acessos")
        .select("*")
        .eq("competencia", mes)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const dre = useMemo(() => {
    const comPagamento = (contas ?? []).filter((c: any) =>
      c.tipo === "pagar" && c.status !== "cancelada" &&
      (c.status === "paga" || Number(c.valor_pago ?? 0) > 0),
    );
    return montarDRE(pedidos ?? [], comPagamento);
  }, [pedidos, contas]);

  const porDoc = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs ?? []) m.set(d.status, (m.get(d.status) ?? 0) + 1);
    return m;
  }, [docs]);

  const porMeio = useMemo(() => {
    const m = new Map<string, { qtd: number; total: number }>();
    for (const p of pedidos ?? []) {
      if (p.pagamento_status !== "pago" || p.status === "cancelado") continue;
      const k = String(p.forma_pagamento ?? "outro");
      const cur = m.get(k) ?? { qtd: 0, total: 0 };
      cur.qtd += 1;
      cur.total += Number(p.total ?? 0) || 0;
      m.set(k, cur);
    }
    return [...m.entries()];
  }, [pedidos]);

  const semComprovante = useMemo(
    () =>
      (contas ?? []).filter((c: any) => c.tipo === "pagar" && c.status === "paga" && !c.anexo_url)
        .length,
    [contas],
  );

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["cont-fech", mes] });
    queryClient.invalidateQueries({ queryKey: ["cont-solic", mes] });
  }

  async function mudarFechamento(status: string) {
    const { error } = await supabase.from("fechamentos_mensais").upsert(
      {
        competencia: mes,
        status,
        enviado_em: status === "enviado" ? new Date().toISOString() : (fech?.enviado_em ?? null),
        conferido_em:
          status === "conferido" ? new Date().toISOString() : (fech?.conferido_em ?? null),
        fechado_por: status === "fechado" ? (user?.id ?? null) : (fech?.fechado_por ?? null),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "competencia" },
    );
    if (error) {
      toast.error("Falha ao atualizar. Rode a migration 0079.");
      return;
    }
    void logAdmin("fechamento", `${mes} → ${status}`);
    toast.success(`Mês ${FECH_LABEL[status] ?? status}.`);
    refresh();
  }

  async function novaSolicitacao(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const texto = String(f.get("texto") ?? "").trim();
    if (texto.length < 3) {
      toast.error("Descreva o documento solicitado.");
      return;
    }
    const { error } = await supabase.from("solicitacoes_contador").insert({
      competencia: mes,
      texto,
      anexo_url: String(f.get("anexo_url") ?? ""),
      created_by: user?.id ?? null,
    });
    if (error) {
      toast.error("Falha ao abrir solicitação.");
      return;
    }
    toast.success("Solicitação aberta.");
    (e.target as HTMLFormElement).reset();
    refresh();
  }

  async function responder(e: React.FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await supabase
      .from("solicitacoes_contador")
      .update({
        resposta: String(f.get("resposta") ?? ""),
        status: "respondida",
        respondida_em: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      toast.error("Falha ao responder.");
      return;
    }
    toast.success("Resposta registrada.");
    refresh();
  }

  function baixarXML(d: any) {
    if (!d.xml) {
      toast.error("Sem XML neste documento.");
      return;
    }
    const blob = new Blob([d.xml], { type: "application/xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nfe-${d.serie ?? "s"}-${d.numero ?? d.id.slice(0, 8)}.xml`;
    a.click();
    URL.revokeObjectURL(a.href);
    void supabase
      .from("contador_acessos")
      .insert({
        usuario: user?.id ?? null,
        competencia: mes,
        acao: `baixou_xml:${d.id.slice(0, 8)}`,
      });
  }

  function exportarVendas() {
    downloadCSV(
      `vendas-${mes}.csv`,
      (pedidos ?? []).map((p: any) => ({
        numero: p.numero,
        data: p.created_at,
        total: p.total,
        pagamento: p.forma_pagamento,
        pagamento_status: p.pagamento_status,
        status: p.status,
      })),
    );
    void supabase
      .from("contador_acessos")
      .insert({ usuario: user?.id ?? null, competencia: mes, acao: "exportou_vendas" });
  }

  if (roles && !permitido) {
    return (
      <p className="p-10 text-center text-muted-foreground">Área do contador (acesso restrito).</p>
    );
  }

  const travado = fech?.status === "fechado";

  return (
    <>
      <AdminTopbar
        usuario={user?.email ?? null}
        acesso={roles?.includes("contador") ? "Contador" : "Equipe"}
        onSair={async () => {
          await supabase.auth.signOut();
          navigate({ to: "/auth", replace: true });
        }}
      />
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8">
        <PageHeader
          titulo="Contador"
          descricao="Somente leitura fiscal e financeira, com registro de cada acesso."
          acoes={
            <Input
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="w-44"
              aria-label="Competência"
            />
          }
        />

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl">Fechamento — {mes}</h2>
            <Badge className="ml-auto">{FECH_LABEL[fech?.status ?? "aberto"]}</Badge>
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            <li className="flex justify-between rounded bg-muted px-2 py-1.5">
              <span>Documentos rejeitados</span>
              <b>{porDoc.get("rejeitada") ?? 0}</b>
            </li>
            <li className="flex justify-between rounded bg-muted px-2 py-1.5">
              <span>Contas pagas sem comprovante</span>
              <b>{semComprovante}</b>
            </li>
            <li className="flex justify-between rounded bg-muted px-2 py-1.5">
              <span>Resultado (DRE)</span>
              <b>
                {brl(dre.resultado)} ({dre.margemPct.toFixed(1)}%)
              </b>
            </li>
          </ul>
          {podeGerenciar && !travado ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {(fech?.status ?? "aberto") === "aberto" ? (
                <Button size="sm" onClick={() => mudarFechamento("enviado")}>
                  Enviar ao contador
                </Button>
              ) : null}
              {(fech?.status ?? "aberto") === "enviado" ? (
                <Button size="sm" onClick={() => mudarFechamento("conferido")}>
                  Marcar conferido
                </Button>
              ) : null}
              {(fech?.status ?? "aberto") === "conferido" ? (
                <Button size="sm" onClick={() => mudarFechamento("fechado")}>
                  Fechar mês (trava edição)
                </Button>
              ) : null}
            </div>
          ) : null}
          {travado ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Mês fechado: lançamentos travados, só estorno.
            </p>
          ) : null}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl">Documentos fiscais</h2>
            <span className="text-xs text-muted-foreground">
              autorizadas {porDoc.get("autorizada") ?? 0} • rejeitadas{" "}
              {porDoc.get("rejeitada") ?? 0} • canceladas {porDoc.get("cancelada") ?? 0}
            </span>
            <Button size="sm" variant="outline" className="ml-auto" onClick={exportarVendas}>
              Exportar vendas (CSV)
            </Button>
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {(docs ?? []).slice(0, 100).map((d: any) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-2 rounded border border-border px-2 py-1.5"
              >
                <span className="font-semibold">
                  NF {d.modelo}
                  {d.serie ? `-${d.serie}` : ""} nº {d.numero ?? "—"}
                </span>
                <Badge variant="outline">{d.status}</Badge>
                <span className="ml-auto flex gap-1">
                  {d.xml ? (
                    <Button size="sm" variant="ghost" onClick={() => baixarXML(d)}>
                      XML
                    </Button>
                  ) : null}
                  {d.danfe_url ? (
                    <a
                      href={d.danfe_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded px-2 py-1 text-sm underline"
                    >
                      DANFE
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
            {(docs ?? []).length === 0 ? (
              <li className="text-muted-foreground">Sem documentos na competência.</li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-xl">Vendas por pagamento</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {porMeio.map(([meio, v]) => (
              <li key={meio} className="flex justify-between rounded bg-muted px-2 py-1.5">
                <span>
                  {meio} ({v.qtd})
                </span>
                <b>{brl(v.total)}</b>
              </li>
            ))}
            {porMeio.length === 0 ? (
              <li className="text-muted-foreground">Sem recebimentos.</li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-xl">Solicitações de documentos</h2>
          <form onSubmit={novaSolicitacao} className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-2">
              <Label>Documento solicitado *</Label>
              <Input
                name="texto"
                required
                maxLength={300}
                placeholder="Ex.: comprovante da conta de luz de março"
              />
            </div>
            <div className="space-y-1">
              <Label>Anexo (URL)</Label>
              <Input name="anexo_url" maxLength={500} />
            </div>
            <div className="sm:col-span-3">
              <Button type="submit" size="sm">
                Abrir solicitação
              </Button>
            </div>
          </form>
          <ul className="mt-3 space-y-2 text-sm">
            {(solics ?? []).map((s: any) => (
              <li key={s.id} className="rounded border border-border p-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{s.texto}</span>
                  <Badge variant="outline" className="ml-auto">
                    {s.status}
                  </Badge>
                </div>
                {s.resposta ? (
                  <p className="mt-1 text-muted-foreground">Resposta: {s.resposta}</p>
                ) : null}
                {podeGerenciar && s.status === "aberta" ? (
                  <form onSubmit={(e) => responder(e, s.id)} className="mt-2 flex gap-2">
                    <Input
                      name="resposta"
                      required
                      maxLength={500}
                      placeholder="Responder…"
                      className="flex-1"
                    />
                    <Button type="submit" size="sm">
                      Responder
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
            {(solics ?? []).length === 0 ? (
              <li className="text-muted-foreground">Nenhuma solicitação.</li>
            ) : null}
          </ul>
        </section>

        {podeGerenciar ? (
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-display text-xl">Acessos registrados</h2>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {(acessos ?? []).map((a: any) => (
                <li key={a.id}>
                  {new Date(a.created_at).toLocaleString("pt-BR")} •{" "}
                  {a.usuario ? a.usuario.slice(0, 8) : "—"} • {a.acao}
                </li>
              ))}
              {(acessos ?? []).length === 0 ? <li>Sem acessos registrados.</li> : null}
            </ul>
          </section>
        ) : (
          <EmptyState
            titulo="Somente leitura"
            descricao="Seu papel permite ver e baixar, sem editar valores."
          />
        )}
      </div>
    </>
  );
}
