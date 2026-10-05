import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRoles, useSession } from "@/lib/session";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { brl } from "@/lib/format";
import { whatsappLink } from "@/lib/format";
import {
  DEFAULT_CRM_SETTINGS,
  renderMensagem,
  useClientesStats,
  useCrmSettings,
} from "@/lib/crm";
import { diasParaRecompra, montarWhatsApp } from "@/lib/inteligencia";
import { simularCampanhas } from "@/lib/crm-fidelidade";

export const Route = createFileRoute("/campanhas")({
  validateSearch: z.object({
    segmento: z.string().optional(),
    dias: z.string().optional(),
  }).parse,
  head: () => ({
    meta: [{ title: "Campanhas — Néia Salgados" }],
  }),
  component: Campanhas,
});

function Campanhas() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const isAdmin = roles?.includes("admin");
  const { data: clientes } = useClientesStats();
  const { data: settings } = useCrmSettings();

  const [nome, setNome] = useState("Reativação 30+ dias");
  const [diasMin, setDiasMin] = useState(Number(search.dias ?? 30));
  const [recDias, setRecDias] = useState("0");
  const [soEmp, setSoEmp] = useState(false);
  const [mensagem, setMensagem] = useState(DEFAULT_CRM_SETTINGS.mensagem_padrao);
  const [salvando, setSalvando] = useState(false);

  const cfg = settings ?? DEFAULT_CRM_SETTINGS;

  const { data: recentes } = useQuery({
    queryKey: ["crm-recentes", cfg.intervalo_min_campanhas_dias],
    queryFn: async (): Promise<Set<string>> => {
      try {
        const corte = new Date(Date.now() - cfg.intervalo_min_campanhas_dias * 86400000).toISOString();
        const { data, error } = await supabase.from("crm_recipients").select("telefone_norm").gte("sent_at", corte);
        if (error) return new Set();
        return new Set((data ?? []).map((r: any) => r.telefone_norm));
      } catch {
        return new Set();
      }
    },
  });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: "/campanhas" }, replace: true });
  }, [loading, user, navigate]);
  useEffect(() => {
    if (settings?.mensagem_padrao) setMensagem(settings.mensagem_padrao);
  }, [settings?.mensagem_padrao]);

  const base = useMemo(() => {
    return (clientes ?? []).filter((c) => {
      if ((c.dias_sem_comprar ?? 0) < diasMin) return false;
      if (c.opt_out) return false;
      if (search.segmento && c.segmento !== search.segmento) return false;
      if (soEmp && c.tipo_cliente !== "PJ") return false;
      if (recDias !== "0") {
        const d = diasParaRecompra(c);
        if (d == null || d > Number(recDias)) return false;
      }
      return true;
    });
  }, [clientes, diasMin, search.segmento, soEmp, recDias]);

  const { aptos, bloqueadosRecentes, bloqueadosOptOut } = useMemo(() => {
    const rec = recentes ?? new Set<string>();
    const apt = base.filter((c) => !rec.has(c.telefone_norm));
    const bloqRec = base.filter((c) => rec.has(c.telefone_norm)).length;
    const bloqOpt = (clientes ?? []).filter((c) => c.opt_out && (c.dias_sem_comprar ?? 0) >= diasMin).length;
    return { aptos: apt, bloqueadosRecentes: bloqRec, bloqueadosOptOut: bloqOpt };
  }, [base, recentes, clientes, diasMin]);

  const exemplo = aptos[0];
  const previa = exemplo ? renderMensagem(mensagem, exemplo) : "Sem clientes aptos para prévia.";

  if (roles && !isAdmin) return <p className="p-10 text-center">Acesso restrito ao administrador.</p>;

  async function criarCampanha() {
    if (!cfg.campanhas_habilitadas) {
      toast.error("Campanhas desabilitadas em Configurações → CRM.");
      return;
    }
    if (aptos.length === 0) {
      toast.error("Nenhum cliente apto neste filtro.");
      return;
    }
    setSalvando(true);
    try {
      const link = `/?campanha=${nome.toLowerCase().replace(/[^a-z0-9]+/gi, "").slice(0, 24) || "reativacao"}`;
      const { data: camp, error } = await supabase.from("crm_campaigns").insert({
        nome,
        segmento: search.segmento ?? "inativo",
        filtros: { diasMin, segmento: search.segmento ?? null, recompraDias: recDias, soEmpresas: soEmp },
        mensagem_template: mensagem,
        link_rastreavel: link,
        status: "pronta",
        created_by: user!.id,
      }).select("id").single();
      if (error) throw error;
      const recips = aptos.slice(0, 500).map((c) => ({
        campaign_id: (camp as any).id,
        telefone_norm: c.telefone_norm,
        nome_snapshot: c.nome,
        variaveis: {
          dias_sem_comprar: c.dias_sem_comprar,
          ultimo_pedido: c.ultimo_pedido,
          ultimo_valor: c.ultimo_valor,
          total_pedidos: c.total_pedidos,
          total_gasto: c.total_gasto,
        },
        status: "apto",
      }));
      const { error: e2 } = await supabase.from("crm_recipients").insert(recips);
      if (e2) throw e2;
      toast.success(`Campanha criada com ${recips.length} clientes aptos.`);
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível salvar. Rode a migração 0001 (tabelas crm_*) no Supabase.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-3xl">📣 Campanhas</h1>
        <Button asChild variant="outline" className="ml-auto"><Link to="/clientes">👥 Clientes</Link></Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Reative inativos via WhatsApp usando a estrutura existente (abrir conversa — sem disparo automático inventado).
      </p>

      <div className="mt-4 space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Nome da campanha</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} /></div>
          <div className="space-y-1.5"><Label>Dias sem comprar (mínimo)</Label><Input type="number" min={1} value={diasMin} onChange={(e) => setDiasMin(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label>Recompra próxima — estimativa (opcional)</Label>
            <select value={recDias} onChange={(e) => setRecDias(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="0">Qualquer</option>
              <option value="3">Próx. 3 dias</option>
              <option value="7">Próx. 7 dias</option>
              <option value="15">Próx. 15 dias</option>
            </select>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={soEmp} onChange={(e) => setSoEmp(e.target.checked)} /> 🏢 Só empresas
          </label>
        </div>
        <p className="text-sm">
          Você selecionou <strong>{base.length} clientes</strong>. {bloqueadosOptOut} opt-out excluídos.{" "}
          {bloqueadosRecentes} com campanha nos últimos {cfg.intervalo_min_campanhas_dias} dias.{" "}
          <strong>{aptos.length} aptos.</strong>
        </p>
        <div className="space-y-1.5">
          <Label>Mensagem (variáveis: {"{{cliente}} {{dias_sem_comprar}} {{ultimo_pedido}} {{ultimo_valor}} {{total_pedidos}} {{total_gasto}} {{link_cardapio}}"})
          </Label>
          <Textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={6} maxLength={1000} />
        </div>
        <div className="rounded-lg bg-muted p-3 text-sm">
          <p className="font-semibold">Prévia {exemplo ? `— ${exemplo.nome} (${brl(exemplo.ultimo_valor)})` : ""}</p>
          <p className="mt-1 whitespace-pre-wrap">{previa}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={criarCampanha} disabled={salvando || aptos.length === 0}>
            {salvando ? "Salvando…" : `Salvar campanha (${aptos.length})`}
          </Button>
          {exemplo ? (
            <Button
              variant="outline"
              onClick={() => window.open(whatsappLink(exemplo.telefone_display, renderMensagem(mensagem, exemplo)), "_blank", "noopener")}
            >
              Testar: abrir WhatsApp
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Intervalo mínimo entre campanhas: {cfg.intervalo_min_campanhas_dias} dias (configurável em Configurações → CRM).
          Clientes 📵 opt-out são sempre excluídos.
        </p>
      </div>

      <DesempenhoCampanhas />

      <CupomReativacao aptos={aptos.length} />

      <RecuperacaoCarrinho />

      <SimuladorBox />
    </div>
  );
}

/** Gera cupom exclusivo vinculado à campanha (uso limitado aos aptos). */
function CupomReativacao({ aptos }: { aptos: number }) {
  const [tipo, setTipo] = useState("percentual");
  const [valor, setValor] = useState(10);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  async function gerar() {
    if (aptos === 0) {
      toast.error("Sem clientes aptos para dimensionar o cupom.");
      return;
    }
    setGerando(true);
    try {
      const code = `CAMP-${Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
      const fim = new Date(Date.now() + 15 * 86400000).toISOString();
      const { error } = await supabase.from("cupons").insert({
        codigo: code, tipo, valor: Number(valor), minimo: 0, ativo: true,
        validade_fim: fim, max_usos: aptos, produtos_ids: [],
      });
      if (error) throw error;
      setCodigo(code);
      toast.success(`Cupom ${code} criado: ${tipo === "percentual" ? `${valor}%` : brl(valor)}, ${aptos} usos, 15 dias.`);
    } catch {
      toast.error("Não foi possível criar. Verifique login admin e migrações.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-border bg-card p-5">
      <h2 className="font-display text-xl">Cupom de reativação</h2>
      <p className="text-xs text-muted-foreground">Exclusivo desta seleção: limite de usos = nº de aptos ({aptos}). A atribuição da venda usa o cupom registrado no pedido.</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="percentual">Percentual %</option>
            <option value="valor">Valor R$</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Desconto</Label>
          <Input type="number" min={0.01} step="0.01" value={valor} onChange={(e) => setValor(Number(e.target.value))} className="w-28" />
        </div>
        <Button disabled={gerando || aptos === 0} onClick={gerar}>{gerando ? "Gerando…" : "Gerar cupom"}</Button>
        {codigo ? <span className="text-sm font-semibold">🎟️ {codigo}</span> : null}
      </div>
    </div>
  );
}

function slugDoLink(link: string): string {  const m = /campanha=([^&]+)/.exec(link ?? "");
  const slug = m?.[1];
  return slug ? decodeURIComponent(slug) : "";
}

/** Métricas reais: selecionados, enviados (com sent_at), pedidos com origem, valor. Sem inventar entregue/lido. */
function DesempenhoCampanhas() {
  const { data: camps } = useQuery({
    queryKey: ["crm-campanhas-lista"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("crm_campaigns").select("id, nome, status, created_at, link_rastreavel").order("created_at", { ascending: false }).limit(30);
        if (error) throw error;
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });
  const { data: recips } = useQuery({
    queryKey: ["crm-recipients-todos"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("crm_recipients").select("campaign_id, sent_at").limit(5000);
        if (error) throw error;
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });
  const { data: pedidosOrigem } = useQuery({
    queryKey: ["pedidos-origem"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("pedidos").select("campanha_origem, total, status").neq("campanha_origem", "").neq("status", "cancelado").limit(2000);
        if (error) throw error;
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });
  const { data: cliques } = useQuery({
    queryKey: ["campanha-cliques"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("campanha_cliques").select("slug").limit(5000);
        if (error) throw error;
        const m = new Map<string, number>();
        for (const r of (data ?? []) as any[]) m.set(r.slug, (m.get(r.slug) ?? 0) + 1);
        return m;
      } catch {
        return new Map<string, number>();
      }
    },
  });
  if (!camps?.length) return null;
  return (
    <div className="mt-4 space-y-2 rounded-xl border border-border bg-card p-5">
      <h2 className="font-display text-xl">Histórico e desempenho</h2>
      <p className="text-xs text-muted-foreground">Pedidos contam só com atribuição confiável (link/campanha registrado no pedido). Entregue/lido: só se a API fornecer (hoje não fornece).</p>
      <ul className="space-y-2 text-sm">
        {camps.map((c) => {
          const slug = slugDoLink(c.link_rastreavel);
          const recs = (recips ?? []).filter((r) => r.campaign_id === c.id);
          const enviados = recs.filter((r) => r.sent_at).length;
          const vinc = (pedidosOrigem ?? []).filter((p) => slug && p.campanha_origem === slug);
          const valor = vinc.reduce((a, p) => a + Number(p.total ?? 0), 0);
          const conv = recs.length ? ((vinc.length / recs.length) * 100).toFixed(1) : "—";
          return (
            <li key={c.id} className="rounded-lg border border-border p-3">
              <p className="font-semibold">{c.nome} <span className="ml-1 text-xs font-normal text-muted-foreground">{c.status} • {new Date(c.created_at).toLocaleDateString("pt-BR")}</span></p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Selecionados: {recs.length} • Enviados: {enviados} • Cliques: {cliques?.get(slug) ?? 0} • Pedidos atribuídos: {vinc.length} • Valor: {brl(valor)} • Conversão: {conv === "—" ? "—" : `${conv}%`}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Recuperação de carrinho: checkouts iniciados (7d) sem pedido posterior. Manual via WhatsApp. */
function SimuladorBox() {
  const [venda, setVenda] = useState("46");
  const [custo, setCusto] = useState("30");
  const [emb, setEmb] = useState("2");
  const base = { precoVenda: Number(venda) || 0, custoProduto: Number(custo) || 0, embalagem: Number(emb) || 0, taxas: 0, impostos: 0, desconto: 0, pontosValor: 0 };
  const linhas = simularCampanhas(base, [0, 5, 10]);
  return (
    <div className="mt-4 space-y-2 rounded-xl border border-border bg-card p-5 text-sm">
      <h2 className="font-display text-xl">Simulador de campanha</h2>
      <p className="text-xs text-muted-foreground">Receita − custos − desconto = lucro estimado. Nunca confunda faturamento com lucro.</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1.5"><Label>Venda (R$)</Label><Input type="number" value={venda} onChange={(e) => setVenda(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Custo produto (R$)</Label><Input type="number" value={custo} onChange={(e) => setCusto(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Embalagem (R$)</Label><Input type="number" value={emb} onChange={(e) => setEmb(e.target.value)} /></div>
      </div>
      <ul className="space-y-1">
        {linhas.map((l) => (
          <li key={l.desconto} className="flex justify-between gap-2">
            <span className="text-muted-foreground">{l.desconto === 0 ? "Sem desconto" : `Desconto R$ ${l.desconto}`}</span>
            <span>lucro {brl(l.liquido)} • margem {l.margemPct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecuperacaoCarrinho() {
  const { data: eventos } = useQuery({
    queryKey: ["carrinho-abandonos"],
    queryFn: async () => {
      try {
        const corte = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data, error } = await supabase.from("carrinho_eventos").select("telefone, subtotal, created_at, itens").gte("created_at", corte).order("created_at", { ascending: false }).limit(100);
        if (error) throw error;
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });
  const { data: pedidosRecentes } = useQuery({
    queryKey: ["pedidos-recentes-tel"],
    queryFn: async () => {
      const corte = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data, error } = await supabase.from("pedidos").select("telefone, created_at, status").gte("created_at", corte).neq("status", "cancelado").limit(2000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const { data: optOut } = useQuery({
    queryKey: ["crm-optout-rec"],
    queryFn: async () => {
      try {
        const { data } = await supabase.from("crm_customers").select("telefone_norm, opt_out");
        return new Map(((data ?? []) as any[]).map((r) => [r.telefone_norm, !!r.opt_out]));
      } catch {
        return new Map<string, boolean>();
      }
    },
  });

  const lista = useMemo(() => {
    const vistos = new Set<string>();
    const out: { tel: string; telNorm: string; subtotal: number; quando: string; recuperado: boolean; optout: boolean }[] = [];
    for (const ev of eventos ?? []) {
      const norm = String(ev.telefone ?? "").replace(/\D/g, "");
      if (!norm || vistos.has(norm)) continue;
      vistos.add(norm);
      const recuperado = (pedidosRecentes ?? []).some((p: any) => {
        const pt = String(p.telefone ?? "").replace(/\D/g, "");
        const fim = pt.endsWith(norm) || norm.endsWith(pt);
        return fim && +new Date(p.created_at) > +new Date(ev.created_at);
      });
      out.push({
        tel: ev.telefone, telNorm: norm, subtotal: Number(ev.subtotal ?? 0),
        quando: ev.created_at, recuperado, optout: optOut?.get(norm) ?? false,
      });
    }
    return out.slice(0, 20);
  }, [eventos, pedidosRecentes, optOut]);

  if (!lista.length) return null;
  return (
    <div className="mt-4 space-y-2 rounded-xl border border-border bg-card p-5">
      <h2 className="font-display text-xl">Recuperação de carrinho (7 dias)</h2>
      <p className="text-xs text-muted-foreground">Checkouts iniciados sem pedido posterior identificado. Recuperação manual, respeitando opt-out.</p>
      <ul className="space-y-1.5 text-sm">
        {lista.map((l) => (
          <li key={l.telNorm} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2.5">
            <span className="font-semibold">{l.tel}</span>
            <span className="text-muted-foreground">{brl(l.subtotal)} • {new Date(l.quando).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
            {l.recuperado ? (
              <span className="ml-auto text-xs text-muted-foreground">✅ pediu depois</span>
            ) : l.optout ? (
              <span className="ml-auto text-xs text-muted-foreground">📵 opt-out</span>
            ) : (
              <Button
                size="sm" variant="outline" className="ml-auto"
                onClick={() => window.open(montarWhatsApp(l.tel, `Olá! 😊 Você deixou itens no seu carrinho na Néia Salgados (${brl(l.subtotal)}). Quer ajuda para finalizar? Cardápio: ${window.location.origin}/`), "_blank", "noopener")}
              >
                Abrir WhatsApp
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
