import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClipboardList } from "lucide-react";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { CentralPedidos } from "@/components/central-pedidos";
import { PageHeader } from "@/components/admin/ui-admin";
import {
  ERP_COLORS,
  ModuleHeader,
  KanbanColumn,
  ActionButton,
  StatusDot,
  StatusBadge,
} from "@/components/admin/erp-ui";
import type { Database } from "@/integrations/supabase/types";
import {
  brl,
  dataHora,
  hora,
  PAGAMENTO_LABEL,
  TAXA_ENTREGA,
  mensagemStatus,
  whatsappLink,
} from "@/lib/format";
import { useRoles, useSession } from "@/lib/session";
import { precoFinal, tipoVendaProduto, useCategorias, useProdutos } from "@/lib/catalog";
import { MINIMO_COMBO, calcTotals } from "@/lib/totals";
import { decidirCriacaoAtomica, type RpcClient } from "@/lib/criacao-atomica";
import { BUILD_DE_CORTE } from "@/lib/corte";
import { ajustarParaCombo } from "@/lib/cart";
import { logAdmin } from "@/lib/operacao";
import { normalizarTelefone } from "@/lib/crm";
import {
  distanciaRotaKm,
  geocodificarCompleto,
  MapaPinAjustavel,
  type EnderecoDetalhado,
} from "@/components/map-view";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import {
  useConfigEntrega,
  modoPorKm,
  calcularTaxaPreview,
  formatarKm,
  type PrevisaoTaxa,
} from "@/lib/config-entrega";

export const Route = createFileRoute("/atendente")({
  head: () => ({ meta: [{ title: "Novo Pedido (atendente) — Néia Salgados" }] }),
  component: Atendente,
});

type Linha = {
  produto_id: string;
  nome: string;
  preco: number;
  quantidade: number;
  combo?: boolean;
};

function Atendente() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const permitido = roles?.includes("admin") || roles?.includes("atendente");
  const { data: produtos } = useProdutos();
  const { data: categorias } = useCategorias();
  const slugCategoriaPorId = useMemo(
    () => new Map((categorias ?? []).map((c) => [c.id, c.slug])),
    [categorias],
  );

  const [buscaCli, setBuscaCli] = useState("");
  // Idempotência: mesma chave por tentativa; reenvio retorna o mesmo pedido.
  const chaveRef = useRef("");
  function chaveAtendente() {
    if (!chaveRef.current) chaveRef.current = crypto.randomUUID();
    return chaveRef.current;
  }
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [buscaProd, setBuscaProd] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [entrega, setEntrega] = useState<"entrega" | "retirada">("entrega");
  const [quando, setQuando] = useState<"hoje" | "agendar">("hoje");
  const [agendamento, setAgendamento] = useState("");
  const [pagamento, setPagamento] = useState<"pix" | "dinheiro" | "credito" | "debito">("pix");
  const [obs, setObs] = useState("");
  const [desconto, setDesconto] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [ultimo, setUltimo] = useState<number | null>(null);
  // Reforma estrutural: kanban é a visão principal; o form fica atrás de toggle.
  const [visao, setVisao] = useState<"kanban" | "novo">("kanban");

  // -----------------------------------------------------------------------
  // ENDEREÇO INTELIGENTE + TAXA POR KM (0103) — mesmo fluxo do checkout.
  // O atendente pode ajustar a taxa manualmente (auditado no servidor).
  // -----------------------------------------------------------------------
  const { data: cfgEntrega } = useConfigEntrega();
  const porKm = modoPorKm(cfgEntrega);
  const [selEnd, setSelEnd] = useState<EnderecoDetalhado | null>(null);
  const [pinFinal, setPinFinal] = useState<{ lat: number; lng: number } | null>(null);
  const [taxaPrev, setTaxaPrev] = useState<PrevisaoTaxa | null>(null);
  const [calculandoTaxa, setCalculandoTaxa] = useState(false);
  const [ajusteTaxa, setAjusteTaxa] = useState<string>("");
  const [ajusteMotivo, setAjusteMotivo] = useState<string>("");
  const [mapaAberto, setMapaAberto] = useState(false);
  const calcSeqRef = useRef(0);

  // Recálculo da rota + taxa sempre que o ponto final confirmado mudar.
  useEffect(() => {
    if (entrega !== "entrega" || !porKm) {
      setTaxaPrev(null);
      return;
    }
    const destino = pinFinal ?? (selEnd ? { lat: selEnd.lat, lng: selEnd.lng } : null);
    if (!destino) {
      setTaxaPrev(null);
      return;
    }
    const seq = ++calcSeqRef.current;
    setCalculandoTaxa(true);
    void (async () => {
      const subLocal = linhas.reduce((a, l) => a + l.preco * l.quantidade, 0);
      let rota: number | null = null;
      if (cfgEntrega?.origem_lat != null && cfgEntrega?.origem_lng != null) {
        const r = await distanciaRotaKm(
          { lat: cfgEntrega.origem_lat, lng: cfgEntrega.origem_lng },
          destino,
        );
        if (calcSeqRef.current !== seq) return;
        rota = r?.km ?? null;
      }
      const prev = await calcularTaxaPreview({
        lat: destino.lat,
        lng: destino.lng,
        distanciaKm: rota,
        subtotal: subLocal,
      });
      if (calcSeqRef.current !== seq) return;
      setTaxaPrev(prev);
      setCalculandoTaxa(false);
    })();
  }, [selEnd, pinFinal, entrega, porKm, linhas]); // eslint-disable-line react-hooks/exhaustive-deps

  function aoEscolherEnderecoAtendente(d: EnderecoDetalhado) {
    setSelEnd(d);
    setPinFinal({ lat: d.lat, lng: d.lng });
    setMapaAberto(true);
    setEndereco(d.numero ? `${d.logradouro}, ${d.numero}` : d.logradouro);
    if (d.bairro) setBairro(d.bairro);
    if (d.cidade) setCidade(d.cidade);
  }

  /** Regeocodifica o endereço digitado (ex.: depois de incluir o número). */
  async function atualizarLocalAtendente() {
    if (endereco.trim().length < 4) {
      toast.error("Informe o endereço completo (rua e número) primeiro.");
      return;
    }
    const texto = [endereco.trim(), bairro.trim(), cidade.trim(), selEnd?.uf ?? ""]
      .filter(Boolean)
      .join(", ");
    const d = await geocodificarCompleto(texto);
    if (!d) {
      toast.error("Não foi possível localizar esse endereço no mapa. Confira os dados.");
      return;
    }
    setSelEnd(d);
    setPinFinal({ lat: d.lat, lng: d.lng });
    setMapaAberto(true);
    if (d.numero && !/\d/.test(endereco)) setEndereco(`${d.logradouro}, ${d.numero}`);
  }

  useEffect(() => {
    if (!loading && !user)
      navigate({ to: "/auth", search: { redirect: "/atendente" }, replace: true });
  }, [loading, user, navigate]);

  const { data: achados } = useQuery({
    queryKey: ["atendente-clientes", buscaCli],
    enabled: !!permitido && buscaCli.trim().length >= 3,
    queryFn: async () => {
      const t = buscaCli
        .trim()
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .slice(0, 60);
      const dig = t.replace(/\D/g, "");
      const { data, error } = await supabase
        .from("profiles")
        .select("nome, telefone")
        .or(`nome.ilike.%${t}%,telefone.ilike.%${dig}%`)
        .limit(12);
      if (error) throw error;
      const vistos = new Set<string>();
      const out: { nome: string; telefone: string }[] = [];
      for (const p of (data ?? []) as any[]) {
        const tel = String(p.telefone ?? "");
        if (!tel || vistos.has(tel)) continue;
        vistos.add(tel);
        out.push({ nome: p.nome ?? "", telefone: tel });
      }
      return out.slice(0, 8);
    },
  });

  const subtotal = linhas.reduce((a, l) => a + l.preco * l.quantidade, 0);
  // Taxa REAL do servidor quando o regime por km respondeu; padrão R$ 6 caso

  /* --------------------------------------------------------------------
     KANBAN DE ATENDIMENTO (reforma estrutural)
     Colunas baseadas em dados reais:
     - NOVOS: status recebido, sem aceite do atendente (aceito_em_atendente)
     - ACEITOS: status recebido já aceito, aguardando produção
     - EM PRODUÇÃO: status em_producao
     - PRONTOS: status pronto
     Leitura apenas — nenhuma transição de status é alterada aqui.
  -------------------------------------------------------------------- */
  const hojeISO = new Date().toISOString().slice(0, 10);
  const { data: pedidosKanban } = useQuery({
    queryKey: ["atendente-kanban", hojeISO],
    enabled: !!permitido,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select(
          "id, numero, cliente_nome, telefone, total, status, created_at, tipo_entrega, agendado_para, observacoes, aceito_em_atendente",
        )
        .or(`created_at.gte.${hojeISO}T00:00:00,agendado_para.gte.${hojeISO}T00:00:00`)
        .in("status", ["recebido", "em_producao", "pronto"])
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const colunasKanban = useMemo(() => {
    const l = pedidosKanban ?? [];
    return [
      {
        titulo: "Novos",
        cor: ERP_COLORS.orange,
        pedidos: l.filter((p) => p.status === "recebido" && !p.aceito_em_atendente),
      },
      {
        titulo: "Aceitos",
        cor: ERP_COLORS.blue,
        pedidos: l.filter((p) => p.status === "recebido" && !!p.aceito_em_atendente),
      },
      {
        titulo: "Em Produção",
        cor: ERP_COLORS.gold,
        pedidos: l.filter((p) => p.status === "em_producao"),
      },
      {
        titulo: "Prontos",
        cor: ERP_COLORS.green,
        pedidos: l.filter((p) => p.status === "pronto"),
      },
    ];
  }, [pedidosKanban]);

  // contrário (legado). Ajuste manual do atendente aparece no resumo.
  const taxaPrevValida =
    entrega === "entrega" &&
    porKm &&
    taxaPrev != null &&
    taxaPrev.modo === "config" &&
    taxaPrev.aceitarEntregas &&
    !taxaPrev.foraDaArea;
  const taxaBase = taxaPrevValida ? (taxaPrev as PrevisaoTaxa).taxa : TAXA_ENTREGA;
  const taxaAjustadaNum = ajusteTaxa.trim() === "" ? null : Number(ajusteTaxa);
  const taxaEfetiva =
    taxaAjustadaNum != null && Number.isFinite(taxaAjustadaNum) && taxaAjustadaNum >= 0
      ? Math.round(taxaAjustadaNum * 100) / 100
      : taxaBase;
  const calc = calcTotals({
    subtotal,
    taxaEntrega: entrega === "entrega" ? taxaEfetiva : 0,
    desconto,
  });

  function addProd(id: string) {
    const p = (produtos ?? []).find((x) => x.id === id);
    if (!p || !p.disponivel) return;
    // Mesma regra do carrinho: combo entra em múltiplos de 50.
    const combo = tipoVendaProduto(p, slugCategoriaPorId.get(p.categoria_id) ?? "") === "combo_50";
    const passo = combo ? MINIMO_COMBO : 1;
    setLinhas((prev) => {
      const f = prev.find((l) => l.produto_id === id);
      if (f) {
        const soma = f.quantidade + passo;
        return prev.map((l) =>
          l.produto_id === id ? { ...l, quantidade: combo ? ajustarParaCombo(soma) : soma } : l,
        );
      }
      return [
        ...prev,
        { produto_id: id, nome: p.nome, preco: precoFinal(p), quantidade: passo, combo },
      ];
    });
  }

  function mudaQtd(id: string, delta: number) {
    setLinhas((prev) =>
      prev
        .map((l) => {
          if (l.produto_id !== id) return l;
          const n = l.quantidade + delta;
          return { ...l, quantidade: l.combo ? ajustarParaCombo(Math.max(n, MINIMO_COMBO)) : n };
        })
        .filter((l) => l.quantidade > 0),
    );
  }

  async function finalizar() {
    if (!user) return;
    const telDig = telefone.replace(/\D/g, "");
    if (nome.trim().length < 2) {
      toast.error("Informe o nome do cliente.");
      return;
    }
    if (telDig.length < 10) {
      toast.error("Informe um WhatsApp válido com DDD.");
      return;
    }
    if (linhas.length === 0) {
      toast.error("Adicione ao menos um produto.");
      return;
    }
    if (entrega === "entrega" && endereco.trim().length < 6) {
      toast.error("Informe o endereço de entrega.");
      return;
    }
    if (entrega === "entrega" && bairro.trim().length < 2) {
      toast.error("Informe o bairro.");
      return;
    }
    if (entrega === "entrega" && cidade.trim().length < 2) {
      toast.error("Informe a cidade.");
      return;
    }
    if (entrega === "entrega" && cfgEntrega && !cfgEntrega.aceitar_entregas) {
      toast.error("A entrega está desativada nas configurações. Use retirada.");
      return;
    }
    if (entrega === "entrega" && porKm && !pinFinal) {
      toast.error("Confirme o ponto no mapa: busque o endereço e ajuste o pin.");
      return;
    }
    if (entrega === "entrega" && taxaPrev?.foraDaArea) {
      toast.error("Este endereço está fora da área de entrega configurada.");
      return;
    }
    // Ajuste manual: valor zerado EXIGE motivo (auditoria server-side).
    if (
      entrega === "entrega" &&
      taxaAjustadaNum != null &&
      taxaAjustadaNum !== taxaBase &&
      taxaAjustadaNum === 0 &&
      ajusteMotivo.trim() === ""
    ) {
      toast.error("Taxa zerada exige motivo (cortesia, promoção, erro operacional…).");
      return;
    }
    let agendadoPara: string | null = null;
    if (quando === "agendar") {
      const dt = new Date(agendamento);
      if (!agendamento || Number.isNaN(+dt) || +dt <= Date.now() + 30 * 60000) {
        toast.error("Agende com pelo menos 30 minutos de antecedência.");
        return;
      }
      agendadoPara = dt.toISOString();
    }
    setEnviando(true);
    try {
      // Revalida preços atuais direto do banco
      const ids = [...new Set(linhas.map((l) => l.produto_id))];
      const { data: prods, error: e1 } = await supabase
        .from("produtos")
        .select("id, nome, preco, preco_promocional, disponivel, estoque")
        .in("id", ids);
      if (e1) throw e1;
      const mapa = new Map(((prods ?? []) as any[]).map((p) => [p.id, p]));
      const itens: Linha[] = [];
      const fora: string[] = [];
      let sub = 0;
      for (const l of linhas) {
        const p = mapa.get(l.produto_id);
        if (!p || !p.disponivel || Number(p.estoque ?? 0) <= 0) {
          fora.push(l.nome);
          continue;
        }
        const preco = Number(precoFinal(p as any));
        sub += preco * l.quantidade;
        itens.push({ produto_id: l.produto_id, nome: l.nome, preco, quantidade: l.quantidade });
      }
      if (itens.length === 0) throw new Error("Nenhum item disponível no momento.");
      const calcF = calcTotals({
        subtotal: sub,
        taxaEntrega: entrega === "entrega" ? taxaEfetiva : 0,
        desconto,
      });
      // Determinar modalidade de pagamento: online vs na_entrega
      // - dinheiro: sempre na_entrega
      // - pix/credito/debito: online por padrão
      // - retirada: sempre online
      const pagamento_modalidade =
        entrega === "retirada" ? "online" : pagamento === "dinheiro" ? "na_entrega" : "online";

      const insertBody: Record<string, any> = {
        id: chaveAtendente(),
        user_id: user.id,
        cliente_nome: nome.trim(),
        telefone: telefone.trim(),
        endereco: entrega === "entrega" ? endereco.trim() : "Retirada",
        bairro: bairro.trim(),
        cidade: cidade.trim(),
        complemento: "",
        referencia: "",
        observacoes: obs.trim(),
        forma_pagamento: pagamento,
        pagamento_modalidade,
        subtotal: sub,
        taxa_entrega: calcF.taxaEntrega,
        desconto: calcF.desconto,
        total: calcF.total,
        cupom: null,
        tipo_entrega: entrega,
        agendado_para: agendadoPara,
        agendamento_obs: "",
        tipo_evento: "",
        // 0103: ponto final confirmado + distância de rota. O servidor
        // revalida a distância e recalcula a taxa (cliente/staff não define).
        destino_lat: entrega === "entrega" ? (pinFinal?.lat ?? selEnd?.lat ?? null) : null,
        destino_lng: entrega === "entrega" ? (pinFinal?.lng ?? selEnd?.lng ?? null) : null,
        distancia_km: entrega === "entrega" ? (taxaPrev?.distanciaKm ?? null) : null,
        endereco_estado: entrega === "entrega" ? (selEnd?.uf ?? null) : null,
        endereco_place_id: entrega === "entrega" ? (selEnd?.placeId || null) : null,
      };
      let pedidoId = "";
      let numero = 0;
      // Criação atômica (0095) — atrás de flag OFF. Flag OFF => caminho legado
      // intacto. Flag ON + sucesso => pula o legado. Flag ON sem attestation/
      // erro => aborta (NUNCA cai no fallback inseguro).
      let atomico = false;
      {
        const dadosAtendente: Record<string, unknown> = {
          ...insertBody,
          desconto_manual: Number(calcF.desconto) || 0,
          // Ajuste manual AUDITADO da taxa de entrega (só staff autorizado,
          // config.ajuste_manual = true; taxa 0 exige motivo).
          entrega_ajuste:
            entrega === "entrega" &&
            taxaAjustadaNum != null &&
            taxaAjustadaNum !== taxaBase
              ? { taxa_final: taxaAjustadaNum, motivo: ajusteMotivo.trim() || null }
              : undefined,
        };
        const decisao = await decidirCriacaoAtomica(supabase as unknown as RpcClient, {
          pedidoId: insertBody["id"] as string,
          canal: "atendente",
          dados: dadosAtendente,
          itens: itens.map((i) => ({
            produtoId: i.produto_id,
            quantidade: i.quantidade,
          })),
        });
        if (decisao.modo === "erro") {
          toast.error(decisao.mensagem);
          return;
        }
        if (decisao.modo === "atomico") {
          pedidoId = decisao.pedido.id;
          numero = decisao.pedido.numero;
          atomico = true;
        }
      }
      // No BUILD DE CORTE o caminho legado NAO e compilado: o bloco e removido
      // do bundle (constant-folding de !BUILD_DE_CORTE). Nao ha fallback.
      if (!BUILD_DE_CORTE && !atomico) {
        const res = await supabase.from("pedidos").insert(insertBody).select("id, numero").single();
        if (res.error && (res.error as any).code === "23505") {
          // Reenvio: recupera o pedido da mesma chave em vez de duplicar.
          const rec = await supabase
            .from("pedidos")
            .select("id, numero")
            .eq("id", insertBody["id"])
            .single();
          if (rec.error || !rec.data) throw res.error;
          const { count } = await supabase
            .from("pedido_itens")
            .select("id", { count: "exact", head: true })
            .eq("pedido_id", insertBody["id"]);
          if ((count ?? 0) > 0) {
            toast.success(`Pedido #${(rec.data as any).numero} já estava registrado.`);
            chaveRef.current = "";
            return;
          }
          pedidoId = (rec.data as any).id;
          numero = (rec.data as any).numero;
        } else if (res.error && String(res.error.message ?? "").includes("column")) {
          const {
            agendado_para: _a,
            agendamento_obs: _b,
            tipo_evento: _c,
            cidade: _d,
            pagamento_modalidade: _pm,
            tipo_entrega: _te,
            ...legacy
          } = insertBody;
          const retry = await supabase.from("pedidos").insert(legacy).select("id, numero").single();
          if (retry.error || !retry.data) throw retry.error ?? new Error("insert falhou");
          pedidoId = (retry.data as any).id;
          numero = (retry.data as any).numero;
        } else {
          if (res.error || !res.data) throw res.error ?? new Error("insert falhou");
          pedidoId = (res.data as any).id;
          numero = (res.data as any).numero;
        }
      const { error: e2 } = await supabase.from("pedido_itens").insert(
        itens.map((i) => ({
          pedido_id: pedidoId,
          produto_id: i.produto_id,
          nome: i.nome,
          preco_unitario: i.preco,
          quantidade: i.quantidade,
        })),
      );
      if (e2) {
        // Compensação: desfaz o pedido vazio e mantém as linhas digitadas.
        try {
          await supabase.from("pedidos").delete().eq("id", pedidoId);
        } catch {
          /* best-effort */
        }
        throw new Error("Falha ao gravar itens — pedido desfeito, linhas mantidas. Tente de novo.");
      }
      }
      void logAdmin("pedido_atendente", `#${numero} ${nome.trim()} ${brl(calcF.total)}`);
      setUltimo(numero);
      setLinhas([]);
      setObs("");
      setDesconto(0);
      chaveRef.current = "";
      if (fora.length > 0) toast.warning(`Indisponíveis: ${fora.slice(0, 3).join(", ")}`);
      toast.success(`Pedido #${numero} registrado! Total ${brl(calcF.total)}`);
      const linhasTxt = itens
        .map((i) => `* ${i.quantidade}x ${i.nome} — ${brl(i.preco * i.quantidade)}`)
        .join("\n");
      window.open(
        whatsappLink(
          telefone.trim(),
          `Novo pedido #${numero}\n\nCliente: ${nome.trim()}\n\n${linhasTxt}\n\nProdutos: ${brl(calcF.subtotal)}\nEntrega: ${brl(calcF.taxaEntrega)}\nTotal: ${brl(calcF.total)}\n\nPagamento: ${PAGAMENTO_LABEL[pagamento]}\n\n${mensagemStatus("recebido", nome.trim(), numero)}`,
        ),
        "_blank",
        "noopener",
      );
    } catch (err) {
      console.error("[atendente] finalizar:", err);
      const detalhe =
        err instanceof Error && err.message
          ? err.message
          : typeof err === "string" && err
            ? err
            : "";
      toast.error(detalhe || "Não foi possível registrar.");
    } finally {
      setEnviando(false);
    }
  }

  if (loading) return <p className="p-10 text-center text-muted-foreground">Carregando…</p>;
  if (roles && !permitido)
    return <p className="p-10 text-center">Acesso restrito a atendentes e administradores.</p>;

  const termo = buscaProd.trim().toLowerCase();
  const prodsOk = (produtos ?? []).filter(
    (p) => p.disponivel && (!termo || p.nome.toLowerCase().includes(termo)),
  );

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
      {visao === "kanban" ? (
        <div className="mx-auto max-w-[1700px]">
          <CentralPedidos />
          <div className="flex justify-end px-3 pb-4">
            <ActionButton variant="ghost" onClick={() => setVisao("novo")}>
              + Novo Pedido
            </ActionButton>
          </div>
        </div>
      ) : (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        <div className="flex items-center justify-between gap-2">
          <PageHeader titulo="Novo pedido" />
          <ActionButton variant="ghost" onClick={() => setVisao("kanban")}>
            ← Kanban
          </ActionButton>
        </div>
        {ultimo ? (
          <p className="rounded-xl border border-green-300 bg-green-50 p-3 text-sm">
            ✅ Último pedido registrado: <strong>#{ultimo}</strong>
          </p>
        ) : null}

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-lg">Cliente</h2>
          <Input
            value={buscaCli}
            onChange={(e) => setBuscaCli(e.target.value)}
            placeholder="Buscar cliente (3+ letras)…"
          />
          {(achados ?? []).length > 0 ? (
            <ul className="space-y-1">
              {(achados ?? []).map((a) => (
                <li key={a.telefone}>
                  <button
                    type="button"
                    className="w-full rounded-lg border border-border p-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      setNome(a.nome);
                      setTelefone(a.telefone);
                      setBuscaCli("");
                    }}
                  >
                    {a.nome || "Sem nome"} • {a.telefone}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp *</Label>
              <Input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(11) 90000-0000"
                inputMode="tel"
              />
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-lg">Produtos</h2>
          <Input
            value={buscaProd}
            onChange={(e) => setBuscaProd(e.target.value)}
            placeholder="Buscar produto…"
          />
          <ul className="max-h-56 space-y-1.5 overflow-y-auto">
            {prodsOk.slice(0, 60).map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1">
                  {p.nome} <span className="text-muted-foreground">• {brl(precoFinal(p))}</span>
                </span>
                <Button size="sm" variant="outline" onClick={() => addProd(p.id)}>
                  Adicionar
                </Button>
              </li>
            ))}
          </ul>
          {linhas.length > 0 ? (
            <ul className="space-y-1.5 border-t border-border pt-2">
              {linhas.map((l) => (
                <li key={l.produto_id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">
                    {l.quantidade}x {l.nome}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => mudaQtd(l.produto_id, -1)}>
                    −
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => mudaQtd(l.produto_id, 1)}>
                    +
                  </Button>
                  <span className="w-20 text-right">{brl(l.preco * l.quantidade)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum produto ainda.</p>
          )}
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-lg">Entrega e data</h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setEntrega("entrega")}
              className={`rounded-lg border p-3 text-sm font-semibold ${entrega === "entrega" ? "border-primary bg-primary/10" : ""}`}
            >
              🛵 Entrega
            </button>
            <button
              type="button"
              onClick={() => setEntrega("retirada")}
              className={`rounded-lg border p-3 text-sm font-semibold ${entrega === "retirada" ? "border-primary bg-primary/10" : ""}`}
            >
              🏃 Retirada
            </button>
          </div>
          {entrega === "entrega" ? (
            <>
              <div className="space-y-1.5">
                <Label>Buscar endereço do cliente</Label>
                <AddressAutocomplete
                  aoSelecionar={aoEscolherEnderecoAtendente}
                  placeholder="Rua, avenida, CEP, condomínio…"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-1">
                  <Label>Endereço *</Label>
                  <Input
                    value={endereco}
                    onChange={(e) => setEndereco(e.target.value)}
                    placeholder="Rua, número"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Bairro</Label>
                  <Input value={bairro} onChange={(e) => setBairro(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Cidade</Label>
                  <Input value={cidade} onChange={(e) => setCidade(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void atualizarLocalAtendente()}
                >
                  📍 Atualizar local no mapa
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => mapaAberto && pinFinal ? setMapaAberto(false) : setMapaAberto(true)}
                >
                  {mapaAberto ? "Fechar mapa" : "Confirmar local da entrega"}
                </Button>
              </div>
              {calculandoTaxa ? (
                <p className="text-xs text-muted-foreground">Calculando distância e taxa…</p>
              ) : null}
              {porKm && taxaPrevValida ? (
                <p className="text-sm">
                  <span className="text-muted-foreground">Distância:</span>{" "}
                  <strong>{formatarKm(taxaPrev.distanciaKm)}</strong>
                  <span className="mx-2 text-muted-foreground">•</span>
                  <span className="text-muted-foreground">Taxa:</span>{" "}
                  <strong>{brl(taxaPrev.taxa)}</strong>
                  {taxaPrev.entregaGratis ? (
                    <span className="ml-2 text-xs text-success">(grátis)</span>
                  ) : null}
                </p>
              ) : null}
              {taxaPrev?.foraDaArea ? (
                <p className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
                  Endereço fora da área de entrega configurada.
                </p>
              ) : null}
              {mapaAberto && pinFinal ? (
                <div className="space-y-1">
                  <MapaPinAjustavel
                    lat={pinFinal.lat}
                    lng={pinFinal.lng}
                    onChange={(lat, lng) => setPinFinal({ lat, lng })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Arraste o pin para a entrada correta antes de confirmar o pedido.
                  </p>
                </div>
              ) : null}
            </>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setQuando("hoje")}
              className={`rounded-lg border p-3 text-sm font-semibold ${quando === "hoje" ? "border-primary bg-primary/10" : ""}`}
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setQuando("agendar")}
              className={`rounded-lg border p-3 text-sm font-semibold ${quando === "agendar" ? "border-primary bg-primary/10" : ""}`}
            >
              Agendar
            </button>
          </div>
          {quando === "agendar" ? (
            <div className="space-y-1.5">
              <Label>Data e horário *</Label>
              <Input
                type="datetime-local"
                value={agendamento}
                onChange={(e) => setAgendamento(e.target.value)}
              />
            </div>
          ) : null}
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-lg">Pagamento e obs.</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["pix", "dinheiro", "credito", "debito"] as const).map((op) => (
              <button
                key={op}
                type="button"
                onClick={() => setPagamento(op)}
                className={`rounded-lg border p-2.5 text-sm font-semibold ${pagamento === op ? "border-primary bg-primary/10" : ""}`}
              >
                {PAGAMENTO_LABEL[op]}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Desconto (R$)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={desconto}
                onChange={(e) => setDesconto(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Input value={obs} onChange={(e) => setObs(e.target.value)} maxLength={200} />
            </div>
            {entrega === "entrega" && cfgEntrega?.ajuste_manual !== false ? (
              <div className="space-y-1.5">
                <Label>
                  Taxa manual (calculada: {brl(taxaBase)}) — vazio = usar calculada
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={ajusteTaxa}
                  onChange={(e) => setAjusteTaxa(e.target.value)}
                  placeholder={String(taxaBase)}
                />
                <Input
                  value={ajusteMotivo}
                  onChange={(e) => setAjusteMotivo(e.target.value)}
                  maxLength={200}
                  placeholder="Motivo do ajuste (obrigatório se taxa R$ 0)"
                />
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-1 rounded-xl border border-border bg-card p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{brl(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Entrega
              {porKm && taxaPrev?.distanciaKm != null
                ? ` (${formatarKm(taxaPrev.distanciaKm)})`
                : ""}
            </span>
            <span>
              {brl(entrega === "entrega" ? taxaEfetiva : 0)}
              {entrega === "entrega" && taxaEfetiva !== taxaBase ? (
                <span className="ml-1 text-xs text-muted-foreground line-through">
                  {brl(taxaBase)}
                </span>
              ) : null}
            </span>
          </div>
          {desconto > 0 ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Desconto</span>
              <span>-{brl(Math.min(desconto, subtotal))}</span>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-border pt-2 font-display text-lg">
            <span>Total</span>
            <span className="text-primary">{brl(calc.total)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Telefone normalizado: {normalizarTelefone(telefone) || "—"}
          </p>
        </section>

        <Button
          size="lg"
          className="min-h-[52px] w-full text-base"
          disabled={enviando || linhas.length === 0}
          onClick={finalizar}
        >
          {enviando ? "Registrando…" : `Finalizar pedido • ${brl(calc.total)}`}
        </Button>
      </div>
      )}
    </>
  );
}

/** Card do kanban de atendimento — nº, cliente, modalidade, horário, total, obs. */
function CardKanbanPedido({ p }: { p: any }) {
  return (
    <article
      className="rounded-lg border border-[#E5E7EB] bg-white p-2.5 text-xs shadow-card transition-colors hover:border-[rgba(196,154,67,.45)]"
      aria-label={`Pedido ${p.numero}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-sm font-bold text-[#A9813A]">#{p.numero}</span>
        <span className="text-[10px] text-muted-foreground">{hora(p.created_at)}</span>
      </div>
      <p className="mt-1 truncate font-semibold text-[#202B3A]">
        {p.cliente_nome || "Sem nome"}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <StatusBadge tom={p.tipo_entrega === "entrega" ? "info" : "neutro"}>
          {p.tipo_entrega === "entrega" ? "Entrega" : "Retirada"}
        </StatusBadge>
        {p.agendado_para ? (
          <StatusBadge tom="atencao">Agend. {hora(p.agendado_para)}</StatusBadge>
        ) : null}
      </div>
      {p.observacoes ? (
        <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{p.observacoes}</p>
      ) : null}
      <p className="mt-1.5 border-t border-[#EEF1F5] pt-1.5 text-right text-sm font-bold text-[#21835D]">
        {brl(p.total)}
      </p>
    </article>
  );
}
