import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Copy, Loader2, QrCode, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import type { Database } from "@/integrations/supabase/types";
import { useCart, isComboItem } from "@/lib/cart";
import { usePerfil, useSession, useStaffOnly } from "@/lib/session";
import { brl, PAGAMENTO_LABEL, TAXA_ENTREGA } from "@/lib/format";
import { notificarPush } from "@/lib/push";
import { calcTotals, isMultiploCombo } from "@/lib/totals";
import { validarCupom } from "@/lib/cupons";
import { pontosGanhos as calcPontos } from "@/lib/fidelidade";
import { useCrmSettings } from "@/lib/crm";
import { registrarEventoCarrinho } from "@/lib/inteligencia";
import { gerarPix } from "@/lib/pix";
import { QrPixLocal } from "@/components/qr-pix-local";
import { textoCupom } from "@/lib/impressao";
import { tempoFritura } from "@/lib/cozinha";
import { mensagemDeErro } from "@/lib/erros";
import { precoFinal } from "@/lib/catalog";
import { geocodificarEndereco } from "@/components/map-view";
import { enderecoLoja, DEFAULT_LOJA_CONFIG, useLojaConfig } from "@/lib/loja";
import { validarAgendamento, mensagemLotado, janelaLotada } from "@/lib/horario";
import { decidirCriacaoAtomica, type RpcClient } from "@/lib/criacao-atomica";
import { BUILD_DE_CORTE } from "@/lib/corte";

/** Fallback quando loja_config.pix_chave ainda não foi preenchida (migration 0029). Preferir sempre loja.pix_chave. */
export const PIX_CHAVE = "24913937000116";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Finalizar pedido — Néia Salgados" },
      {
        name: "description",
        content: "Informe endereço e forma de pagamento para concluir seu pedido.",
      },
    ],
  }),
  component: Checkout,
});

const schema = z.object({
  cliente_nome: z.string().trim().min(2, "Informe seu nome").max(100),
  telefone: z.string().trim().min(10, "WhatsApp inválido").max(20),
  endereco: z.string().trim().max(200).optional().default(""),
  bairro: z.string().trim().max(100).optional().default(""),
  cidade: z.string().trim().max(100).optional().default(""),
  cep: z.string().trim().max(9).optional().default(""),
  complemento: z.string().trim().max(100).optional().default(""),
  referencia: z.string().trim().max(150).optional().default(""),
  tipo_imovel: z.enum(["casa", "apartamento"]).optional().default("casa"),
  apartamento: z.string().trim().max(20).optional().default(""),
  bloco: z.string().trim().max(20).optional().default(""),
  andar: z.string().trim().max(10).optional().default(""),
  torre: z.string().trim().max(20).optional().default(""),
  interfone: z.string().trim().max(30).optional().default(""),
  pode_subir: z.string().optional().default(""),
  cpf_cnpj: z.string().trim().max(14).optional().default(""),
  nome_fiscal: z.string().trim().max(100).optional().default(""),
  origem_cliente: z.string().trim().max(30).optional().default(""),
  origem_indicador: z.string().trim().max(100).optional().default(""),
  observacoes: z.string().trim().max(300).optional().default(""),
  troco: z.string().trim().max(20).optional().default(""),
});

function Checkout() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { staffOnly, painel } = useStaffOnly();
  const { data: perfil } = usePerfil(user?.id);
  const { items, subtotal, clear } = useCart();
  const [pagamento, setPagamento] = useState<"pix" | "dinheiro" | "credito" | "debito">("pix");
  const [cupomTexto, setCupomTexto] = useState("");
  const [cupom, setCupom] = useState<{ codigo: string; desconto: number } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enderecoId, setEnderecoId] = useState<string>("");
  const [tipoEntrega, setTipoEntrega] = useState<"entrega" | "retirada">("entrega");
  const [tipoImovel, setTipoImovel] = useState("casa");
  const [quando, setQuando] = useState<"agora" | "agendar">("agora");
  const { data: settings } = useCrmSettings();
  const { data: lojaConfig } = useLojaConfig();
  const loja = lojaConfig ?? DEFAULT_LOJA_CONFIG;
  const enderecoLojaTexto = enderecoLoja(loja);
  const funilRef = useRef(false);
  // Idempotência: mesma chave por tentativa; reenvio retorna o mesmo pedido.
  const chaveRef = useRef("");

  useEffect(() => {
    if (funilRef.current || loading || !user || items.length === 0) return;
    if (settings && !settings.carrinho_recuperacao_ativa) return;
    funilRef.current = true;
    void registrarEventoCarrinho({
      userId: user.id,
      telefone: (perfil as any)?.telefone ?? "",
      etapa: "checkout-iniciado",
      itens: items.map((i) => ({ nome: i.nome, quantidade: i.quantidade, preco: i.preco })),
      subtotal,
    });
  }, [loading, user, items, subtotal, settings, perfil]);

  const { data: enderecos } = useQuery({
    queryKey: ["enderecos-checkout", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("enderecos").select("*").eq("user_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: qtdPedidos } = useQuery({
    queryKey: ["pedidos-count", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count } = await supabase
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id);
      return count ?? 0;
    },
  });
  const primeiroPedido = (qtdPedidos ?? 1) === 0;
  const [origem, setOrigem] = useState("");
  const [agDt, setAgDt] = useState("");

  const { data: demandas } = useQuery({
    queryKey: ["datas-demanda-checkout"],
    queryFn: async () => {
      try {
        const { data } = await supabase
          .from("datas_demanda")
          .select("*")
          .eq("ativo", true)
          .order("data")
          .limit(20);
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });
  const avisoDemanda = (() => {
    if (quando !== "agendar" || !agDt) return null;
    const alvo = new Date(agDt).getTime();
    if (Number.isNaN(alvo)) return null;
    for (const d of demandas ?? []) {
      const dd = new Date(`${d.data}T12:00:00`).getTime();
      const dias = Math.ceil((dd - alvo) / 86400000);
      if (dias >= 0 && dias <= Number(d.antecedencia_dias ?? 10)) {
        return `${d.ocasiao}${d.mensagem ? ` — ${d.mensagem}` : ""} Peça com antecedência!`;
      }
    }
    return null;
  })();

  useEffect(() => {
    if (staffOnly && painel) navigate({ to: painel, replace: true });
  }, [staffOnly, painel, navigate]);

  useEffect(() => {
    if (!loading && !user)
      navigate({ to: "/auth", search: { redirect: "/checkout" }, replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!loading && user && items.length === 0) navigate({ to: "/carrinho", replace: true });
  }, [loading, user, items.length, navigate]);

  const desconto = cupom?.desconto ?? 0;
  const { taxaEntrega, total } = calcTotals({ subtotal, taxaEntrega: TAXA_ENTREGA, desconto });
  const taxaEntregaFinalUI = tipoEntrega === "retirada" ? 0 : taxaEntrega;
  const totalFinalUI = Math.max(0, subtotal - desconto) + taxaEntregaFinalUI;
  const pontosGanhos = calcPontos(totalFinalUI, {
    ativo: settings?.fid_ativo ?? true,
    reaisPorPonto: settings?.fid_reais_por_ponto ?? 5,
    metaPontos: settings?.fid_meta_pontos ?? 200,
    recompensaValor: settings?.fid_recompensa_valor ?? 20,
  });
  const pixChaveEfetiva = (loja.pix_chave || PIX_CHAVE).trim();
  const pix = gerarPix({
    chave: pixChaveEfetiva,
    valor: totalFinalUI,
    descricao: "Pedido Neia Salgados",
  });

  if (staffOnly) {
    return <p className="p-10 text-center text-muted-foreground">Abrindo seu painel...</p>;
  }

  function preencherEndereco(id: string) {
    setEnderecoId(id);
    const e = (enderecos ?? []).find((x: any) => x.id === id);
    if (!e) return;
    (document.getElementById("endereco") as HTMLInputElement).value = `${e.rua}, ${e.numero}`;
    (document.getElementById("bairro") as HTMLInputElement).value = e.bairro;
    (document.getElementById("complemento") as HTMLInputElement).value = e.complemento ?? "";
    (document.getElementById("referencia") as HTMLInputElement).value = e.referencia ?? "";
  }

  async function aplicarCupom() {
    const codigo = cupomTexto.trim().toUpperCase();
    if (!codigo) return;
    const { data, error } = await supabase
      .from("cupons")
      .select("*")
      .eq("codigo", codigo)
      .eq("ativo", true)
      .maybeSingle();
    if (error || !data) {
      toast.error("Cupom inválido.");
      return;
    }
    const telNorm = (
      (document.getElementById("telefone") as HTMLInputElement | null)?.value ?? ""
    ).replace(/\D/g, "");
    let usos = 0;
    if (Number((data as any).max_usos ?? 0) > 0) {
      const r = await supabase
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("cupom", codigo)
        .neq("status", "cancelado");
      usos = r.count ?? 0;
    }
    const res = validarCupom(data as any, {
      subtotal,
      telefoneDigitado: telNorm,
      usosRegistrados: usos,
      produtoIdsNoCarrinho: items.map((i) => i.produtoId),
    });
    if (!res.ok) {
      toast.error(res.motivo);
      return;
    }
    setCupom({ codigo, desconto: res.desconto });
    toast.success(`Cupom ${codigo} aplicado!`);
  }

  async function finalizar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    const form = new FormData(e.currentTarget);
    const parsed = schema.safeParse({
      // Na retirada os inputs de endereço nem existem no DOM (form.get = null):
      // normaliza para "" aqui (a obrigatoriedade p/ entrega é checada abaixo).
      cliente_nome: form.get("cliente_nome") ?? "",
      telefone: form.get("telefone") ?? "",
      endereco: form.get("endereco") ?? "",
      bairro: form.get("bairro") ?? "",
      cidade: form.get("cidade") ?? "",
      cep: form.get("cep") ?? "",
      complemento: form.get("complemento") ?? "",
      referencia: form.get("referencia") ?? "",
      cpf_cnpj: String(form.get("cpf_cnpj") ?? "")
        .replace(/\D/g, "")
        .slice(0, 14),
      nome_fiscal: form.get("nome_fiscal") ?? "",
      origem_cliente: form.get("origem_cliente") ?? "",
      origem_indicador: form.get("origem_indicador") ?? "",
      tipo_imovel: form.get("tipo_imovel") ?? "casa",
      apartamento: form.get("apartamento") ?? "",
      bloco: form.get("bloco") ?? "",
      andar: form.get("andar") ?? "",
      torre: form.get("torre") ?? "",
      interfone: form.get("interfone") ?? "",
      pode_subir: form.get("pode_subir") ?? "",
      observacoes: form.get("observacoes") ?? "",
      troco: form.get("troco") ?? "",
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Confira os dados.");
      return;
    }
    const digitosTel = String(parsed.data.telefone).replace(/\D/g, "");
    if (digitosTel.length < 10 || digitosTel.length > 13) {
      toast.error("Informe um WhatsApp válido com DDD.");
      return;
    }
    if (tipoEntrega === "entrega") {
      if ((parsed.data.endereco ?? "").length < 6) {
        toast.error("Informe rua e número.");
        return;
      }
      if ((parsed.data.bairro ?? "").length < 2) {
        toast.error("Informe o bairro.");
        return;
      }
      if ((parsed.data.cidade ?? "").length < 2) {
        toast.error("Informe a cidade.");
        return;
      }
    }
    let agendadoPara: string | null = null;
    let agendamentoObs = "";
    let origemCampanha = "";
    try {
      origemCampanha = (localStorage.getItem("neia-campanha") ?? "").slice(0, 60);
    } catch {
      origemCampanha = "";
    }
    const tipoEvento = String(form.get("tipo_evento") ?? "");
    if (quando === "agendar") {
      const dtRaw = String(form.get("agendamento_para") ?? "");
      const v = validarAgendamento(dtRaw, new Date(), 30);
      if (!v.ok) {
        toast.error(v.motivo);
        return;
      }
      // Capacidade da janela por UNIDADES (não por nº de pedidos): soma itens ±30min vs teto
      try {
        const dt = new Date(dtRaw);
        const ini = new Date(dt.getTime() - 30 * 60000).toISOString();
        const fim = new Date(dt.getTime() + 30 * 60000).toISOString();
        const { data: vizinhos } = await supabase
          .from("pedidos")
          .select("id, pedido_itens(quantidade)")
          .gte("agendado_para", ini)
          .lte("agendado_para", fim)
          .neq("status", "cancelado")
          .limit(200);
        let teto = 2000;
        try {
          const { data: hc } = await supabase
            .from("horario_config")
            .select("teto_unidades_janela")
            .eq("id", true)
            .maybeSingle();
          if (Number((hc as any)?.teto_unidades_janela) > 0)
            teto = Number((hc as any).teto_unidades_janela);
        } catch {
          /* teto padrão */
        }
        const un = ((vizinhos ?? []) as any[]).reduce(
          (s, p) =>
            s +
            ((p.pedido_itens ?? []) as any[]).reduce((a, i) => a + Number(i.quantidade ?? 0), 0),
          0,
        );
        if (janelaLotada(un, teto)) {
          toast.error(mensagemLotado());
          return;
        }
      } catch {
        /* sem dados — segue */
      }
      const dt = new Date(dtRaw);
      agendadoPara = dt.toISOString();
      agendamentoObs = String(form.get("agendamento_obs") ?? "").slice(0, 200);
      void mensagemLotado;
    }
    setEnviando(true);
    try {
      // Revalida preços no backend: busca produtos vinculados e ignora preço do navegador.
      // Combos: a autoridade é `categorias.combo_preco_unit` (não a constante do
      // frontend nem a média dos componentes). A composição precisa fechar e
      // todos os componentes precisam pertencer à MESMA categoria.
      const ids = [
        ...new Set(
          items
            .flatMap((i) => [i.produtoId, ...(i.componentes?.map((c) => c.produtoId) ?? [])])
            .filter((v): v is string => !!v),
        ),
      ];
      let mapaPrecos = new Map<string, number>();
      let mapaProdutos = new Map<string, { categoria_id: string | null }>();
      if (ids.length > 0) {
        const { data: prods, error: errProds } = await supabase
          .from("produtos")
          .select("id, categoria_id, preco, preco_promocional")
          .in("id", ids);
        if (errProds) throw errProds;
        mapaPrecos = new Map((prods ?? []).map((p: any) => [p.id, Number(precoFinal(p as any))]));
        mapaProdutos = new Map((prods ?? []).map((p: any) => [p.id, { categoria_id: p.categoria_id ?? null }]));
      }

      const categoriaIds = [
        ...new Set(
          [...mapaProdutos.values()]
            .map((p) => p.categoria_id)
            .filter((v): v is string => !!v),
        ),
      ];
      let mapaCombo = new Map<string, number>();
      if (categoriaIds.length > 0) {
        const { data: cats, error: errCats } = await supabase
          .from("categorias")
          .select("id, combo_preco_unit")
          .in("id", categoriaIds);
        if (errCats) throw errCats;
        mapaCombo = new Map(
          (cats ?? [])
            .filter((c: any) => c.combo_preco_unit != null)
            .map((c: any) => [c.id, Number(c.combo_preco_unit)]),
        );
      }

      let subtotalValidado = 0;
      const itensValidados = items.map((i) => {
        let precoReal: number | null;
        if (i.produtoId) {
          precoReal = mapaPrecos.get(i.produtoId) ?? null;
        } else if (i.componentes?.length) {
          const soma = i.componentes.reduce((s, c) => s + c.quantidade, 0);
          if (soma !== i.quantidade) {
            throw new Error(`"${i.nome}": composição do combo não fecha com a quantidade.`);
          }
          const categorias = new Set(
            i.componentes
              .map((c) => mapaProdutos.get(c.produtoId)?.categoria_id)
              .filter((v): v is string => !!v),
          );
          if (categorias.size !== 1) {
            throw new Error(`"${i.nome}": componentes de categorias diferentes.`);
          }
          const catId = [...categorias][0]!;
          precoReal = mapaCombo.get(catId) ?? null;
          if (precoReal == null) {
            throw new Error(
              `"${i.nome}": preço do combo não configurado no servidor. Tente novamente após o administrador configurar.`,
            );
          }
        } else {
          // Carrinho antigo, sem composição estruturada. Mantém o preço exibido
          // apenas para o caminho legado; a via atômica falha fechada.
          precoReal = i.preco;
        }
        if (precoReal == null || Number.isNaN(precoReal))
          throw new Error(`Produto ${i.nome} indisponível no momento.`);
        if (isComboItem(i) && !isMultiploCombo(i.quantidade)) {
          throw new Error(
            `"${i.nome}": combos são vendidos em múltiplos de 50 unidades. Ajuste no carrinho.`,
          );
        }
        subtotalValidado += precoReal * i.quantidade;
        return { ...i, preco: precoReal };
      });
      const calc = calcTotals({ subtotal: subtotalValidado, taxaEntrega: TAXA_ENTREGA, desconto });
      const isRetirada = tipoEntrega === "retirada";
      const taxaEntregaFinal = isRetirada ? 0 : calc.taxaEntrega;
      const totalFinal = Math.max(0, subtotalValidado - calc.desconto) + taxaEntregaFinal;
      const obsFinal =
        pagamento === "dinheiro" && parsed.data.troco
          ? `${parsed.data.observacoes} [Troco para ${parsed.data.troco}]`.trim()
          : parsed.data.observacoes;

      const coords = isRetirada
        ? null
        : await geocodificarEndereco(
            `${parsed.data.endereco}, ${parsed.data.bairro}, ${parsed.data.cidade}`,
          ).catch(() => null);

      // Determinar modalidade de pagamento: online vs na_entrega
      // - dinheiro: sempre na_entrega (não existe pagamento online em dinheiro)
      // - pix/credito/debito: online por padrão (confirmação posterior)
      // - retirada: sempre online (pagamento no balcão/online)
      const pagamento_modalidade =
        tipoEntrega === "retirada" ? "online" : pagamento === "dinheiro" ? "na_entrega" : "online";

      const insertBody: Record<string, any> = {
        user_id: user.id,
        cliente_nome: parsed.data.cliente_nome,
        telefone: parsed.data.telefone,
        endereco: isRetirada
          ? enderecoLojaTexto || "Retirada na loja"
          : `${parsed.data.endereco} — ${parsed.data.cidade}`,
        bairro: isRetirada ? "-" : parsed.data.bairro,
        cidade: isRetirada ? "-" : parsed.data.cidade,
        cep: isRetirada
          ? null
          : String(parsed.data.cep ?? "")
              .replace(/\D/g, "")
              .slice(0, 8) || null,
        complemento: isRetirada ? "" : (parsed.data.complemento ?? ""),
        referencia: isRetirada ? "" : (parsed.data.referencia ?? ""),
        tipo_imovel: isRetirada ? null : (parsed.data.tipo_imovel ?? "casa"),
        apartamento: isRetirada ? null : (parsed.data.apartamento ?? ""),
        bloco: isRetirada ? null : (parsed.data.bloco ?? ""),
        andar: isRetirada ? null : (parsed.data.andar ?? ""),
        torre: isRetirada ? null : (parsed.data.torre ?? ""),
        interfone: isRetirada ? null : (parsed.data.interfone ?? ""),
        pode_subir: isRetirada ? null : String(parsed.data.pode_subir ?? "") === "on",
        cpf_cnpj: parsed.data.cpf_cnpj || null,
        nome_fiscal: parsed.data.nome_fiscal || null,
        origem_cliente: primeiroPedido ? parsed.data.origem_cliente || null : null,
        observacoes: parsed.data.origem_indicador
          ? `${obsFinal ?? ""} [Indicado por: ${parsed.data.origem_indicador}]`.trim()
          : (obsFinal ?? ""),
        tipo_entrega: tipoEntrega,
        forma_pagamento: pagamento,
        pagamento_modalidade,
        // Pagamento começa SEMPRE pendente. Nunca marcar como pago aqui:
        // a loja confirma. Status do pedido e status do pagamento são separados.
        pagamento_status: "pendente",
        subtotal: subtotalValidado,
        taxa_entrega: taxaEntregaFinal,
        desconto: calc.desconto,
        total: totalFinal,
        cupom: cupom?.codigo ?? null,
        destino_lat: coords?.lat ?? null,
        destino_lng: coords?.lng ?? null,
        agendado_para: agendadoPara,
        agendamento_obs: agendamentoObs,
        tipo_evento: tipoEvento,
        campanha_origem: origemCampanha,
      };

      let pedido: { id: string; numero: number; cliente_nome: string; telefone: string } | null =
        null;
      if (!chaveRef.current) chaveRef.current = crypto.randomUUID();
      insertBody["id"] = chaveRef.current;

      // Criação atômica (0095) — atrás de flag OFF. Flag OFF => segue o caminho
      // legado abaixo, intacto. Flag ON + sucesso => pula o legado. Flag ON sem
      // attestation/erro => aborta (NUNCA cai no fallback inseguro).
      let atomico = false;
      {
        const decisao = await decidirCriacaoAtomica(supabase as unknown as RpcClient, {
          pedidoId: chaveRef.current,
          canal: "checkout",
          dados: insertBody as Record<string, unknown>,
          itens: itensValidados.map((i) => ({
            produtoId: i.produtoId ?? undefined,
            nome: i.nome,
            quantidade: i.quantidade,
            observacao: i.observacao ?? undefined,
            componentes: i.componentes,
          })),
        });
        if (decisao.modo === "erro") {
          toast.error(decisao.mensagem);
          return;
        }
        if (decisao.modo === "atomico") {
          pedido = {
            id: decisao.pedido.id,
            numero: decisao.pedido.numero,
            cliente_nome: parsed.data.cliente_nome,
            telefone: parsed.data.telefone,
          };
          atomico = true;
        }
      }

      // No BUILD DE CORTE o caminho legado NAO e compilado: o bloco e removido
      // do bundle (constant-folding de !BUILD_DE_CORTE). Nao ha fallback.
      if (!BUILD_DE_CORTE && !atomico) {
        const res = await supabase
          .from("pedidos")
          .insert(insertBody)
          .select("id, numero, cliente_nome, telefone")
          .single();
        if (res.error && (res.error as any).code === "23505") {
          // Reenvio (duplo clique/retry): recupera o pedido da mesma chave.
          const rec = await supabase
            .from("pedidos")
            .select("id, numero, cliente_nome, telefone")
            .eq("id", chaveRef.current)
            .single();
          if (rec.error || !rec.data) throw res.error;
          const { count } = await supabase
            .from("pedido_itens")
            .select("id", { count: "exact", head: true })
            .eq("pedido_id", chaveRef.current);
          if ((count ?? 0) > 0) {
            toast.success(`Pedido nº ${(rec.data as any).numero} já estava registrado.`);
            navigate({ to: "/pedido/$id", params: { id: (rec.data as any).id } });
            return;
          }
          pedido = rec.data;
        } else if (res.error && String(res.error.message ?? "").includes("column")) {
          // Banco sem migrações 0003/0004/0006/0018/0022 — reenvia sem campos novos
          const {
            agendado_para: _a,
            agendamento_obs: _ao,
            tipo_evento: _te,
            campanha_origem: _co,
            tipo_entrega: _te2,
            pagamento_status: _ps,
            pagamento_modalidade: _pm,
            tipo_imovel: _ti,
            apartamento: _ap,
            bloco: _bl,
            andar: _an,
            torre: _to,
            interfone: _in,
            pode_subir: _ps2,
            cpf_cnpj: _cp,
            nome_fiscal: _nf,
            origem_cliente: _oc,
            cep: _cep,
            ...legacy
          } = insertBody;
          const retry = await supabase
            .from("pedidos")
            .insert(legacy)
            .select("id, numero, cliente_nome, telefone")
            .single();
          if (retry.error || !retry.data) throw retry.error ?? new Error("insert falhou");
          pedido = retry.data;
          if (quando === "agendar")
            toast.warning("Agendamento registrado só no WhatsApp — rode as migrações no Supabase.");
          if (tipoEntrega === "retirada")
            toast.warning("Tipo de entrega não salvo — rode a migration 0018 no Supabase.");
        } else {
          if (res.error || !res.data) throw res.error ?? new Error("insert falhou");
          pedido = res.data;
        }

      const { error: erroItens } = await supabase.from("pedido_itens").insert(
        itensValidados.map((i) => ({
          pedido_id: (pedido as any).id,
          produto_id: i.produtoId === undefined ? i.id : i.produtoId,
          nome: i.observacao ? `${i.nome} (obs: ${i.observacao})` : i.nome,
          preco_unitario: i.preco,
          quantidade: i.quantidade,
        })),
      );
      if (erroItens) {
        // Compensação: desfaz o pedido vazio e mantém o carrinho (nada some).
        try {
          await supabase
            .from("pedidos")
            .delete()
            .eq("id", (pedido as any).id);
        } catch {
          /* best-effort */
        }
        throw new Error(
          "Falha ao gravar os itens — o pedido foi desfeito e seu carrinho foi mantido. Tente de novo.",
        );
      }

      // Reserva atômica (0030): lock por produto, nunca vende acima do estoque.
      // Combos montados (sem produtoId) não reservam aqui — são montagem.
      const itensReservaveis = itensValidados.filter((i) => i.produtoId);
      let rpcIndisponivel = false;
      const falhasEstoque: string[] = [];
      for (const i of itensReservaveis) {
        try {
          const { data, error } = await supabase.rpc("reservar_estoque_atomica", {
            p_pedido_id: (pedido as any).id,
            p_produto_id: i.produtoId as string,
            p_qtd: Math.floor(i.quantidade),
          });
          if (error) {
            // Migration 0030 ainda não aplicada — cai para best-effort legado abaixo.
            rpcIndisponivel = true;
            break;
          }
          if (data !== true) falhasEstoque.push(i.nome);
        } catch {
          rpcIndisponivel = true;
          break;
        }
      }
      if (rpcIndisponivel) {
        // Fallback legado: insert direto (sem garantia contra concorrência).
        try {
          const reservas = itensReservaveis.map((i) => ({
            pedido_id: (pedido as any).id,
            produto_id: i.produtoId,
            quantidade: i.quantidade,
            status: "ativa",
          }));
          if (reservas.length > 0) await supabase.from("reservas_estoque").insert(reservas);
        } catch {
          /* sem migration — segue sem reserva */
        }
      } else if (falhasEstoque.length > 0) {
        // Sem estoque: desfaz reservas parciais, cancela pedido e avisa com alternativa.
        try {
          await supabase.rpc("liberar_reserva_atomica", { p_pedido_id: (pedido as any).id });
        } catch {
          /* best-effort */
        }
        try {
          await supabase
            .from("pedidos")
            .update({ status: "cancelado" })
            .eq("id", (pedido as any).id);
        } catch {
          /* best-effort */
        }
        try {
          await supabase.from("pedido_status_historico").insert({
            pedido_id: (pedido as any).id,
            de_status: "recebido",
            para_status: "cancelado",
            motivo: `estoque insuficiente: ${falhasEstoque.join(", ")}`,
          });
        } catch {
          /* sem migration — segue */
        }
        throw new Error(
          `Temos apenas estoque parcial. Faltou: ${falhasEstoque.join(", ")}. Reduza a quantidade ou escolha uma alternativa da mesma categoria.`,
        );
      }
      try {
        await supabase.from("pedido_status_historico").insert({
          pedido_id: (pedido as any).id,
          de_status: null,
          para_status: "recebido",
          motivo: quando === "agendar" ? `agendado ${agendadoPara}` : "novo",
        });
      } catch {
        /* sem migration — segue */
      }
      }
      try {
        const totalUnidades = itensValidados.reduce((a, i) => a + i.quantidade, 0);
        const prepMin = Math.ceil(tempoFritura(totalUnidades) / 60) + 40;
        const fmtH = (d: Date) => d.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        const iniPrev = new Date(Date.now() + prepMin * 60000);
        const fimPrev = new Date(iniPrev.getTime() + 30 * 60000);
        const payloadCozinha = textoCupom({
          numero: (pedido as any).numero,
          dataHora: new Date().toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          cliente: parsed.data.cliente_nome,
          telefone: parsed.data.telefone,
          itens: itensValidados.map((i) => ({
            qtd: i.quantidade,
            nome: i.nome,
            precoUnit: i.preco,
          })),
          totalUnidades,
          entregaRetirada: isRetirada ? "RETIRADA NA LOJA" : "ENTREGA",
          horario: agendadoPara
            ? new Date(agendadoPara).toLocaleString("pt-BR")
            : "o mais rapido possivel",
          endereco: isRetirada
            ? enderecoLojaTexto || "Retirada na loja"
            : `${parsed.data.endereco} — ${parsed.data.cidade}`,
          pagamento: PAGAMENTO_LABEL[pagamento] ?? pagamento,
          observacoes: obsFinal ?? "",
          status: "PENDENTE_PGTO",
          bairro: isRetirada ? null : parsed.data.bairro,
          cidade: isRetirada ? null : parsed.data.cidade,
          cep: isRetirada ? null : parsed.data.cep || null,
          complemento: isRetirada ? null : parsed.data.complemento || null,
          referencia: isRetirada ? null : parsed.data.referencia || null,
          subtotal: subtotalValidado,
          taxaEntrega: taxaEntregaFinal,
          total: totalFinal,
          pedidosCliente: (qtdPedidos ?? 0) + 1,
          motoboy: null,
          prevista: `${fmtH(iniPrev)} - ${fmtH(fimPrev)}`,
          agendadoEm:
            quando === "agendar"
              ? new Date().toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : null,
          agendadoPara: agendadoPara
            ? new Date(agendadoPara)
                .toLocaleString("pt-BR", {
                  weekday: "short",
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
                .replace(/\./g, "") + "h"
            : null,
        });
        let pts = 0;
        try {
          const { data: creditados } = await supabase.rpc("creditar_pontos_pedido", {
            p_pedido_id: (pedido as any).id,
          });
          pts = Number(creditados ?? 0);
        } catch {
          /* pedido segue mesmo sem pontos */
        }

        clear();
        void notificarPush(supabase, (pedido as any).id, "recebido");
        toast.success(`Pedido nº ${(pedido as any).numero} recebido! +${pts} pts fidelidade`);
        const linhas = itensValidados
          .map((i) => `* ${i.quantidade}x ${i.nome} — ${brl(i.preco * i.quantidade)}`)
          .join("\n");
        const quandoTxt =
          quando === "agendar" && agendadoPara
            ? `\n\nReceber em: ${new Date(agendadoPara).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}${agendamentoObs ? ` (${agendamentoObs})` : ""}`
            : "\n\nReceber: o mais rápido possível";
        const eventoTxt = tipoEvento ? `\nTipo de evento: ${tipoEvento}` : "";
        const ehApto = !isRetirada && parsed.data.tipo_imovel === "apartamento";
        const condTxt = ehApto
          ? `\nApto: ${parsed.data.apartamento || "-"}${parsed.data.bloco ? ` • Bloco/Torre: ${parsed.data.bloco}` : ""}${parsed.data.andar ? ` • Andar: ${parsed.data.andar}` : ""}${parsed.data.interfone ? ` • Interfone: ${parsed.data.interfone}` : ""}${String(parsed.data.pode_subir ?? "") === "on" ? " • autorizado subir" : ""}`
          : "";
        navigate({ to: "/pedido/$id", params: { id: (pedido as any).id } });
        chaveRef.current = "";
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível finalizar o pedido.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível finalizar o pedido.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl">Finalizar pedido</h1>
      {(enderecos ?? []).length > 0 && (
        <div className="mt-3 rounded-xl border border-border bg-card p-3 text-sm">
          <Label>Usar endereço salvo</Label>
          <div className="mt-1 flex gap-2">
            <select
              value={enderecoId}
              onChange={(e) => preencherEndereco(e.target.value)}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Digite um novo endereço…</option>
              {(enderecos ?? []).map((e: any) => (
                <option key={e.id} value={e.id}>
                  {e.rua}, {e.numero} — {e.bairro}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <form onSubmit={finalizar} className="mt-4 space-y-6">
        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-xl">Entrega</h2>
          <p className="text-xs text-muted-foreground">
            Carrinho → Dados → Endereço → Entrega → Pagamento → Confirmar pedido
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cliente_nome">Nome *</Label>
              <Input
                id="cliente_nome"
                name="cliente_nome"
                defaultValue={perfil?.nome ?? ""}
                required
                autoComplete="name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="telefone">WhatsApp *</Label>
              <Input
                id="telefone"
                name="telefone"
                defaultValue={perfil?.telefone ?? ""}
                required
                autoComplete="tel"
                placeholder="(11) 90000-0000"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Como deseja receber? *</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm">
                <input
                  type="radio"
                  name="tipoEntrega"
                  checked={tipoEntrega === "entrega"}
                  onChange={() => setTipoEntrega("entrega")}
                />
                <div>
                  <div className="font-semibold">Entrega</div>
                  <div className="text-xs text-muted-foreground">
                    No seu endereço (taxa {brl(TAXA_ENTREGA)})
                  </div>
                </div>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm">
                <input
                  type="radio"
                  name="tipoEntrega"
                  checked={tipoEntrega === "retirada"}
                  onChange={() => setTipoEntrega("retirada")}
                />
                <div>
                  <div className="font-semibold">Retirada na loja</div>
                  <div className="text-xs text-muted-foreground">Sem taxa de entrega</div>
                </div>
              </label>
            </div>
          </div>
          {tipoEntrega === "entrega" ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="endereco">Endereço e número *</Label>
                <Input
                  id="endereco"
                  name="endereco"
                  placeholder="Rua das Flores, 123"
                  required
                  autoComplete="street-address"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="bairro">Bairro *</Label>
                  <Input id="bairro" name="bairro" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cidade">Cidade *</Label>
                  <Input
                    id="cidade"
                    name="cidade"
                    placeholder="Sua cidade"
                    required
                    autoComplete="address-level2"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cep">CEP</Label>
                  <Input
                    id="cep"
                    name="cep"
                    inputMode="numeric"
                    placeholder="18000-000"
                    maxLength={9}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="complemento">Complemento</Label>
                  <Input id="complemento" name="complemento" placeholder="Casa, fundos..." />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="referencia">Ponto de referência</Label>
                <Input id="referencia" name="referencia" placeholder="Próximo à praça" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="tipo_imovel">Tipo de imóvel</Label>
                  <select
                    id="tipo_imovel"
                    name="tipo_imovel"
                    value={tipoImovel}
                    onChange={(e) => setTipoImovel(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="casa">Casa</option>
                    <option value="apartamento">Apartamento / condomínio</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="interfone">Interfone (se houver)</Label>
                  <Input id="interfone" name="interfone" placeholder="Ex: 1234" maxLength={30} />
                </div>
              </div>
              {tipoImovel === "apartamento" ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="apartamento">Apto *</Label>
                      <Input
                        id="apartamento"
                        name="apartamento"
                        placeholder="Ex: 42"
                        maxLength={20}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="bloco">Bloco / torre</Label>
                      <Input id="bloco" name="bloco" placeholder="Ex: B" maxLength={20} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="andar">Andar</Label>
                      <Input id="andar" name="andar" placeholder="Ex: 4" maxLength={10} />
                    </div>
                  </div>
                  <input type="hidden" name="torre" value="" />
                  <p className="text-xs text-muted-foreground">
                    Se possível, aguarde o motoboy na portaria no momento da chegada. 😊
                  </p>
                </>
              ) : (
                <>
                  <input type="hidden" name="apartamento" value="" />
                  <input type="hidden" name="bloco" value="" />
                  <input type="hidden" name="andar" value="" />
                  <input type="hidden" name="torre" value="" />
                </>
              )}
            </>
          ) : (
            <div className="space-y-1.5 rounded-lg bg-muted p-3 text-sm">
              <p className="font-semibold">Você retira o pedido na loja. Sem taxa de entrega.</p>
              {enderecoLojaTexto ? (
                <>
                  <p className="mt-1 text-muted-foreground">{enderecoLojaTexto}</p>
                  {loja.referencia ? (
                    <p className="text-muted-foreground">Referência: {loja.referencia}</p>
                  ) : null}
                </>
              ) : (
                <p className="mt-1 text-muted-foreground">
                  O endereço da loja é informado no WhatsApp assim que o pedido é confirmado.
                </p>
              )}
              {loja.instrucoes_retirada ? (
                <p className="mt-1 whitespace-pre-line text-muted-foreground">
                  {loja.instrucoes_retirada}
                </p>
              ) : null}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              name="observacoes"
              placeholder="Ex: troco, ponto de entrega..."
            />
          </div>
          {primeiroPedido ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="origem_cliente">👋 Como você conheceu a Néia Salgados?</Label>
                <select
                  id="origem_cliente"
                  name="origem_cliente"
                  value={origem}
                  onChange={(e) => setOrigem(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  defaultValue=""
                >
                  <option value="">Prefiro não dizer</option>
                  <option value="instagram">Instagram</option>
                  <option value="google">Google</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="indicacao">Indicação</option>
                  <option value="parceiro">Parceiro</option>
                  <option value="anuncio">Anúncio</option>
                  <option value="ja_conhecia">Já conhecia</option>
                  <option value="pessoalmente">Pessoalmente</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              {origem === "indicacao" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="origem_indicador">Quem indicou?</Label>
                  <Input
                    id="origem_indicador"
                    name="origem_indicador"
                    placeholder="Nome de quem indicou"
                    maxLength={100}
                  />
                </div>
              ) : (
                <input type="hidden" name="origem_indicador" value="" />
              )}
            </div>
          ) : null}
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              Nota fiscal (opcional — só se precisar)
            </summary>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cpf_cnpj">CPF / CNPJ</Label>
                <Input id="cpf_cnpj" name="cpf_cnpj" inputMode="numeric" maxLength={14} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nome_fiscal">Nome / razão social</Label>
                <Input id="nome_fiscal" name="nome_fiscal" maxLength={100} />
              </div>
            </div>
          </details>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-xl">Quando deseja receber?</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm">
              <input
                type="radio"
                name="quando"
                checked={quando === "agora"}
                onChange={() => setQuando("agora")}
              />
              ⚡ O mais rápido possível
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm">
              <input
                type="radio"
                name="quando"
                checked={quando === "agendar"}
                onChange={() => setQuando("agendar")}
              />
              📅 Agendar data e horário
            </label>
          </div>
          {quando === "agendar" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="agendamento_para">Data e horário *</Label>
                <Input
                  id="agendamento_para"
                  name="agendamento_para"
                  type="datetime-local"
                  required={quando === "agendar"}
                  value={agDt}
                  onChange={(e) => setAgDt(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agendamento_obs">Observação do agendamento</Label>
                <Input
                  id="agendamento_obs"
                  name="agendamento_obs"
                  placeholder="Ex: festa às 15h"
                  maxLength={200}
                />
              </div>
            </div>
          ) : null}
          {avisoDemanda ? (
            <p className="rounded-lg bg-secondary/30 p-2.5 text-xs">📅 {avisoDemanda}</p>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="tipo_evento">Tipo de evento (opcional)</Label>
            <select
              id="tipo_evento"
              name="tipo_evento"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              defaultValue=""
            >
              <option value="">Não é para evento</option>
              <option value="aniversario">Aniversário</option>
              <option value="casamento">Casamento</option>
              <option value="empresa">Empresa</option>
              <option value="festa">Festa</option>
              <option value="confraternizacao">Confraternização</option>
              <option value="outro">Outro</option>
            </select>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-xl">Pagamento</h2>
          <RadioGroup value={pagamento} onValueChange={(v) => setPagamento(v as typeof pagamento)}>
            {(["pix", "dinheiro", "credito", "debito"] as const).map((op) => (
              <label
                key={op}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm"
              >
                <RadioGroupItem value={op} id={op} />
                {PAGAMENTO_LABEL[op]}
              </label>
            ))}
          </RadioGroup>
          {pagamento === "dinheiro" && (
            <div className="space-y-1.5">
              <Label htmlFor="troco">Troco para quanto? (opcional)</Label>
              <Input id="troco" name="troco" placeholder="Ex: R$ 100" />
            </div>
          )}
          {pagamento === "pix" && (
            <div className="rounded-lg bg-muted p-4 text-sm">
              <p className="flex items-center gap-1.5 font-semibold">
                <QrCode className="size-4" /> Pague com PIX
              </p>
              {pix ? (
                <>
                  <div className="mt-2 flex flex-col items-center gap-2">
                    <div className="rounded-lg border border-border bg-white p-2">
                      <QrPixLocal copiaECola={pix.copiaECola} tamanho={220} />
                    </div>
                    <p className="text-xs font-semibold">{brl(totalFinalUI)}</p>
                    <p className="text-center text-xs text-muted-foreground">
                      Abra o app do banco, escolha Pix &gt; Ler QR Code e aponte a câmera.
                    </p>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <Label htmlFor="pix-copia">Pix Copia e Cola</Label>
                    <Textarea
                      id="pix-copia"
                      readOnly
                      rows={3}
                      value={pix.copiaECola}
                      className="break-all font-mono text-[11px]"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(pix.copiaECola);
                          toast.success(
                            "Pix Copia e Cola copiado — cole em Pix &gt; Pagar com código.",
                          );
                        } catch {
                          toast.error(
                            "Não consegui copiar. Selecione o texto acima e copie na mão.",
                          );
                        }
                      }}
                    >
                      <Copy className="mr-1 size-3.5" /> Copiar Pix Copia e Cola
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Chave:</span>
                    <code className="min-w-0 flex-1 truncate text-xs">{pixChaveEfetiva}</code>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    O pagamento é conferido pela loja. Envie o comprovante pelo WhatsApp depois de
                    finalizar.
                  </p>
                </>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  O Pix ainda não está configurado. Escolha outra forma de pagamento ou fale com a
                  loja.
                </p>
              )}
            </div>
          )}
          <p className="flex items-center gap-1.5 rounded-lg bg-secondary/30 p-2.5 text-xs">
            <Trophy className="size-4 text-primary" /> Este pedido rende{" "}
            <strong>{pontosGanhos} pontos</strong> no programa fidelidade.
          </p>
        </section>

        <section
          className="space-y-3 rounded-xl border border-border bg-card p-5"
          aria-label="Resumo antes de finalizar"
        >
          <h2 className="font-display text-xl">Resumo — confira antes de confirmar</h2>
          <p className="text-xs text-muted-foreground">
            Pagamento escolhido: <strong>{PAGAMENTO_LABEL[pagamento]}</strong>
          </p>
          <div className="flex gap-2">
            <Input
              value={cupomTexto}
              onChange={(e) => setCupomTexto(e.target.value)}
              placeholder="Cupom (ex: NEIA10)"
              maxLength={20}
            />
            <Button type="button" variant="outline" onClick={aplicarCupom}>
              Aplicar
            </Button>
          </div>
          <ul className="space-y-1 text-sm">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between gap-2">
                <span className="min-w-0 break-words text-muted-foreground">
                  {i.quantidade}x {i.nome}
                  {i.observacao ? ` (${i.observacao})` : ""}
                </span>
                <span className="shrink-0">{brl(i.preco * i.quantidade)}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-1 border-t border-border pt-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Produtos</span>
              <span>{brl(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {tipoEntrega === "retirada" ? "Retirada na loja" : "Entrega (1x)"}
              </span>
              <span>{brl(taxaEntregaFinalUI)}</span>
            </div>
            {desconto > 0 && (
              <div className="flex justify-between text-success">
                <span>Desconto ({cupom?.codigo})</span>
                <span>-{brl(desconto)}</span>
              </div>
            )}
            <div className="flex justify-between font-display text-lg">
              <span>Total</span>
              <span className="text-primary">{brl(totalFinalUI)}</span>
            </div>
          </div>
        </section>

        <Button type="submit" size="lg" className="w-full" disabled={enviando}>
          {enviando ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Confirmar pedido • {brl(totalFinalUI)}
        </Button>
      </form>
    </div>
  );
}
