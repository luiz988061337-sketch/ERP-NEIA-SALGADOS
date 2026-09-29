import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Heart, MapPin, Star, Trophy, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-steps";
import { ProductCard } from "@/components/product-card";
import { supabase } from "@/integrations/supabase/client";
import { brl, dataHora } from "@/lib/format";
import { usePerfil, useSession, useStaffOnly } from "@/lib/session";
import { useAvaliacoes, useProdutos, type Produto } from "@/lib/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/conta")({
  head: () => ({
    meta: [
      { title: "Minha conta — Néia Salgados" },
      { name: "description", content: "Pedidos, favoritos, fidelidade, endereços e avaliações." },
    ],
  }),
  component: Conta,
});

const META_FIDELIDADE = 200; // pontos para prêmio
const PONTOS_POR_REAL = 0.2; // 1 ponto a cada R$ 5

function Conta() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { staffOnly, painel } = useStaffOnly();
  const { data: perfil } = usePerfil(user?.id);
  const queryClient = useQueryClient();
  const [aba, setAba] = useState("pedidos");

  useEffect(() => {
    if (staffOnly && painel) navigate({ to: painel, replace: true });
  }, [staffOnly, painel, navigate]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: "/conta" }, replace: true });
  }, [loading, user, navigate]);

  const { data: pedidos } = useQuery({
    queryKey: ["meus-pedidos", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("*, pedido_itens(*)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: favoritosIds } = useQuery({
    queryKey: ["favoritos", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("favoritos").select("produto_id").eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((f) => f.produto_id);
    },
  });

  const { data: produtos } = useProdutos();
  const { data: avaliacoes } = useAvaliacoes();

  const { data: enderecos } = useQuery({
    queryKey: ["enderecos", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("enderecos").select("*").eq("user_id", user!.id).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: minhasAvaliacoes } = useQuery({
    queryKey: ["minhas-avaliacoes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("avaliacoes").select("*").eq("user_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const favoritos = (produtos ?? []).filter((p) => favoritosIds?.includes(p.id));
  const totalGasto = (pedidos ?? []).filter((p: any) => p.status !== "cancelado").reduce((a: number, p: any) => a + Number(p.total), 0);
  const pontos = perfil?.pontos ?? 0;
  const progresso = Math.min(100, (pontos / META_FIDELIDADE) * 100);

  async function removerFavorito(id: string) {
    await supabase.from("favoritos").delete().eq("produto_id", id).eq("user_id", user!.id);
    queryClient.invalidateQueries({ queryKey: ["favoritos"] });
  }

  if (staffOnly) {
    return <p className="p-10 text-center text-muted-foreground">Abrindo seu painel...</p>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-3xl">Minha conta</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {perfil?.nome ?? user?.email} {perfil?.telefone ? `• ${perfil.telefone}` : ""} • {brl(totalGasto)} em pedidos
      </p>

      {/* Fidelidade */}
      <section className="mt-4 rounded-xl border border-secondary/60 bg-gradient-to-r from-card to-secondary/20 p-4">
        <p className="flex items-center gap-2 font-display text-lg"><Trophy className="size-5 text-primary" /> Fidelidade Néia</p>
        <p className="text-sm text-muted-foreground">
          Você tem <strong className="text-foreground">{pontos} pontos</strong>. A cada R$ 5 em pedidos você ganha 1 ponto. Com {META_FIDELIDADE} pontos você ganha um cupom de R$ 20.
        </p>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progresso}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{pontos}/{META_FIDELIDADE} pontos</p>
      </section>

      <Tabs value={aba} onValueChange={setAba} className="mt-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
          <TabsTrigger value="favoritos">Favoritos</TabsTrigger>
          <TabsTrigger value="enderecos">Endereços</TabsTrigger>
          <TabsTrigger value="avaliar">Avaliar</TabsTrigger>
        </TabsList>

        <TabsContent value="pedidos" className="mt-4">
          <ul className="space-y-3">
            {(pedidos ?? []).map((p: any) => (
              <li key={p.id}>
                <Link
                  to="/pedido/$id"
                  params={{ id: p.id }}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-[var(--shadow-card)]"
                >
                  <div className="flex-1">
                    <p className="font-display">Pedido nº {p.numero}</p>
                    <p className="text-xs text-muted-foreground">{dataHora(p.created_at)} • {(p.pedido_itens ?? []).length} itens</p>
                  </div>
                  <StatusBadge status={p.status} />
                  <span className="font-display text-primary">{brl(p.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {pedidos && pedidos.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center">
              <p className="text-muted-foreground">Você ainda não fez pedidos.</p>
              <Button asChild className="mt-4"><Link to="/">Ver cardápio</Link></Button>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="favoritos" className="mt-4">
          {favoritos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Toque no <Heart className="inline size-4" /> dos produtos no cardápio para favoritar.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {favoritos.map((p: Produto) => (
                <div key={p.id} className="relative">
                  <ProductCard produto={p} slugCategoria="" favorito onToggleFavorito={() => removerFavorito(p.id)} />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="enderecos" className="mt-4">
          <Enderecos userId={user?.id} lista={enderecos ?? []} />
        </TabsContent>

        <TabsContent value="avaliar" className="mt-4">
          <AvaliarProdutos
            pedidos={pedidos ?? []}
            produtos={produtos ?? []}
            minhas={minhasAvaliacoes ?? []}
            userId={user?.id}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Enderecos({ userId, lista }: { userId: string | undefined; lista: any[] }) {
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!userId) return;
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.from("enderecos").insert({
      user_id: userId,
      rua: String(f.get("rua")),
      numero: String(f.get("numero") ?? ""),
      bairro: String(f.get("bairro")),
      complemento: String(f.get("complemento") ?? ""),
      referencia: String(f.get("referencia") ?? ""),
    });
    if (error) toast.error("Não foi possível salvar.");
    else {
      toast.success("Endereço salvo!");
      (e.target as HTMLFormElement).reset();
      setAberto(false);
      queryClient.invalidateQueries({ queryKey: ["enderecos"] });
    }
  }

  async function excluir(id: string) {
    await supabase.from("enderecos").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["enderecos"] });
  }

  return (
    <div>
      <Button size="sm" onClick={() => setAberto(!aberto)}><Plus className="mr-1 size-4" /> Novo endereço</Button>
      {aberto && (
        <form onSubmit={salvar} className="mt-3 grid gap-2 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label>Rua / Avenida</Label><Input name="rua" required /></div>
          <div className="space-y-1"><Label>Número</Label><Input name="numero" /></div>
          <div className="space-y-1"><Label>Bairro</Label><Input name="bairro" required /></div>
          <div className="space-y-1"><Label>Complemento</Label><Input name="complemento" /></div>
          <div className="space-y-1"><Label>Referência</Label><Input name="referencia" /></div>
          <Button type="submit" className="sm:col-span-2">Salvar endereço</Button>
        </form>
      )}
      <ul className="mt-3 space-y-2">
        {lista.map((e) => (
          <li key={e.id} className="flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-sm">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
            <span className="flex-1">{e.rua}, {e.numero} — {e.bairro} {e.complemento ? `(${e.complemento})` : ""}</span>
            <Button size="icon" variant="ghost" onClick={() => excluir(e.id)}><Trash2 className="size-4" /></Button>
          </li>
        ))}
        {lista.length === 0 && <li className="text-sm text-muted-foreground">Nenhum endereço salvo.</li>}
      </ul>
    </div>
  );
}

function AvaliarProdutos({ pedidos, produtos, minhas, userId }: { pedidos: any[]; produtos: Produto[]; minhas: any[]; userId: string | undefined }) {
  const queryClient = useQueryClient();
  const [notas, setNotas] = useState<Record<string, number>>({});
  const [coment, setComent] = useState<Record<string, string>>({});

  const comprados = [...new Set((pedidos ?? []).flatMap((p: any) => (p.pedido_itens ?? []).map((i: any) => i.produto_id).filter(Boolean)))];
  const paraAvaliar = produtos.filter((p) => comprados.includes(p.id));
  const avaliados = new Set(minhas.map((m) => m.produto_id));

  async function enviar(produtoId: string) {
    if (!userId) return;
    const nota = notas[produtoId] ?? 0;
    if (nota < 1 || nota > 5) {
      toast.error("Escolha de 1 a 5 estrelas para avaliar.");
      return;
    }
    const { error } = await supabase.from("avaliacoes").upsert(
      { produto_id: produtoId, user_id: userId, nota, comentario: coment[produtoId] ?? "" },
      { onConflict: "produto_id,user_id" },
    );
    if (error) toast.error("Não foi possível avaliar.");
    else {
      toast.success("Obrigado pela avaliação!");
      queryClient.invalidateQueries({ queryKey: ["minhas-avaliacoes"] });
      queryClient.invalidateQueries({ queryKey: ["avaliacoes"] });
    }
  }

  if (paraAvaliar.length === 0) {
    return <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Faça um pedido para avaliar os produtos.</p>;
  }

  return (
    <ul className="space-y-3">
      {paraAvaliar.map((p) => (
        <li key={p.id} className="rounded-xl border border-border bg-card p-4">
          <p className="font-display">{p.nome}</p>
          {avaliados.has(p.id)
            ? <p className="mt-1 text-sm text-success">Você já avaliou este produto. Pode atualizar abaixo.</p>
            : null}
          <div className="mt-2 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setNotas((s) => ({ ...s, [p.id]: n }))} aria-label={`${n} estrelas`}>
                <Star className={cn("size-6", (notas[p.id] ?? 0) >= n ? "fill-secondary text-secondary" : "text-muted-foreground")} />
              </button>
            ))}
          </div>
          <Input
            value={coment[p.id] ?? ""}
            onChange={(e) => setComent((s) => ({ ...s, [p.id]: e.target.value }))}
            placeholder="Comentário (opcional)"
            className="mt-2"
            maxLength={200}
          />
          <Button size="sm" className="mt-2" onClick={() => enviar(p.id)}>Enviar avaliação</Button>
        </li>
      ))}
    </ul>
  );
}

export { PONTOS_POR_REAL };
