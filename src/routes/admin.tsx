import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BarChart3,
  Crown,
  Package,
  Printer,
  Star,
  Trash2,
  Users,
  Pencil,
  Plus,
  MessageCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PagamentoStatusBadge, StatusBadge } from "@/components/status-steps";
import { geocodificarEndereco, MapView } from "@/components/map-view";
import { NotasAdmin } from "@/components/pedido-notas";
import { CentralOperacao } from "@/components/central-operacao";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import type { Database } from "@/integrations/supabase/types";
import {
  brl,
  dataHora,
  hora,
  mensagemStatus,
  PAGAMENTO_LABEL,
  PAGAMENTO_STATUS_LABEL,
  STATUS_EXIBICAO,
  STATUS_LABEL,
  statusFlow,
  whatsappLink,
  type OrderStatus,
} from "@/lib/format";
import { avisarStatus } from "@/lib/push";
import { useClientesStats, normalizarTelefone, type CustomerStats } from "@/lib/crm";
import { logAdmin } from "@/lib/operacao";
import { downloadCSV } from "@/lib/export";
import { novoEstoque, type TipoMov } from "@/lib/estoque";
import { agruparPorBairro } from "@/lib/inteligencia";
import { extensaoValida, redimensionarImagem, tamanhoLegivel } from "@/lib/upload-imagem";
import { SlideAdmin } from "@/components/hero-slide-admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { LojaPanel } from "@/components/admin/loja-panel";
import { DEFAULT_LOJA_CONFIG, type LojaConfig } from "@/lib/loja";
import { impressaoDireta } from "@/lib/impressao";
import { buscarCep, cepValido, mascararCep } from "@/lib/cep";
import { useRoles, useSession } from "@/lib/session";
import type { Role } from "@/lib/session";
import type { PeriodoKey } from "@/lib/operacao";
import { noIntervalo } from "@/lib/operacao";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Administração — Néia Salgados" },
      { name: "description", content: "Dashboard, produtos, pedidos, clientes, motoboys e financeiro." },
    ],
  }),
  component: Admin,
});

function Admin() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const queryClient = useQueryClient();
  const [aba, setAba] = useState("dashboard");
  const [periodo, setPeriodo] = useState<PeriodoKey>("hoje");
  const [buscaGlobal, setBuscaGlobal] = useState("");
  const [pedidoFoco, setPedidoFoco] = useState("");
  const [produtoFoco, setProdutoFoco] = useState("");
  const [clienteFoco, setClienteFoco] = useState("");
  const [notLidas, setNotLidas] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("neia-nots-lidas") ?? "[]");
    } catch {
      return [];
    }
  });

  function marcarLida(id: string) {
    setNotLidas((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id];
      try {
        localStorage.setItem("neia-nots-lidas", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const { data: clientesStats } = useClientesStats();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: "/admin" }, replace: true });
  }, [loading, user, navigate]);

  const isAdmin = roles?.includes("admin");

  const { data: pedidos } = useQuery({
    queryKey: ["admin-pedidos"],
    enabled: !!isAdmin,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("*, pedido_itens(*)")
        .order("created_at", { ascending: false })
        .limit(400);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: produtos } = useQuery({
    queryKey: ["admin-produtos"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("produtos").select("*, categorias(nome,slug)").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: categorias } = useQuery({
    queryKey: ["admin-categorias"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("categorias").select("*").order("ordem");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: cupons } = useQuery({
    queryKey: ["admin-cupons"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("cupons").select("*").order("codigo");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["admin-profiles"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: avaliacoes } = useQuery({
    queryKey: ["admin-avaliacoes"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("avaliacoes")
        .select("*, produtos(nome)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: motoboysRoles } = useQuery({
    queryKey: ["admin-motoboys"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id").eq("role", "motoboy");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: todasRoles, refetch: refetchRoles } = useQuery({
    queryKey: ["admin-all-roles"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return (data ?? []) as { user_id: string; role: string }[];
    },
  });

  const { data: motoboysList, refetch: refetchMotoboys } = useQuery({
    queryKey: ["admin-motoboys-lista"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("motoboys").select("*").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
  const [editandoMotoboy, setEditandoMotoboy] = useState<{ id?: string; nome: string; telefone: string; observacao: string } | null>(null);
  const [salvandoMotoboy, setSalvandoMotoboy] = useState(false);

  async function salvarMotoboy(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editandoMotoboy) return;
    setSalvandoMotoboy(true);
    const payload = { nome: editandoMotoboy.nome, telefone: editandoMotoboy.telefone, observacao: editandoMotoboy.observacao };
    const { error } = editandoMotoboy.id
      ? await supabase.from("motoboys").update(payload).eq("id", editandoMotoboy.id)
      : await supabase.from("motoboys").insert(payload);
    setSalvandoMotoboy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editandoMotoboy.id ? "Motoboy atualizado." : "Motoboy cadastrado.");
    setEditandoMotoboy(null);
    void refetchMotoboys();
  }

  async function excluirMotoboy(id: string, nome: string) {
    if (!window.confirm(`Excluir motoboy "${nome}"?`)) return;
    const { error } = await supabase.from("motoboys").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Motoboy excluído.");
    void refetchMotoboys();
  }

  const { data: heroSlides, refetch: refetchHero } = useQuery({
    queryKey: ["admin-hero"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("hero_carousel").select("*").order("ordem");
      if (error) throw error;
      return data ?? [];
    },
  });
  const [novoSlide, setNovoSlide] = useState({ imagem_url: "", legenda: "", ordem: 0 });
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [fotoInfo, setFotoInfo] = useState("");

  function limparNovoSlide() {
    setNovoSlide({ imagem_url: "", legenda: "", ordem: 0 });
    setFotoInfo("");
  }

  const BUCKET_HERO = "hero";

  async function enviarFotoHero(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!extensaoValida(file)) {
      toast.error("Use JPG, PNG, WebP ou AVIF.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast.error("Arquivo acima de 12 MB. Escolha uma foto menor.");
      return;
    }
    setEnviandoFoto(true);
    try {
      // Reduz sem cortar: a proporção original é preservada, então a foto
      // aparece inteira na capa mesmo sendo alta ou quadrada.
      const { blob, type, largura, altura } = await redimensionarImagem(file);
      const ext = type === "image/png" ? "png" : "jpg";
      const caminho = `hero/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET_HERO).upload(caminho, blob, {
        upsert: true,
        contentType: type,
      });
      if (error) {
        toast.error(
          /bucket|not found|schema/i.test(error.message)
            ? "Bucket de imagens ausente — rode a migration 0020 no Supabase."
            : error.message,
        );
        return;
      }
      const { data } = supabase.storage.from(BUCKET_HERO).getPublicUrl(caminho);
      setNovoSlide((s) => ({ ...s, imagem_url: data.publicUrl }));
      setFotoInfo(`${largura}x${altura} • ${tamanhoLegivel(blob.size)}`);
      toast.success(`Foto pronta (${largura}x${altura}, ${tamanhoLegivel(blob.size)}). Agora clique em Adicionar slide.`);
    } catch (err) {
      console.error(err);
      toast.error("Não consegui preparar a imagem. Tente outra foto.");
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function adicionarSlide(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { error } = await supabase.from("hero_carousel").insert({ ...novoSlide, ativo: true });
    if (error) { toast.error(error.message); return; }
    toast.success("Slide adicionado.");
    limparNovoSlide();
    void refetchHero();
  }

  async function alternarSlideAtivo(id: string, ativo: boolean) {
    const { error } = await supabase.from("hero_carousel").update({ ativo: !ativo }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    void refetchHero();
  }

  async function salvarSlide(id: string, campos: { legenda?: string; ordem?: number }) {
    const { error } = await supabase.from("hero_carousel").update(campos).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Slide atualizado.");
    void refetchHero();
  }

  /** Troca a foto de um slide existente, mantendo legenda e ordem. */
  async function trocarFotoSlide(id: string, file: File) {
    setEnviandoFoto(true);
    try {
      const { blob, type, largura, altura } = await redimensionarImagem(file);
      const ext = type === "image/png" ? "png" : "jpg";
      const caminho = `hero/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET_HERO).upload(caminho, blob, { upsert: true, contentType: type });
      if (error) { toast.error(error.message); return; }
      const { data } = supabase.storage.from(BUCKET_HERO).getPublicUrl(caminho);
      const upd = await supabase.from("hero_carousel").update({ imagem_url: data.publicUrl }).eq("id", id);
      if (upd.error) { toast.error(upd.error.message); return; }
      toast.success(`Foto trocada (${largura}x${altura}, ${tamanhoLegivel(blob.size)}).`);
      void refetchHero();
    } catch (err) {
      console.error(err);
      toast.error("Não consegui preparar a imagem. Tente outra foto.");
    } finally {
      setEnviandoFoto(false);
    }
  }

  /** Extrai o caminho do storage de uma URL pública (ou null se for URL externa). */
  function caminhoNoStorage(url: string): string | null {
    const m = url.match(/\/storage\/v1\/object\/public\/hero\/(.+)$/);
    return m && m[1] ? decodeURIComponent(m[1]) : null;
  }

  async function excluirSlide(id: string, imagemUrl: string) {
    if (!window.confirm("Excluir este slide?")) return;
    const { error } = await supabase.from("hero_carousel").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    // Apaga o arquivo do storage para não deixar lixo acumulado.
    const caminho = caminhoNoStorage(imagemUrl);
    if (caminho) {
      const { error: errStorage } = await supabase.storage.from(BUCKET_HERO).remove([caminho]);
      if (errStorage) console.warn("Slide removido, mas a imagem ficou no storage:", errStorage.message);
    }
    toast.success("Slide excluído.");
    void refetchHero();
  }

  const { data: calcConfig, refetch: refetchCalc } = useQuery({
    queryKey: ["admin-calc-config"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("calculadora_config").select("*").eq("id", true).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: lojaConfig, refetch: refetchLoja } = useQuery({
    queryKey: ["loja-config"],
    enabled: !!isAdmin,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("loja_config").select("*").eq("id", true).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  // Formulário controlado: o CEP precisa escrever nos campos.
  const [lojaForm, setLojaForm] = useState<LojaConfig | null>(null);
  const [cepLoja, setCepLoja] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [localizando, setLocalizando] = useState(false);

  useEffect(() => {
    if (lojaForm || !lojaConfig) return;
    setLojaForm({ ...DEFAULT_LOJA_CONFIG, ...(lojaConfig as Partial<LojaConfig>) });
  }, [lojaConfig, lojaForm]);

  const lojaAtual = lojaForm ?? { ...DEFAULT_LOJA_CONFIG, ...(lojaConfig ?? {}) };
  function setLoja(campo: keyof LojaConfig, valor: string) {
    setLojaForm((f) => ({ ...(f ?? lojaAtual), [campo]: valor }));
  }

  async function aplicarCep() {
    if (!cepValido(cepLoja)) {
      toast.error("Digite um CEP com 8 dígitos.");
      return;
    }
    setBuscandoCep(true);
    try {
      const r = await buscarCep(cepLoja);
      setLojaForm((f) => ({
        ...(f ?? lojaAtual),
        endereco: [r.logradouro, r.complemento].filter(Boolean).join(", ") || (f ?? lojaAtual).endereco,
        bairro: r.bairro || (f ?? lojaAtual).bairro,
        cidade: r.localidade || (f ?? lojaAtual).cidade,
      }));
      toast.success(`CEP ${mascararCep(r.cep)}: ${r.localidade}${r.uf ? `/${r.uf}` : ""}. Confira o número.`);
      document.getElementById("loja-endereco")?.focus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui buscar o CEP.");
    } finally {
      setBuscandoCep(false);
    }
  }

  async function localizarNoMapa() {
    const endereco = [
      lojaAtual.endereco,
      lojaAtual.complemento,
      lojaAtual.bairro,
      lojaAtual.cidade,
    ]
      .filter(Boolean)
      .join(", ");
    if (!endereco) {
      toast.error("Preencha o endereço (use o CEP) antes de achar no mapa.");
      return;
    }
    setLocalizando(true);
    const loc = await geocodificarEndereco(endereco);
    setLocalizando(false);
    if (!loc) {
      toast.error("Não localizei esse endereço. Confira o texto ou digite latitude/longitude ao lado.");
      return;
    }
    setLojaForm((f) => ({ ...(f ?? lojaAtual), mapa_lat: loc.lat, mapa_lng: loc.lng }));
    toast.success(`Loja marcada: ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}.`);
  }

  async function salvarLoja(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!lojaForm) return;
    const num = (v: unknown): number | null => {
      const n = Number(v);
      return v === "" || v == null || Number.isNaN(n) ? null : n;
    };
    const payload = {
      ...lojaForm,
      mapa_lat: num(lojaForm.mapa_lat),
      mapa_lng: num(lojaForm.mapa_lng),
      atualizado_em: new Date().toISOString(),
    };
    const { error } = await supabase.from("loja_config").update(payload).eq("id", true);
    if (error) {
      toast.error(/does not exist|schema/i.test(error.message) ? "Rode a migration 0021 no Supabase." : error.message);
      return;
    }
    toast.success("Dados da loja salvos.");
    void refetchLoja();
    queryClient.invalidateQueries({ queryKey: ["loja-config"] });
  }

  const [calcEdit, setCalcEdit] = useState<{ permitir_personalizado: boolean; por_pessoa_padrao: number; minimo_por_pessoa: number; maximo_por_pessoa: number } | null>(null);

  async function salvarCalcConfig(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!calcEdit) return;
    const { error } = await supabase.from("calculadora_config").update(calcEdit).eq("id", true);
    if (error) { toast.error(error.message); return; }
    toast.success("Configuração salva.");
    setCalcEdit(null);
    void refetchCalc();
  }

  async function moderarAvaliacao(id: string, aprovada: boolean) {
    const { error } = await supabase.from("avaliacoes").update({ aprovada }).eq("id", id);
    if (error) toast.error("Não foi possível moderar.");
    else {
      toast.success(aprovada ? "Avaliação publicada." : "Avaliação despublicada.");
      queryClient.invalidateQueries({ queryKey: ["admin-avaliacoes"] });
    }
  }

  function refreshAll() {
    for (const k of ["admin-pedidos", "admin-produtos", "admin-categorias", "admin-cupons", "admin-profiles", "admin-avaliacoes", "admin-all-roles", "admin-metas"])
      queryClient.invalidateQueries({ queryKey: [k] });
    void refetchRoles();
  }

  const dash = useMemo(() => {
    const lista = pedidos ?? [];
    const hojeStr = new Date().toDateString();
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const doDia = lista.filter((p: any) => new Date(p.created_at).toDateString() === hojeStr && p.status !== "cancelado");
    const doMes = lista.filter((p: any) => new Date(p.created_at) >= inicioMes && p.status !== "cancelado");
    const fatDia = doDia.reduce((a: number, p: any) => a + Number(p.total), 0);
    const fatMes = doMes.reduce((a: number, p: any) => a + Number(p.total), 0);
    const ticket = doMes.length ? fatMes / doMes.length : 0;

    const prodMap = new Map<string, { nome: string; qtd: number; total: number }>();
    for (const p of lista) {
      if (p.status === "cancelado") continue;
      for (const i of (p as any).pedido_itens ?? []) {
        const cur = prodMap.get(i.nome) ?? { nome: i.nome, qtd: 0, total: 0 };
        cur.qtd += i.quantidade;
        cur.total += Number(i.preco_unitario) * i.quantidade;
        prodMap.set(i.nome, cur);
      }
    }
    const maisVendidos = [...prodMap.values()].sort((a, b) => b.qtd - a.qtd).slice(0, 5);

    const cliMap = new Map<string, { nome: string; qtd: number; total: number; tel: string }>();
    for (const p of lista) {
      if (p.status === "cancelado") continue;
      const key = (p as any).user_id ?? (p as any).telefone;
      const cur = cliMap.get(key) ?? { nome: (p as any).cliente_nome, qtd: 0, total: 0, tel: (p as any).telefone };
      cur.qtd += 1;
      cur.total += Number((p as any).total);
      cliMap.set(key, cur);
    }
    const recorrentes = [...cliMap.values()].filter((c) => c.qtd >= 2).sort((a, b) => b.qtd - a.qtd).slice(0, 5);

    // Cálculo puro (nunca useMemo aninhado: hook dentro de hook quebra o render).
    const fatPorDia = (() => {
      const map = new Map<string, number>();
      for (const p of doMes) {
        const dia = new Date(p.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        map.set(dia, (map.get(dia) ?? 0) + Number(p.total));
      }
      return [...map.entries()].map(([dia, total]) => ({ dia, total }));
    })();

    return { doDia, doMes, fatDia, fatMes, ticket, maisVendidos, recorrentes, totalPedidos: lista.length, fatPorDia };
  }, [pedidos]);

  const rankingMotoboys = useMemo(() => {
    const lista = pedidos ?? [];
    const map = new Map<string, { id: string; entregas: number; canceladas: number; ganhos: number; tempos: number[] }>();
    for (const p of lista) {
      const mid = (p as any).motoboy_id;
      if (!mid) continue;
      const cur = map.get(mid) ?? { id: mid as string, entregas: 0, canceladas: 0, ganhos: 0, tempos: [] as number[] };
      if ((p as any).status === "entregue") {
        cur.entregas += 1;
        cur.ganhos += Number((p as any).taxa_motoboy ?? 0);
        if ((p as any).aceito_em && (p as any).entregue_em) {
          cur.tempos.push((new Date((p as any).entregue_em).getTime() - new Date((p as any).aceito_em).getTime()) / 60000);
        }
      }
      if ((p as any).status === "cancelado") cur.canceladas += 1;
      map.set(mid, cur);
    }
    return [...map.values()]
      .map((m) => ({
        ...m,
        tempoMedio: m.tempos.length ? m.tempos.reduce((a, b) => a + b, 0) / m.tempos.length : 0,
      }))
      .sort((a, b) => b.entregas - a.entregas);
  }, [pedidos]);

  if (roles && !isAdmin) {
    return <p className="p-10 text-center text-muted-foreground">Acesso restrito ao administrador.</p>;
  }

  async function mudarStatusPedido(p: any, status: OrderStatus) {
    // Cancelar devolve estoque primeiro (0030); o trigger 0042 reconcilia o resto.
    // Sem isso, produtos.estoque ficava debitado para sempre (vazamento).
    if (status === "cancelado") {
      try { await supabase.rpc("liberar_reserva_atomica", { p_pedido_id: p.id }); } catch { /* sem migration — trigger 0042 assume */ }
      try { await supabase.from("reservas_estoque").update({ status: "cancelada" }).eq("pedido_id", p.id).eq("status", "ativa"); } catch { /* sem migration */ }
    }
    const { error } = await supabase.from("pedidos").update({ status }).eq("id", p.id);
    if (error) toast.error(error?.message || "Não foi possível atualizar.");
    else {
      toast.success(`Pedido nº ${p.numero} → ${STATUS_LABEL[status]}`);
      void logAdmin("pedido_status", `#${p.numero} → ${status}`);
      void avisarStatus(supabase, p, status, mensagemStatus(status, p.cliente_nome, p.numero));
    }
    queryClient.invalidateQueries({ queryKey: ["admin-pedidos"] });
  }

  /**
   * Pagamento é separado do pedido. Só a loja confirma — o cliente nunca
   * marca o próprio pagamento como pago.
   */
  async function mudarPagamento(p: any, pagamentoStatus: string) {
    const agora = new Date().toISOString();
    const patch =
      pagamentoStatus === "pago"
        ? { pagamento_status: pagamentoStatus, pagamento_em: agora }
        : { pagamento_status: pagamentoStatus, pagamento_em: null };
    const { error } = await supabase.from("pedidos").update(patch).eq("id", p.id);
    if (error) {
      toast.error(
        /column|does not exist/i.test(error.message)
          ? "Rode a migration 0022 no Supabase para controlar o pagamento."
          : "Não foi possível atualizar o pagamento.",
      );
      return;
    }
    toast.success(`Pagamento do pedido nº ${p.numero}: ${PAGAMENTO_STATUS_LABEL[pagamentoStatus] ?? pagamentoStatus}`);
    void logAdmin("pagamento_status", `#${p.numero} → ${pagamentoStatus}`);
    queryClient.invalidateQueries({ queryKey: ["admin-pedidos"] });
  }

  return (
    <AdminShell aba={aba} onAba={setAba} onRefresh={refreshAll}>
      <Tabs value={aba} onValueChange={setAba}>
        <TabsContent value="dashboard" className="mt-4 space-y-4">
          <BuscaGlobal
            termo={buscaGlobal}
            onTermo={setBuscaGlobal}
            pedidos={pedidos ?? []}
            produtos={produtos ?? []}
            profiles={profiles ?? []}
            onIrPedido={(numero) => { setPedidoFoco(String(numero)); setAba("pedidos"); }}
            onIrProduto={(nome) => { setProdutoFoco(nome); setAba("produtos"); }}
            onIrCliente={(nome) => { setClienteFoco(nome); setAba("clientes"); }}
          />
          <CentralOperacao
            pedidos={pedidos ?? []}
            produtos={produtos ?? []}
            clientes={clientesStats ?? []}
            periodo={periodo}
            setPeriodo={setPeriodo}
            setAba={setAba}
            notLidas={notLidas}
            marcarLida={marcarLida}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 font-display text-xl"><BarChart3 className="size-5" /> Mais vendidos</h2>
              {dash.maisVendidos.length > 0 ? (
                <div className="mt-3 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dash.maisVendidos} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => brl(v)} />
                      <YAxis type="category" dataKey="nome" width={120} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(v: number) => brl(v)} />
                      <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Total" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Sem vendas ainda.</p>
              )}
            </section>
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 font-display text-xl"><Crown className="size-5" /> Clientes recorrentes</h2>
              {dash.recorrentes.length > 0 ? (
                <div className="mt-3 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dash.recorrentes}
                        dataKey="total"
                        nameKey="nome"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ nome, qtd }) => `${nome} (${qtd})`}
                      >
                        {dash.recorrentes.map((_, i) => (
                          <Cell key={i} fill={`hsl(${(i * 60) + 20} 70% 50%)`} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => brl(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Nenhum recorrente ainda.</p>
              )}
            </section>
          </div>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Faturamento do mês</h2>
            {dash.fatPorDia.length > 0 ? (
              <div className="mt-3 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dash.fatPorDia} margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="dia" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => brl(v)} />
                    <Tooltip formatter={(v: number) => brl(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} name="Faturamento" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Sem faturamento no mês.</p>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Pedidos de hoje</h2>
            <div className="mt-3 space-y-2">
              {(dash.doDia ?? []).slice(0, 10).map((p: any) => (
                <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-display">Nº {p.numero}</span>
<StatusBadge status={p.status} />
              <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-semibold">{p.tipo_entrega === "retirada" ? "🏪 Retirada" : "🚚 Entrega"}</span>
              <PagamentoStatusBadge status={p.pagamento_status} />
                  <span className="text-muted-foreground">{p.cliente_nome} • {hora(p.created_at)}</span>
                  <span className="ml-auto font-semibold text-primary">{brl(p.total)}</span>
                </div>
              ))}
              {dash.doDia.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pedido hoje.</p>}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="pedidos" className="mt-4">
          <PedidosAdmin pedidos={pedidos ?? []} onStatus={mudarStatusPedido} onPagamento={mudarPagamento} foco={pedidoFoco} onLimparFoco={() => setPedidoFoco("")} />
        </TabsContent>

        <TabsContent value="produtos" className="mt-4 space-y-6">
          <ProdutosAdmin produtos={produtos ?? []} categorias={categorias ?? []} onChange={refreshAll} foco={produtoFoco} onLimparFoco={() => setProdutoFoco("")} />
          <CategoriasAdmin categorias={categorias ?? []} onChange={refreshAll} />
        </TabsContent>

        <TabsContent value="clientes" className="mt-4">
          <ClientesAdmin profiles={profiles ?? []} pedidos={pedidos ?? []} foco={clienteFoco} onLimparFoco={() => setClienteFoco("")} />
        </TabsContent>

        <TabsContent value="motoboys" className="mt-4 space-y-4">
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl">Motoboys cadastrados</h2>
              <Button size="sm" onClick={() => setEditandoMotoboy({ nome: "", telefone: "", observacao: "" })}>
                <Plus className="mr-1 size-4" /> Novo motoboy
              </Button>
            </div>
            {editandoMotoboy && (
              <form onSubmit={salvarMotoboy} className="mb-4 grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
                <div className="space-y-1"><Label>Nome</Label><Input value={editandoMotoboy.nome} onChange={(e) => setEditandoMotoboy({ ...editandoMotoboy, nome: e.target.value })} required /></div>
                <div className="space-y-1"><Label>Telefone (WhatsApp)</Label><Input value={editandoMotoboy.telefone} onChange={(e) => setEditandoMotoboy({ ...editandoMotoboy, telefone: e.target.value })} placeholder="(11) 90000-0000" required inputMode="tel" /></div>
                <div className="space-y-1 sm:col-span-2"><Label>Observação</Label><Textarea value={editandoMotoboy.observacao} onChange={(e) => setEditandoMotoboy({ ...editandoMotoboy, observacao: e.target.value })} /></div>
                <div className="flex gap-2 sm:col-span-2">
                  <Button type="submit" disabled={salvandoMotoboy}>{salvandoMotoboy ? "Salvando…" : "Salvar"}</Button>
                  <Button type="button" variant="outline" onClick={() => setEditandoMotoboy(null)}>Cancelar</Button>
                </div>
              </form>
            )}
            <div className="space-y-2">
              {(motoboysList ?? []).map((m: any) => (
                <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm">
                  <div className="flex-1">
                    <p className="font-semibold">{m.nome || "Sem nome"} <span className="ml-1 text-xs font-normal text-muted-foreground">{m.telefone || "—"}</span></p>
                    {m.observacao ? <p className="text-xs text-muted-foreground">{m.observacao}</p> : null}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditandoMotoboy({ id: m.id, nome: m.nome, telefone: m.telefone, observacao: m.observacao })}><Pencil className="size-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => excluirMotoboy(m.id, m.nome)}><Trash2 className="size-4" /></Button>
                </div>
              ))}
              {(motoboysList ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum motoboy cadastrado.</p>}
            </div>
          </section>
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Ranking de motoboys</h2>
            <p className="text-xs text-muted-foreground">Entregas realizadas, tempo médio, ganhos e canceladas. Motoboys cadastrados: {motoboysRoles?.length ?? 0}</p>
            <div className="mt-3 space-y-2">
              {rankingMotoboys.map((m, i) => (
                <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm">
                  <Badge>#{i + 1}</Badge>
                  <span className="font-mono text-xs">{m.id.slice(0, 8)}…</span>
                  <span>{m.entregas} entregas</span>
                  <span className="text-muted-foreground">Tempo médio: {m.tempoMedio ? `${m.tempoMedio.toFixed(0)} min` : "—"}</span>
                  <span className="text-muted-foreground">Canceladas: {m.canceladas}</span>
                  <span className="ml-auto font-display text-primary">{brl(m.ganhos)}</span>
                </div>
              ))}
              {rankingMotoboys.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma entrega com motoboy ainda.</p>}
            </div>
          </section>
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Entregas em rota agora</h2>
            <EmRotaAdmin pedidos={(pedidos ?? []).filter((p: any) => p.status === "em_rota")} />
          </section>
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Rotas por bairro</h2>
            <RotasBairro pedidos={(pedidos ?? []).filter((p: any) => ["em_rota", "aguardando_motoboy"].includes(p.status))} />
          </section>
        </TabsContent>

        <TabsContent value="cupons" className="mt-4">
          <CuponsAdmin cupons={cupons ?? []} produtos={produtos ?? []} onChange={refreshAll} />
        </TabsContent>

        <TabsContent value="metas" className="mt-4">
          <MetasAdmin pedidos={pedidos ?? []} onChange={refreshAll} />
        </TabsContent>

        <TabsContent value="financeiro" className="mt-4">
          <FinanceiroAdmin pedidos={pedidos ?? []} />
        </TabsContent>

        <TabsContent value="impressao" className="mt-4">
          <ImpressaoAdmin />
        </TabsContent>

        <TabsContent value="comercial" className="mt-4">
          <ComercialAdmin pedidos={pedidos ?? []} clientes={clientesStats ?? []} />
        </TabsContent>

        <TabsContent value="usuarios" className="mt-4">
          <UsuariosAdmin profiles={profiles ?? []} roles={todasRoles ?? []} meuId={user?.id} onChange={refreshAll} />
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <LogsAdmin profiles={profiles ?? []} />
        </TabsContent>

        <TabsContent value="hero" className="mt-4">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Carrossel da capa</h2>
            <p className="text-xs text-muted-foreground">Slides aparecem na home. Sem slides, a capa padrão é usada.</p>
            <form onSubmit={adicionarSlide} className="mt-4 grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="hero-foto">Foto do slide *</Label>
                <input
                  id="hero-foto"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  disabled={enviandoFoto}
                  onChange={enviarFotoHero}
                  className="block w-full cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-semibold"
                />
                <p className="text-xs text-muted-foreground">
                  JPG, PNG, WebP ou AVIF. A foto é redimensionada sem corte e aparece inteira na capa —
                  proporção horizontal (ex.: 1600x900) ocupa mais espaço, mas qualquer formato funciona.
                </p>
                {enviandoFoto ? <p className="text-xs text-muted-foreground">Preparando e enviando foto…</p> : null}
                {novoSlide.imagem_url ? (
                  <div className="mt-2 rounded-lg border border-border p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={novoSlide.imagem_url} alt="Prévia" className="h-28 w-full rounded object-contain" />
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        Foto anexada{fotoInfo ? ` — ${fotoInfo}` : ""} (sem corte)
                      </span>
                      <Button type="button" size="sm" variant="ghost" onClick={limparNovoSlide}>Trocar</Button>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="space-y-1"><Label>Legenda</Label><Input value={novoSlide.legenda} onChange={(e) => setNovoSlide({ ...novoSlide, legenda: e.target.value })} /></div>
              <div className="space-y-1"><Label>Ordem</Label><Input type="number" value={novoSlide.ordem} onChange={(e) => setNovoSlide({ ...novoSlide, ordem: Number(e.target.value) || 0 })} /></div>
              <div className="sm:col-span-2"><Button type="submit" disabled={!novoSlide.imagem_url}><Plus className="mr-1 size-4" />Adicionar slide</Button></div>
            </form>
            <div className="mt-4 space-y-2">
              {(heroSlides ?? []).map((s: any) => (
                <SlideAdmin
                  key={s.id}
                  slide={s}
                  enviando={enviandoFoto}
                  onAlternar={() => alternarSlideAtivo(s.id, s.ativo)}
                  onSalvar={(campos) => salvarSlide(s.id, campos)}
                  onTrocarFoto={(file) => trocarFotoSlide(s.id, file)}
                  onExcluir={() => excluirSlide(s.id, s.imagem_url)}
                />
              ))}
              {(heroSlides ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum slide cadastrado.</p>}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="calculadora" className="mt-4">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Calculadora de salgados</h2>
            <p className="text-xs text-muted-foreground">Configurações da página /calculadora.</p>
            <form onSubmit={salvarCalcConfig} className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label>Por pessoa (padrão)</Label><Input type="number" defaultValue={calcConfig?.por_pessoa_padrao ?? 20} onChange={(e) => setCalcEdit((p) => ({ ...(p ?? { permitir_personalizado: calcConfig?.permitir_personalizado ?? true, por_pessoa_padrao: calcConfig?.por_pessoa_padrao ?? 20, minimo_por_pessoa: calcConfig?.minimo_por_pessoa ?? 15, maximo_por_pessoa: calcConfig?.maximo_por_pessoa ?? 40, zap_contato: calcConfig?.zap_contato ?? "", orcamento_validade_dias: calcConfig?.orcamento_validade_dias ?? 3 }), por_pessoa_padrao: Number(e.target.value) || 20 }))} /></div>
              <div className="space-y-1"><Label>Mínimo por pessoa</Label><Input type="number" defaultValue={calcConfig?.minimo_por_pessoa ?? 15} onChange={(e) => setCalcEdit((p) => ({ ...(p ?? { permitir_personalizado: calcConfig?.permitir_personalizado ?? true, por_pessoa_padrao: calcConfig?.por_pessoa_padrao ?? 20, minimo_por_pessoa: calcConfig?.minimo_por_pessoa ?? 15, maximo_por_pessoa: calcConfig?.maximo_por_pessoa ?? 40, zap_contato: calcConfig?.zap_contato ?? "", orcamento_validade_dias: calcConfig?.orcamento_validade_dias ?? 3 }), minimo_por_pessoa: Number(e.target.value) || 15 }))} /></div>
              <div className="space-y-1"><Label>Máximo por pessoa</Label><Input type="number" defaultValue={calcConfig?.maximo_por_pessoa ?? 40} onChange={(e) => setCalcEdit((p) => ({ ...(p ?? { permitir_personalizado: calcConfig?.permitir_personalizado ?? true, por_pessoa_padrao: calcConfig?.por_pessoa_padrao ?? 20, minimo_por_pessoa: calcConfig?.minimo_por_pessoa ?? 15, maximo_por_pessoa: calcConfig?.maximo_por_pessoa ?? 40, zap_contato: calcConfig?.zap_contato ?? "", orcamento_validade_dias: calcConfig?.orcamento_validade_dias ?? 3 }), maximo_por_pessoa: Number(e.target.value) || 40 }))} /></div>
              <div className="space-y-1"><Label>WhatsApp que recebe o orçamento</Label><Input placeholder="11999999999" defaultValue={calcConfig?.zap_contato ?? ""} onChange={(e) => setCalcEdit((p) => ({ ...(p ?? { permitir_personalizado: calcConfig?.permitir_personalizado ?? true, por_pessoa_padrao: calcConfig?.por_pessoa_padrao ?? 20, minimo_por_pessoa: calcConfig?.minimo_por_pessoa ?? 15, maximo_por_pessoa: calcConfig?.maximo_por_pessoa ?? 40, zap_contato: calcConfig?.zap_contato ?? "", orcamento_validade_dias: calcConfig?.orcamento_validade_dias ?? 3 }), zap_contato: e.target.value }))} /><p className="text-xs text-muted-foreground">Com DDD. Vazio = o botão de WhatsApp avisa que falta configurar.</p></div>
              <div className="space-y-1"><Label>Validade da estimativa (dias)</Label><Input type="number" defaultValue={calcConfig?.orcamento_validade_dias ?? 3} onChange={(e) => setCalcEdit((p) => ({ ...(p ?? { permitir_personalizado: calcConfig?.permitir_personalizado ?? true, por_pessoa_padrao: calcConfig?.por_pessoa_padrao ?? 20, minimo_por_pessoa: calcConfig?.minimo_por_pessoa ?? 15, maximo_por_pessoa: calcConfig?.maximo_por_pessoa ?? 40, zap_contato: calcConfig?.zap_contato ?? "", orcamento_validade_dias: calcConfig?.orcamento_validade_dias ?? 3 }), orcamento_validade_dias: Number(e.target.value) || 3 }))} /></div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={calcEdit?.permitir_personalizado ?? calcConfig?.permitir_personalizado ?? true} onCheckedChange={(v) => setCalcEdit((p) => ({ ...(p ?? { permitir_personalizado: calcConfig?.permitir_personalizado ?? true, por_pessoa_padrao: calcConfig?.por_pessoa_padrao ?? 20, minimo_por_pessoa: calcConfig?.minimo_por_pessoa ?? 15, maximo_por_pessoa: calcConfig?.maximo_por_pessoa ?? 40, zap_contato: calcConfig?.zap_contato ?? "", orcamento_validade_dias: calcConfig?.orcamento_validade_dias ?? 3 }), permitir_personalizado: v }))} /> Permitir quantidade personalizada</label>
              <div className="sm:col-span-2"><Button type="submit">Salvar configuração</Button></div>
            </form>
          </section>
        </TabsContent>

        <TabsContent value="loja">
          <LojaPanel
            lojaAtual={lojaAtual}
            podeSalvar={!!lojaForm}
            cepLoja={cepLoja}
            setCepLoja={setCepLoja}
            buscandoCep={buscandoCep}
            localizando={localizando}
            setLoja={setLoja}
            aplicarCep={aplicarCep}
            localizarNoMapa={localizarNoMapa}
            salvarLoja={salvarLoja}
          />
        </TabsContent>
        <TabsContent value="avaliacoes" className="mt-4">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Avaliações (qualidade • prazo • atendimento)</h2>
            <AvaliacoesResumo avaliacoes={avaliacoes ?? []} />
            <ul className="mt-3 space-y-2 text-sm">
              {(avaliacoes ?? []).map((a: any) => (
                <li key={a.id} className="rounded-lg border border-border p-3">
                  <p className="flex items-center gap-2">
                    <Star className="size-4 fill-secondary text-secondary" /> {a.nota}/5 — {a.produtos?.nome ?? a.produto_id}
                    {a.prazo ? <span className="text-xs text-muted-foreground">• prazo {a.prazo}/5</span> : null}
                    {a.atendimento ? <span className="text-xs text-muted-foreground">• atend. {a.atendimento}/5</span> : null}
                    {a.nota <= 2 ? <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">⚠ acompanhar</span> : null}
                    <span className="ml-auto text-xs text-muted-foreground">{dataHora(a.created_at)}</span>
                  </p>
                  {a.comentario && <p className="mt-1 text-muted-foreground">“{a.comentario}”</p>}
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    {a.autoriza_publicar ? <span className="text-muted-foreground">✔ autorizou publicar</span> : <span className="text-muted-foreground">não autorizou publicar</span>}
                    {a.aprovada ? <span className="text-success">● publicada</span> : <span className="text-muted-foreground">○ pendente</span>}
                    {!a.aprovada ? <Button size="sm" variant="outline" onClick={() => moderarAvaliacao(a.id, true)}>Aprovar e publicar</Button> : null}
                    {a.aprovada ? <Button size="sm" variant="ghost" onClick={() => moderarAvaliacao(a.id, false)}>Despublicar</Button> : null}
                  </p>
                </li>
              ))}
              {(avaliacoes ?? []).length === 0 && <li className="text-muted-foreground">Sem avaliações.</li>}
            </ul>
          </section>
        </TabsContent>
      </Tabs>
    </AdminShell>
  );
}

function BuscaGlobal({ termo, onTermo, pedidos, produtos, profiles, onIrPedido, onIrProduto, onIrCliente }: {
  termo: string;
  onTermo: (t: string) => void;
  pedidos: any[];
  produtos: any[];
  profiles: any[];
  onIrPedido: (numero: number) => void;
  onIrProduto: (nome: string) => void;
  onIrCliente: (nome: string) => void;
}) {
  const t = termo.trim().toLowerCase();
  const ped = t ? pedidos.filter((p: any) =>
    String(p.numero).includes(t) || (p.cliente_nome ?? "").toLowerCase().includes(t) || (p.telefone ?? "").includes(t),
  ).slice(0, 5) : [];
  const prods = t ? produtos.filter((p: any) => (p.nome ?? "").toLowerCase().includes(t)).slice(0, 5) : [];
  const clis = t ? profiles.filter((p: any) =>
    (p.nome ?? "").toLowerCase().includes(t) || (p.telefone ?? "").includes(t),
  ).slice(0, 5) : [];
  const temResultado = ped.length + prods.length + clis.length > 0;
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label="Pesquisa global">
      <Input
        value={termo}
        onChange={(e) => onTermo(e.target.value)}
        placeholder="🔎 Buscar pedido nº, cliente, telefone ou produto…"
        className="max-w-xl"
      />
      {t ? (
        <div className="mt-3 space-y-2 text-sm">
          {!temResultado ? <p className="text-muted-foreground">Nenhum resultado para “{termo.trim()}”.</p> : null}
          {ped.map((p: any) => (
            <button key={p.id} type="button" onClick={() => { onIrPedido(p.numero); onTermo(""); }} className="flex w-full items-center gap-2 rounded-lg border border-border p-2 text-left hover:bg-muted">
              <span className="font-display">Pedido nº {p.numero}</span>
              <StatusBadge status={p.status} />
              <span className="text-muted-foreground">{p.cliente_nome} • {dataHora(p.created_at)}</span>
              <span className="ml-auto font-semibold text-primary">{brl(p.total)}</span>
            </button>
          ))}
          {prods.map((p: any) => (
            <button key={p.id} type="button" onClick={() => { onIrProduto(p.nome); onTermo(""); }} className="flex w-full items-center gap-2 rounded-lg border border-border p-2 text-left hover:bg-muted">
              <Package className="size-4 text-muted-foreground" />
              <span className="font-semibold">{p.nome}</span>
              <span className="ml-auto text-muted-foreground">{brl(p.preco_promocional ?? p.preco)}</span>
            </button>
          ))}
          {clis.map((p: any) => (
            <button key={p.id} type="button" onClick={() => { onIrCliente(p.nome ?? p.telefone ?? ""); onTermo(""); }} className="flex w-full items-center gap-2 rounded-lg border border-border p-2 text-left hover:bg-muted">
              <Users className="size-4 text-muted-foreground" />
              <span className="font-semibold">{p.nome || "Sem nome"}</span>
              <span className="text-muted-foreground">{p.telefone || ""}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function PedidosAdmin({ pedidos, onStatus, onPagamento, foco, onLimparFoco }: { pedidos: any[]; onStatus: (p: any, s: OrderStatus) => void; onPagamento?: (p: any, s: string) => void; foco?: string; onLimparFoco?: () => void }) {
  async function imprimirDireto(p: any) {
    try {
      await impressaoDireta(supabase, p);
      toast.success(`Pedido nº ${p.numero} enviado para a Tanca.`);
    } catch {
      toast.error("Não entrou na fila. Confira em /impressao.");
    }
  }
  const [filtro, setFiltro] = useState("todos");
  const [fEvento, setFEvento] = useState("todos");
  const [soAgendados, setSoAgendados] = useState(false);
  const listaBase = pedidos.filter((p) => (filtro === "todos" ? true : p.status === filtro));
  const listaEvt = fEvento === "todos" ? listaBase : listaBase.filter((p) => (p.tipo_evento ?? "") === (fEvento === "sem_evento" ? "" : fEvento));
  const listaAge = soAgendados ? listaEvt.filter((p) => p.agendado_para && p.status !== "cancelado" && p.status !== "entregue") : listaEvt;
  const lista = foco
    ? listaAge.filter((p) => String(p.numero).includes(foco) || (p.cliente_nome ?? "").toLowerCase().includes(foco.toLowerCase()) || (p.telefone ?? "").includes(foco))
    : listaAge;
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-xl">Gestão de pedidos</h2>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={soAgendados} onChange={(e) => setSoAgendados(e.target.checked)} /> Só agendados
        </label>
        <Select value={fEvento} onValueChange={setFEvento}>
          <SelectTrigger className="ml-auto w-44"><SelectValue placeholder="Evento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os eventos</SelectItem>
            <SelectItem value="sem_evento">Sem evento</SelectItem>
            <SelectItem value="aniversario">Aniversário</SelectItem>
            <SelectItem value="casamento">Casamento</SelectItem>
            <SelectItem value="empresa">Empresa</SelectItem>
            <SelectItem value="festa">Festa</SelectItem>
            <SelectItem value="confraternizacao">Confraternização</SelectItem>
            <SelectItem value="outro">Outro</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {["recebido", "em_producao", "pronto", "aguardando_motoboy", "em_rota", "entregue", "cancelado"].map((v) => (
              <SelectItem key={v} value={v}>{v === "em_producao" ? "Em preparo" : STATUS_LABEL[v]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm" variant="outline" className="ml-auto"
          onClick={() => downloadCSV(`pedidos-${new Date().toISOString().slice(0, 10)}.csv`, lista.slice(0, 500).map((p: any) => ({
            numero: p.numero, data: p.created_at, cliente: p.cliente_nome, telefone: p.telefone,
            endereco: p.endereco, bairro: p.bairro, pagamento: p.forma_pagamento, subtotal: p.subtotal,
            entrega: p.tipo_entrega === "retirada" ? "retirada" : "entrega", taxa_entrega: p.taxa_entrega, desconto: p.desconto, total: p.total, status: p.status, evento: p.tipo_evento,
            itens: ((p.pedido_itens ?? []) as any[]).map((i) => `${i.quantidade}x ${i.nome}`).join(" | "),
          })))}
        >
          Exportar CSV
        </Button>
        {foco ? (
          <Button size="sm" variant="outline" onClick={onLimparFoco}>
            Foco: “{foco}” ✕
          </Button>
        ) : null}
        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="ml-auto w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {["recebido", "em_producao", "pronto", "aguardando_motoboy", "em_rota", "entregue", "cancelado"].map((v) => (
              <SelectItem key={v} value={v}>{v === "em_producao" ? "Em preparo" : STATUS_LABEL[v]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="mt-4 space-y-3">
        {lista.slice(0, 60).map((p) => (
          <article key={p.id} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-display">Nº {p.numero}</span>
              <StatusBadge status={p.status} />
              <span className="text-muted-foreground">{p.cliente_nome} • {p.telefone} • {dataHora(p.created_at)}</span>
              <span className="ml-auto font-display text-primary">{brl(p.total)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{p.endereco} — {p.bairro}{(p as any).cidade ? ` • ${(p as any).cidade}` : ""} {p.complemento ? `(${p.complemento})` : ""} <span className="ml-1 rounded bg-muted px-1.5 py-0.5">{STATUS_EXIBICAO[p.status] ?? p.status}</span>{(p as any).campanha_origem ? <span className="ml-1 rounded bg-muted px-1.5 py-0.5">🔗 {(p as any).campanha_origem}</span> : ""}</p>
            <ul className="mt-1 text-xs">
              {(p.pedido_itens ?? []).map((i: any) => (
                <li key={i.id}>{i.quantidade}x {i.nome}</li>
              ))}
            </ul>
            {p.observacoes && <p className="mt-1 rounded bg-muted p-1.5 text-xs">Obs: {p.observacoes}</p>}
            <NotasAdmin pedidoId={p.id} numero={p.numero} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Select value={p.status} onValueChange={(s) => onStatus(p, s as OrderStatus)}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[...statusFlow(p.tipo_entrega), "cancelado"]
                    .map((v) => (
                      <SelectItem key={v} value={v}>{v === "em_producao" ? "Em preparo" : STATUS_LABEL[v]}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {onPagamento ? (
                <Select value={p.pagamento_status ?? "pendente"} onValueChange={(s) => onPagamento(p, s)}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAGAMENTO_STATUS_LABEL).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => window.open(whatsappLink(p.telefone, mensagemStatus(p.status, p.cliente_nome, p.numero)), "_blank")}>
                <MessageCircle className="mr-1 size-3.5" /> WhatsApp
              </Button>
              <Button size="sm" variant="ghost" onClick={() => imprimirDireto(p)}>
                <Printer className="mr-1 size-3.5" /> Imprimir direto
              </Button>
            </div>
          </article>
        ))}
        {lista.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pedido neste filtro.</p>}
      </div>
    </section>
  );
}

function ProdutosAdmin({ produtos, categorias, onChange, foco, onLimparFoco }: { produtos: any[]; categorias: any[]; onChange: () => void; foco?: string; onLimparFoco?: () => void }) {
  const [editando, setEditando] = useState<any | null>(null);
  const [novo, setNovo] = useState(false);
  const [movDe, setMovDe] = useState<string | null>(null);
  const visiveis = foco
    ? produtos.filter((p: any) => (p.nome ?? "").toLowerCase().includes(foco.toLowerCase()))
    : produtos;

  async function salvar(e: React.FormEvent<HTMLFormElement>, id?: string) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const fullPayload: Record<string, any> = {
      nome: String(f.get("nome")),
      descricao: String(f.get("descricao") ?? ""),
      preco: Number(f.get("preco")),
      preco_promocional: f.get("preco_promocional") ? Number(f.get("preco_promocional")) : null,
      categoria_id: String(f.get("categoria_id")),
      estoque: Number(f.get("estoque") ?? 0),
      estoque_minimo: Number(f.get("estoque_minimo") ?? 0),
      custo: f.get("custo") ? Number(f.get("custo")) : null,
      tempo_fritura_s: f.get("tempo_fritura_s") ? Number(f.get("tempo_fritura_s")) : null,
      disponivel: f.get("disponivel") === "on",
      imagem_url: String(f.get("imagem_url") ?? "") || null,
      tipo_venda: String(f.get("tipo_venda") ?? "combo_50"),
      destaque: f.get("destaque") === "on",
      promo_inicio: String(f.get("promo_inicio") ?? "") || null,
      promo_fim: String(f.get("promo_fim") ?? "") || null,
      promo_ativo: f.get("promo_ativo") === "on",
      descricao_fiscal: String(f.get("descricao_fiscal") ?? "") || null,
      ncm: String(f.get("ncm") ?? "").replace(/\D/g, "") || null,
      cest: String(f.get("cest") ?? "").replace(/\D/g, "") || null,
      cfop_padrao: String(f.get("cfop_padrao") ?? "").replace(/\D/g, "") || null,
      cst: String(f.get("cst") ?? "") || null,
      csosn: String(f.get("csosn") ?? "") || null,
      origem_mercadoria: String(f.get("origem_mercadoria") ?? "") || null,
      gtin: String(f.get("gtin") ?? "").replace(/\D/g, "") || null,
    };
    let { error } = id
      ? await supabase.from("produtos").update(fullPayload).eq("id", id)
      : await supabase.from("produtos").insert(fullPayload);
    if (error && String(error.message ?? "").includes("column")) {
      // Banco ainda sem migrações 0001/0003/0004/0033 — salva campos legados
      const { tipo_venda: _tv, destaque: _d, promo_inicio: _pi, promo_fim: _pf, promo_ativo: _pa, estoque_minimo: _em, custo: _cu, tempo_fritura_s: _tf, descricao_fiscal: _df, ncm: _ncm, cest: _ce, cfop_padrao: _cf, cst: _cs, csosn: _so, origem_mercadoria: _om, gtin: _gt, ...legacy } = fullPayload;
      const retry = id
        ? await supabase.from("produtos").update(legacy).eq("id", id)
        : await supabase.from("produtos").insert(legacy);
      error = retry.error;
      if (!error) toast.error("Salvo sem campos novos — rode as migrações no Supabase.");
    }
    if (error) toast.error("Erro ao salvar produto.");
    else {
      toast.success("Produto salvo!");
      void logAdmin(id ? "produto_alterado" : "produto_criado", String(fullPayload["nome"]));
      setEditando(null);
      setNovo(false);
      onChange();
    }
  }

  async function excluir(id: string, nome: string) {
    if (!confirm("Excluir este produto?")) return;
    const { error } = await supabase.from("produtos").delete().eq("id", id);
    if (error) toast.error("Não foi possível excluir.");
    else {
      toast.success("Produto excluído.");
      void logAdmin("produto_excluido", nome);
      onChange();
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-xl">Produtos ({produtos.length})</h2>
        {foco ? (
          <Button size="sm" variant="outline" onClick={onLimparFoco}>
            Foco: “{foco}” ✕
          </Button>
        ) : null}
        <Button
          size="sm" variant="outline"
          onClick={() => downloadCSV(`produtos-${new Date().toISOString().slice(0, 10)}.csv`, visiveis.map((p: any) => ({
            nome: p.nome, categoria: p.categorias?.nome, preco: p.preco, promo: p.preco_promocional,
            tipo: p.tipo_venda, estoque: p.estoque, minimo: p.estoque_minimo, disponivel: p.disponivel,
          })))}
        >
          CSV
        </Button>
        <Button size="sm" className="ml-auto" onClick={() => { setNovo(true); setEditando(null); }}>
          <Plus className="mr-1 size-4" /> Novo
        </Button>
      </div>

      {(novo || editando) && (
        <form onSubmit={(e) => salvar(e, editando?.id)} className="mt-4 grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
          <div className="space-y-1"><Label>Nome</Label><Input name="nome" defaultValue={editando?.nome ?? ""} required /></div>
          <div className="space-y-1"><Label>Categoria</Label>
            <select name="categoria_id" defaultValue={editando?.categoria_id ?? categorias[0]?.id} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2"><Label>Descrição</Label><Textarea name="descricao" defaultValue={editando?.descricao ?? ""} /></div>
          <div className="space-y-1"><Label>Preço</Label><Input name="preco" type="number" step="0.01" defaultValue={editando?.preco ?? ""} required /></div>
          <div className="space-y-1"><Label>Preço promocional (opcional)</Label><Input name="preco_promocional" type="number" step="0.01" defaultValue={editando?.preco_promocional ?? ""} /></div>
          <div className="space-y-1"><Label>Tipo de venda</Label>
            <select name="tipo_venda" defaultValue={editando?.tipo_venda ?? "combo_50"} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="combo_50">Combo de 50 (múltiplos de 50)</option>
              <option value="unidade">Venda por unidade</option>
            </select>
          </div>
          <div className="space-y-1"><Label>Promo início (opcional)</Label><Input name="promo_inicio" type="datetime-local" defaultValue={editando?.promo_inicio ? String(editando.promo_inicio).slice(0, 16) : ""} /></div>
          <div className="space-y-1"><Label>Promo fim (opcional)</Label><Input name="promo_fim" type="datetime-local" defaultValue={editando?.promo_fim ? String(editando.promo_fim).slice(0, 16) : ""} /></div>
          <div className="space-y-1"><Label>Estoque</Label><Input name="estoque" type="number" defaultValue={editando?.estoque ?? 100} /></div>
          <div className="space-y-1"><Label>Estoque mínimo (alerta)</Label><Input name="estoque_minimo" type="number" defaultValue={editando?.estoque_minimo ?? 0} /></div>
          <div className="space-y-1"><Label>Custo (margem estimada, opcional)</Label><Input name="custo" type="number" step="0.01" defaultValue={editando?.custo ?? ""} /></div>
          <div className="space-y-1"><Label>Fritura 50un em seg (padrão 210)</Label><Input name="tempo_fritura_s" type="number" min={0} placeholder="210" defaultValue={editando?.tempo_fritura_s ?? ""} /></div>
          <div className="space-y-1"><Label>Imagem URL (opcional)</Label><Input name="imagem_url" defaultValue={editando?.imagem_url ?? ""} /></div>
          <details className="sm:col-span-2 rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-sm font-semibold">Dados fiscais (contador) — sem NCM a NF-e bloqueia</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2"><Label>Descrição fiscal (opcional)</Label><Input name="descricao_fiscal" defaultValue={editando?.descricao_fiscal ?? ""} /></div>
              <div className="space-y-1"><Label>NCM *</Label><Input name="ncm" inputMode="numeric" maxLength={8} defaultValue={editando?.ncm ?? ""} placeholder="Ex: 19059090" /></div>
              <div className="space-y-1"><Label>CEST (opcional)</Label><Input name="cest" inputMode="numeric" defaultValue={editando?.cest ?? ""} /></div>
              <div className="space-y-1"><Label>CFOP padrão *</Label><Input name="cfop_padrao" inputMode="numeric" maxLength={4} defaultValue={editando?.cfop_padrao ?? ""} placeholder="Ex: 5102" /></div>
              <div className="space-y-1"><Label>Origem *</Label>
                <select name="origem_mercadoria" defaultValue={editando?.origem_mercadoria ?? ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">—</option>
                  <option value="0">0 - Nacional</option>
                  <option value="1">1 - Importada direta</option>
                  <option value="2">2 - Importada no mercado interno</option>
                </select>
              </div>
              <div className="space-y-1"><Label>CST (lucro real/presumido)</Label><Input name="cst" inputMode="numeric" maxLength={2} defaultValue={editando?.cst ?? ""} placeholder="Ex: 00" /></div>
              <div className="space-y-1"><Label>CSOSN (Simples Nacional)</Label><Input name="csosn" inputMode="numeric" maxLength={3} defaultValue={editando?.csosn ?? ""} placeholder="Ex: 102" /></div>
              <div className="space-y-1 sm:col-span-2"><Label>GTIN/EAN (opcional)</Label><Input name="gtin" inputMode="numeric" defaultValue={editando?.gtin ?? ""} /></div>
            </div>
          </details>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="disponivel" defaultChecked={editando?.disponivel ?? true} /> Disponível</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="destaque" defaultChecked={editando?.destaque ?? false} /> ⭐ Destaque (Mais pedidos)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="promo_ativo" defaultChecked={editando?.promo_ativo ?? true} /> Promo ativa</label>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit">Salvar</Button>
            <Button type="button" variant="outline" onClick={() => { setNovo(false); setEditando(null); }}>Cancelar</Button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {visiveis.map((p) => {
          const baixo = Number(p.estoque_minimo ?? 0) > 0 && Number(p.estoque ?? 0) < Number(p.estoque_minimo);
          return (
          <div key={p.id}>
          <div className={cn("flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm", !p.disponivel && "opacity-60")}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{p.nome} <span className="text-xs text-muted-foreground">• {p.categorias?.nome} • {p.tipo_venda === "unidade" ? "Unidade" : "Combo 50"}{p.destaque ? " • ⭐" : ""}{p.ncm ? "" : " • ⚠️ sem NCM"}</span></p>
              <p className="text-xs text-muted-foreground">{brl(p.preco_promocional ?? p.preco)} • Estoque: {p.estoque}{baixo ? " ⚠️ abaixo do mínimo" : ""} {p.preco_promocional ? "• PROMO" : ""}</p>
            </div>
            <Switch checked={p.disponivel} onCheckedChange={async (v) => {
              await supabase.from("produtos").update({ disponivel: v }).eq("id", p.id);
              onChange();
            }} />
            <Button size="sm" variant="outline" onClick={() => setMovDe(movDe === p.id ? null : p.id)}>Estoque</Button>
            <Button size="icon" variant="outline" onClick={() => { setEditando(p); setNovo(false); }}><Pencil className="size-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => excluir(p.id, p.nome)}><Trash2 className="size-4" /></Button>
          </div>
          {movDe === p.id ? <MovEstoque produto={p} onChange={() => { setMovDe(null); onChange(); }} /> : null}
          </div>
          );
        })}
      </div>
    </section>
  );
}

function MovEstoque({ produto, onChange }: { produto: any; onChange: () => void }) {
  const [tipo, setTipo] = useState<TipoMov>("entrada");
  const [qtd, setQtd] = useState(1);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const { data: movs } = useQuery({
    queryKey: ["estoque-mov", produto.id],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("estoque_mov").select("*").eq("produto_id", produto.id).order("created_at", { ascending: false }).limit(10);
        if (error) throw error;
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });

  async function salvar() {
    const r = novoEstoque(Number(produto.estoque ?? 0), tipo, qtd);
    if (!r.ok) {
      toast.error(r.motivo);
      return;
    }
    setEnviando(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error: e1 } = await supabase.from("estoque_mov").insert({
        produto_id: produto.id, tipo, quantidade: Math.floor(Number(qtd)), motivo: motivo.slice(0, 200), created_by: u.user?.id ?? null,
      });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("produtos").update({ estoque: r.valor }).eq("id", produto.id);
      if (e2) throw e2;
      toast.success(`Estoque: ${produto.estoque} → ${r.valor}`);
      void logAdmin("estoque_mov", `${produto.nome} ${tipo} ${qtd} → ${r.valor}`);
      onChange();
    } catch {
      toast.error("Não foi possível salvar. Rode a migração 0003 no Supabase.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-border p-3 text-sm">
      <p className="font-semibold">Movimentar estoque (atual: {produto.estoque})</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-4">
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoMov)} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm">
          <option value="entrada">Entrada</option>
          <option value="saida">Saída</option>
          <option value="ajuste">Ajuste (+)</option>
          <option value="perda">Perda</option>
          <option value="producao">Produção</option>
        </select>
        <Input type="number" min={1} value={qtd} onChange={(e) => setQtd(Number(e.target.value))} aria-label="Quantidade" />
        <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo" maxLength={200} className="sm:col-span-2" />
      </div>
      <Button size="sm" className="mt-2" disabled={enviando} onClick={salvar}>Registrar</Button>
      {(movs ?? []).length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {(movs ?? []).map((m: any) => (
            <li key={m.id}>{new Date(m.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} • {m.tipo} • {m.quantidade}{m.motivo ? ` • ${m.motivo}` : ""}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CategoriasAdmin({ categorias, onChange }: { categorias: any[]; onChange: () => void }) {
  const [nome, setNome] = useState("");
  async function criar() {
    if (!nome.trim()) return;
    const slug = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-");
    const { error } = await supabase.from("categorias").insert({ nome: nome.trim(), slug, ordem: categorias.length + 1 });
    if (error) toast.error("Erro ao criar categoria.");
    else {
      toast.success("Categoria criada!");
      setNome("");
      onChange();
    }
  }
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-display text-xl">Categorias</h2>
      <div className="mt-3 flex gap-2">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nova categoria (ex: Porções)" />
        <Button onClick={criar}>Adicionar</Button>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {categorias.map((c) => (
          <li key={c.id} className="flex items-center gap-2 rounded-lg border border-border p-2.5">
            <span className="flex-1">{c.nome} <span className="text-xs text-muted-foreground">/{c.slug}</span></span>
            <Switch checked={c.ativo} onCheckedChange={async (v) => {
              await supabase.from("categorias").update({ ativo: v }).eq("id", c.id);
              onChange();
            }} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ClientesAdmin({ profiles, pedidos, foco, onLimparFoco }: { profiles: any[]; pedidos: any[]; foco?: string; onLimparFoco?: () => void }) {
  const [busca, setBusca] = useState(foco ?? "");
  const agreg = useMemo(() => {
    const map = new Map<string, { pedidos: any[]; total: number }>();
    for (const p of pedidos) {
      const key = (p as any).user_id ?? (p as any).telefone;
      const cur = map.get(key) ?? { pedidos: [], total: 0 };
      cur.pedidos.push(p);
      if ((p as any).status !== "cancelado") cur.total += Number((p as any).total);
      map.set(key, cur);
    }
    return map;
  }, [pedidos]);

  const lista = profiles.filter((pr) =>
    busca ? (pr.nome ?? "").toLowerCase().includes(busca.toLowerCase()) || (pr.telefone ?? "").includes(busca) : true,
  );

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-xl">Clientes ({profiles.length})</h2>
        {foco ? (
          <Button size="sm" variant="outline" onClick={() => { setBusca(""); onLimparFoco?.(); }}>
            Foco: “{foco}” ✕
          </Button>
        ) : null}
      </div>
      <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou telefone..." className="mt-3 max-w-sm" />
      <div className="mt-3 space-y-2">
        {lista.slice(0, 50).map((pr) => {
          const ag = agreg.get(pr.id);
          return (
            <details key={pr.id} className="rounded-lg border border-border p-3 text-sm">
              <summary className="cursor-pointer font-semibold">
                {pr.nome || "Sem nome"} • {pr.telefone || "—"}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {ag?.pedidos.length ?? 0} pedidos • {brl(ag?.total ?? 0)} • {pr.pontos ?? 0} pts fidelidade
                </span>
              </summary>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {(ag?.pedidos ?? []).slice(0, 5).map((p: any) => (
                  <p key={p.id}>Nº {p.numero} — {dataHora(p.created_at)} — {STATUS_LABEL[p.status]} — {brl(p.total)} — {p.endereco}, {p.bairro}</p>
                ))}
                {!(ag?.pedidos?.length) && <p>Sem pedidos ainda.</p>}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function CuponsAdmin({ cupons, produtos, onChange }: { cupons: any[]; produtos: any[]; onChange: () => void }) {
  const [expandir, setExpandir] = useState(false);
  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const part: string[] = [];
    for (const p of produtos) {
      if (f.get(`prod_${p.id}`) === "on") part.push(p.id);
    }
    const payload: Record<string, any> = {
      codigo: String(f.get("codigo")).toUpperCase().trim(),
      tipo: String(f.get("tipo")),
      valor: Number(f.get("valor")),
      minimo: Number(f.get("minimo") ?? 0),
      ativo: true,
      cliente_telefone: String(f.get("cliente_telefone") ?? "").replace(/\D/g, ""),
      validade_ini: String(f.get("validade_ini") ?? "") || null,
      validade_fim: String(f.get("validade_fim") ?? "") || null,
      max_usos: Number(f.get("max_usos") ?? 0),
      produtos_ids: part,
    };
    let { error } = await supabase.from("cupons").insert(payload);
    if (error && String(error.message ?? "").includes("column")) {
      const { cliente_telefone: _t, validade_ini: _i, validade_fim: _f2, max_usos: _m, produtos_ids: _p, ...legacy } = payload;
      const retry = await supabase.from("cupons").insert(legacy);
      error = retry.error;
      if (!error) toast.error("Criado sem personalização — rode a migração 0006 no Supabase.");
    }
    if (error) toast.error("Erro ao criar cupom (código duplicado?).");
    else {
      toast.success("Cupom criado!");
      void logAdmin("cupom_criado", String(payload["codigo"]));
      (e.target as HTMLFormElement).reset();
      setExpandir(false);
      onChange();
    }
  }
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-xl">Cupons</h2>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => setExpandir((v) => !v)}>
          {expandir ? "− Simples" : "+ Personalizado"}
        </Button>
      </div>
      <form onSubmit={salvar} className="mt-3 grid gap-2 sm:grid-cols-5">
        <Input name="codigo" placeholder="CÓDIGO" required maxLength={20} />
        <select name="tipo" className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="percentual">Percentual %</option>
          <option value="valor">Valor R$</option>
        </select>
        <Input name="valor" type="number" step="0.01" placeholder="Valor" required />
        <Input name="minimo" type="number" step="0.01" placeholder="Mínimo" defaultValue={0} />
        <Button type="submit">Criar</Button>
        {expandir ? (
          <>
            <div className="space-y-1"><Label>Cliente específico (telefone)</Label><Input name="cliente_telefone" placeholder="Só este telefone (opcional)" /></div>
            <div className="space-y-1"><Label>Válido de</Label><Input name="validade_ini" type="datetime-local" /></div>
            <div className="space-y-1"><Label>Válido até</Label><Input name="validade_fim" type="datetime-local" /></div>
            <div className="space-y-1"><Label>Limite de usos (0=ilimitado)</Label><Input name="max_usos" type="number" min={0} defaultValue={0} /></div>
            <details className="sm:col-span-5 rounded-md border border-border p-2">
              <summary className="cursor-pointer text-sm">Produtos participantes (vazio = todos)</summary>
              <div className="mt-2 grid max-h-40 gap-1 overflow-y-auto sm:grid-cols-2">
                {produtos.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" name={`prod_${p.id}`} /> {p.nome}
                  </label>
                ))}
              </div>
            </details>
          </>
        ) : null}
      </form>
      <ul className="mt-3 space-y-1.5 text-sm">
        {cupons.map((c) => (
          <li key={c.id} className="flex items-center gap-2 rounded-lg border border-border p-2.5">
            <Badge>{c.codigo}</Badge>
            <span className="text-muted-foreground">
              {c.tipo === "percentual" ? `${c.valor}%` : brl(c.valor)} • mín. {brl(c.minimo)}
              {c.cliente_telefone ? ` • 👤 ${c.cliente_telefone}` : ""}
              {c.validade_fim ? ` • até ${new Date(c.validade_fim).toLocaleDateString("pt-BR")}` : ""}
              {Number(c.max_usos ?? 0) > 0 ? ` • máx. ${c.max_usos} usos` : ""}
              {Array.isArray(c.produtos_ids) && c.produtos_ids.length > 0 ? ` • ${c.produtos_ids.length} produto(s)` : ""}
            </span>
            <Switch className="ml-auto" checked={c.ativo} onCheckedChange={async (v) => {
              await supabase.from("cupons").update({ ativo: v }).eq("id", c.id);
              onChange();
            }} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function MetasAdmin({ pedidos, onChange }: { pedidos: any[]; onChange: () => void }) {
  const { data: metas } = useQuery({
    queryKey: ["admin-metas"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("metas").select("*").order("periodo_ref", { ascending: false }).limit(24);
        if (error) throw error;
        return data ?? [];
      } catch {
        return [];
      }
    },
  });

  function intervaloMeta(m: any): { ini: Date; fim: Date; diasTotais: number } {
    const hoje = new Date();
    if (m.tipo === "diaria") {
      const ini = new Date(`${m.periodo_ref}T00:00:00`);
      const fim = new Date(`${m.periodo_ref}T23:59:59`);
      return { ini, fim, diasTotais: 1 };
    }
    if (m.tipo === "semanal") {
      const ini = new Date(`${m.periodo_ref}T00:00:00`);
      const fim = new Date(ini.getTime() + 6 * 86400000);
      fim.setHours(23, 59, 59, 999);
      return { ini, fim, diasTotais: 7 };
    }
    const [y, mo] = String(m.periodo_ref).split("-").map(Number);
    const ini = new Date(y || hoje.getFullYear(), (mo || hoje.getMonth() + 1) - 1, 1);
    const fim = new Date(ini.getFullYear(), ini.getMonth() + 1, 0, 23, 59, 59, 999);
    return { ini, fim, diasTotais: fim.getDate() };
  }

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const tipo = String(f.get("tipo"));
    let periodo_ref = String(f.get("periodo_ref") ?? "").trim();
    if (tipo === "mensal" && /^\d{4}-\d{2}$/.test(periodo_ref) === false) {
      toast.error("Para meta mensal use o formato AAAA-MM.");
      return;
    }
    if ((tipo === "diaria" || tipo === "semanal") && /^\d{4}-\d{2}-\d{2}$/.test(periodo_ref) === false) {
      toast.error("Use o formato AAAA-MM-DD (semanal = dia inicial).");
      return;
    }
    const { error } = await supabase.from("metas").upsert(
      { tipo, periodo_ref, valor: Number(f.get("valor") ?? 0) },
      { onConflict: "tipo,periodo_ref" },
    );
    if (error) {
      toast.error("Não foi possível salvar. Rode a migração 0006 no Supabase.");
      return;
    }
    toast.success("Meta salva!");
    void logAdmin("meta_salva", `${tipo} ${periodo_ref}`);
    (e.target as HTMLFormElement).reset();
    onChange();
  }

  const agora = new Date();
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-display text-xl">Metas de vendas</h2>
      <form onSubmit={salvar} className="mt-3 grid gap-2 sm:grid-cols-4">
        <select name="tipo" className="rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue="mensal">
          <option value="diaria">Diária</option>
          <option value="semanal">Semanal</option>
          <option value="mensal">Mensal</option>
        </select>
        <Input name="periodo_ref" placeholder="AAAA-MM ou AAAA-MM-DD" required maxLength={10} />
        <Input name="valor" type="number" step="0.01" min={0} placeholder="Valor R$" required />
        <Button type="submit">Salvar meta</Button>
      </form>
      <ul className="mt-3 space-y-2 text-sm">
        {(metas ?? []).map((m: any) => {
          const { ini, fim, diasTotais } = intervaloMeta(m);
          const validos = pedidos.filter((p: any) => p.status !== "cancelado" && noIntervalo(p.created_at, ini, fim));
          const vendido = validos.reduce((a: number, p: any) => a + Number(p.total ?? 0), 0);
          const meta = Number(m.valor ?? 0);
          const pct = meta > 0 ? Math.min(100, (vendido / meta) * 100) : 0;
          const fimEfetivo = fim > agora ? agora : fim;
          const diasPassados = Math.max(1, Math.ceil((fimEfetivo.getTime() - ini.getTime()) / 86400000));
          const diasRestantes = Math.max(0, diasTotais - diasPassados);
          const restante = Math.max(0, meta - vendido);
          const mediaNecessaria = diasRestantes > 0 && restante > 0 ? restante / diasRestantes : 0;
          return (
            <li key={m.id} className="rounded-lg border border-border p-3">
              <div className="flex justify-between gap-2">
                <span className="font-semibold capitalize">{m.tipo} • {m.periodo_ref}</span>
                <span>{brl(vendido)} de {brl(meta)} ({pct.toFixed(1)}%)</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Restam {brl(restante)}{diasRestantes > 0 ? ` • média diária necessária: ${brl(mediaNecessaria)}` : " • período encerrado"}
              </p>
            </li>
          );
        })}
        {(metas ?? []).length === 0 ? <li className="text-muted-foreground">Nenhuma meta cadastrada. Sem previsões — só dados reais após cadastrar.</li> : null}
      </ul>
    </section>
  );
}

function FinanceiroAdmin({ pedidos }: { pedidos: any[] }) {
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const queryClient = useQueryClient();
  const { data: despesas, refetch } = useQuery({
    queryKey: ["admin-despesas", mes],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("despesas").select("*").gte("data", `${mes}-01`).lt("data", `${mes}-31`).order("data", { ascending: false });
        if (error) throw error;
        return data ?? [];
      } catch {
        return [];
      }
    },
  });

  const validos = pedidos.filter((p: any) => p.status !== "cancelado" && String(p.created_at ?? "").slice(0, 7) === mes);
  const fat = validos.reduce((a: number, p: any) => a + Number(p.total ?? 0), 0);
  const porPag: Record<string, number> = {};
  let taxas = 0;
  let descontos = 0;
  for (const p of validos) {
    porPag[p.forma_pagamento] = (porPag[p.forma_pagamento] ?? 0) + Number(p.total ?? 0);
    taxas += Number(p.taxa_entrega ?? 0);
    descontos += Number(p.desconto ?? 0);
  }
  const despTotal = ((despesas ?? []) as any[]).reduce((a: number, d: any) => a + Number(d.valor ?? 0), 0);
  const resultado = fat - despTotal;

  async function salvarDespesa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("despesas").insert({
      data: String(f.get("data") ?? mes + "-01"),
      descricao: String(f.get("descricao") ?? ""),
      valor: Number(f.get("valor") ?? 0),
      created_by: u.user?.id ?? null,
    });
    if (error) {
      toast.error("Não foi possível salvar. Rode a migração 0003 no Supabase.");
      return;
    }
    toast.success("Despesa registrada!");
    void logAdmin("despesa_criada", `${f.get("descricao")} ${f.get("valor")}`);
    (e.target as HTMLFormElement).reset();
    refetch();
  }

  async function excluirDespesa(id: string) {
    if (!confirm("Excluir esta despesa?")) return;
    const { error } = await supabase.from("despesas").delete().eq("id", id);
    if (error) toast.error("Não foi possível excluir.");
    else {
      toast.success("Despesa excluída.");
      refetch();
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-xl">Fechamento — {mes}</h2>
          <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="ml-auto w-44" aria-label="Mês" />
        </div>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <p className="flex justify-between rounded-lg bg-muted p-2.5"><span>Faturamento ({validos.length} pedidos)</span><strong>{brl(fat)}</strong></p>
          <p className="flex justify-between rounded-lg bg-muted p-2.5"><span>Taxas de entrega</span><strong>{brl(taxas)}</strong></p>
          <p className="flex justify-between rounded-lg bg-muted p-2.5"><span>Descontos</span><strong>-{brl(descontos)}</strong></p>
          <p className="flex justify-between rounded-lg bg-muted p-2.5"><span>Despesas</span><strong>-{brl(despTotal)}</strong></p>
        </div>
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-4">
          {(["pix", "dinheiro", "credito", "debito"] as const).map((pg) => (
            <p key={pg} className="flex justify-between rounded-lg border border-border p-2.5"><span>{PAGAMENTO_LABEL[pg]}</span><strong>{brl(porPag[pg] ?? 0)}</strong></p>
          ))}
        </div>
        <p className="mt-3 rounded-xl border border-primary/40 p-3 font-display text-lg">
          Resultado operacional estimado: <span className="text-primary">{brl(resultado)}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Faturamento menos despesas registradas. Não é lucro líquido (não inclui todos os custos).</p>
      </section>
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-xl">Despesas</h2>
        <form onSubmit={salvarDespesa} className="mt-3 grid gap-2 sm:grid-cols-4">
          <Input name="data" type="date" defaultValue={`${mes}-01`} required />
          <Input name="descricao" placeholder="Descrição" required maxLength={120} className="sm:col-span-2" />
          <div className="flex gap-2">
            <Input name="valor" type="number" step="0.01" min={0} placeholder="Valor" required />
            <Button type="submit">Add</Button>
          </div>
        </form>
        <ul className="mt-3 space-y-1.5 text-sm">
          {((despesas ?? []) as any[]).map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded-lg border border-border p-2.5">
              <span className="text-muted-foreground">{new Date(`${d.data}T12:00:00`).toLocaleDateString("pt-BR")}</span>
              <span className="flex-1">{d.descricao}</span>
              <span className="font-semibold">{brl(d.valor)}</span>
              <Button size="icon" variant="ghost" onClick={() => excluirDespesa(d.id)}><Trash2 className="size-4" /></Button>
            </li>
          ))}
          {(despesas ?? []).length === 0 ? <li className="text-muted-foreground">Nenhuma despesa no mês.</li> : null}
        </ul>
      </section>
    </div>
  );
}

function ImpressaoAdmin() {
  const { user } = useSession();
  const { data: roles } = useRoles(user?.id);
  const queryClient = useQueryClient();
  const isAdmin = roles?.includes("admin");
  const { data: fila } = useQuery({
    queryKey: ["fila-impressao"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("fila_impressao").select("*").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: pedidos } = useQuery({
    queryKey: ["admin-pedidos-impressao"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("pedidos").select("id, numero, status, impresso, created_at").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function testar() {
    const uuid = `teste:${Date.now()}`;
    const { error } = await supabase.from("fila_impressao").insert({
      trabalho_uuid: uuid,
      tipo: "teste",
      payload: `NÉIA SALGADOS\nTESTE DE IMPRESSÃO\nTANCA TP-550\n${new Date().toLocaleString("pt-BR")}\n\nSistema OK ✅`,
      impressora: "Tanca TP-550",
    });
    if (error) {
      toast.error("Erro ao enviar teste. Rode o PASSO-11 no Supabase.");
    } else {
      toast.success("Teste enviado. O agente imprime em segundos.");
      queryClient.invalidateQueries({ queryKey: ["fila-impressao"] });
    }
  }

  async function reimprimir(job: { id: string; payload: string; pedido_id: string | null; reimpressoes: number }) {
    try {
      await supabase.from("fila_impressao").insert({
        trabalho_uuid: `reimp:${job.id}:${Date.now()}`,
        pedido_id: job.pedido_id,
        tipo: "pedido",
        payload: job.payload,
        impressora: "Tanca TP-550",
        motivo_reimpressao: "manual",
      });
      await supabase.from("fila_impressao").update({ reimpressoes: (job.reimpressoes ?? 0) + 1 }).eq("id", job.id);
      toast.success("Reimpressão na fila.");
      queryClient.invalidateQueries({ queryKey: ["fila-impressao"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao reimprimir");
    }
  }

  async function cancelarJob(job: { id: string }) {
    if (!window.confirm("Cancelar este trabalho de impressão?")) return;
    try {
      await supabase.from("fila_impressao").update({ status: "cancelado", updated_at: new Date().toISOString() }).eq("id", job.id);
      toast.success("Trabalho cancelado.");
      queryClient.invalidateQueries({ queryKey: ["fila-impressao"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    }
  }

  if (!isAdmin) return <p className="p-10 text-center text-muted-foreground">Acesso restrito ao administrador.</p>;

  const trabalhos = ((fila ?? []) as any[]);
  const pendentes = trabalhos.filter((j) => j.status === "pendente" || j.status === "enviando");
  const maisAntigo = pendentes.reduce<number | null>((acc, j) => {
    const t = +new Date(j.created_at);
    return acc == null || t < acc ? t : acc;
  }, null);
  const idadeMin = maisAntigo == null ? 0 : Math.round((Date.now() - maisAntigo) / 60000);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <h1 className="font-display text-3xl">Fila de Impressão</h1>
      <p className="mt-1 text-sm text-muted-foreground">Tanca TP-550 via agente Windows. Anti-duplicidade por uuid.</p>
      {pendentes.length > 0 && idadeMin >= 3 ? (
        <p className="mt-2 rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">
          ⚠️ {pendentes.length} trabalho(s) parado(s) há {idadeMin} min. O agente pode estar offline (notebook desligado?). A fila é mantida — nada será perdido nem duplicado.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 mt-4">
        <Button onClick={testar} className="mt-4">🖨️ Testar Impressora</Button>
      </div>
      <div className="mt-6 space-y-2">
        {trabalhos.map((j: { id: string; trabalho_uuid: string; status: string; tentativa: number; payload: string; pedido_id: string | null; reimpressoes: number; ultimo_erro?: string | null }) => (
          <div key={j.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 text-sm">
            <div className="min-w-0">
              <div className="truncate font-mono text-xs" title={j.trabalho_uuid}>{j.trabalho_uuid}</div>
              <div className="text-muted-foreground">{j.status} • tentativas {j.tentativa} • reimp {j.reimpressoes}</div>
              {j.status === "erro" && j.ultimo_erro ? <div className="mt-1 break-all text-xs text-destructive">{j.ultimo_erro}</div> : null}
            </div>
            <div className="flex shrink-0 gap-1">
              {j.status === "erro" ? <Button variant="outline" size="sm" onClick={() => { /* tentar novamente - implementar se necessário */ }}>↻ Tentar</Button> : null}
              {(j.status === "pendente" || j.status === "erro") ? <Button variant="ghost" size="sm" onClick={() => cancelarJob(j)}>✕</Button> : null}
              <Button variant="outline" size="sm" onClick={() => reimprimir(j)}>🔁 Reimprimir</Button>
            </div>
          </div>
        ))}
        {trabalhos.length === 0 ? <p className="text-sm text-muted-foreground">Fila vazia.</p> : null}
      </div>
    </div>
  );
}

const PAPEIS: Role[] = ["admin", "atendente", "producao", "motoboy", "financeiro", "cliente"];

function UsuariosAdmin({ profiles, roles, meuId, onChange }: { profiles: any[]; roles: { user_id: string; role: string }[]; meuId: string | undefined; onChange: () => void }) {
  const [busca, setBusca] = useState("");
  const porUsuario = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of roles) {
      const arr = m.get(r.user_id) ?? [];
      arr.push(r.role);
      m.set(r.user_id, arr);
    }
    return m;
  }, [roles]);
  const admins = roles.filter((r) => r.role === "admin").map((r) => r.user_id);

  async function alternar(userId: string, role: Role, tem: boolean) {
    if (tem && role === "admin" && userId === meuId) {
      toast.error("Você não pode remover seu próprio papel de admin.");
      return;
    }
    if (tem && role === "admin" && admins.length <= 1) {
      toast.error("Não é possível remover o último admin.");
      return;
    }
    if (!tem && role === "admin" && !confirm("Tornar este usuário administrador?")) return;
    const { error } = tem
      ? await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role)
      : await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) {
      toast.error("Sem permissão. Rode a migração 0011 no Supabase.");
      return;
    }
    toast.success(tem ? `Papel ${role} removido.` : `Papel ${role} atribuído.`);
    void logAdmin(tem ? "papel_removido" : "papel_atribuido", `${role} → ${userId.slice(0, 8)}`);
    onChange();
  }

  const lista = profiles.filter((p) => {
    const t = busca.trim().toLowerCase();
    if (!t) return true;
    return (p.nome ?? "").toLowerCase().includes(t) || (p.telefone ?? "").includes(t);
  });

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-display text-xl">Usuários e papéis ({profiles.length})</h2>
      <p className="text-xs text-muted-foreground">Somente admin. Papéis controlam RLS no backend, não só menus.</p>
      <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou telefone…" className="mt-3 max-w-sm" />
      <ul className="mt-3 space-y-2">
        {lista.slice(0, 60).map((p) => {
          const meus = porUsuario.get(p.id) ?? [];
          return (
            <li key={p.id} className="rounded-lg border border-border p-3 text-sm">
              <p className="font-semibold">{p.nome || "Sem nome"} <span className="font-normal text-muted-foreground">• {p.telefone || "—"}</span></p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PAPEIS.map((r) => {
                  const tem = meus.includes(r);
                  return (
                    <button
                      key={r} type="button"
                      onClick={() => alternar(p.id, r, tem)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${tem ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
                      aria-pressed={tem}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LogsAdmin({ profiles }: { profiles: any[] }) {
  const { data: logs } = useQuery({
    queryKey: ["admin-logs"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("admin_logs").select("*").order("created_at", { ascending: false }).limit(200);
        if (error) throw error;
        return data ?? [];
      } catch {
        return [];
      }
    },
  });
  const nomes = useMemo(() => new Map(profiles.map((p: any) => [p.id, p.nome || p.telefone || p.id.slice(0, 8)])), [profiles]);
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-display text-xl">Logs de auditoria</h2>
      <p className="text-xs text-muted-foreground">Quem fez o quê e quando (status, produtos, cupons, metas, despesas, notas, papéis).</p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {((logs ?? []) as any[]).map((l) => (
          <li key={l.id} className="flex flex-wrap gap-2 rounded-lg border border-border p-2.5">
            <span className="font-semibold">{l.acao}</span>
            <span className="text-muted-foreground">{l.detalhe}</span>
            <span className="ml-auto text-xs text-muted-foreground">{l.actor ? nomes.get(l.actor) ?? l.actor.slice(0, 8) : "sistema"} • {dataHora(l.created_at)}</span>
          </li>
        ))}
        {(logs ?? []).length === 0 ? <li className="text-muted-foreground">Sem logs. Rode a migração 0003 no Supabase.</li> : null}
      </ul>
    </section>
  );
}

function ComercialAdmin({ pedidos, clientes }: { pedidos: any[]; clientes: CustomerStats[] }) {
  const validos = useMemo(() => (pedidos ?? []).filter((p: any) => p.status !== "cancelado"), [pedidos]);
  const ticket = validos.length ? validos.reduce((a: number, p: any) => a + Number(p.total ?? 0), 0) / validos.length : 0;

  // Agrupa por telefone p/ novos / recorrentes / reativados (base: pedidos carregados)
  const grupos = useMemo(() => {
    type Grupo = { datas: number[]; total: number; nome: string };
    const m = new Map<string, Grupo>();
    for (const p of validos) {
      const tel = normalizarTelefone(p.telefone);
      if (!tel) continue;
      const cur: Grupo = m.get(tel) ?? { datas: [], total: 0, nome: p.cliente_nome };
      cur.datas.push(+new Date(p.created_at));
      cur.total += Number(p.total ?? 0);
      m.set(tel, cur);
    }
    const agora = Date.now();
    let novos = 0;
    let recorrentes = 0;
    let reativados = 0;
    for (const g of m.values()) {
      g.datas.sort((a, b) => a - b);
      const primeiro = g.datas[0]!;
      const ultimo = g.datas[g.datas.length - 1]!;
      if (agora - primeiro < 30 * 86400000 && g.datas.length === 1) novos++;
      if (g.datas.length >= 2) recorrentes++;
      if (g.datas.length >= 2 && agora - ultimo < 30 * 86400000) {
        const anterior = g.datas[g.datas.length - 2]!;
        if (ultimo - anterior > 60 * 86400000) reativados++;
      }
    }
    return { novos, recorrentes, reativados };
  }, [validos]);

  const empresas = clientes.filter((c) => c.tipo_cliente === "PJ").length;
  const fatEmpresas = clientes.filter((c) => c.tipo_cliente === "PJ").reduce((a, c) => a + c.total_gasto, 0);

  const { data: orcamentos } = useQuery({
    queryKey: ["comercial-orcamentos"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("orcamentos").select("status, total").limit(500);
        if (error) throw error;
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });
  const orcPorStatus = useMemo(() => {
    const m = new Map<string, { qtd: number; total: number }>();
    for (const o of orcamentos ?? []) {
      const cur = m.get(o.status) ?? { qtd: 0, total: 0 };
      cur.qtd += 1;
      cur.total += Number(o.total ?? 0);
      m.set(o.status, cur);
    }
    return [...m.entries()];
  }, [orcamentos]);

  const { data: campanhasInfo } = useQuery({
    queryKey: ["comercial-campanhas"],
    queryFn: async () => {
      try {
        const { data: camps } = await supabase.from("crm_campaigns").select("id").limit(100);
        const { data: recs } = await supabase.from("crm_recipients").select("campaign_id, sent_at").limit(5000);
        const { data: peds } = await supabase.from("pedidos").select("campanha_origem, total").neq("campanha_origem", "").neq("status", "cancelado").limit(2000);
        return {
          qtd: (camps ?? []).length,
          enviados: ((recs ?? []) as any[]).filter((r) => r.sent_at).length,
          pedidos: (peds ?? []).length,
          valor: ((peds ?? []) as any[]).reduce((a: number, p: any) => a + Number(p.total ?? 0), 0),
        };
      } catch {
        return { qtd: 0, enviados: 0, pedidos: 0, valor: 0 };
      }
    },
  });

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-xl">Comercial (base: dados carregados)</h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <p className="rounded-lg bg-muted p-2.5">Novos clientes <strong className="float-right">{grupos.novos}</strong></p>
          <p className="rounded-lg bg-muted p-2.5">Recorrentes (2+ pedidos) <strong className="float-right">{grupos.recorrentes}</strong></p>
          <p className="rounded-lg bg-muted p-2.5">Reativados (gap 60d+, comprou 30d) <strong className="float-right">{grupos.reativados}</strong></p>
          <p className="rounded-lg bg-muted p-2.5">Ticket médio <strong className="float-right">{brl(ticket)}</strong></p>
          <p className="rounded-lg bg-muted p-2.5">Empresas <strong className="float-right">{empresas}</strong></p>
          <p className="rounded-lg bg-muted p-2.5">Faturamento B2B <strong className="float-right">{brl(fatEmpresas)}</strong></p>
          <p className="rounded-lg bg-muted p-2.5">Campanhas <strong className="float-right">{campanhasInfo?.qtd ?? 0}</strong></p>
          <p className="rounded-lg bg-muted p-2.5">Vendas de campanha <strong className="float-right">{campanhasInfo?.pedidos ?? 0} • {brl(campanhasInfo?.valor ?? 0)}</strong></p>
        </div>
      </section>
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-xl">Orçamentos por status</h2>
        <ul className="mt-2 space-y-1.5 text-sm">
          {(orcPorStatus ?? []).map(([s, v]) => (
            <li key={s} className="flex justify-between gap-2 rounded-lg border border-border p-2.5">
              <span className="capitalize">{s} ({v.qtd})</span><span className="font-semibold">{brl(v.total)}</span>
            </li>
          ))}
          {(orcPorStatus ?? []).length === 0 ? <li className="text-muted-foreground">Nenhum orçamento.</li> : null}
        </ul>
      </section>
    </div>
  );
}

function RotasBairro({ pedidos }: { pedidos: any[] }) {
  const grupos = agruparPorBairro(pedidos.map((p: any) => ({ bairro: p.bairro, id: p.id })));
  const porId = useMemo(() => new Map(pedidos.map((p: any) => [p.id, p])), [pedidos]);
  if (grupos.length === 0) return <p className="mt-2 text-sm text-muted-foreground">Nenhuma entrega pendente.</p>;
  return (
    <div className="mt-3 space-y-2">
      {grupos.map((g) => (
        <details key={g.bairro} className="rounded-lg border border-border p-3 text-sm" open={grupos.length <= 3}>
          <summary className="cursor-pointer font-semibold">ROTA — {g.bairro} ({g.qtd} pedido(s))</summary>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {g.ids.map((id) => {
              const p = porId.get(id);
              if (!p) return null;
              return <li key={id}>#{p.numero} — {p.cliente_nome} — {p.endereco}{p.complemento ? `, ${p.complemento}` : ""} • {p.telefone} • {STATUS_EXIBICAO[p.status] ?? p.status}</li>;
            })}
          </ul>
        </details>
      ))}
    </div>
  );
}

function AvaliacoesResumo({ avaliacoes }: { avaliacoes: any[] }) {
  const media = (k: string) => {
    const vals = avaliacoes.map((a: any) => Number(a[k] ?? NaN)).filter((n) => Number.isFinite(n) && n > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const mq = media("nota");
  const mp = media("prazo");
  const ma = media("atendimento");
  const ruins = avaliacoes.filter((a: any) => Number(a.nota) <= 2).length;
  return (
    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
      <p className="rounded-lg bg-muted p-2.5">Qualidade <strong className="float-right">{mq != null ? `${mq.toFixed(1)}★` : "—"}</strong></p>
      <p className="rounded-lg bg-muted p-2.5">Prazo <strong className="float-right">{mp != null ? `${mp.toFixed(1)}★` : "—"}</strong></p>
      <p className="rounded-lg bg-muted p-2.5">Atendimento <strong className="float-right">{ma != null ? `${ma.toFixed(1)}★` : "—"}</strong></p>
      <p className="rounded-lg bg-muted p-2.5">⚠ p/ acompanhar <strong className="float-right">{ruins}</strong></p>
    </div>
  );
}

function EmRotaAdmin({ pedidos }: { pedidos: any[] }) {  if (pedidos.length === 0) return <p className="mt-2 text-sm text-muted-foreground">Nenhum pedido em rota.</p>;
  const pontos = pedidos.flatMap((p: any) => [
    p.destino_lat && p.destino_lng ? { lat: p.destino_lat, lng: p.destino_lng, label: `Entrega ${p.numero}` } : null,
    p.motoboy_lat && p.motoboy_lng ? { lat: p.motoboy_lat, lng: p.motoboy_lng, label: `Motoboy ${p.numero}` } : null,
  ].filter(Boolean));
  return (
    <div className="mt-3 space-y-2">
      <MapView pontos={pontos as any} />
      {pedidos.map((p: any) => (
        <p key={p.id} className="text-sm">Nº {p.numero} — {p.cliente_nome} — atual. {p.motoboy_atualizado_em ? hora(p.motoboy_atualizado_em) : "—"}</p>
      ))}
    </div>
  );
}
