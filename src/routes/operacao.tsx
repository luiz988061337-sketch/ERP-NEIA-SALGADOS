import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { PageHeader } from "@/components/admin/ui-admin";
import { useRoles, useSession } from "@/lib/session";
import { oQuePrecisaAtencao, oQuePrepararAgora, acontecendoAgora } from "@/lib/dashboard";
import { lembretesPendentes, mensagemLembrete } from "@/lib/lembretes";
import { whatsappLink } from "@/lib/format";

export const Route = createFileRoute("/operacao")({
  head: () => ({ meta: [{ title: "Operação — Néia Salgados" }] }),
  component: Operacao,
});

function Operacao() {
  const navigate = useNavigate();
  const { user } = useSession();
  const { data: roles } = useRoles(user?.id);
  const qc = useQueryClient();
  const isAdmin = roles?.includes("admin");
  const pedidos = useQuery({
    queryKey: ["op-pedidos"],
    enabled: !!isAdmin,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data } = await supabase
        .from("pedidos")
        .select("*, pedido_itens(nome,quantidade)")
        .neq("status", "cancelado")
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []) as any[];
    },
  });
  const lotes = useQuery({
    queryKey: ["op-lotes"],
    enabled: !!isAdmin,
    queryFn: async () => {
      try {
        const { data } = await supabase
          .from("lotes")
          .select("*, produtos(nome)")
          .order("validade")
          .limit(100);
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });

  const lista = (pedidos.data ?? []).map((p: any) => ({
    status: p.status,
    atrasado: p.atrasado,
    problema: p.problema,
    agendado_para: p.agendado_para,
    created_at: p.created_at,
    itens: (p.pedido_itens ?? []).map((i: any) => ({
      nome: i.nome,
      quantidade: Number(i.quantidade),
    })),
  }));
  const criticos = (lotes.data ?? [])
    .filter((l: any) => Number(l.restante) <= 0)
    .map((l: any) => l.codigo);

  async function salvarHorario(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.from("horario_config").upsert(
      {
        id: true,
        antecedencia_min: Number(f.get("ant") ?? 30),
        teto_unidades_janela: Number(f.get("teto") ?? 2000),
      },
      { onConflict: "id" },
    );
    if (error) toast.error("Rode o PASSO-11 no banco.");
    else toast.success("Horário salvo.");
  }

  if (!isAdmin) return <p className="p-10 text-center text-muted-foreground">Acesso do admin.</p>;

  return (
    <>
      <AdminTopbar
        usuario={user?.email ?? null}
        onSair={async () => {
          await supabase.auth.signOut();
          navigate({ to: "/auth", replace: true });
        }}
      />
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <PageHeader
          titulo="O que precisa de atenção?"
          descricao={
            <span className="text-sm">
              <a href="/fiscal" className="underline">
                Administração → Fiscal
              </a>{" "}
              •{" "}
              <a href="/impressao" className="underline">
                Impressão
              </a>
            </span>
          }
        />
        <ul className="rounded-xl border border-border bg-card p-4 text-sm">
          {oQuePrecisaAtencao(lista, criticos).map((a) => (
            <li key={a}>• {a}</li>
          ))}
          {oQuePrecisaAtencao(lista, criticos).length === 0 ? <li>Tudo sob controle. ✅</li> : null}
        </ul>
        <p className="text-sm text-muted-foreground">{acontecendoAgora(lista, 0, 0)}</p>
        <LembretesBox />;
        <AvisosBox />
        <DemandaBox />
        <GargaloBox />
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-xl">O que preciso preparar agora?</h2>
          <ul className="mt-2 text-sm">
            {oQuePrepararAgora(lista)
              .slice(0, 15)
              .map((r) => (
                <li key={r.nome} className="flex justify-between">
                  <span>{r.nome}</span>
                  <strong>{r.qtd} un</strong>
                </li>
              ))}
          </ul>
        </section>
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-xl">Horário e capacidade</h2>
          <form onSubmit={salvarHorario} className="mt-2 flex flex-wrap gap-3 text-sm">
            <div>
              <Label>Antecedência (min)</Label>
              <Input name="ant" type="number" defaultValue={30} className="w-28" />
            </div>
            <div>
              <Label>Teto un/janela</Label>
              <Input name="teto" type="number" defaultValue={2000} className="w-32" />
            </div>
            <Button type="submit" size="sm" className="self-end">
              Salvar
            </Button>
          </form>
          <p className="mt-1 text-xs text-muted-foreground">
            Seg–Sáb 08–12h e 13–22h • Dom fechado • nunca 12–13h (validado em lib/horario.ts).
          </p>
        </section>
        <section className="rounded-xl border border-border bg-card p-4 text-sm">
          <h2 className="font-display text-xl">Lotes (FEFO)</h2>
          {(lotes.data ?? []).length === 0 ? (
            <p className="text-muted-foreground">Nenhum lote. Cadastre pela produção ou SQL.</p>
          ) : null}
          <ul className="mt-2 space-y-1">
            {(lotes.data ?? []).slice(0, 20).map((l: any) => (
              <li key={l.id} className="flex justify-between gap-2">
                <span>
                  {l.codigo} • {l.produtos?.nome ?? l.produto_id} • val {l.validade ?? "—"}
                </span>
                <span>
                  rest {l.restante}/{l.quantidade}
                </span>
              </li>
            ))}
          </ul>
          <NovoLote onOk={() => qc.invalidateQueries({ queryKey: ["op-lotes"] })} />
        </section>
      </div>
    </>
  );
}

function AvisosBox() {
  const qc2 = useQueryClient();
  const { data } = useQuery({
    queryKey: ["op-avisos"],
    refetchInterval: 15000,
    queryFn: async () => {
      try {
        const { data } = await supabase
          .from("notificacoes")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20);
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });
  async function ler(id: string) {
    await supabase.from("notificacoes").update({ lida: true }).eq("id", id);
    qc2.invalidateQueries({ queryKey: ["op-avisos"] });
  }
  const novas = (data ?? []).filter((n) => !n.lida);
  if (!data || data.length === 0) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4 text-sm">
      <h2 className="font-display text-xl">Avisos ({novas.length} novos)</h2>
      <ul className="mt-2 space-y-2">
        {data.map((n: any) => (
          <li key={n.id} className="flex flex-wrap items-center gap-2">
            <span className={n.lida ? "text-muted-foreground" : "font-semibold"}>
              {n.titulo} — {n.detalhe}
            </span>
            {!n.lida ? (
              <Button size="sm" variant="ghost" onClick={() => ler(n.id)}>
                Marcar lida
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DemandaBox() {
  const qc3 = useQueryClient();
  const { data } = useQuery({
    queryKey: ["op-demanda"],
    queryFn: async () => {
      try {
        const { data } = await supabase.from("datas_demanda").select("*").order("data").limit(30);
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });
  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.from("datas_demanda").insert({
      ocasiao: String(f.get("ocasiao") ?? ""),
      data: String(f.get("data") ?? ""),
      mensagem: String(f.get("mensagem") ?? ""),
      antecedencia_dias: Number(f.get("ant") ?? 10),
      nivel: String(f.get("nivel") ?? "alta"),
      ativo: true,
    });
    if (error) toast.error("Não salvou. Rode a migration 0028.");
    else {
      toast.success("Data de alta demanda salva.");
      (e.target as HTMLFormElement).reset();
      qc3.invalidateQueries({ queryKey: ["op-demanda"] });
    }
  }
  async function alternar(d: any) {
    await supabase.from("datas_demanda").update({ ativo: !d.ativo }).eq("id", d.id);
    qc3.invalidateQueries({ queryKey: ["op-demanda"] });
  }
  return (
    <section className="rounded-xl border border-border bg-card p-4 text-sm">
      <h2 className="font-display text-xl">Datas de alta demanda</h2>
      <form onSubmit={salvar} className="mt-2 flex flex-wrap gap-2">
        <Input name="ocasiao" placeholder="Ocasião (ex: Dia das Mães)" required className="w-44" />
        <Input name="data" type="date" required className="w-36" />
        <Input name="mensagem" placeholder="Aviso ao cliente" className="w-52" />
        <Input
          name="ant"
          type="number"
          defaultValue={10}
          title="Antecedência (dias)"
          className="w-20"
        />
        <Button type="submit" size="sm">
          + Data
        </Button>
      </form>
      <ul className="mt-2 space-y-1">
        {(data ?? []).map((d: any) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2">
            <span className={d.ativo ? "" : "text-muted-foreground line-through"}>
              {d.ocasiao} • {d.data}
              {d.mensagem ? ` — ${d.mensagem}` : ""}
            </span>
            <Button size="sm" variant="ghost" onClick={() => alternar(d)}>
              {d.ativo ? "Desativar" : "Ativar"}
            </Button>
          </li>
        ))}
        {(data ?? []).length === 0 ? (
          <li className="text-muted-foreground">Nenhuma data configurada.</li>
        ) : null}
      </ul>
    </section>
  );
}

/** §80: gargalos medidos no histórico real (separação/fritura+montagem/entrega). */
function GargaloBox() {
  const { data } = useQuery({
    queryKey: ["op-gargalo"],
    queryFn: async () => {
      try {
        const corte = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data } = await supabase
          .from("pedido_status_historico")
          .select("pedido_id, de_status, para_status, created_at")
          .gte("created_at", corte)
          .order("created_at")
          .limit(500);
        const porPedido = new Map<string, { de: string | null; para: string; em: number }[]>();
        for (const h of (data ?? []) as any[]) {
          const arr = porPedido.get(h.pedido_id) ?? [];
          arr.push({ de: h.de_status, para: h.para_status, em: +new Date(h.created_at) });
          porPedido.set(h.pedido_id, arr);
        }
        const chaves = ["separacao", "fritura_montagem", "entrega"] as const;
        const soma: Record<string, number> = { separacao: 0, fritura_montagem: 0, entrega: 0 };
        const n: Record<string, number> = { separacao: 0, fritura_montagem: 0, entrega: 0 };
        for (const evs of porPedido.values()) {
          for (let i = 1; i < evs.length; i++) {
            const prev = evs[i - 1] as { de: string | null; para: string; em: number };
            const cur = evs[i] as { de: string | null; para: string; em: number };
            const dt = (cur.em - prev.em) / 60000;
            if (dt < 0 || dt > 24 * 60) continue;
            let k: string | null = null;
            if (prev.para === "recebido" && cur.para === "em_producao") k = "separacao";
            else if (prev.para === "em_producao" && cur.para === "pronto") k = "fritura_montagem";
            else if (
              prev.para === "pronto" &&
              ["entregue", "em_rota", "aguardando_motoboy"].includes(cur.para)
            )
              k = "entrega";
            if (k) {
              soma[k] = (soma[k] ?? 0) + dt;
              n[k] = (n[k] ?? 0) + 1;
            }
          }
        }
        const media: Record<string, number> = {};
        for (const k of chaves)
          media[k] = (n[k] ?? 0) ? Math.round((soma[k] ?? 0) / (n[k] ?? 1)) : 0;
        return { media, amostras: n };
      } catch {
        return null;
      }
    },
  });
  if (!data) return null;
  const pares = (Object.entries(data.media) as [string, number][]).sort(
    (a, b) => (b[1] ?? 0) - (a[1] ?? 0),
  );
  const top = pares[0] ?? ["separacao", 0];
  const topNome = top[0] ?? "separacao";
  const topVal = top[1] ?? 0;
  const nome: Record<string, string> = {
    separacao: "Separação",
    fritura_montagem: "Fritura/montagem",
    entrega: "Entrega",
  };
  return (
    <section className="rounded-xl border border-border bg-card p-4 text-sm">
      <h2 className="font-display text-xl">Gargalos (7 dias)</h2>
      <p className="mt-1">
        Maior tempo médio:{" "}
        <strong>
          {nome[topNome] ?? topNome} ({topVal} min)
        </strong>
      </p>
      <ul className="mt-1 space-y-0.5 text-muted-foreground">
        {pares.map(([k, v]) => (
          <li key={k}>
            {nome[k] ?? k}: {v} min médias ({data.amostras[k] ?? 0} amostras)
          </li>
        ))}
      </ul>
    </section>
  );
}

function NovoLote({ onOk }: { onOk: () => void }) {
  const [form, setForm] = useState({ produto_id: "", codigo: "", quantidade: "100", validade: "" });
  async function salvar() {
    if (!form.produto_id || !form.codigo) {
      toast.error("Produto e código obrigatórios.");
      return;
    }
    const q = Number(form.quantidade) || 0;
    const { error } = await supabase.from("lotes").insert({
      produto_id: form.produto_id,
      codigo: form.codigo,
      quantidade: q,
      restante: q,
      validade: form.validade || null,
      status: "ativo",
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Lote criado.");
      onOk();
    }
  }
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Input
        placeholder="produto_id"
        value={form.produto_id}
        onChange={(e) => setForm({ ...form, produto_id: e.target.value })}
        className="w-40"
      />
      <Input
        placeholder="código"
        value={form.codigo}
        onChange={(e) => setForm({ ...form, codigo: e.target.value })}
        className="w-28"
      />
      <Input
        placeholder="qtd"
        type="number"
        value={form.quantidade}
        onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
        className="w-20"
      />
      <Input
        type="date"
        value={form.validade}
        onChange={(e) => setForm({ ...form, validade: e.target.value })}
        className="w-36"
      />
      <Button size="sm" onClick={salvar}>
        + Lote
      </Button>
    </div>
  );
}

function LembretesBox() {
  const { data } = useQuery({
    queryKey: ["op-lembretes"],
    refetchInterval: 60000,
    queryFn: async () => {
      try {
        const { data: peds } = await supabase
          .from("pedidos")
          .select("id, numero, cliente_nome, telefone, agendado_para, status")
          .not("agendado_para", "is", null)
          .not("status", "in", "(cancelado,entregue)")
          .limit(100);
        const { data: lems } = await supabase
          .from("pedido_lembretes")
          .select("pedido_id, tipo, status");
        const porPedido = new Map<string, { tipo: string; status: string }[]>();
        for (const l of (lems ?? []) as any[]) {
          const arr = porPedido.get(l.pedido_id) ?? [];
          arr.push({ tipo: l.tipo, status: l.status });
          porPedido.set(l.pedido_id, arr);
        }
        return lembretesPendentes(
          ((peds ?? []) as any[]).map((p) => ({ ...p, lembretes: porPedido.get(p.id) ?? [] })),
        );
      } catch {
        return [];
      }
    },
  });
  async function marcar(pedidoId: string, tipo: string, st: string) {
    await supabase
      .from("pedido_lembretes")
      .upsert({ pedido_id: pedidoId, tipo, status: st }, { onConflict: "pedido_id,tipo" });
  }
  if (!data || data.length === 0) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4 text-sm">
      <h2 className="font-display text-xl">Lembretes devidos ({data.length})</h2>
      <ul className="mt-2 space-y-2">
        {data.slice(0, 20).map(({ pedido: p, tipo }) => {
          const msg = mensagemLembrete(tipo, {
            numero: p.numero,
            cliente: p.cliente_nome,
            agendamento: new Date(p.agendado_para).toLocaleString("pt-BR"),
          });
          return (
            <li key={`${p.id}:${tipo}`} className="flex flex-wrap items-center gap-2">
              <span>
                #{p.numero} {p.cliente_nome} • {tipo}
              </span>
              <Button size="sm" variant="outline" asChild>
                <a href={whatsappLink(p.telefone, msg)} target="_blank" rel="noreferrer">
                  Enviar WhatsApp
                </a>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => marcar(p.id, tipo, "enviado")}>
                Marcar enviado
              </Button>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-xs text-muted-foreground">
        Nunca cancela sozinho. Deploy do cron: supabase functions deploy enviar-lembretes.
      </p>
    </section>
  );
}
