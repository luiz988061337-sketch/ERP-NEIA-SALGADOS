import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BarChart3,
  Bike,
  ClipboardList,
  Crown,
  LayoutDashboard,
  Package,
  Printer,
  Star,
  Tag,
  Trash2,
  Users,
  Pencil,
  Plus,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { StatusBadge } from "@/components/status-steps";
import { MapView } from "@/components/map-view";
import { supabase } from "@/integrations/supabase/client";
import { brl, dataHora, hora, mensagemStatus, STATUS_LABEL, whatsappLink, type OrderStatus } from "@/lib/format";
import { useRoles, useSession } from "@/lib/session";
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

  function refreshAll() {
    for (const k of ["admin-pedidos", "admin-produtos", "admin-categorias", "admin-cupons", "admin-profiles", "admin-avaliacoes"])
      queryClient.invalidateQueries({ queryKey: [k] });
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

    return { doDia, doMes, fatDia, fatMes, ticket, maisVendidos, recorrentes, totalPedidos: lista.length };
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
    const { error } = await supabase.from("pedidos").update({ status }).eq("id", p.id);
    if (error) toast.error("Não foi possível atualizar.");
    else {
      toast.success(`Pedido nº ${p.numero} → ${STATUS_LABEL[status]}`);
      window.open(whatsappLink(p.telefone, mensagemStatus(status, p.cliente_nome, p.numero)), "_blank", "noopener");
    }
    queryClient.invalidateQueries({ queryKey: ["admin-pedidos"] });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-3xl">Administração</h1>
          <p className="text-sm text-muted-foreground">Gestão completa da operação Néia Salgados.</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={refreshAll}>
          Atualizar dados
        </Button>
      </div>

      <Tabs value={aba} onValueChange={setAba} className="mt-6">
        <TabsList className="no-scrollbar flex w-full justify-start gap-1 overflow-x-auto">
          <TabsTrigger value="dashboard"><LayoutDashboard className="mr-1 size-4" />Dashboard</TabsTrigger>
          <TabsTrigger value="pedidos"><ClipboardList className="mr-1 size-4" />Pedidos</TabsTrigger>
          <TabsTrigger value="produtos"><Package className="mr-1 size-4" />Produtos</TabsTrigger>
          <TabsTrigger value="clientes"><Users className="mr-1 size-4" />Clientes</TabsTrigger>
          <TabsTrigger value="motoboys"><Bike className="mr-1 size-4" />Motoboys</TabsTrigger>
          <TabsTrigger value="cupons"><Tag className="mr-1 size-4" />Cupons</TabsTrigger>
          <TabsTrigger value="avaliacoes"><Star className="mr-1 size-4" />Avaliações</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DashCard titulo="Pedidos hoje" valor={String(dash.doDia.length)} sub={`${dash.totalPedidos} no total`} />
            <DashCard titulo="Faturamento hoje" valor={brl(dash.fatDia)} sub="Exclui cancelados" />
            <DashCard titulo="Faturamento mês" valor={brl(dash.fatMes)} sub={`${dash.doMes.length} pedidos`} />
            <DashCard titulo="Ticket médio" valor={brl(dash.ticket)} sub="Média mensal" />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 font-display text-xl"><BarChart3 className="size-5" /> Mais vendidos</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {dash.maisVendidos.map((m) => (
                  <li key={m.nome} className="flex justify-between gap-2">
                    <span>{m.nome} <span className="text-muted-foreground">×{m.qtd}</span></span>
                    <span className="font-semibold">{brl(m.total)}</span>
                  </li>
                ))}
                {dash.maisVendidos.length === 0 && <li className="text-muted-foreground">Sem vendas ainda.</li>}
              </ul>
            </section>
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 font-display text-xl"><Crown className="size-5" /> Clientes recorrentes</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {dash.recorrentes.map((c) => (
                  <li key={c.tel} className="flex justify-between gap-2">
                    <span>{c.nome} <span className="text-muted-foreground">({c.qtd} pedidos)</span></span>
                    <span className="font-semibold">{brl(c.total)}</span>
                  </li>
                ))}
                {dash.recorrentes.length === 0 && <li className="text-muted-foreground">Nenhum recorrente ainda.</li>}
              </ul>
            </section>
          </div>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Pedidos de hoje</h2>
            <div className="mt-3 space-y-2">
              {(dash.doDia ?? []).slice(0, 10).map((p: any) => (
                <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-display">Nº {p.numero}</span>
                  <StatusBadge status={p.status} />
                  <span className="text-muted-foreground">{p.cliente_nome} • {hora(p.created_at)}</span>
                  <span className="ml-auto font-semibold text-primary">{brl(p.total)}</span>
                </div>
              ))}
              {dash.doDia.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pedido hoje.</p>}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="pedidos" className="mt-4">
          <PedidosAdmin pedidos={pedidos ?? []} onStatus={mudarStatusPedido} />
        </TabsContent>

        <TabsContent value="produtos" className="mt-4 space-y-6">
          <ProdutosAdmin produtos={produtos ?? []} categorias={categorias ?? []} onChange={refreshAll} />
          <CategoriasAdmin categorias={categorias ?? []} onChange={refreshAll} />
        </TabsContent>

        <TabsContent value="clientes" className="mt-4">
          <ClientesAdmin profiles={profiles ?? []} pedidos={pedidos ?? []} />
        </TabsContent>

        <TabsContent value="motoboys" className="mt-4 space-y-4">
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
        </TabsContent>

        <TabsContent value="cupons" className="mt-4">
          <CuponsAdmin cupons={cupons ?? []} onChange={refreshAll} />
        </TabsContent>

        <TabsContent value="avaliacoes" className="mt-4">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Últimas avaliações</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {(avaliacoes ?? []).map((a: any) => (
                <li key={a.id} className="rounded-lg border border-border p-3">
                  <p className="flex items-center gap-2">
                    <Star className="size-4 fill-secondary text-secondary" /> {a.nota}/5 — {a.produtos?.nome ?? a.produto_id}
                    <span className="ml-auto text-xs text-muted-foreground">{dataHora(a.created_at)}</span>
                  </p>
                  {a.comentario && <p className="mt-1 text-muted-foreground">“{a.comentario}”</p>}
                </li>
              ))}
              {(avaliacoes ?? []).length === 0 && <li className="text-muted-foreground">Sem avaliações.</li>}
            </ul>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DashCard({ titulo, valor, sub }: { titulo: string; valor: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="font-display text-2xl text-primary">{valor}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function PedidosAdmin({ pedidos, onStatus }: { pedidos: any[]; onStatus: (p: any, s: OrderStatus) => void }) {
  const [filtro, setFiltro] = useState("todos");
  const lista = pedidos.filter((p) => (filtro === "todos" ? true : p.status === filtro));
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-xl">Gestão de pedidos</h2>
        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="ml-auto w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
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
            <p className="mt-1 text-xs text-muted-foreground">{p.endereco} — {p.bairro} {p.complemento ? `(${p.complemento})` : ""}</p>
            <ul className="mt-1 text-xs">
              {(p.pedido_itens ?? []).map((i: any) => (
                <li key={i.id}>{i.quantidade}x {i.nome}</li>
              ))}
            </ul>
            {p.observacoes && <p className="mt-1 rounded bg-muted p-1.5 text-xs">Obs: {p.observacoes}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Select value={p.status} onValueChange={(s) => onStatus(p, s as OrderStatus)}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABEL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={() => window.open(whatsappLink(p.telefone, mensagemStatus(p.status, p.cliente_nome, p.numero)), "_blank")}>
                <MessageCircle className="mr-1 size-3.5" /> WhatsApp
              </Button>
              <Button size="sm" variant="ghost" onClick={() => window.print()}>
                <Printer className="mr-1 size-3.5" /> Imprimir
              </Button>
            </div>
          </article>
        ))}
        {lista.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pedido neste filtro.</p>}
      </div>
    </section>
  );
}

function ProdutosAdmin({ produtos, categorias, onChange }: { produtos: any[]; categorias: any[]; onChange: () => void }) {
  const [editando, setEditando] = useState<any | null>(null);
  const [novo, setNovo] = useState(false);

  async function salvar(e: React.FormEvent<HTMLFormElement>, id?: string) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload = {
      nome: String(f.get("nome")),
      descricao: String(f.get("descricao") ?? ""),
      preco: Number(f.get("preco")),
      preco_promocional: f.get("preco_promocional") ? Number(f.get("preco_promocional")) : null,
      categoria_id: String(f.get("categoria_id")),
      estoque: Number(f.get("estoque") ?? 0),
      disponivel: f.get("disponivel") === "on",
      imagem_url: String(f.get("imagem_url") ?? "") || null,
    };
    const { error } = id
      ? await supabase.from("produtos").update(payload).eq("id", id)
      : await supabase.from("produtos").insert(payload);
    if (error) toast.error("Erro ao salvar produto.");
    else {
      toast.success("Produto salvo!");
      setEditando(null);
      setNovo(false);
      onChange();
    }
  }

  async function excluir(id: string) {
    if (!confirm("Excluir este produto?")) return;
    const { error } = await supabase.from("produtos").delete().eq("id", id);
    if (error) toast.error("Não foi possível excluir.");
    else {
      toast.success("Produto excluído.");
      onChange();
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-xl">Produtos ({produtos.length})</h2>
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
          <div className="space-y-1"><Label>Estoque</Label><Input name="estoque" type="number" defaultValue={editando?.estoque ?? 100} /></div>
          <div className="space-y-1"><Label>Imagem URL (opcional)</Label><Input name="imagem_url" defaultValue={editando?.imagem_url ?? ""} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="disponivel" defaultChecked={editando?.disponivel ?? true} /> Disponível</label>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit">Salvar</Button>
            <Button type="button" variant="outline" onClick={() => { setNovo(false); setEditando(null); }}>Cancelar</Button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {produtos.map((p) => (
          <div key={p.id} className={cn("flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm", !p.disponivel && "opacity-60")}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{p.nome} <span className="text-xs text-muted-foreground">• {p.categorias?.nome}</span></p>
              <p className="text-xs text-muted-foreground">{brl(p.preco_promocional ?? p.preco)} • Estoque: {p.estoque} {p.preco_promocional ? "• PROMO" : ""}</p>
            </div>
            <Switch checked={p.disponivel} onCheckedChange={async (v) => {
              await supabase.from("produtos").update({ disponivel: v }).eq("id", p.id);
              onChange();
            }} />
            <Button size="icon" variant="outline" onClick={() => { setEditando(p); setNovo(false); }}><Pencil className="size-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => excluir(p.id)}><Trash2 className="size-4" /></Button>
          </div>
        ))}
      </div>
    </section>
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

function ClientesAdmin({ profiles, pedidos }: { profiles: any[]; pedidos: any[] }) {
  const [busca, setBusca] = useState("");
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
      <h2 className="font-display text-xl">Clientes ({profiles.length})</h2>
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

function CuponsAdmin({ cupons, onChange }: { cupons: any[]; onChange: () => void }) {
  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload = {
      codigo: String(f.get("codigo")).toUpperCase().trim(),
      tipo: String(f.get("tipo")),
      valor: Number(f.get("valor")),
      minimo: Number(f.get("minimo") ?? 0),
      ativo: true,
    };
    const { error } = await supabase.from("cupons").insert(payload);
    if (error) toast.error("Erro ao criar cupom (código duplicado?).");
    else {
      toast.success("Cupom criado!");
      (e.target as HTMLFormElement).reset();
      onChange();
    }
  }
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-display text-xl">Cupons</h2>
      <form onSubmit={salvar} className="mt-3 grid gap-2 sm:grid-cols-5">
        <Input name="codigo" placeholder="CÓDIGO" required maxLength={20} />
        <select name="tipo" className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="percentual">Percentual %</option>
          <option value="valor">Valor R$</option>
        </select>
        <Input name="valor" type="number" step="0.01" placeholder="Valor" required />
        <Input name="minimo" type="number" step="0.01" placeholder="Mínimo" defaultValue={0} />
        <Button type="submit">Criar</Button>
      </form>
      <ul className="mt-3 space-y-1.5 text-sm">
        {cupons.map((c) => (
          <li key={c.id} className="flex items-center gap-2 rounded-lg border border-border p-2.5">
            <Badge>{c.codigo}</Badge>
            <span className="text-muted-foreground">{c.tipo === "percentual" ? `${c.valor}%` : brl(c.valor)} • mín. {brl(c.minimo)}</span>
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

function EmRotaAdmin({ pedidos }: { pedidos: any[] }) {
  if (pedidos.length === 0) return <p className="mt-2 text-sm text-muted-foreground">Nenhum pedido em rota.</p>;
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
