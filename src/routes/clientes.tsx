import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRoles, useSession } from "@/lib/session";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { PageHeader } from "@/components/admin/ui-admin";
import { brl, dataHora } from "@/lib/format";
import {
  SEGMENTO_LABEL,
  diasParaAniversario,
  isFrequenteCfg,
  isVipCfg,
  normalizarTelefone,
  useClientesStats,
  useCrmSettings,
  validarCNPJ,
  type CustomerStats,
  type TipoCliente,
} from "@/lib/crm";
import {
  diasParaRecompra,
  intervaloHabitual,
  montarWhatsApp,
  proximaRecompra,
} from "@/lib/inteligencia";
import { cn } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes (CRM) — Néia Salgados" },
      { name: "description", content: "Relacionamento com clientes e reativação." },
    ],
  }),
  component: Clientes,
});

type FiltroSeg = "todos" | "ativo" | "risco" | "inativo" | "muito_inativo" | "novo";
type FiltroDias = "0" | "7" | "15" | "30" | "60" | "90";
type FiltroRecompra = "0" | "3" | "7" | "15";
type FiltroAniv = "0" | "7" | "15" | "30";

function Clientes() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const isAdmin = roles?.includes("admin");
  const { data: clientes, isLoading, refetch } = useClientesStats();
  const { data: settings } = useCrmSettings();

  const [busca, setBusca] = useState("");
  const [fSeg, setFSeg] = useState<FiltroSeg>("todos");
  const [fDias, setFDias] = useState<FiltroDias>("0");
  const [fRecompra, setFRecompra] = useState<FiltroRecompra>("0");
  const [fAniv, setFAniv] = useState<FiltroAniv>("0");
  const [fEmp, setFEmp] = useState<"todas" | "pj">("todas");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [detalhe, setDetalhe] = useState<CustomerStats | null>(null);

  const { data: nascMap } = useQuery({
    queryKey: ["crm-aniversarios"],
    queryFn: async (): Promise<Map<string, string>> => {
      try {
        const { data, error } = await supabase
          .from("crm_customers")
          .select("telefone_norm, data_nascimento");
        if (error || !data) return new Map();
        return new Map(
          (data as any[])
            .filter((r) => r.data_nascimento)
            .map((r) => [r.telefone_norm, r.data_nascimento]),
        );
      } catch {
        return new Map();
      }
    },
  });

  useEffect(() => {
    if (!loading && !user)
      navigate({ to: "/auth", search: { redirect: "/clientes" }, replace: true });
  }, [loading, user, navigate]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (clientes ?? []).filter((c) => {
      if (fSeg !== "todos" && c.segmento !== fSeg) return false;
      if (Number(fDias) > 0 && (c.dias_sem_comprar ?? 0) < Number(fDias)) return false;
      if (fRecompra !== "0") {
        const d = diasParaRecompra(c);
        if (d == null || d > Number(fRecompra)) return false;
      }
      if (fAniv !== "0") {
        const d = diasParaAniversario(nascMap?.get(c.telefone_norm));
        if (d == null || d > Number(fAniv)) return false;
      }
      if (fEmp === "pj" && c.tipo_cliente !== "PJ") return false;
      if (termo && !(c.nome.toLowerCase().includes(termo) || c.telefone_display.includes(termo)))
        return false;
      return true;
    });
  }, [clientes, busca, fSeg, fDias, fRecompra, fAniv, fEmp, nascMap]);

  const nomesMap = useMemo(
    () => new Map((clientes ?? []).map((c) => [c.telefone_norm, c.nome])),
    [clientes],
  );

  if (roles && !isAdmin)
    return <p className="p-10 text-center">Acesso restrito ao administrador.</p>;

  const inativos30 = (clientes ?? []).filter((c) => (c.dias_sem_comprar ?? 0) >= 30).length;

  function toggleTodos() {
    if (selecionados.size === filtrados.length) setSelecionados(new Set());
    else setSelecionados(new Set(filtrados.map((c) => c.telefone_norm)));
  }

  async function salvarOptOut(c: CustomerStats, optOut: boolean) {
    const tel = normalizarTelefone(c.telefone_display);
    const { error } = await supabase
      .from("crm_customers")
      .upsert(
        { telefone_norm: tel, nome: c.nome, opt_out: optOut, updated_at: new Date().toISOString() },
        { onConflict: "telefone_norm" },
      );
    if (error) {
      toast.error(
        "Tabela crm_customers ainda não migrada. Rode 0001_neia_tipos_crm.sql no Supabase.",
      );
      return;
    }
    toast.success(optOut ? "Marcado como não enviar campanhas." : "Liberado para campanhas.");
    refetch();
  }

  return (
    <>
      <AdminTopbar
        usuario={user?.email ?? null}
        onSair={async () => {
          await supabase.auth.signOut();
          navigate({ to: "/auth", replace: true });
        }}
        onVoltar={() => navigate({ to: "/" })}
      />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <PageHeader
          titulo="👥 Clientes"
          descricao={`${filtrados.length} na lista`}
          acoes={
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  downloadCSV(
                    `clientes-${new Date().toISOString().slice(0, 10)}.csv`,
                    filtrados.map((c) => ({
                      nome: c.nome_fantasia || c.nome,
                      telefone: c.telefone_display,
                      tipo: c.tipo_cliente,
                      segmento: c.segmento,
                      pedidos: c.total_pedidos,
                      gasto: c.total_gasto,
                      ticket: c.ticket_medio,
                      ultimo: c.ultimo_pedido,
                      dias_sem_comprar: c.dias_sem_comprar,
                      bairro: c.bairro,
                      opt_out: c.opt_out,
                    })),
                  )
                }
              >
                CSV
              </Button>
              <Button asChild variant="outline">
                <Link to="/admin">Pedidos/Admin</Link>
              </Button>
              <Button asChild>
                <Link to="/campanhas">📣 Campanhas</Link>
              </Button>
            </div>
          }
        />

        {inativos30 > 0 ? (
          <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
            ⚠️ <strong>{inativos30} clientes estão há mais de 30 dias sem comprar.</strong>{" "}
            <button
              className="underline"
              onClick={() => {
                setFSeg("todos");
                setFDias("30");
              }}
            >
              Ver clientes
            </button>
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label>Buscar (nome/telefone)</Label>
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Ex: Maria ou 119..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Segmento</Label>
            <select
              value={fSeg}
              onChange={(e) => setFSeg(e.target.value as FiltroSeg)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="todos">Todos</option>
              <option value="ativo">🟢 Ativos</option>
              <option value="risco">🟡 Em risco</option>
              <option value="inativo">🔴 Inativos</option>
              <option value="muito_inativo">⚫ Muito inativos</option>
              <option value="novo">🆕 Novos</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Sem comprar há</Label>
            <select
              value={fDias}
              onChange={(e) => setFDias(e.target.value as FiltroDias)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="0">Qualquer período</option>
              <option value="7">7+ dias</option>
              <option value="15">15+ dias</option>
              <option value="30">30+ dias</option>
              <option value="60">60+ dias</option>
              <option value="90">90+ dias</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Recompra próxima (estimativa)</Label>
            <select
              value={fRecompra}
              onChange={(e) => setFRecompra(e.target.value as FiltroRecompra)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="0">Todas</option>
              <option value="3">Próx. 3 dias</option>
              <option value="7">Próx. 7 dias</option>
              <option value="15">Próx. 15 dias</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Aniversários próximos</Label>
            <select
              value={fAniv}
              onChange={(e) => setFAniv(e.target.value as FiltroAniv)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="0">Todos</option>
              <option value="7">Próx. 7 dias</option>
              <option value="15">Próx. 15 dias</option>
              <option value="30">Próx. 30 dias</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <select
              value={fEmp}
              onChange={(e) => setFEmp(e.target.value as "todas" | "pj")}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="todas">PF + empresas</option>
              <option value="pj">🏢 Só empresas</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" className="flex-1" onClick={toggleTodos}>
              {selecionados.size === filtrados.length && filtrados.length > 0
                ? "Desmarcar"
                : "Selecionar todos"}
            </Button>
            <Button className="flex-1" disabled={selecionados.size === 0} asChild>
              <Link
                to="/campanhas"
                search={{
                  segmento: fSeg === "todos" ? undefined : fSeg,
                  dias: fDias === "0" ? undefined : fDias,
                }}
              >
                Criar campanha ({selecionados.size})
              </Link>
            </Button>
          </div>
        </div>

        {isLoading ? (
          <p className="p-8 text-center text-muted-foreground">Carregando clientes reais…</p>
        ) : null}

        <RankingClientes nomes={nomesMap} />

        <ul className="mt-4 space-y-2">
          {filtrados.map((c) => {
            const vip = settings ? isVipCfg(c.total_gasto, c.total_pedidos, settings) : false;
            const freq = settings ? isFrequenteCfg(c.total_pedidos, settings) : false;
            const dRec = settings?.recompra_ativa === false ? null : diasParaRecompra(c);
            const dAniv = diasParaAniversario(nascMap?.get(c.telefone_norm));
            return (
              <li
                key={c.telefone_norm}
                className={cn(
                  "rounded-xl border border-border bg-card p-3",
                  c.opt_out && "opacity-70",
                )}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selecionados.has(c.telefone_norm)}
                    onChange={() =>
                      setSelecionados((s) => {
                        const n = new Set(s);
                        if (n.has(c.telefone_norm)) n.delete(c.telefone_norm);
                        else n.add(c.telefone_norm);
                        return n;
                      })
                    }
                    aria-label={`Selecionar ${c.nome}`}
                    className="size-5"
                  />
                  <div className="flex-1">
                    <p className="font-semibold">
                      {c.nome_fantasia || c.nome}{" "}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {SEGMENTO_LABEL[c.segmento]}
                      </span>
                      {c.tipo_cliente === "PJ" ? (
                        <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs">
                          🏢 Empresa
                        </span>
                      ) : null}
                      {vip ? (
                        <span className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-xs">
                          ⭐ VIP
                        </span>
                      ) : null}
                      {freq && !vip ? (
                        <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs">
                          🔁 Frequente
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.telefone_display} • {c.total_pedidos} pedidos • {brl(c.total_gasto)} •
                      último há {c.dias_sem_comprar ?? "-"} dias (
                      {c.ultimo_pedido ? dataHora(c.ultimo_pedido) : "-"})
                      {c.opt_out ? " • 📵 não enviar" : ""}
                      {dRec != null
                        ? ` • 🟣 recompra est. ${dRec <= 0 ? "agora" : `em ${dRec}d`}`
                        : ""}
                      {dAniv != null && dAniv <= 30 ? ` • 🎂 em ${dAniv}d` : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setDetalhe(c)}>
                    Detalhes
                  </Button>
                </div>
                {detalhe?.telefone_norm === c.telefone_norm ? (
                  <DetalheCliente
                    c={c}
                    settings={settings}
                    onFechar={() => setDetalhe(null)}
                    onOptOut={() => salvarOptOut(c, !c.opt_out)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
        {!isLoading && filtrados.length === 0 ? (
          <p className="p-8 text-center text-muted-foreground">Nenhum cliente neste filtro.</p>
        ) : null}
      </div>
    </>
  );
}

function DetalheCliente({
  c,
  settings,
  onFechar,
  onOptOut,
}: {
  c: CustomerStats;
  settings: ReturnType<typeof useCrmSettings>["data"];
  onFechar: () => void;
  onOptOut: () => void;
}) {
  const intervalo = settings?.recompra_ativa === false ? null : intervaloHabitual(c.datas ?? []);
  const prox =
    settings?.recompra_ativa === false ? null : proximaRecompra(c.ultimo_pedido, intervalo);
  const vip = settings ? isVipCfg(c.total_gasto, c.total_pedidos, settings) : false;
  const { data: pontos } = useQuery({
    queryKey: ["crm-pontos", c.user_id],
    enabled: !!c.user_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("pontos")
        .eq("id", c.user_id!)
        .maybeSingle();
      return (data as any)?.pontos ?? null;
    },
  });
  const [nasc, setNasc] = useState<string>("");
  const [nascAtual, setNascAtual] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoCliente>("PF");
  const [razao, setRazao] = useState("");
  const [fantasia, setFantasia] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [resp, setResp] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("crm_customers")
          .select("data_nascimento, tipo_cliente, razao_social, nome_fantasia, cnpj, responsavel")
          .eq("telefone_norm", normalizarTelefone(c.telefone_display))
          .maybeSingle();
        setNascAtual((data as any)?.data_nascimento ?? null);
        setNasc((data as any)?.data_nascimento ?? "");
        setTipo(((data as any)?.tipo_cliente === "PJ" ? "PJ" : "PF") as TipoCliente);
        setRazao(String((data as any)?.razao_social ?? ""));
        setFantasia(String((data as any)?.nome_fantasia ?? ""));
        setCnpj(String((data as any)?.cnpj ?? ""));
        setResp(String((data as any)?.responsavel ?? ""));
      } catch {
        setNascAtual(null);
      }
    })();
  }, [c.telefone_display]);
  async function salvarNasc() {
    const { error } = await supabase
      .from("crm_customers")
      .upsert(
        {
          telefone_norm: normalizarTelefone(c.telefone_display),
          nome: c.nome,
          data_nascimento: nasc || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "telefone_norm" },
      );
    if (error) {
      toast.error("Não foi possível salvar. Rode a migração 0006 no Supabase.");
      return;
    }
    setNascAtual(nasc || null);
    toast.success("Data de nascimento salva (só com consentimento do cliente).");
  }
  return (
    <div className="mt-3 grid gap-2 rounded-lg bg-muted p-3 text-sm sm:grid-cols-2">
      <p>
        <strong>Primeiro pedido:</strong> {c.primeiro_pedido ? dataHora(c.primeiro_pedido) : "-"}
      </p>
      <p>
        <strong>Último pedido:</strong> {c.ultimo_pedido ? dataHora(c.ultimo_pedido) : "-"}
      </p>
      <p>
        <strong>Total pedidos:</strong> {c.total_pedidos}
      </p>
      <p>
        <strong>Total gasto:</strong> {brl(c.total_gasto)} (ticket {brl(c.ticket_medio)})
      </p>
      <p>
        <strong>Último valor:</strong> {brl(c.ultimo_valor)}
      </p>
      <p>
        <strong>Endereço recente:</strong> {c.endereco_recente || "-"}{" "}
        {c.bairro ? `• ${c.bairro}` : ""}
      </p>
      <p>
        <strong>Classificação:</strong> {SEGMENTO_LABEL[c.segmento]}
        {vip ? " • ⭐ VIP" : ""}
      </p>
      {pontos != null ? (
        <p>
          <strong>Fidelidade:</strong> {pontos} pontos
        </p>
      ) : null}
      <p>
        <strong>Recompra (estimativa):</strong>{" "}
        {intervalo && prox
          ? `a cada ~${intervalo}d • próxima ~${prox.toLocaleDateString("pt-BR")}`
          : "sem histórico suficiente"}
      </p>
      <p className="sm:col-span-2">
        <strong>Status:</strong> {SEGMENTO_LABEL[c.segmento]}{" "}
        {settings
          ? `(ativo ≤${settings.ativo_ate_dias}d, risco ≥${settings.risco_apos_dias}d, inativo ≥${settings.inativo_apos_dias}d, muito ≥${settings.muito_inativo_apos_dias}d)`
          : ""}
      </p>
      <div className="space-y-1 sm:col-span-2">
        <Label>Data de nascimento (opcional, só se o cliente informar)</Label>
        <div className="flex gap-2">
          <Input
            type="date"
            value={nasc}
            onChange={(e) => setNasc(e.target.value)}
            className="max-w-52"
          />
          <Button size="sm" variant="outline" onClick={salvarNasc}>
            Salvar
          </Button>
          {nascAtual ? (
            <span className="self-center text-xs text-muted-foreground">
              🎂 {new Date(`${nascAtual}T12:00:00`).toLocaleDateString("pt-BR")}
            </span>
          ) : null}
        </div>
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label>Tipo de cliente (mesma base, sem duplicar)</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoCliente)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="PF">Pessoa Física</option>
            <option value="PJ">Empresa (PJ)</option>
          </select>
          <Input
            value={resp}
            onChange={(e) => setResp(e.target.value)}
            placeholder="Responsável"
            maxLength={100}
          />
        </div>
        {tipo === "PJ" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={razao}
              onChange={(e) => setRazao(e.target.value)}
              placeholder="Razão social"
              maxLength={150}
            />
            <Input
              value={fantasia}
              onChange={(e) => setFantasia(e.target.value)}
              placeholder="Nome fantasia"
              maxLength={150}
            />
            <Input
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              placeholder="CNPJ (14 dígitos)"
              inputMode="numeric"
              maxLength={18}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if (cnpj && !validarCNPJ(cnpj)) {
                  toast.error("CNPJ inválido (precisa de 14 dígitos).");
                  return;
                }
                const { error } = await supabase
                  .from("crm_customers")
                  .upsert(
                    {
                      telefone_norm: normalizarTelefone(c.telefone_display),
                      nome: c.nome,
                      tipo_cliente: tipo,
                      razao_social: razao,
                      nome_fantasia: fantasia,
                      cnpj: cnpj.replace(/\D/g, ""),
                      responsavel: resp,
                      updated_at: new Date().toISOString(),
                    },
                    { onConflict: "telefone_norm" },
                  );
                if (error) {
                  toast.error("Não foi possível salvar. Rode a migração 0009 no Supabase.");
                  return;
                }
                toast.success("Dados da empresa salvos!");
              }}
            >
              Salvar empresa
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const { error } = await supabase
                .from("crm_customers")
                .upsert(
                  {
                    telefone_norm: normalizarTelefone(c.telefone_display),
                    nome: c.nome,
                    tipo_cliente: tipo,
                    responsavel: resp,
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: "telefone_norm" },
                );
              if (error) {
                toast.error("Não foi possível salvar. Rode a migração 0009 no Supabase.");
                return;
              }
              toast.success("Tipo de cliente salvo!");
            }}
          >
            Salvar tipo
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            window.open(
              montarWhatsApp(
                c.telefone_display,
                `Olá ${c.nome.split(" ")[0]}! Aqui é da Néia Salgados 😊`,
              ),
              "_blank",
              "noopener",
            )
          }
        >
          WhatsApp
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link to="/campanhas">Criar campanha</Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link to="/admin">Ver no admin</Link>
        </Button>
        <Button size="sm" variant="outline" onClick={onOptOut}>
          {c.opt_out ? "Liberar campanhas" : "📵 Não enviar campanhas"}
        </Button>
        <Button size="sm" variant="outline" onClick={onFechar}>
          Fechar
        </Button>
      </div>
      <div className="sm:col-span-2">
        <TimelineCliente cliente={c} />
      </div>
    </div>
  );
}

function TimelineCliente({ cliente }: { cliente: CustomerStats }) {
  const sufixo = cliente.telefone_norm.slice(-9);
  const { data: pedidos } = useQuery({
    queryKey: ["timeline-pedidos", cliente.telefone_norm],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("id, numero, total, status, created_at, campanha_origem")
        .like("telefone", `%${sufixo}`)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: campanhas } = useQuery({
    queryKey: ["timeline-campanhas", cliente.telefone_norm],
    queryFn: async () => {
      try {
        const { data: recs, error } = await supabase
          .from("crm_recipients")
          .select("sent_at, status, campaign_id")
          .eq("telefone_norm", cliente.telefone_norm)
          .order("sent_at", { ascending: false })
          .limit(20);
        if (error || !recs?.length) return [];
        const ids = [...new Set(recs.map((r: any) => r.campaign_id))];
        const { data: camps } = await supabase
          .from("crm_campaigns")
          .select("id, nome")
          .in("id", ids);
        const nomes = new Map((camps ?? []).map((c: any) => [c.id, c.nome]));
        return recs.map((r: any) => ({
          sent_at: r.sent_at,
          status: r.status,
          nome: nomes.get(r.campaign_id) ?? "Campanha",
        }));
      } catch {
        return [];
      }
    },
  });
  const eventos = useMemo(() => {
    const ev: { data: string; texto: string }[] = [];
    for (const p of (pedidos ?? []) as any[]) {
      if (p.status === "cancelado") continue;
      ev.push({
        data: p.created_at,
        texto: `Pedido #${p.numero} — ${brl(p.total)}${p.campanha_origem ? ` (🔗 ${p.campanha_origem})` : ""}`,
      });
    }
    for (const c of (campanhas ?? []) as any[]) {
      if (c.sent_at) ev.push({ data: c.sent_at, texto: `Campanha enviada — ${c.nome}` });
    }
    return ev.sort((a, b) => +new Date(b.data) - +new Date(a.data)).slice(0, 15);
  }, [pedidos, campanhas]);
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="font-semibold">Linha do tempo</p>
      {eventos.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">Sem eventos registrados.</p>
      ) : (
        <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
          {eventos.map((e, i) => (
            <li key={i}>
              {new Date(e.data).toLocaleDateString("pt-BR")} — {e.texto}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type RankPeriodo = "7" | "30" | "90" | "ano";
type RankMetrica = "faturamento" | "pedidos" | "ticket";

function RankingClientes({ nomes }: { nomes: Map<string, string> }) {
  const [periodo, setPeriodo] = useState<RankPeriodo>("30");
  const [metrica, setMetrica] = useState<RankMetrica>("faturamento");
  const { data, isLoading } = useQuery({
    queryKey: ["ranking-clientes", periodo],
    queryFn: async () => {
      const dias = periodo === "ano" ? 365 : Number(periodo);
      const corte = new Date(Date.now() - dias * 86400000).toISOString();
      const { data, error } = await supabase
        .from("pedidos")
        .select("telefone, total, created_at, status")
        .gte("created_at", corte)
        .neq("status", "cancelado")
        .limit(2000);
      if (error) throw error;
      const map = new Map<string, { qtd: number; total: number }>();
      for (const p of (data ?? []) as any[]) {
        const tel = normalizarTelefone(p.telefone);
        if (!tel) continue;
        const cur = map.get(tel) ?? { qtd: 0, total: 0 };
        cur.qtd += 1;
        cur.total += Number(p.total ?? 0);
        map.set(tel, cur);
      }
      return [...map.entries()].map(([tel, v]) => ({
        tel,
        nome: nomes.get(tel) ?? tel,
        qtd: v.qtd,
        total: v.total,
        ticket: v.qtd ? v.total / v.qtd : 0,
      }));
    },
  });
  const lista = useMemo(() => {
    const arr = [...(data ?? [])];
    if (metrica === "pedidos") arr.sort((a, b) => b.qtd - a.qtd || b.total - a.total);
    else if (metrica === "ticket") arr.sort((a, b) => b.ticket - a.ticket);
    else arr.sort((a, b) => b.total - a.total);
    return arr.slice(0, 10);
  }, [data, metrica]);
  return (
    <section
      className="mt-4 rounded-xl border border-border bg-card p-4"
      aria-label="Ranking de clientes"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg">🏆 Ranking de clientes (métricas comerciais)</h2>
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value as RankPeriodo)}
          className="ml-auto rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          aria-label="Período"
        >
          <option value="7">7 dias</option>
          <option value="30">30 dias</option>
          <option value="90">90 dias</option>
          <option value="ano">Este ano</option>
        </select>
        <select
          value={metrica}
          onChange={(e) => setMetrica(e.target.value as RankMetrica)}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          aria-label="Métrica"
        >
          <option value="faturamento">Maior faturamento</option>
          <option value="pedidos">Mais pedidos</option>
          <option value="ticket">Maior ticket médio</option>
        </select>
      </div>
      {isLoading ? <p className="mt-2 text-sm text-muted-foreground">Calculando…</p> : null}
      <ol className="mt-2 space-y-1 text-sm">
        {lista.map((r, i) => (
          <li key={r.tel} className="flex justify-between gap-2">
            <span>
              #{i + 1} {r.nome} <span className="text-muted-foreground">({r.qtd} pedidos)</span>
            </span>
            <span className="font-semibold">
              {metrica === "pedidos"
                ? `${r.qtd} pedidos • ${brl(r.total)}`
                : brl(metrica === "ticket" ? r.ticket : r.total)}
            </span>
          </li>
        ))}
        {!isLoading && lista.length === 0 ? (
          <li className="text-muted-foreground">Sem dados no período.</li>
        ) : null}
      </ol>
    </section>
  );
}
