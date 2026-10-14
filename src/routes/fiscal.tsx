import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { PageHeader } from "@/components/admin/ui-admin";
import { useRoles, useSession } from "@/lib/session";
import { empresaConfigurada, podeTransitarFiscal, rotuloFiscal } from "@/lib/fiscal";

export const Route = createFileRoute("/fiscal")({
  head: () => ({ meta: [{ title: "Fiscal — Néia Salgados" }] }),
  component: Fiscal,
});

function Fiscal() {
  const navigate = useNavigate();
  const { user } = useSession();
  const { data: roles } = useRoles(user?.id);
  const qc = useQueryClient();
  const isAdmin = roles?.includes("admin") || roles?.includes("financeiro");
  const [docSel, setDocSel] = useState<any>(null);

  const empresa = useQuery({
    queryKey: ["empresa-fiscal"],
    enabled: !!isAdmin,
    queryFn: async () => {
      try {
        const { data } = await supabase
          .from("empresa_fiscal")
          .select("*")
          .eq("id", true)
          .maybeSingle();
        return (data ?? null) as any;
      } catch {
        return null;
      }
    },
  });
  const docs = useQuery({
    queryKey: ["docs-fiscais"],
    enabled: !!isAdmin,
    refetchInterval: 20000,
    queryFn: async () => {
      try {
        const { data } = await supabase
          .from("documentos_fiscais")
          .select("*, pedidos(numero, cliente_nome, total)")
          .order("created_at", { ascending: false })
          .limit(100);
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });
  const eventos = useQuery({
    queryKey: ["doc-eventos", docSel?.id],
    enabled: !!isAdmin && !!docSel,
    queryFn: async () => {
      const { data } = await supabase
        .from("documento_eventos")
        .select("*")
        .eq("documento_id", docSel.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as any[];
    },
  });
  const provedorCfg = useQuery({
    queryKey: ["provedor-fiscal"],
    enabled: !!isAdmin,
    queryFn: async () => {
      try {
        const { data } = await supabase
          .from("fiscal_provedor_config")
          .select("*")
          .eq("id", true)
          .maybeSingle();
        return (data ?? null) as any;
      } catch {
        return null;
      }
    },
  });

  async function salvarProvedor(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      id: true,
      provedor: String(f.get("provedor_tipo") ?? "focus"),
      ambiente: String(f.get("ambiente") ?? "homologacao"),
      homologacao_url: String(f.get("homologacao_url") ?? ""),
      homologacao_token: String(f.get("homologacao_token") ?? ""),
      producao_url: String(f.get("producao_url") ?? ""),
      producao_token: String(f.get("producao_token") ?? ""),
      timeout_segundos: Number(f.get("timeout_segundos") ?? 30) || 30,
      contingencia_habilitada: f.get("contingencia_habilitada") === "on",
    };
    const { error } = await supabase
      .from("fiscal_provedor_config")
      .upsert(payload, { onConflict: "id" });
    if (error) toast.error("Não salvou. Rode a migration 0046.");
    else {
      toast.success("Provedor fiscal salvo. Teste em homologação antes de virar produção.");
      qc.invalidateQueries({ queryKey: ["provedor-fiscal"] });
    }
  }

  const [emitindo, setEmitindo] = useState<string | null>(null);
  const pedidos = useQuery({
    queryKey: ["pedidos-fiscal"],
    enabled: !!isAdmin,
    queryFn: async () => {
      try {
        const { data } = await supabase
          .from("pedidos")
          .select("id, numero, cliente_nome, total, status")
          .order("created_at", { ascending: false })
          .limit(30);
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });

  async function emitir(pedidoId: string, forcar = false) {
    if (!cfg.ok) {
      toast.error(`Configure a empresa fiscal primeiro: faltam ${cfg.faltando.join(", ")}.`);
      return;
    }
    if (emitindo) return;
    setEmitindo(pedidoId);
    try {
      const { data, error } = await supabase.functions.invoke("fiscal-emitir", {
        body: { pedido_id: pedidoId, forcar },
      });
      if (error) {
        toast.error(error.message || "Falha ao chamar a emissão fiscal.");
        return;
      }
      if ((data as any)?.sucesso) {
        toast.success(
          `Documento ${(data as any).documento?.numero ?? ""} autorizado. Protocolo ${(data as any).documento?.protocolo ?? ""}.`,
        );
      } else {
        toast.error((data as any)?.erro || "Emissão rejeitada. Veja o detalhe do documento.");
      }
      qc.invalidateQueries({ queryKey: ["docs-fiscais"] });
      qc.invalidateQueries({ queryKey: ["pedidos-fiscal"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao emitir.");
    } finally {
      setEmitindo(null);
    }
  }

  async function salvarEmpresa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      id: true,
      razao_social: String(f.get("razao_social") ?? ""),
      nome_fantasia: String(f.get("nome_fantasia") ?? ""),
      cnpj: String(f.get("cnpj") ?? "").replace(/\D/g, ""),
      inscricao_estadual: String(f.get("ie") ?? ""),
      inscricao_municipal: String(f.get("im") ?? ""),
      endereco: String(f.get("endereco") ?? ""),
      numero: String(f.get("numero") ?? ""),
      complemento: String(f.get("complemento") ?? ""),
      bairro: String(f.get("bairro") ?? ""),
      cidade: String(f.get("cidade") ?? ""),
      uf: String(f.get("uf") ?? "SP"),
      cep: String(f.get("cep") ?? "").replace(/\D/g, ""),
      regime_tributario: String(f.get("regime") ?? ""),
      serie: String(f.get("serie") ?? ""),
      numero_inicial: Number(f.get("numero_inicial") ?? 1) || 1,
      ambiente: String(f.get("ambiente") ?? "homologacao"),
      modelo_padrao: String(f.get("modelo") ?? ""),
      provedor: String(f.get("provedor") ?? ""),
      csc_id: String(f.get("csc") ?? ""),
      info_adicionais: String(f.get("info") ?? ""),
    };
    const { error } = await supabase.from("empresa_fiscal").upsert(payload, { onConflict: "id" });
    if (error) toast.error("Não salvou. Rode a migration 0033.");
    else {
      toast.success("Configuração fiscal salva.");
      qc.invalidateQueries({ queryKey: ["empresa-fiscal"] });
    }
  }

  async function mudarStatus(doc: any, para: string) {
    if (!podeTransitarFiscal(doc.status, para)) {
      toast.error(`Transição ${doc.status} → ${para} bloqueada.`);
      return;
    }
    if (
      para === "cancelada" &&
      !window.confirm("Cancelar documento fiscal? Exige justificativa registrada.")
    )
      return;
    const motivo =
      para === "cancelada" ? (window.prompt("Justificativa do cancelamento:") ?? "") : "";
    if (para === "cancelada" && !motivo.trim()) {
      toast.error("Cancelamento exige justificativa.");
      return;
    }
    const { error } = await supabase
      .from("documentos_fiscais")
      .update({ status: para, updated_at: new Date().toISOString() })
      .eq("id", doc.id);
    if (error) {
      toast.error("Falha ao atualizar.");
      return;
    }
    await supabase
      .from("documento_eventos")
      .insert({
        documento_id: doc.id,
        evento: para,
        detalhe: motivo || `manual por ${user?.id ?? "?"}`,
      });
    toast.success(`Documento → ${rotuloFiscal(para)}.`);
    qc.invalidateQueries({ queryKey: ["docs-fiscais"] });
  }

  async function baixarXml(doc: any) {
    if (!doc.xml) {
      toast.error("XML ainda não disponível (aguardando autorização).");
      return;
    }
    const blob = new Blob([doc.xml], { type: "application/xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `doc-${doc.numero ?? doc.id}.xml`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (roles && !isAdmin)
    return <p className="p-10 text-center text-muted-foreground">Acesso do admin/financeiro.</p>;
  const emp = (empresa.data ?? {}) as any;
  const cfg = empresaConfigurada(emp);
  const ehProd = emp.ambiente === "producao";

  return (
    <>
      <AdminTopbar
        usuario={user?.email ?? null}
        acesso="Equipe"
        onSair={async () => {
          await supabase.auth.signOut();
          navigate({ to: "/auth", replace: true });
        }}
      />
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div className="flex items-center gap-3">
          <PageHeader titulo="Fiscal" />
          <span
            className={`rounded px-2 py-0.5 text-xs font-bold ${ehProd ? "bg-destructive text-destructive-foreground" : "bg-secondary text-secondary-foreground"}`}
          >
            {ehProd ? "🔴 PRODUÇÃO" : "🔵 HOMOLOGAÇÃO"}
          </span>
        </div>
        {!cfg.ok ? (
          <p className="rounded-lg bg-secondary/30 p-3 text-sm">
            ⚠️ Configuração fiscal pendente: faltam {cfg.faltando.join(", ")}. Preencha abaixo e
            valide com o contador antes de emitir.
          </p>
        ) : null}
        {ehProd ? (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            Ambiente de produção: documentos aqui têm validade fiscal real.
          </p>
        ) : null}

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-xl">Empresa (Administração → Fiscal)</h2>
          <form onSubmit={salvarEmpresa} className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
            <div className="space-y-1.5">
              <Label>Razão social *</Label>
              <Input name="razao_social" defaultValue={emp.razao_social ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Nome fantasia</Label>
              <Input name="nome_fantasia" defaultValue={emp.nome_fantasia ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>CNPJ *</Label>
              <Input name="cnpj" defaultValue={emp.cnpj ?? ""} inputMode="numeric" />
            </div>
            <div className="space-y-1.5">
              <Label>Inscrição estadual</Label>
              <Input name="ie" defaultValue={emp.inscricao_estadual ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Inscrição municipal</Label>
              <Input name="im" defaultValue={emp.inscricao_municipal ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Endereço (rua/av) *</Label>
              <Input name="endereco" defaultValue={emp.endereco ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Número</Label>
              <Input name="numero" defaultValue={emp.numero ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Complemento</Label>
              <Input name="complemento" defaultValue={emp.complemento ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Bairro</Label>
              <Input name="bairro" defaultValue={emp.bairro ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Cidade</Label>
              <Input name="cidade" defaultValue={emp.cidade ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>UF</Label>
              <Input name="uf" defaultValue={emp.uf ?? "SP"} maxLength={2} />
            </div>
            <div className="space-y-1.5">
              <Label>CEP</Label>
              <Input name="cep" defaultValue={emp.cep ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Regime tributário</Label>
              <Input
                name="regime"
                defaultValue={emp.regime_tributario ?? ""}
                placeholder="Definido pelo contador"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Série</Label>
              <Input name="serie" defaultValue={emp.serie ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Número inicial</Label>
              <Input
                name="numero_inicial"
                type="number"
                min={1}
                defaultValue={emp.numero_inicial ?? 1}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ambiente *</Label>
              <select
                name="ambiente"
                defaultValue={emp.ambiente ?? "homologacao"}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              >
                <option value="homologacao">🔵 Homologação</option>
                <option value="producao">🔴 Produção</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Modelo padrão *</Label>
              <select
                name="modelo"
                defaultValue={emp.modelo_padrao ?? ""}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              >
                <option value="">—</option>
                <option value="55">NF-e 55</option>
                <option value="65">NFC-e 65</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Provedor/API fiscal *</Label>
              <Input
                name="provedor"
                defaultValue={emp.provedor ?? ""}
                placeholder="Ex: Focus, Nuvem Fiscal…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>CSC/Token (NFC-e)</Label>
              <Input
                name="csc"
                defaultValue={emp.csc_id ?? ""}
                type="password"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label>Informações adicionais</Label>
              <Input name="info" defaultValue={emp.info_adicionais ?? ""} />
            </div>
            <Button type="submit" size="sm" className="sm:col-span-3 w-fit">
              Salvar
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Certificado digital e senhas ficam no provedor/cofre — nunca no código nem no frontend.
          </p>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-xl">Provedor fiscal (transmissão SEFAZ)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Sem provedor configurado a emissão para em “rejeitada”. Comece por homologação; o
            certificado A1 fica no provedor/cofre, nunca aqui.
          </p>
          <form onSubmit={salvarProvedor} className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
            <div className="space-y-1.5">
              <Label>Provedor</Label>
              <select
                name="provedor_tipo"
                defaultValue={(provedorCfg.data as any)?.provedor ?? "focus"}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              >
                <option value="focus">Focus NFe</option>
                <option value="nuvem_fiscal">Nuvem Fiscal</option>
                <option value="tecnospeed">TecnoSpeed</option>
                <option value="sefaz_direto">SEFAZ direto</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Ambiente do provedor</Label>
              <select
                name="ambiente"
                defaultValue={(provedorCfg.data as any)?.ambiente ?? "homologacao"}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              >
                <option value="homologacao">🔵 Homologação</option>
                <option value="producao">🔴 Produção</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Timeout (seg)</Label>
              <Input
                name="timeout_segundos"
                type="number"
                min={5}
                max={120}
                defaultValue={(provedorCfg.data as any)?.timeout_segundos ?? 30}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label>URL homologação</Label>
              <Input
                name="homologacao_url"
                defaultValue={(provedorCfg.data as any)?.homologacao_url ?? ""}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label>Token homologação</Label>
              <Input
                name="homologacao_token"
                type="password"
                autoComplete="off"
                defaultValue={(provedorCfg.data as any)?.homologacao_token ?? ""}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label>URL produção</Label>
              <Input
                name="producao_url"
                defaultValue={(provedorCfg.data as any)?.producao_url ?? ""}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label>Token produção</Label>
              <Input
                name="producao_token"
                type="password"
                autoComplete="off"
                defaultValue={(provedorCfg.data as any)?.producao_token ?? ""}
              />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-3">
              <input
                type="checkbox"
                name="contingencia_habilitada"
                defaultChecked={(provedorCfg.data as any)?.contingencia_habilitada ?? false}
              />{" "}
              Contingência habilitada (só com orientação do contador)
            </label>
            <Button type="submit" size="sm" className="sm:col-span-3 w-fit">
              Salvar provedor
            </Button>
          </form>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-xl">Emitir (pedidos sem documento)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            A emissão valida empresa + NCM/CFOP/CST com o banco antes de chamar o provedor. Sem NCM
            do contador ou com combo avulso, ela bloqueia com o motivo — nunca emite com tributo
            inventado.
          </p>
          {(() => {
            const comDoc = new Set((docs.data ?? []).map((d: any) => d.pedido_id));
            const pendentes = (pedidos.data ?? []).filter((p: any) => !comDoc.has(p.id));
            if (pendentes.length === 0)
              return (
                <p className="mt-2 text-sm text-muted-foreground">
                  Nenhum pedido recente sem documento.
                </p>
              );
            return (
              <ul className="mt-2 space-y-2 text-sm">
                {pendentes.map((p: any) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3"
                  >
                    <span className="font-display">Pedido #{p.numero}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.cliente_nome ?? ""} • {p.status}
                    </span>
                    <Button
                      size="sm"
                      className="ml-auto"
                      disabled={emitindo === p.id}
                      onClick={() => emitir(p.id)}
                    >
                      {emitindo === p.id ? "Emitindo…" : "Emitir NF-e/NFC-e"}
                    </Button>
                  </li>
                ))}
              </ul>
            );
          })()}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-xl">Documentos</h2>
          {(docs.data ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Nenhum documento. A emissão começa pelo pedido, após configurar empresa e validar
              dados com o contador.
            </p>
          ) : null}
          <ul className="mt-2 space-y-2 text-sm">
            {(docs.data ?? []).map((d: any) => (
              <li key={d.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display">Pedido #{d.pedidos?.numero ?? "—"}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {rotuloFiscal(d.status)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {d.modelo ? `mod ${d.modelo}` : ""}
                    {d.serie ? ` • sér ${d.serie}` : ""}
                    {d.numero ? ` • nº ${d.numero}` : ""}
                  </span>
                  <span className="ml-auto flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDocSel(docSel?.id === d.id ? null : d)}
                    >
                      Detalhe
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => baixarXml(d)}>
                      XML
                    </Button>
                  </span>
                </div>
                {docSel?.id === d.id ? (
                  <div className="mt-2 space-y-1 text-xs">
                    <p className="text-muted-foreground">
                      Cliente: {d.pedidos?.cliente_nome ?? "—"} • Total {d.pedidos?.total ?? "—"}
                    </p>
                    {d.chave_acesso ? <p className="break-all">Chave: {d.chave_acesso}</p> : null}
                    {d.protocolo ? <p>Protocolo: {d.protocolo}</p> : null}
                    {d.status === "rejeitada" ? (
                      <p className="text-destructive">
                        Rejeição {d.codigo_rejeicao}: {d.mensagem_rejeicao}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {["pendente", "rejeitada", "erro_comunicacao", "nao_emitida"].includes(
                        d.status,
                      ) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={emitindo === d.pedido_id}
                          onClick={() => emitir(d.pedido_id, true)}
                        >
                          {emitindo === d.pedido_id ? "Emitindo…" : "Reemitir via provedor"}
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" onClick={() => mudarStatus(d, "cancelada")}>
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => mudarStatus(d, "contingencia")}
                      >
                        Contingência
                      </Button>
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {(eventos.data ?? []).map((e: any) => (
                        <li key={e.id} className="text-muted-foreground">
                          {new Date(e.created_at).toLocaleString("pt-BR")} • {e.evento}
                          {e.detalhe ? ` — ${e.detalhe}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
