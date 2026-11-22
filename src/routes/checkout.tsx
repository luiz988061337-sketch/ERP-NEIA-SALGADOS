import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Bike,
  CheckCircle2,
  CreditCard,
  MapPin,
  LocateFixed,
  Loader2,
  QrCode,
  ShoppingBag,
  Store,
  Trophy,
  Copy,
  Clock,
  UserRound,
  MapPinned,
  Wallet,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { ehModoDemo } from "@/lib/demo-preview";
import type { Database } from "@/integrations/supabase/types";
import { DEMO_SEED_FLAG, useCart, type TipoEntrega } from "@/lib/cart";
import { usePerfil, useSession, useStaffOnly } from "@/lib/session";
import { brl, PAGAMENTO_LABEL, TAXA_ENTREGA } from "@/lib/format";
import { notificarPush } from "@/lib/push";
import { calcTotals, taxaEntregaDoPedido } from "@/lib/totals";
import {
  mensagemQuantidadeInvalida,
  quantidadeValida,
  regraDoItem,
  regraQuantidade,
  type RegraQuantidade,
} from "@/lib/quantidade";
import { validarCupom } from "@/lib/cupons";
import { DEFAULT_FIDELIDADE, pontosGanhos as calcPontos } from "@/lib/fidelidade";
import { useCrmSettings } from "@/lib/crm";
import { registrarEventoCarrinho } from "@/lib/inteligencia";
import { gerarPix } from "@/lib/pix";
import { QrPixLocal } from "@/components/qr-pix-local";
import { mensagemDeErro } from "@/lib/erros";
import { precoFinal, type TipoVenda } from "@/lib/catalog";
import {
  geocodificarEndereco,
  geocodificarCompleto,
  distanciaRotaKm,
  MapaPinAjustavel,
  MapView,
  rotaGoogleMaps,
  type EnderecoDetalhado,
} from "@/components/map-view";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import {
  useConfigEntrega,
  modoPorKm,
  calcularTaxaPreview,
  formatarKm,
  previsaoTaxaUtilizavel,
  type PrevisaoTaxa,
} from "@/lib/config-entrega";
import { garantirSessaoAnonima } from "@/lib/sessao-anonima";
import {
  enderecoLojaOficial,
  pontoDaLoja,
  DEFAULT_LOJA_CONFIG,
  useLojaConfig,
} from "@/lib/loja";
import { validarAgendamento, mensagemLotado, janelaLotada } from "@/lib/horario";
import { decidirCriacaoAtomica, type RpcClient } from "@/lib/criacao-atomica";
import { BUILD_DE_CORTE } from "@/lib/corte";
import { cn } from "@/lib/utils";

/** Fallback quando loja_config.pix_chave ainda não foi preenchida (migration 0029). Preferir sempre loja.pix_chave. */
export const PIX_CHAVE = "24913937000116";

/** Rascunho do assistente: apenas a sessão da aba, nunca localStorage/persistência longa. */
const RASCUNHO_CHECKOUT = "neia-checkout-rascunho-v1";
type RascunhoCheckout = {
  etapa?: number;
  campos?: Record<string, string>;
  /** Modalidade de origem do rascunho; divergência invalida frete/localização. */
  modalidade?: "entrega" | "retirada" | null;
  quando?: "agora" | "agendar";
  pagamento?: "pix" | "dinheiro" | "credito" | "debito";
  obsPedido?: string;
  origem?: string;
  agDt?: string;
  cupomTexto?: string;
  enderecoId?: string;
  tipoImovel?: string;
  semNumero?: string;
  salvarEnd?: string;
  selEnd?: string | undefined;
  pinFinal?: string | undefined;
};

function lerRascunhoCheckout(): RascunhoCheckout | null {
  try {
    if (typeof window === "undefined") return null;
    const bruto = window.sessionStorage.getItem(RASCUNHO_CHECKOUT);
    return bruto ? (JSON.parse(bruto) as RascunhoCheckout) : null;
  } catch {
    return null;
  }
}

function lerJsonSeguro<T>(valor: string | undefined): T | null {
  if (!valor) return null;
  try {
    return JSON.parse(valor) as T;
  } catch {
    return null;
  }
}

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
  const { items, subtotal, clear, tipoEntrega, carregando: carregandoCarrinho } = useCart();
  const [pagamento, setPagamento] = useState<"pix" | "dinheiro" | "credito" | "debito">("pix");
  const [cupomTexto, setCupomTexto] = useState("");
  const [cupom, setCupom] = useState<{ codigo: string; desconto: number } | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Trava síncrona: o estado do React só é refletido no próximo render, e até
  // lá um duplo clique poderia iniciar duas gravações (HOMO-13).
  const enviandoRef = useRef(false);
  const [enderecoId, setEnderecoId] = useState<string>("");
  const [obsPedido, setObsPedido] = useState("");
  const [etapaAtiva, setEtapaAtiva] = useState(1);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement | null>(null);
  const rascunhoRestaurado = useRef(false);
  const modalidadeRascunhoRef = useRef<TipoEntrega | null | undefined>(undefined);
  // Os inputs de entrega só existem depois que o Carrinho define a modalidade.
  // Guardamos o rascunho para reaplicá-lo quando eles aparecerem (HOMO-13).
  const camposRascunhoRef = useRef<Record<string, string> | null>(null);
  const camposRascunhoAplicadosRef = useRef(false);
  // Um rascunho pode ser rebaixado enquanto o frete é calculado. Guardamos a
  // etapa salva para promovê-la de volta assim que todas as etapas validarem.
  const etapaRascunhoRef = useRef<number | null>(null);
  const promocaoRascunhoPendenteRef = useRef(false);
  // Só grava/valida o rascunho depois que a restauração foi commitada; sem isso,
  // o efeito de gravação sobrescreve a etapa salva com o valor inicial (1).
  const [rascunhoPronto, setRascunhoPronto] = useState(false);
  const [tipoImovel, setTipoImovel] = useState("casa");
  const [quando, setQuando] = useState<"agora" | "agendar">("agora");
  const { data: settings } = useCrmSettings();
  const { data: lojaConfig } = useLojaConfig();
  const loja = lojaConfig ?? DEFAULT_LOJA_CONFIG;
  const pontoLoja = pontoDaLoja(loja);
  const funilRef = useRef(false);
  // Idempotência: mesma chave por tentativa; reenvio retorna o mesmo pedido.
  const chaveRef = useRef("");
  // Depois de confirmar, o carrinho é esvaziado. Sem esta trava o efeito de
  // "carrinho vazio" redireciona para /carrinho e atropela a ida ao acompanhamento.
  const pedidoConfirmadoRef = useRef(false);

  // -----------------------------------------------------------------------
  // ENDEREÇO INTELIGENTE (0103) — autocomplete, confirmação visual, GPS e
  // taxa por km. O cliente NUNCA define a taxa: o preview vem do SERVIDOR
  // (calcular_taxa_entrega) e a cobrança é recalculada de novo na criação.
  // -----------------------------------------------------------------------
  const {
    data: cfgEntrega,
    isError: erroConfigEntrega,
    isLoading: carregandoConfigEntrega,
  } = useConfigEntrega();
  const porKm = modoPorKm(cfgEntrega);
  // HOMO-CLIENTE-15: endereco da loja tem uma unica origem/validacao. Em demo,
  // ou sem configuracao oficial, a pendencia e exibida em vez do texto ficticio.
  const retiradaOficial = enderecoLojaOficial(loja, cfgEntrega, ehModoDemo());
  const [selEnd, setSelEnd] = useState<EnderecoDetalhado | null>(null);
  const [semNumero, setSemNumero] = useState(false);
  const [pinFinal, setPinFinal] = useState<{ lat: number; lng: number } | null>(null);
  const [rotaKm, setRotaKm] = useState<number | null>(null);
  const [taxaPrev, setTaxaPrev] = useState<PrevisaoTaxa | null>(null);
  const [calculandoTaxa, setCalculandoTaxa] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [salvarEnd, setSalvarEnd] = useState(false);
  const [mapaAberto, setMapaAberto] = useState(false);
  const calcSeqRef = useRef(0);

  // A modalidade vem do CartProvider e nunca é escolhida automaticamente aqui.
  // A observação do pedido continua vinda da chave própria, aplicada uma vez.
  const preferenciasAplicadas = useRef(false);
  useEffect(() => {
    if (preferenciasAplicadas.current) return;
    preferenciasAplicadas.current = true;
    try {
      setObsPedido(localStorage.getItem("neia-obs-pedido") ?? "");
    } catch {
      /* navegador sem storage */
    }
  }, []);

  // Se a modalidade mudar no Carrinho, nenhuma taxa/localização da anterior
  // pode sobreviver: o cliente precisa validar novamente o ponto de entrega.
  const modalidadeAnteriorRef = useRef(tipoEntrega);
  useEffect(() => {
    if (modalidadeAnteriorRef.current === tipoEntrega) return;
    modalidadeAnteriorRef.current = tipoEntrega;
    // O Carrinho carrega depois da hidratação: se a modalidade que chegou é a
    // mesma do rascunho restaurado, o pin/frete salvos continuam válidos.
    if (modalidadeRascunhoRef.current === tipoEntrega) return;
    setPinFinal(null);
    setSelEnd(null);
    setRotaKm(null);
    setTaxaPrev(null);
    setCalculandoTaxa(false);
    setMapaAberto(false);
  }, [tipoEntrega]);

  // Recálculo da rota + taxa SEMPRE que o ponto final confirmado mudar
  // (endereço, número, pin ajustado no mapa). Nunca mantém a taxa do
  // endereço anterior. Guard de sequência evita resposta fora de ordem.
  useEffect(() => {
    if (tipoEntrega !== "entrega" || !porKm) {
      setTaxaPrev(null);
      setRotaKm(null);
      return;
    }
    const destino =
      pinFinal ?? (selEnd ? { lat: selEnd.lat, lng: selEnd.lng } : null);
    if (!destino) {
      setTaxaPrev(null);
      setRotaKm(null);
      return;
    }
    const seq = ++calcSeqRef.current;
    // Endereço, número ou pin mudou: o frete anterior deixa de valer na hora.
    setTaxaPrev(null);
    setRotaKm(null);
    setCalculandoTaxa(true);
    void (async () => {
      let rota: number | null = null;
      if (cfgEntrega?.origem_lat != null && cfgEntrega?.origem_lng != null) {
        const r = await distanciaRotaKm(
          { lat: cfgEntrega.origem_lat, lng: cfgEntrega.origem_lng },
          destino,
        );
        if (calcSeqRef.current !== seq) return;
        rota = r?.km ?? null;
      }
      setRotaKm(rota);
      const prev = await calcularTaxaPreview({
        lat: destino.lat,
        lng: destino.lng,
        distanciaKm: rota,
        subtotal,
      });
      if (calcSeqRef.current !== seq) return;
      setTaxaPrev(prev);
      setCalculandoTaxa(false);
    })();
  }, [selEnd, pinFinal, tipoEntrega, porKm, subtotal]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!loading && !user) void garantirSessaoAnonima();
  }, [loading, user]);

  useEffect(() => {
    if (!loading && user && items.length === 0 && !pedidoConfirmadoRef.current) {
      navigate({ to: "/carrinho", replace: true });
    }
  }, [loading, user, items.length, navigate]);

  const desconto = cupom?.desconto ?? 0;
  // Nenhuma taxa é inventada antes da validação do endereço: só existe valor
  // quando o servidor respondeu um preview utilizável (distância × R$/km,
  // respeitando a mínima). Fora disso, o frete fica pendente e bloqueia a
  // confirmação — nunca cai em taxa fixa fictícia.
  const taxaPrevValida = tipoEntrega === "entrega" && porKm && previsaoTaxaUtilizavel(taxaPrev);
  const taxaEntregaUI = taxaPrevValida ? (taxaPrev as PrevisaoTaxa).taxa : null;
  const taxaEntregaFinalUI = tipoEntrega === "retirada" ? 0 : taxaEntregaUI;
  const fretePendente = tipoEntrega === "entrega" && taxaEntregaFinalUI == null;
  const taxaFormatadaUI =
    taxaEntregaFinalUI == null
      ? "A calcular"
      : taxaEntregaFinalUI === 0
        ? "Retirada grátis"
        : brl(taxaEntregaFinalUI);
  const totalFinalUI = Math.max(0, subtotal - desconto) + (taxaEntregaFinalUI ?? 0);
  // HOMO-CLIENTE-15: uma unica copia dos defaults, compartilhada com o cartao
  // do acompanhamento e com o RPC demonstrativo de credito.
  const pontosGanhos = calcPontos(totalFinalUI, {
    ativo: settings?.fid_ativo ?? DEFAULT_FIDELIDADE.ativo,
    reaisPorPonto: settings?.fid_reais_por_ponto ?? DEFAULT_FIDELIDADE.reaisPorPonto,
    metaPontos: settings?.fid_meta_pontos ?? DEFAULT_FIDELIDADE.metaPontos,
    recompensaValor: settings?.fid_recompensa_valor ?? DEFAULT_FIDELIDADE.recompensaValor,
  });
  const pixChaveEfetiva = (loja.pix_chave || PIX_CHAVE).trim();
  // Demonstração local nunca produz BR Code/QR com chave real nem cobrança.
  const pix = ehModoDemo()
    ? null
    : gerarPix({
        chave: pixChaveEfetiva,
        valor: totalFinalUI,
        descricao: "Pedido Neia Salgados",
      });

  // -------------------------------------------------------------------------
  // ASSISTENTE (HOMO-CLIENTE-09A): um único formulário, quatro etapas exibidas
  // uma de cada vez. Nada é desmontado, então valores, máscara, mapa e taxas
  // permanecem intactos ao voltar. O rascunho vive apenas na sessão da aba.
  // -------------------------------------------------------------------------
  function salvarRascunho(patch?: Partial<RascunhoCheckout>) {
    try {
      if (typeof window === "undefined") return;
      const form = formRef.current;
      const camposAtuais: Record<string, string> = { ...campos };
      if (form) {
        for (const el of Array.from(form.elements)) {
          const c = el as HTMLInputElement;
          if (!c.name) continue;
          if (["hidden", "radio", "checkbox", "submit", "button"].includes(c.type)) continue;
          camposAtuais[c.name] = c.value;
        }
      }
      const rascunho: RascunhoCheckout = {
        etapa: etapaAtiva,
        campos: camposAtuais,
        modalidade: tipoEntrega,
        quando,
        pagamento,
        obsPedido,
        origem,
        agDt,
        cupomTexto,
        enderecoId,
        tipoImovel,
        semNumero: semNumero ? "1" : "0",
        salvarEnd: salvarEnd ? "1" : "0",
        selEnd: selEnd ? JSON.stringify(selEnd) : undefined,
        pinFinal: pinFinal ? JSON.stringify(pinFinal) : undefined,
        ...patch,
      };
      window.sessionStorage.setItem(RASCUNHO_CHECKOUT, JSON.stringify(rascunho));
    } catch {
      /* navegador sem storage — o wizard segue funcionando na memória */
    }
  }

  function valorCampo(nome: string) {
    const el = formRef.current?.elements.namedItem(nome) as HTMLInputElement | null;
    return String(el?.value ?? campos[nome] ?? "").trim();
  }

  /** Troco é opcional; quando informado, deve ser um valor monetário válido. */
  function valorTroco(texto: string | undefined): { valor: number | null; invalido: boolean } {
    const bruto = (texto ?? "").trim();
    if (!bruto) return { valor: null, invalido: false };
    const normalizado = bruto
      .replace(/[Rr]\$/g, "")
      .replace(/\s/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalizado)) return { valor: null, invalido: true };
    const valor = Number(normalizado);
    if (!Number.isFinite(valor) || valor <= 0) return { valor: null, invalido: true };
    return { valor, invalido: false };
  }

  function validarEtapa(n: number): string | null {
    if (n === 1) {
      if (!valorCampo("cliente_nome")) return "Informe seu nome para continuar.";
      const digitos = valorCampo("telefone").replace(/\D/g, "");
      if (digitos.length < 10 || digitos.length > 13) {
        return "Informe um WhatsApp válido com DDD.";
      }
      return null;
    }
    if (n === 2) {
      if (!tipoEntrega) {
        return "Selecione Entrega ou Retirada no Carrinho para continuar.";
      }
      if (tipoEntrega === "entrega") {
        if (erroConfigEntrega || carregandoConfigEntrega) {
          return "Não foi possível confirmar as regras de entrega. Aguarde e tente novamente.";
        }
        if (cfgEntrega && !cfgEntrega.aceitar_entregas) {
          return "A entrega está temporariamente desativada. Altere para retirada no Carrinho.";
        }
        if (valorCampo("endereco").length < 6) return "Informe rua e número.";
        if (valorCampo("bairro").length < 2) return "Informe o bairro.";
        if (valorCampo("cidade").length < 2) return "Informe a cidade.";
        if (!semNumero && !/\d/.test(valorCampo("endereco"))) {
          return "Informe o número da casa ou marque “Meu endereço não tem número”.";
        }
        if (porKm && !pinFinal) {
          return "Confirme o local da entrega: busque o endereço e ajuste o ponto no mapa.";
        }
        if (porKm && !taxaPrevValida) {
          return taxaPrev?.foraDaArea
            ? "Este endereço está fora da nossa área de entrega."
            : "Não foi possível confirmar a taxa e a área de entrega. Tente novamente antes de continuar.";
        }
      }
      // Retirada não exige endereço residencial nem localização do cliente.
      if (quando === "agendar") {
        const v = validarAgendamento(agDt, new Date(), 30);
        if (!v.ok) return v.motivo;
      }
      return null;
    }
    if (n === 3) {
      if (!["pix", "dinheiro", "credito", "debito"].includes(pagamento)) {
        return "Escolha uma forma de pagamento.";
      }
      const troco = valorTroco(campos["troco"]);
      if (troco.invalido) return "Informe um valor de troco válido (ex.: 100 ou R$ 100,00).";
      if (troco.valor !== null && troco.valor < totalFinalUI) {
        return `O valor para troco deve ser maior ou igual ao total do pedido (${brl(totalFinalUI)}).`;
      }
      return null;
    }
    return null;
  }

  function irPara(destino: number) {
    if (destino < 1 || destino > 4 || enviando) return;
    if (destino > etapaAtiva) {
      for (let n = etapaAtiva; n < destino; n++) {
        const erro = validarEtapa(n);
        if (erro) {
          toast.error(erro);
          return;
        }
      }
    }
    setEtapaAtiva(destino);
    salvarRascunho({ etapa: destino });
    window.scrollTo({ top: 0, behavior: "smooth" });
    // Leva o foco para o início da etapa seguinte (navegação por teclado).
    requestAnimationFrame(() => {
      document.getElementById(etapas[destino - 1]?.id ?? "")?.focus({ preventScroll: true });
    });
  }

  /** Reaplica os campos salvos quando a etapa 2 ainda não estava montada no
   * primeiro render (a modalidade do Carrinho chega depois da hidratação). */
  function aplicarCamposSalvos(camposSalvos: Record<string, string>) {
    const form = document.getElementById("form-checkout") as HTMLFormElement | null;
    if (!form) return;
    const controlados = new Set(["observacoes", "origem_cliente", "agendamento_para", "tipo_imovel"]);
    for (const [nome, valor] of Object.entries(camposSalvos)) {
      if (controlados.has(nome)) continue;
      const el = form.elements.namedItem(nome) as HTMLInputElement | null;
      // Não sobrescreve nada que o cliente já tenha digitado neste render.
      if (el && "value" in el && !el.value) el.value = valor;
    }
  }

  // Restaura o rascunho depois da hidratação (sem divergência SSR) e impede
  // que as preferências do carrinho sobrescrevam o que o cliente já digitou.
  useEffect(() => {
    const r = lerRascunhoCheckout();
    if (!r) {
      rascunhoRestaurado.current = true;
      requestAnimationFrame(() => setRascunhoPronto(true));
      return;
    }
    preferenciasAplicadas.current = true;
    modalidadeRascunhoRef.current = r.modalidade ?? undefined;
    if (r.quando === "agora" || r.quando === "agendar") setQuando(r.quando);
    if (r.pagamento && ["pix", "dinheiro", "credito", "debito"].includes(r.pagamento)) {
      setPagamento(r.pagamento);
    }
    if (typeof r.obsPedido === "string") setObsPedido(r.obsPedido);
    if (typeof r.origem === "string") setOrigem(r.origem);
    if (typeof r.agDt === "string") setAgDt(r.agDt);
    if (typeof r.cupomTexto === "string") setCupomTexto(r.cupomTexto);
    if (typeof r.enderecoId === "string") setEnderecoId(r.enderecoId);
    if (typeof r.tipoImovel === "string") setTipoImovel(r.tipoImovel);
    setSemNumero(r.semNumero === "1");
    setSalvarEnd(r.salvarEnd === "1");
    const sel = lerJsonSeguro<EnderecoDetalhado>(r.selEnd);
    if (sel) setSelEnd(sel);
    const pin = lerJsonSeguro<{ lat: number; lng: number }>(r.pinFinal);
    if (pin) setPinFinal(pin);
    const camposSalvos = r.campos ?? {};
    camposRascunhoRef.current = camposSalvos;
    setCampos(camposSalvos);
    aplicarCamposSalvos(camposSalvos);
    if (r.cupomTexto?.trim()) void aplicarCupom(r.cupomTexto);
    if (typeof r.etapa === "number") {
      const etapa = Math.min(4, Math.max(1, r.etapa));
      etapaRascunhoRef.current = etapa;
      promocaoRascunhoPendenteRef.current = true;
      setEtapaAtiva(etapa);
    }
    rascunhoRestaurado.current = true;
    requestAnimationFrame(() => setRascunhoPronto(true));
  }, []);

  // Quando o Carrinho termina de carregar, os inputs de entrega finalmente
  // existem. Reaplica o rascunho ANTES da validação que rebaixaria a etapa.
  useEffect(() => {
    if (!rascunhoPronto || carregandoCarrinho || camposRascunhoAplicadosRef.current) return;
    const salvos = camposRascunhoRef.current;
    if (!salvos) return;
    aplicarCamposSalvos(salvos);
    camposRascunhoAplicadosRef.current = true;
  }, [rascunhoPronto, carregandoCarrinho, tipoEntrega]);

  // Rascunho de outra modalidade não pode reaproveitar pin/frete calculados
  // para a seleção anterior no Carrinho.
  useEffect(() => {
    if (!rascunhoPronto || carregandoCarrinho) return;
    const origem = modalidadeRascunhoRef.current;
    if (origem === undefined || origem === tipoEntrega) return;
    modalidadeRascunhoRef.current = tipoEntrega;
    setPinFinal(null);
    setSelEnd(null);
    setRotaKm(null);
    setTaxaPrev(null);
    setCalculandoTaxa(false);
    setMapaAberto(false);
  }, [rascunhoPronto, carregandoCarrinho, tipoEntrega]);

  useEffect(() => {
    if (!rascunhoRestaurado.current || !rascunhoPronto) return;
    salvarRascunho();
  }, [
    etapaAtiva,
    tipoEntrega,
    quando,
    pagamento,
    obsPedido,
    origem,
    agDt,
    cupomTexto,
    enderecoId,
    tipoImovel,
    semNumero,
    salvarEnd,
    selEnd,
    pinFinal,
    campos,
    rascunhoPronto,
  ]);

  // Ao restaurar (ou mudar config), não deixa o cliente ficar numa etapa cujas
  // etapas anteriores deixaram de ser válidas — ex.: frete recalculado.
  useEffect(() => {
    if (!rascunhoRestaurado.current || !rascunhoPronto) return;
    // O frete é recalculado de forma assíncrona; durante esse intervalo a
    // previsão é null. Não rebaixar a etapa por um estado transitório.
    if (carregandoCarrinho || carregandoConfigEntrega || calculandoTaxa) return;
    let permitida = 1;
    while (permitida < 4 && !validarEtapa(permitida)) permitida++;
    if (etapaAtiva > permitida) {
      setEtapaAtiva(permitida);
    } else if (
      promocaoRascunhoPendenteRef.current &&
      etapaRascunhoRef.current &&
      etapaAtiva < etapaRascunhoRef.current &&
      permitida >= etapaRascunhoRef.current
    ) {
      setEtapaAtiva(etapaRascunhoRef.current);
      promocaoRascunhoPendenteRef.current = false;
    }
  }, [
    etapaAtiva,
    campos,
    carregandoCarrinho,
    tipoEntrega,
    quando,
    agDt,
    semNumero,
    cfgEntrega,
    carregandoConfigEntrega,
    erroConfigEntrega,
    porKm,
    pinFinal,
    taxaPrev,
    taxaPrevValida,
    calculandoTaxa,
    rascunhoPronto,
  ]);

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
    // Endereço salvo já georreferenciado: reutiliza as coordenadas confirmadas
    // (nunca inventa). Sem lat/lng salvo, o cliente confirma no mapa/GPS.
    if (typeof e.lat === "number" && typeof e.lng === "number" && e.lat && e.lng) {
      setSelEnd({
        completo: `${e.rua}, ${e.numero}`,
        logradouro: String(e.rua ?? ""),
        numero: String(e.numero ?? ""),
        bairro: String(e.bairro ?? ""),
        cidade: String(e.cidade ?? ""),
        uf: String(e.uf ?? ""),
        cep: String(e.cep ?? ""),
        lat: e.lat,
        lng: e.lng,
        placeId: String(e.place_id ?? ""),
        precisao: String(e.precisao ?? "APPROXIMATE"),
        nivel: e.precisao === "ROOFTOP" || e.precisao === "RANGE_INTERPOLATED" ? "preciso" : "aproximado",
      });
      setPinFinal({ lat: e.lat, lng: e.lng });
      setMapaAberto(true);
    }
  }

  async function aplicarCupom(codigoForcado?: string) {
    const codigo = (codigoForcado ?? cupomTexto).trim().toUpperCase();
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

  // -----------------------------------------------------------------------
  // ENDEREÇO INTELIGENTE — handlers
  // -----------------------------------------------------------------------

  /** Sugestão selecionada no autocomplete: preenche os campos e exige
   * confirmação visual do ponto (mapa) quando o resultado é aproximado. */
  function aoEscolherEndereco(d: EnderecoDetalhado) {
    setEnderecoId("");
    setSelEnd(d);
    setPinFinal({ lat: d.lat, lng: d.lng });
    setGpsAccuracy(null);
    setMapaAberto(true);
    const elEnd = document.getElementById("endereco") as HTMLInputElement | null;
    const elBai = document.getElementById("bairro") as HTMLInputElement | null;
    const elCid = document.getElementById("cidade") as HTMLInputElement | null;
    const elCep = document.getElementById("cep") as HTMLInputElement | null;
    if (elEnd) elEnd.value = d.numero ? `${d.logradouro}, ${d.numero}` : d.logradouro;
    if (elBai) elBai.value = d.bairro;
    if (elCid) elCid.value = d.cidade;
    if (elCep) elCep.value = d.cep;
    if (!d.numero && !semNumero) {
      toast.message("Informe o número da casa", {
        description: "Digite o número no campo Endereço e toque em “Atualizar local no mapa”.",
      });
    } else if (d.nivel === "aproximado") {
      toast.message("LOCALIZAÇÃO APROXIMADA", {
        description: "Confirme o ponto no mapa ou ajuste o pin antes de confirmar o pedido.",
      });
    }
  }

  /** Regeocodifica o endereço DIGITADO (ex.: depois de incluir o número).
   * Nunca usa só CEP e nunca inventa coordenadas: falha => mensagem clara. */
  async function atualizarLocalDigitado() {
    const v = (id: string) =>
      (document.getElementById(id) as HTMLInputElement | null)?.value?.trim() ?? "";
    const end = v("endereco");
    if (end.length < 4) {
      toast.error("Informe o endereço completo (rua e número) primeiro.");
      return;
    }
    const bai = v("bairro");
    const cid = v("cidade");
    const uf = selEnd?.uf ?? "";
    const texto = [end, bai, cid, uf].filter(Boolean).join(", ");
    const d = await geocodificarCompleto(texto);
    if (!d) {
      toast.error(
        "Não foi possível localizar esse endereço no mapa. Confira rua, número e cidade.",
      );
      return;
    }
    setSelEnd(d);
    setPinFinal({ lat: d.lat, lng: d.lng });
    setGpsAccuracy(null);
    setMapaAberto(true);
    if (d.nivel === "aproximado") {
      toast.message("LOCALIZAÇÃO APROXIMADA", {
        description: "Ajuste o pin no mapa para o ponto exato da entrega.",
      });
    } else {
      toast.success("Local confirmado no mapa.");
    }
  }

  /** GPS do celular — somente após ação explícita do usuário. Converte as
   * coordenadas em endereço, exige confirmação e valida a precisão. */
  async function usarLocalizacaoAtual() {
    if (ehModoDemo()) {
      toast.info("Localização automática desativada na demonstração.");
      return;
    }
    if (!("geolocation" in navigator)) {
      toast.error("Seu navegador não suporta localização.");
      return;
    }
    toast.loading("Obtendo sua localização…", { id: "gps" });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const acc = Math.round(pos.coords.accuracy);
        setGpsAccuracy(acc);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const d = await geocodificarCompleto(`${lat},${lng}`);
        if (d) {
          setSelEnd(d);
          const elEnd = document.getElementById("endereco") as HTMLInputElement | null;
          const elBai = document.getElementById("bairro") as HTMLInputElement | null;
          const elCid = document.getElementById("cidade") as HTMLInputElement | null;
          const elCep = document.getElementById("cep") as HTMLInputElement | null;
          if (elEnd) elEnd.value = d.numero ? `${d.logradouro}, ${d.numero}` : d.logradouro;
          if (elBai) elBai.value = d.bairro;
          if (elCid) elCid.value = d.cidade;
          if (elCep && d.cep) elCep.value = d.cep;
        }
        setPinFinal({ lat, lng });
        setMapaAberto(true);
        if (acc > 200) {
          toast.warning(
            `Sua localização está imprecisa (~${acc} m). Confirme o endereço ou ajuste o ponto no mapa.`,
            { id: "gps" },
          );
        } else {
          toast.success(`Localização obtida (precisão ~${acc} m). Confirme o ponto no mapa.`, {
            id: "gps",
          });
        }
      },
      (err) => {
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? "Permissão de localização negada. Busque o endereço manualmente."
            : "Não foi possível obter sua localização. Busque o endereço manualmente.",
          { id: "gps" },
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  async function finalizar(e: React.FormEvent<HTMLFormElement>) {
    // O evento sintético do React deixa de expor `currentTarget` depois de
    // qualquer `await` — por isso capturamos o formulário de forma SÍNCRONA,
    // ANTES de qualquer operação assíncrona.
    e.preventDefault();
    // Defesa em profundidade: nem um submit programático/Enter duplo cria pedido
    // fora da Revisão nem inicia uma segunda gravação enquanto a primeira corre.
    if (enviandoRef.current || enviando || etapaAtiva !== 4 || !podeConfirmar) return;
    enviandoRef.current = true;
    const cancelarEnvio = () => {
      enviandoRef.current = false;
    };
    const form = new FormData(e.currentTarget);
    // Revalida o troco no submit: um submit direto não pode driblar a etapa 3.
    const trocoSubmit = valorTroco(String(form.get("troco") ?? ""));
    if (trocoSubmit.invalido || (trocoSubmit.valor !== null && trocoSubmit.valor < totalFinalUI)) {
      toast.error(
        trocoSubmit.invalido
          ? "Informe um valor de troco válido."
          : `O valor para troco deve ser maior ou igual ao total (${brl(totalFinalUI)}).`,
      );
      setEtapaAtiva(3);
      return cancelarEnvio();
    }
    // Sessão anônima garantida nos bastidores antes de gravar o pedido
    // (cliente pede sem login; funcionário logado preserva a própria sessão).
    await garantirSessaoAnonima();
    const sessao = await supabase.auth.getSession();
    const uidPedido = (sessao.data.session?.user ?? null)?.id ?? user?.id ?? null;
    if (!uidPedido) {
      toast.error("Não foi possível iniciar seu pedido. Tente novamente.");
      return cancelarEnvio();
    }
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
      return cancelarEnvio();
    }
    const digitosTel = String(parsed.data.telefone).replace(/\D/g, "");
    if (digitosTel.length < 10 || digitosTel.length > 13) {
      toast.error("Informe um WhatsApp válido com DDD.");
      return cancelarEnvio();
    }
    if (tipoEntrega === "entrega") {
      if (erroConfigEntrega || carregandoConfigEntrega) {
        toast.error("Não foi possível confirmar as regras de entrega. Aguarde e tente novamente.");
        return cancelarEnvio();
      }
      if (cfgEntrega && !cfgEntrega.aceitar_entregas) {
        toast.error("A entrega está temporariamente desativada. Escolha retirada na loja.");
        return cancelarEnvio();
      }
      if ((parsed.data.endereco ?? "").length < 6) {
        toast.error("Informe rua e número.");
        return cancelarEnvio();
      }
      if ((parsed.data.bairro ?? "").length < 2) {
        toast.error("Informe o bairro.");
        return cancelarEnvio();
      }
      if ((parsed.data.cidade ?? "").length < 2) {
        toast.error("Informe a cidade.");
        return cancelarEnvio();
      }
      // Número obrigatório, com opção explícita "Sem número" (0103).
      if (!semNumero && !/\d/.test(parsed.data.endereco ?? "")) {
        toast.error("Informe o número da casa ou marque “Meu endereço não tem número”.");
        return cancelarEnvio();
      }
      // Precisão obrigatória: no regime por km a coordenada final confirmada
      // (mapa/pin ou GPS) é exigida — nunca só CEP, nunca coordenada inventada.
      if (porKm && !pinFinal) {
        toast.error(
          "Confirme o local da entrega: busque o endereço e ajuste o ponto no mapa.",
        );
        return cancelarEnvio();
      }
      if (porKm && !taxaPrevValida) {
        toast.error(
          taxaPrev?.foraDaArea
            ? "Este endereço está fora da nossa área de entrega."
            : "Não foi possível confirmar a taxa e a área de entrega. Tente novamente antes de finalizar.",
        );
        return cancelarEnvio();
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
        return cancelarEnvio();
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
          return cancelarEnvio();
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
      let mapaProdutos = new Map<
        string,
        { categoria_id: string | null; tipo_venda: string | null; unidade_medida: string | null }
      >();
      if (ids.length > 0) {
        const { data: prods, error: errProds } = await supabase
          .from("produtos")
          .select("id, categoria_id, preco, preco_promocional, tipo_venda, unidade_medida")
          .in("id", ids);
        if (errProds) throw errProds;
        mapaPrecos = new Map((prods ?? []).map((p: any) => [p.id, Number(precoFinal(p as any))]));
        mapaProdutos = new Map(
          (prods ?? []).map((p: any) => [
            p.id,
            {
              categoria_id: p.categoria_id ?? null,
              tipo_venda: p.tipo_venda ?? null,
              unidade_medida: p.unidade_medida ?? null,
            },
          ]),
        );
      }

      const categoriaIds = [
        ...new Set(
          [...mapaProdutos.values()]
            .map((p) => p.categoria_id)
            .filter((v): v is string => !!v),
        ),
      ];
      let mapaCombo = new Map<string, number>();
      let mapaSlugCategoria = new Map<string, string>();
      if (categoriaIds.length > 0) {
        const { data: cats, error: errCats } = await supabase
          .from("categorias")
          .select("id, combo_preco_unit, slug")
          .in("id", categoriaIds);
        if (errCats) throw errCats;
        mapaCombo = new Map(
          (cats ?? [])
            .filter((c: any) => c.combo_preco_unit != null)
            .map((c: any) => [c.id, Number(c.combo_preco_unit)]),
        );
        mapaSlugCategoria = new Map(
          (cats ?? []).map((c: any) => [c.id, String(c.slug ?? "")]),
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

        // REGRA AUTORITATIVA: vem do cadastro no banco (tipo_venda +
        // unidade_medida, com slug da categoria como fallback), nunca da flag
        // `combo`/`regra` gravada no localStorage. Assim, editar o carrinho ou
        // o payload não altera o tipo de venda real do produto.
        let regra: RegraQuantidade;
        const cadastro = i.produtoId ? mapaProdutos.get(i.produtoId) : null;
        if (cadastro) {
          regra = regraQuantidade(
            {
              tipo_venda: cadastro.tipo_venda as TipoVenda | null,
              unidade_medida: cadastro.unidade_medida,
            },
            mapaSlugCategoria.get(cadastro.categoria_id ?? "") ?? "",
          );
        } else if (i.componentes?.length) {
          // Combo montado = salgados prontos: sempre múltiplo de 50.
          regra = regraQuantidade({ tipo_venda: "combo_50", unidade_medida: "un" });
        } else {
          // Item legado sem vínculo: sem cadastro para revalidar, usamos a
          // regra congelada no item (a via atômica falha fechada de todo modo).
          regra = regraDoItem(i);
        }
        if (!quantidadeValida(i.quantidade, regra)) {
          throw new Error(`"${i.nome}": ${mensagemQuantidadeInvalida(regra)}`);
        }
        subtotalValidado += precoReal * i.quantidade;
        return { ...i, preco: precoReal };
      });
      const isRetirada = tipoEntrega === "retirada";
      const taxaEntregaBase = taxaEntregaDoPedido({
        retirada: isRetirada,
        previaKmValida: taxaPrevValida,
        taxaPrevista: taxaPrev?.taxa,
        fallback: TAXA_ENTREGA,
      });
      const calc = calcTotals({ subtotal: subtotalValidado, taxaEntrega: taxaEntregaBase, desconto });
      const taxaEntregaFinal = calc.taxaEntrega;
      const totalFinal = Math.max(0, subtotalValidado - calc.desconto) + taxaEntregaFinal;      const obsFinal =
        pagamento === "dinheiro" && parsed.data.troco
          ? `${parsed.data.observacoes} [Troco para ${parsed.data.troco}]`.trim()
          : parsed.data.observacoes;

      // Coordenada final confirmada: pin ajustado no mapa / GPS / sugestão
      // escolhida. Sem seleção: tenta geocodificar o endereço digitado
      // (best-effort legado). NUNCA inventa coordenadas.
      const coords = isRetirada
        ? null
        : pinFinal
          ? pinFinal
          : selEnd
            ? { lat: selEnd.lat, lng: selEnd.lng }
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
        user_id: uidPedido,
        cliente_nome: parsed.data.cliente_nome,
        telefone: parsed.data.telefone,
        endereco: isRetirada
          ? retiradaOficial.texto
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
        // 0103: distância de rota calculada no cliente (Google Directions) e
        // identidade do endereço. O SERVIDOR valida a distância contra a linha
        // reta origem->destino e recalcula a taxa — cliente nunca define taxa.
        distancia_km: isRetirada ? null : (rotaKm ?? null),
        endereco_estado: isRetirada ? null : (selEnd?.uf ?? null),
        endereco_place_id: isRetirada ? null : (selEnd?.placeId || null),
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
          return cancelarEnvio();
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
        // Impressão do cupom NÃO é feita no cliente: a fila_impressao do pedido
        // é criada no servidor (trigger trg_gerar_cupom_apos_itens e
        // trg_pagamento_confirmado do baseline 0086, via enfileirar_cupom).
        // O antigo INSERT manual + payloadCozinhado foram removidos; o payload
        // construído em memoria nunca era enfileirado (variavel morta).
        let pts = 0;
        try {
          const { data: creditados } = await supabase.rpc("creditar_pontos_pedido", {
            p_pedido_id: (pedido as any).id,
          });
          // Autoridade e o RPC (que calcula no servidor); se ele nao responder,
          // usa a mesma regra da previa em vez de exibir um numero arbitrario.
          pts = creditados == null ? pontosGanhos : Number(creditados);
        } catch {
          /* pedido segue mesmo sem pontos */
        }

        // 0103: salva o endereço (com as coordenadas FINAIS confirmadas) para
        // "Usar endereço salvo". Falha aqui não afeta o pedido (best-effort).
        if (salvarEnd && !isRetirada && uidPedido) {
          try {
            const partesEnd = String(parsed.data.endereco ?? "").split(",");
            await supabase.from("enderecos").insert({
              user_id: uidPedido,
              rua:
                selEnd?.logradouro ||
                partesEnd[0]?.trim() ||
                String(parsed.data.endereco ?? ""),
              numero:
                selEnd?.numero ||
                partesEnd.slice(1).join(",").trim() ||
                "S/N",
              bairro: String(parsed.data.bairro ?? ""),
              cidade: selEnd?.cidade || String(parsed.data.cidade ?? ""),
              uf: selEnd?.uf || null,
              cep:
                String(parsed.data.cep ?? "")
                  .replace(/\D/g, "")
                  .slice(0, 8) || null,
              lat: pinFinal?.lat ?? selEnd?.lat ?? coords?.lat ?? null,
              lng: pinFinal?.lng ?? selEnd?.lng ?? coords?.lng ?? null,
              place_id: selEnd?.placeId || null,
              precisao: selEnd?.precisao || null,
              complemento: String(parsed.data.complemento ?? ""),
              referencia: String(parsed.data.referencia ?? ""),
            });
          } catch {
            /* best-effort: pedido segue sem o endereço salvo */
          }
        }

        // Marca ANTES de esvaziar: o efeito de carrinho vazio não deve competir
        // com a navegação para /pedido/$id abaixo.
        pedidoConfirmadoRef.current = true;
        clear();
        try {
          localStorage.removeItem("neia-obs-pedido");
          // No demo o carrinho de exemplo volta no próximo carregamento, para
          // que o cliente possa repetir o fluxo sem montar um pedido novo.
          // Fora do demo nada muda (o carrinho permanece vazio após a compra).
          if (ehModoDemo()) localStorage.removeItem(DEMO_SEED_FLAG);
          sessionStorage.removeItem(RASCUNHO_CHECKOUT);
        } catch {
          /* navegador sem storage */
        }
        void notificarPush(supabase, (pedido as any).id, "recebido");
        toast.success(`Pedido nº ${(pedido as any).numero} recebido! +${pts} pts fidelidade`);
        navigate({ to: "/pedido/$id", params: { id: (pedido as any).id } });
        chaveRef.current = "";
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível finalizar o pedido.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível finalizar o pedido.");
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }

  // Fluxo REAL de quatro etapas. A modalidade já vem do Carrinho, então
  // Endereço e Entrega foram unidos em "Recebimento".
  const etapas = [
    { n: 1, id: "etapa-dados", label: "Dados" },
    { n: 2, id: "etapa-recebimento", label: "Recebimento" },
    { n: 3, id: "etapa-pagamento", label: "Pagamento" },
    { n: 4, id: "etapa-confirmacao", label: "Revisão" },
  ];

  const podeConfirmar =
    etapaAtiva === 4 &&
    !enviando &&
    !!tipoEntrega &&
    !fretePendente &&
    [1, 2, 3].every((n) => validarEtapa(n) === null);

  // Resumo lateral espelha o estado real do pedido. Nenhum frete é exibido
  // antes do preview calculado pelo servidor a partir do endereço validado.
  const resumoPedido = (
    <section
      className="overflow-hidden rounded-[22px] border border-[#F0D9A8] bg-white shadow-[var(--shadow-card)]"
      aria-label="Resumo do Pedido"
    >
      <div className="brand-gradient flex items-center gap-2 px-4 py-3 text-white">
        <ShoppingBag className="size-5" aria-hidden />
        <h2 className="font-display text-xl font-bold">Resumo do Pedido</h2>
      </div>
      <div className="p-4">
        <ul className="max-h-52 space-y-2 overflow-y-auto text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between gap-2">
              <span className="min-w-0 break-words text-[#60524C]">
                {i.quantidade}x {i.nome}
                {i.observacao ? ` (${i.observacao})` : ""}
              </span>
              <span className="shrink-0 font-semibold text-[#500B08]">{brl(i.preco * i.quantidade)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1.5 border-t border-[#F0D9A8] pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-[#60524C]">Produtos</span>
            <span>{brl(subtotal)}</span>
          </div>
          <div className="flex justify-between gap-2" data-testid="resumo-entrega">
            <span className="text-[#60524C]">
              {tipoEntrega === "retirada"
                ? "Retirada na loja"
                : tipoEntrega === "entrega"
                  ? "Entrega"
                  : "Modalidade não selecionada"}
            </span>
            <span className="text-right" data-testid="taxa-entrega">
              {tipoEntrega === "entrega" && fretePendente
                ? "Entrega — A calcular"
                : taxaFormatadaUI}
            </span>
          </div>
          {fretePendente ? (
            <p className="text-xs text-[#60524C]">Frete calculado após informar um endereço válido.</p>
          ) : null}
          {desconto > 0 ? (
            <div className="flex justify-between text-success">
              <span>Desconto ({cupom?.codigo})</span>
              <span>-{brl(desconto)}</span>
            </div>
          ) : null}
        </div>
        <div className="mt-3 rounded-2xl bg-[#FFF4D8] p-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[#500B08]">{fretePendente ? "Subtotal" : "Total"}</span>
            <span className="font-display text-2xl font-bold text-[#D50909]">{brl(totalFinalUI)}</span>
          </div>
        </div>
        <p data-testid="resumo-etapa" className="mt-3 flex items-start gap-2 rounded-xl bg-[#FFF4D8] p-3 text-xs leading-relaxed text-[#60524C]">
          <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-[#B9000B]" aria-hidden />
          {etapaAtiva < 4
            ? `Etapa ${etapaAtiva} de 4. Conclua as validações para chegar à revisão — não há atalho para confirmação.`
            : "Revise os dados e use o botão CONFIRMAR PEDIDO abaixo."}
        </p>
      </div>
    </section>
  );

  return (
    <div className="min-h-screen bg-[#FFFCF7] pb-10">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-[22px] border border-[#F0D9A8] bg-white shadow-[var(--shadow-card)]">
            <div className="sticky top-0 z-20 rounded-t-[22px] border-b border-[#F0D9A8] bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9 rounded-full text-[#500B08]"
                  onClick={() => navigate({ to: "/carrinho" })}
                  aria-label="Voltar ao carrinho"
                >
                  <ArrowLeft className="size-5" />
                </Button>
                <span
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#B9000B] via-[#F47500] to-[#F6B300] text-white shadow-[var(--shadow-card)]"
                  aria-hidden
                >
                  <ShoppingBag className="size-5" />
                </span>
                <div className="min-w-0">
                  <h1 className="font-display text-2xl font-bold text-[#500B08] sm:text-3xl">
                    Finalizar pedido
                  </h1>
                  <p data-testid="etapa-atual" className="text-xs text-[#60524C] sm:text-sm" aria-live="polite">
                    Etapa {etapaAtiva} de 4 — {etapas[etapaAtiva - 1]?.label}. Seus dados são
                    preservados ao voltar.
                  </p>
                </div>
              </div>

              <nav aria-label="Etapas do checkout" className="relative mt-3 grid grid-cols-4 gap-1 rounded-2xl bg-[#FFF4D8] p-1">
                {etapas.map((e) => (
                  <button
                    key={e.n}
                    type="button"
                    onClick={() => irPara(e.n)}
                    disabled={e.n > etapaAtiva || enviando}
                    aria-current={etapaAtiva === e.n ? "step" : undefined}
                    aria-label={`Etapa ${e.n}: ${e.label}`}
                    title={e.n > etapaAtiva ? "Conclua as etapas anteriores" : e.label}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-xl px-1 py-2 text-[11px] font-bold transition focus-visible:ring-2 focus-visible:ring-[#F6B300] disabled:cursor-not-allowed disabled:opacity-50 sm:text-xs",
                      etapaAtiva === e.n
                        ? "bg-white text-[#500B08] shadow-sm"
                        : e.n < etapaAtiva
                          ? "text-[#500B08] hover:bg-white/70"
                          : "text-[#60524C]",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                        etapaAtiva === e.n
                          ? "bg-[#F6B300] text-[#500B08]"
                          : etapaAtiva > e.n
                            ? "bg-[#500B08] text-white"
                            : "bg-white/80 text-[#60524C]",
                      )}
                    >
                      {etapaAtiva > e.n ? "✓" : e.n}
                    </span>
                    <span className="inline">{e.label}</span>
                  </button>
                ))}
                <span className="pointer-events-none absolute inset-x-1 bottom-0 h-0.5 overflow-hidden rounded-full" aria-hidden>
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-[#B9000B] via-[#F47500] to-[#F6B300] transition-all duration-300"
                    style={{ width: `${((etapaAtiva - 1) / 3) * 100}%` }}
                  />
                </span>
              </nav>
            </div>

            <div className="px-4 pb-5 pt-4 sm:px-5">
            {etapaAtiva === 2 && (enderecos ?? []).length > 0 && (
              <div className="mb-4 rounded-2xl border border-[#F0D9A8] bg-[#FFFCF7] p-3 text-sm">
                <Label>Usar endereço salvo</Label>
                <div className="mt-1 flex gap-2">
                  <select
                    value={enderecoId}
                    onChange={(e) => preencherEndereco(e.target.value)}
                    className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm"
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

            <form
              id="form-checkout"
              ref={formRef}
              onSubmit={finalizar}
              onChange={() => {
                const form = formRef.current;
                if (!form) return;
                const atual: Record<string, string> = {};
                for (const el of Array.from(form.elements)) {
                  const c = el as HTMLInputElement;
                  if (!c.name) continue;
                  if (["hidden", "radio", "checkbox", "submit", "button"].includes(c.type)) continue;
                  atual[c.name] = c.value;
                }
                setCampos(atual);
                salvarRascunho();
              }}
              className="space-y-5 [&_input:not([type=hidden]):not([type=radio]):not([type=checkbox])]:h-11 [&_select]:h-11 [&_textarea]:min-h-24"
            >
        <section id="etapa-dados" tabIndex={-1} hidden={etapaAtiva !== 1} className="scroll-mt-36 space-y-4 overflow-hidden rounded-[20px] border border-[#F0D9A8] bg-white p-4 shadow-[var(--shadow-card)]">
          <div className="brand-gradient -mx-4 -mt-4 mb-4 flex items-center gap-2 rounded-t-[20px] px-4 py-3 text-white">
            <UserRound className="size-5 shrink-0" aria-hidden />
            <div>
              <h2 className="font-display text-xl font-bold">Seus dados</h2>
              <p className="text-xs text-white/90">Dados → Recebimento → Pagamento → Revisão</p>
            </div>
          </div>
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
        </section>

        <section id="etapa-recebimento" tabIndex={-1} hidden={etapaAtiva !== 2} className="scroll-mt-36 space-y-4 overflow-hidden rounded-[20px] border border-[#F0D9A8] bg-white p-4 shadow-[var(--shadow-card)]">
          <div className="brand-gradient -mx-4 -mt-4 mb-4 flex items-center gap-2 rounded-t-[20px] px-4 py-3 text-white">
            <MapPinned className="size-5 shrink-0" aria-hidden />
            <div>
              <h2 className="font-display text-xl font-bold">Recebimento</h2>
              <p className="text-xs text-white/90">
                {tipoEntrega === "retirada"
                  ? "Retirada gratuita na loja"
                  : "Entrega calculada pelo endereço validado"}
              </p>
            </div>
          </div>
          {/* A modalidade é lida do Carrinho; o Checkout nunca pergunta de novo. */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#F0D9A8] bg-[#FFF4D8] p-3 text-sm">
            <p className="flex items-center gap-2 font-bold text-[#500B08]">
              {tipoEntrega === "retirada" ? (
                <Store className="size-4 shrink-0" aria-hidden />
              ) : (
                <Bike className="size-4 shrink-0" aria-hidden />
              )}
              {tipoEntrega === "retirada"
                ? "Retirada na loja selecionada"
                : tipoEntrega === "entrega"
                  ? "Entrega selecionada"
                  : "Modalidade não selecionada no carrinho"}
            </p>
            <Link
              to="/carrinho"
              className="rounded-lg px-2 py-1 text-xs font-bold text-[#B9000B] underline underline-offset-2 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6B300]"
            >
              Alterar no carrinho
            </Link>
          </div>
          {!tipoEntrega ? (
            <p className="rounded-xl border border-[#F0D9A8] bg-white p-3 text-sm text-[#60524C]">
              Selecione <strong>Entrega</strong> ou <strong>Retirada na loja</strong> no Carrinho para continuar.
              Nenhuma opção é escolhida automaticamente por aqui.
            </p>
          ) : null}
          {tipoEntrega === "entrega" ? (
            <>
              <p className="text-sm font-bold">Endereço de entrega</p>
              {/* Busca inteligente de endereço (rua, avenida, CEP,
                  condomínio, estabelecimento) com geocoding preciso. */}
              <div className="space-y-1.5">
                <Label>Buscar endereço *</Label>
                <AddressAutocomplete aoSelecionar={aoEscolherEndereco} />
                <p className="text-xs text-muted-foreground">
                  Encontre sua rua, avenida, CEP ou condomínio. Depois confira o número e o ponto
                  no mapa.
                </p>
              </div>
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

              {/* Confirmar local da entrega — mapa com pin ajustável + GPS */}
              <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      if (pinFinal) setMapaAberto(!mapaAberto);
                      else await atualizarLocalDigitado();
                    }}
                  >
                    <MapPin className="mr-1 size-3.5" />
                    📍 Confirmar local da entrega
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void usarLocalizacaoAtual()}
                  >
                    <LocateFixed className="mr-1 size-3.5" />
                    Usar minha localização atual
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void atualizarLocalDigitado()}
                  >
                    Atualizar local com o endereço digitado
                  </Button>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={semNumero}
                    onChange={(e) => setSemNumero(e.target.checked)}
                  />
                  Meu endereço não tem número (opção explícita)
                </label>
                {calculandoTaxa ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> Calculando distância e taxa…
                  </p>
                ) : null}
                {porKm && taxaPrevValida ? (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Distância:</span>{" "}
                    <strong>{formatarKm(taxaPrev!.distanciaKm)}</strong>
                    <span className="mx-2 text-muted-foreground">•</span>
                    <span className="text-muted-foreground">Taxa de entrega:</span>{" "}
                    <strong>{brl(taxaPrev!.taxa)}</strong>
                    {taxaPrev!.entregaGratis ? (
                      <span className="ml-2 text-xs text-success">(entrega grátis)</span>
                    ) : null}
                    {taxaPrev!.fonte === "linha_reta" ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (distância aproximada em linha reta)
                      </span>
                    ) : null}
                  </p>
                ) : null}
                {taxaPrev?.foraDaArea ? (
                  <p className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
                    Este endereço está fora da nossa área de entrega.
                  </p>
                ) : null}
                {gpsAccuracy != null ? (
                  <p className="text-xs text-muted-foreground">
                    Precisão do GPS: ~{gpsAccuracy} m
                    {gpsAccuracy > 200
                      ? " — localização imprecisa: ajuste o ponto no mapa."
                      : ""}
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
                      Confira se o pin está na entrada correta (casa, portaria, prédio). Arraste
                      para ajustar — o texto do endereço não muda.
                    </p>
                  </div>
                ) : mapaAberto && !pinFinal ? (
                  <p className="text-xs text-muted-foreground">
                    Busque o endereço acima para mostrar o mapa.
                  </p>
                ) : null}
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={salvarEnd}
                    onChange={(e) => setSalvarEnd(e.target.checked)}
                  />
                  Salvar este endereço para os próximos pedidos
                </label>
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
            <div className="space-y-1.5 rounded-2xl border border-[#F0D9A8] bg-[#FFF4D8] p-3 text-sm">
              <p className="font-semibold text-[#500B08]">
                Retirada na loja selecionada — <span className="text-[#B9000B]">Retirada gratuita</span>.
              </p>
              {!retiradaOficial.validada ? (
                <p className="mt-1 text-muted-foreground">
                  {retiradaOficial.motivoPendencia}
                  {ehModoDemo() ? " Nesta prévia não abrimos rota nem usamos coordenadas fictícias." : ""}
                </p>
              ) : (
                <>
                  <p className="mt-1 text-muted-foreground">Endereço da loja: {retiradaOficial.texto}</p>
                  {loja.referencia ? (
                    <p className="text-muted-foreground">Referência: {loja.referencia}</p>
                  ) : null}
                </>
              )}
              {!ehModoDemo() && loja.instrucoes_retirada ? (
                <p className="mt-1 whitespace-pre-line text-muted-foreground">
                  {loja.instrucoes_retirada}
                </p>
              ) : null}
              {!ehModoDemo() && pontoLoja ? (
                <MapView
                  pontos={[pontoLoja]}
                  className="h-48 w-full rounded-xl border border-[#F0D9A8]"
                />
              ) : null}
              {retiradaOficial.validada ? (
                <Button asChild type="button" size="sm" variant="outline">
                  <a
                    href={rotaGoogleMaps(
                      retiradaOficial.texto ||
                        `${pontoLoja!.lat},${pontoLoja!.lng}`,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MapPin className="mr-1 size-3.5" /> Como chegar pelo Google Maps
                  </a>
                </Button>
              ) : null}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              name="observacoes"
              value={obsPedido}
              onChange={(e) => setObsPedido(e.target.value)}
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
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Dados fiscais adicionais (opcional)
            </summary>
            <p className="mt-2 rounded-lg bg-[#FFF4D8] p-2 text-xs text-[#60524C]">
              Estes dados são usados pela loja. Informá-los não solicita nem garante emissão automática de nota fiscal.
            </p>
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

        <section id="etapa-agendamento" tabIndex={-1} hidden={etapaAtiva !== 2} className="scroll-mt-36 space-y-3 overflow-hidden rounded-[20px] border border-[#F0D9A8] bg-white p-4 shadow-[var(--shadow-card)]">
          <div className="brand-gradient -mx-4 -mt-4 mb-4 flex items-center gap-2 rounded-t-[20px] px-4 py-3 text-white">
            <Clock className="size-5 shrink-0" aria-hidden />
            <h2 className="font-display text-xl font-bold">Quando receber</h2>
          </div>
          <p className="text-sm font-bold text-[#500B08]">
            {tipoEntrega === "retirada" ? "Quando deseja retirar?" : "Quando deseja receber?"}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3 text-sm transition focus-within:ring-2 focus-within:ring-ring",
                quando === "agora"
                  ? "border-[#F6B300] bg-[#FFF4D8] text-[#500B08]"
                  : "border-[#F0D9A8] bg-white text-[#500B08] hover:border-[#F6B300]",
              )}
            >
              <input
                type="radio"
                name="quando"
                className="sr-only"
                checked={quando === "agora"}
                onChange={() => setQuando("agora")}
              />
              ⚡ O mais rápido possível
            </label>
            <label
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3 text-sm transition focus-within:ring-2 focus-within:ring-ring",
                quando === "agendar"
                  ? "border-[#F6B300] bg-[#FFF4D8] text-[#500B08]"
                  : "border-[#F0D9A8] bg-white text-[#500B08] hover:border-[#F6B300]",
              )}
            >
              <input
                type="radio"
                name="quando"
                className="sr-only"
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

        <section id="etapa-pagamento" tabIndex={-1} hidden={etapaAtiva !== 3} className="scroll-mt-36 space-y-3 overflow-hidden rounded-[20px] border border-[#F0D9A8] bg-white p-4 shadow-[var(--shadow-card)]">
          <div className="brand-gradient -mx-4 -mt-4 mb-4 flex items-center gap-2 rounded-t-[20px] px-4 py-3 text-white">
            <Wallet className="size-5 shrink-0" aria-hidden />
            <h2 className="font-display text-xl font-bold">Pagamento</h2>
          </div>
          <RadioGroup value={pagamento} onValueChange={(v) => setPagamento(v as typeof pagamento)} className="gap-2">
            {(
              [
                { id: "pix", Icone: QrCode },
                { id: "credito", Icone: CreditCard },
                { id: "debito", Icone: CreditCard },
                { id: "dinheiro", Icone: Banknote },
              ] as const
            ).map(({ id, Icone }) => {
              const ativo = pagamento === id;
              return (
                <label
                  key={id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3 text-sm transition focus-within:ring-2 focus-within:ring-ring",
                    ativo
                      ? "border-[#F6B300] bg-[#FFF4D8]"
                      : "border-[#F0D9A8] bg-white hover:border-[#F6B300]",
                  )}
                >
                  <Icone
                    className={cn("size-5 shrink-0", ativo ? "text-[#B9000B]" : "text-[#60524C]")}
                    aria-hidden
                  />
                  <span className="flex-1 font-semibold">{PAGAMENTO_LABEL[id]}</span>
                  <RadioGroupItem
                    value={id}
                    id={id}
                    className={cn("size-5 border-2", ativo ? "border-[#B9000B] text-[#B9000B]" : "")}
                  />
                </label>
              );
            })}
          </RadioGroup>
          {pagamento === "dinheiro" && (
            <div className="space-y-1.5">
              <Label htmlFor="troco">Troco para quanto? (opcional)</Label>
              <Input
                id="troco"
                name="troco"
                inputMode="decimal"
                placeholder={`Ex: R$ ${Math.ceil(totalFinalUI).toFixed(2).replace(".", ",")} ou mais`}
                aria-describedby="troco-ajuda"
              />
              <p id="troco-ajuda" className="text-xs text-[#60524C]">
                Se informado, o valor deve ser maior ou igual ao total do pedido ({brl(totalFinalUI)}).
              </p>
            </div>
          )}
          {pagamento === "pix" && (
            <div className="rounded-2xl border border-[#F0D9A8] bg-[#FFFCF7] p-4 text-sm">
              <p className="flex items-center gap-1.5 font-semibold text-[#500B08]">
                <QrCode className="size-4" /> Pague com PIX
              </p>
              {ehModoDemo() ? (
                <p className="mt-2 rounded-xl border border-[#F0D9A8] bg-[#FFF4D8] p-3 text-xs leading-relaxed text-[#60524C]">
                  Demonstração local: QR Code e Pix Copia e Cola desativados. Nenhuma cobrança,
                  chave real ou transação é apresentada. O fluxo real permanece disponível fora do
                  modo de demonstração.
                </p>
              ) : pix ? (
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
          {settings?.fid_ativo !== false ? (
            <p className="flex items-center gap-1.5 rounded-lg bg-[#FFF4D8] p-2.5 text-xs text-[#60524C]">
              <Trophy className="size-4 text-[#B9000B]" aria-hidden /> Este pedido rende{" "}
              <strong className="text-[#500B08]">{pontosGanhos} pontos</strong> no programa fidelidade.
            </p>
          ) : null}
        </section>

        <section
          id="etapa-confirmacao"
          tabIndex={-1}
          hidden={etapaAtiva !== 4}
          className="scroll-mt-36 space-y-3 rounded-2xl border border-[#F0D9A8] bg-[#FFFCF7] p-4"
          aria-label="Resumo antes de finalizar"
        >
          <span id="etapa-revisao" className="block scroll-mt-36" aria-hidden="true" />
          <div className="brand-gradient -mx-4 -mt-4 flex items-center gap-2 rounded-t-2xl px-4 py-3 text-white">
            <ShoppingBag className="size-5" aria-hidden />
            <h2 className="font-display text-xl font-bold">Revisão do pedido</h2>
          </div>
          <p className="text-xs text-[#60524C]">Confira os itens e o pagamento antes de confirmar.</p>
          <div className="grid gap-2 rounded-2xl border border-[#F0D9A8] bg-white p-3 text-sm sm:grid-cols-2">
            <p><span className="block text-[#60524C]">Nome:</span> <strong className="block break-words text-[#500B08]">{valorCampo("cliente_nome") || "—"}</strong></p>
            <p><span className="block text-[#60524C]">WhatsApp:</span> <strong className="block break-words text-[#500B08]">{valorCampo("telefone") || "—"}</strong></p>
            <p className="sm:col-span-2">
              <span className="text-[#60524C]">{tipoEntrega === "retirada" ? "Retirada:" : "Endereço:"}</span>{" "}
              <strong className="text-[#500B08]">
                {tipoEntrega === "retirada"
                  ? retiradaOficial.texto
                  : [valorCampo("endereco"), valorCampo("bairro"), valorCampo("cidade")]
                      .filter(Boolean)
                      .join(" — ") || "—"}
              </strong>
            </p>
            <p>
              <span className="text-[#60524C]">Horário:</span>{" "}
              <strong className="text-[#500B08]">
                {quando === "agendar" ? agDt.replace("T", " ") || "A agendar" : "O mais rápido possível"}
              </strong>
            </p>
            <p data-testid="revisao-pagamento">
              <span className="block text-[#60524C]">Forma de pagamento:</span>
              <strong className="block break-words text-[#500B08]">{PAGAMENTO_LABEL[pagamento]}</strong>
            </p>
            <p className="sm:col-span-2">
              <span className="text-[#60524C]">Observações:</span>{" "}
              <strong className="text-[#500B08]">{obsPedido || "—"}</strong>
            </p>
            {cupom?.codigo ? (
              <p className="sm:col-span-2">
                <span className="text-[#60524C]">Desconto aplicado:</span>{" "}
                <strong className="text-[#500B08]">{cupom.codigo} — -{brl(desconto)}</strong>
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Input
              value={cupomTexto}
              onChange={(e) => setCupomTexto(e.target.value)}
              placeholder="Cupom (ex: NEIA10)"
              maxLength={20}
            />
            <Button type="button" variant="outline" onClick={() => void aplicarCupom()}>
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
              <span className="text-[#60524C]">
                {tipoEntrega === "retirada"
                  ? "Retirada na loja"
                  : fretePendente
                    ? "Entrega — calculada após informar o endereço"
                    : porKm && taxaPrev?.distanciaKm != null
                      ? `Entrega (${formatarKm(taxaPrev.distanciaKm)})`
                      : "Entrega"}
              </span>
              <span>{taxaFormatadaUI}</span>
            </div>
            {fretePendente ? (
              <p className="text-xs text-muted-foreground">
                {calculandoTaxa
                  ? "Calculando a taxa pelo endereço informado…"
                  : "Frete pendente: informe e valide o endereço para calcular a taxa antes de confirmar."}
              </p>
            ) : null}
            {desconto > 0 && (
              <div className="flex justify-between text-success">
                <span>Desconto ({cupom?.codigo})</span>
                <span>-{brl(desconto)}</span>
              </div>
            )}
            <div className="flex justify-between font-display text-lg">
              <span>{fretePendente ? "Subtotal" : "Total"}</span>
              <span className="text-primary">{brl(totalFinalUI)}</span>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#F0D9A8] pt-4">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => irPara(etapaAtiva - 1)}
            disabled={etapaAtiva === 1 || enviando}
            className="h-11 rounded-full border-[#F0D9A8] bg-white px-5 font-bold text-[#500B08] hover:bg-[#FFF4D8] focus-visible:ring-2 focus-visible:ring-[#F6B300] disabled:opacity-50"
          >
            <ArrowLeft className="mr-2 size-4" /> Voltar
          </Button>
          {etapaAtiva < 4 ? (
            <Button
              type="button"
              size="lg"
              onClick={() => irPara(etapaAtiva + 1)}
              disabled={enviando}
              className="h-11 rounded-full bg-gradient-to-r from-[#B9000B] via-[#F47500] to-[#F6B300] px-6 font-bold text-white shadow-[var(--shadow-card)] hover:opacity-95 focus-visible:ring-2 focus-visible:ring-[#F6B300] disabled:opacity-50"
            >
              Próximo <ArrowRight className="ml-2 size-4" />
            </Button>
          ) : (
            <p className="text-xs font-semibold text-[#60524C]">
              Total a confirmar: <span className="text-[#D50909]">{brl(totalFinalUI)}</span>
            </p>
          )}
        </div>

        {etapaAtiva === 4 ? (
          <Button
            type="submit"
            size="lg"
            className="h-14 w-full rounded-full bg-gradient-to-r from-[#B9000B] via-[#F47500] to-[#F6B300] text-base font-bold tracking-wide text-white shadow-[var(--shadow-card)] hover:opacity-95 focus-visible:ring-2 focus-visible:ring-[#F6B300] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!podeConfirmar}
          >
            {enviando ? (
              <Loader2 className="mr-2 size-5 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 size-5" />
            )}
            {enviando ? "ENVIANDO PEDIDO" : "CONFIRMAR PEDIDO"}
          </Button>
        ) : null}
      </form>
            </div>
          </div>

          <aside className="hidden space-y-4 lg:sticky lg:top-24 lg:block">{resumoPedido}</aside>
        </div>

        <details className="mt-4 rounded-[22px] border border-[#F0D9A8] bg-white shadow-[var(--shadow-card)] lg:hidden">
          <summary className="cursor-pointer px-4 py-3 font-display text-lg font-bold text-[#500B08]">
            Resumo do Pedido
          </summary>
          <div className="px-4 pb-4">{resumoPedido}</div>
        </details>
      </div>
    </div>
  );
}
