import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { EmptyState, PageHeader } from "@/components/admin/ui-admin";
import { brl } from "@/lib/format";
import { faixaCompetencia } from "@/lib/competencia";
import { logAdmin } from "@/lib/operacao";
import { useRoles, useSession } from "@/lib/session";

export const Route = createFileRoute("/equipe")({
  head: () => ({ meta: [{ title: "Equipe — Néia Salgados" }] }),
  component: Equipe,
});

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function Equipe() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [acertoIni, setAcertoIni] = useState(() => new Date().toISOString().slice(0, 10));
  const [acertoFim, setAcertoFim] = useState(() => new Date().toISOString().slice(0, 10));
  const [acertoMoto, setAcertoMoto] = useState("");

  useEffect(() => {
    if (!loading && !user)
      navigate({ to: "/auth", search: { redirect: "/equipe" }, replace: true });
  }, [loading, user, navigate]);

  const staff = roles?.includes("admin") || roles?.includes("financeiro");
  const isAdmin = roles?.includes("admin");

  const { data: funcs } = useQuery({
    queryKey: ["eq-funcs"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funcionarios")
        .select("*")
        .order("nome")
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const meuFunc = useMemo(
    () => (funcs ?? []).find((f: any) => f.user_id === user?.id) ?? null,
    [funcs, user?.id],
  );

  const { data: escalas } = useQuery({
    queryKey: ["eq-escalas"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("escalas").select("*").limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const fxMes = faixaCompetencia(mes);
  const iniMes = fxMes.ini.slice(0, 10);
  const fimMes = fxMes.fim.slice(0, 10);

  const { data: pontos } = useQuery({
    queryKey: ["eq-pontos", mes],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pontos")
        .select("*, funcionarios(nome)")
        .gte("data", iniMes)
        .lt("data", fimMes)
        .order("data", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: vales } = useQuery({
    queryKey: ["eq-vales", mes],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vales")
        .select("*, funcionarios(nome)")
        .gte("data", iniMes)
        .lt("data", fimMes)
        .order("data", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: entregasAcerto } = useQuery({
    queryKey: ["eq-acerto", acertoIni, acertoFim, acertoMoto],
    enabled: !!staff && !!acertoMoto,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("id, numero, total, taxa_motoboy, status, created_at")
        .eq("status", "entregue")
        .eq("motoboy_id", acertoMoto)
        .gte("created_at", `${acertoIni}T00:00:00`)
        .lte("created_at", `${acertoFim}T23:59:59`)
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["eq-funcs"] });
    queryClient.invalidateQueries({ queryKey: ["eq-escalas"] });
    queryClient.invalidateQueries({ queryKey: ["eq-pontos"] });
    queryClient.invalidateQueries({ queryKey: ["eq-vales"] });
  }

  async function salvarFunc(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const nome = String(f.get("nome") ?? "").trim();
    if (nome.length < 2) {
      toast.error("Informe o nome.");
      return;
    }
    const { error } = await supabase.from("funcionarios").insert({
      nome,
      funcao: String(f.get("funcao") ?? ""),
      tipo_remuneracao: String(f.get("tipo") ?? "mensal"),
      valor: Number(f.get("valor") ?? 0) || 0,
      contato: String(f.get("contato") ?? ""),
      documentos: String(f.get("documentos") ?? ""),
      admissao: String(f.get("admissao") ?? "") || null,
    });
    if (error) {
      toast.error("Falha ao salvar. Rode a migration 0080.");
      return;
    }
    void logAdmin("funcionario_criado", nome);
    toast.success(
      "Funcionário cadastrado. Vincule o login editando pelo SQL (user_id) ou finalize aqui.",
    );
    (e.target as HTMLFormElement).reset();
    refresh();
  }

  async function vincular(id: string, email: string) {
    const { data: u } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email.trim())
      .maybeSingle();
    const uid = (u as any)?.id as string | undefined;
    if (!uid) {
      toast.error("Usuário não encontrado pelo e-mail (ele precisa ter conta).");
      return;
    }
    const { error } = await supabase.from("funcionarios").update({ user_id: uid }).eq("id", id);
    if (error) {
      toast.error("Falha ao vincular.");
      return;
    }
    toast.success("Login vinculado.");
    refresh();
  }

  async function salvarEscala(funcId: string, dia: number, entrada: string, saida: string) {
    if (!entrada || !saida) {
      toast.error("Informe entrada e saída.");
      return;
    }
    const { error } = await supabase
      .from("escalas")
      .upsert(
        { funcionario_id: funcId, dia_semana: dia, entrada, saida },
        { onConflict: "funcionario_id,dia_semana" },
      );
    if (error) {
      toast.error("Falha ao salvar escala.");
      return;
    }
    toast.success("Escala salva.");
    refresh();
  }

  async function baterPonto(tipo: "entrada" | "saida") {
    if (!meuFunc) {
      toast.error("Seu usuário não está vinculado a um funcionário.");
      return;
    }
    const hoje = new Date().toISOString().slice(0, 10);
    const agora = new Date().toISOString();
    const aberto = (pontos ?? []).find(
      (p: any) => p.funcionario_id === meuFunc.id && p.data === hoje && !p.saida,
    );
    if (tipo === "entrada") {
      if (aberto) {
        toast.error("Entrada já registrada hoje.");
        return;
      }
      const { error } = await supabase
        .from("pontos")
        .insert({ funcionario_id: meuFunc.id, user_id: user!.id, data: hoje, entrada: agora });
      if (error) {
        toast.error("Falha ao registrar.");
        return;
      }
      toast.success(
        `Entrada registrada às ${new Date(agora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`,
      );
    } else {
      if (!aberto) {
        toast.error("Sem entrada aberta hoje.");
        return;
      }
      const { error } = await supabase.from("pontos").update({ saida: agora }).eq("id", aberto.id);
      if (error) {
        toast.error("Falha ao registrar.");
        return;
      }
      toast.success("Saída registrada.");
    }
    refresh();
  }

  async function novoVale(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const funcId = String(f.get("funcionario_id") ?? "");
    const valor = Number(f.get("valor") ?? 0) || 0;
    if (!funcId || !(valor > 0)) {
      toast.error("Funcionário e valor válidos.");
      return;
    }
    const { error } = await supabase.from("vales").insert({
      funcionario_id: funcId,
      valor,
      data: String(f.get("data") ?? new Date().toISOString().slice(0, 10)),
      descricao: String(f.get("descricao") ?? ""),
      created_by: user!.id,
    });
    if (error) {
      toast.error("Falha ao registrar vale.");
      return;
    }
    void logAdmin("vale", `${brl(valor)}`);
    toast.success("Vale registrado.");
    (e.target as HTMLFormElement).reset();
    refresh();
  }

  async function fecharAcerto() {
    if (!acertoMoto) return;
    const func = (funcs ?? []).find((f: any) => f.user_id === acertoMoto);
    const idsVales = (vales ?? [])
      .filter((v: any) => !v.descontado && (!func || v.funcionario_id === func.id))
      .map((v: any) => v.id);
    const { error: eAc } = await supabase.from("acertos_motoboy").insert({
      motoboy_id: acertoMoto,
      periodo_ini: acertoIni,
      periodo_fim: acertoFim,
      entregas: (entregasAcerto ?? []).length,
      taxas: acertoTaxas,
      vales: acertoVales,
      liquido: acertoLiquido,
      created_by: user!.id,
    });
    if (eAc) {
      toast.error("Falha ao persistir acerto (rode a 0083 em teste).");
      return;
    }
    if (idsVales.length > 0) {
      const { error } = await supabase
        .from("vales")
        .update({ descontado: true })
        .in("id", idsVales);
      if (error) {
        toast.error("Acerto salvo, mas falha ao descontar vales.");
        return;
      }
    }
    void logAdmin(
      "acerto_motoboy",
      `${acertoMoto.slice(0, 8)} ${acertoIni}..${acertoFim} = ${brl(acertoLiquido)}`,
    );
    toast.success(`Acerto fechado: ${brl(acertoLiquido)}.`);
    refresh();
  }

  async function gerarFolha(funcId: string) {
    const func = (funcs ?? []).find((f: any) => f.id === funcId);
    if (!func) return;
    // Dedupe: folha do mesmo mês/funcionário só uma vez.
    const { data: ja } = await supabase
      .from("contas")
      .select("id")
      .eq("descricao", `Folha ${mes} — ${func.nome}`)
      .limit(1)
      .maybeSingle();
    if (ja) {
      toast.error("Folha deste mês já gerada para este funcionário.");
      return;
    }
    const diasTrab = new Set(
      (pontos ?? []).filter((p: any) => p.funcionario_id === funcId).map((p: any) => p.data),
    ).size;
    const base =
      func.tipo_remuneracao === "diaria"
        ? Number(func.valor ?? 0) * diasTrab
        : Number(func.valor ?? 0);
    const valesPend = (vales ?? [])
      .filter((v: any) => v.funcionario_id === funcId && !v.descontado)
      .reduce((s: number, v: any) => s + Number(v.valor ?? 0), 0);
    const liquido = Math.max(0, base - valesPend);
    const { error } = await supabase.from("contas").insert({
      tipo: "pagar",
      descricao: `Folha ${mes} — ${func.nome}`,
      categoria: "folha",
      fornecedor: func.nome,
      valor: liquido,
      meio: "transferencia",
      vencimento: `${mes}-05`,
      created_by: user!.id,
    });
    if (error) {
      toast.error("Falha ao gerar conta (rode a 0072).");
      return;
    }
    const ids = (vales ?? [])
      .filter((v: any) => v.funcionario_id === funcId && !v.descontado)
      .map((v: any) => v.id);
    if (ids.length > 0) await supabase.from("vales").update({ descontado: true }).in("id", ids);
    void logAdmin("folha_gerada", `${func.nome} ${mes} = ${brl(liquido)}`);
    toast.success(`Folha gerada: ${brl(liquido)} em contas a pagar.`);
    refresh();
  }

  const acertoTaxas = (entregasAcerto ?? []).reduce(
    (s: number, p: any) => s + (Number(p.taxa_motoboy ?? 0) || 0),
    0,
  );
  const acertoVales = (() => {
    const func = (funcs ?? []).find((f: any) => f.user_id === acertoMoto);
    return (vales ?? [])
      .filter((v: any) => !v.descontado && (!func || v.funcionario_id === func.id))
      .reduce((s: number, v: any) => s + Number(v.valor ?? 0), 0);
  })();
  const acertoLiquido = Math.max(0, acertoTaxas - acertoVales);

  if (!user) return null;

  const meusPontos = (pontos ?? []).filter((p: any) => meuFunc && p.funcionario_id === meuFunc.id);
  const minhaEscala = (escalas ?? []).filter(
    (e: any) => meuFunc && e.funcionario_id === meuFunc.id,
  );
  const meusVales = (vales ?? []).filter((v: any) => meuFunc && v.funcionario_id === meuFunc.id);

  return (
    <>
      <AdminTopbar
        usuario={user?.email ?? null}
        acesso={staff ? "Equipe (gestão)" : "Equipe"}
        onSair={async () => {
          await supabase.auth.signOut();
          navigate({ to: "/auth", replace: true });
        }}
      />
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8">
        <PageHeader titulo="Equipe" descricao="Cadastro, escala, ponto, vales e acertos." />

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-xl">Meu ponto</h2>
          {meuFunc ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span>
                {meuFunc.nome} • {meuFunc.funcao || "sem função"}
              </span>
              <Button size="sm" onClick={() => baterPonto("entrada")}>
                Bater entrada
              </Button>
              <Button size="sm" variant="outline" onClick={() => baterPonto("saida")}>
                Bater saída
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Seu login não está vinculado a um funcionário — peça ao admin.
            </p>
          )}
          {meuFunc ? (
            <>
              <h3 className="mt-3 text-sm font-bold">Minha escala</h3>
              <ul className="mt-1 grid gap-1 text-sm sm:grid-cols-2">
                {minhaEscala.map((e: any) => (
                  <li key={e.id} className="rounded bg-muted px-2 py-1">
                    {DIAS[e.dia_semana]}: {e.entrada?.slice(0, 5)}–{e.saida?.slice(0, 5)}
                  </li>
                ))}
                {minhaEscala.length === 0 ? (
                  <li className="text-muted-foreground">Sem escala cadastrada.</li>
                ) : null}
              </ul>
              <h3 className="mt-3 text-sm font-bold">Meus vales ({mes})</h3>
              <p className="text-sm text-muted-foreground">
                {brl(meusVales.reduce((s: number, v: any) => s + Number(v.valor ?? 0), 0))} em{" "}
                {meusVales.length} vale(s).
              </p>
            </>
          ) : null}
        </section>

        {staff ? (
          <>
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-display text-xl">Funcionários</h2>
              <ul className="mt-2 divide-y divide-border">
                {(funcs ?? []).map((f: any) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <span className="block font-semibold">
                        {f.nome} {f.ativo ? "" : "(inativo)"}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {f.funcao} • {f.tipo_remuneracao} {brl(f.valor)}{" "}
                        {f.user_id ? "• login vinculado" : "• sem login"}
                      </span>
                    </div>
                    {!f.user_id ? <VincularBox onOk={(email) => vincular(f.id, email)} /> : null}
                    <Button size="sm" variant="outline" onClick={() => gerarFolha(f.id)}>
                      Gerar folha {mes}
                    </Button>
                  </li>
                ))}
                {(funcs ?? []).length === 0 ? (
                  <li className="py-2 text-sm text-muted-foreground">Nenhum funcionário.</li>
                ) : null}
              </ul>
              <form onSubmit={salvarFunc} className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                <div className="space-y-1">
                  <Label>Nome *</Label>
                  <Input name="nome" required />
                </div>
                <div className="space-y-1">
                  <Label>Função</Label>
                  <Input name="funcao" placeholder="atendente, motoboy…" />
                </div>
                <div className="space-y-1">
                  <Label>Remuneração</Label>
                  <select
                    name="tipo"
                    className="w-full rounded-md border border-input bg-background px-3 py-2"
                    defaultValue="mensal"
                  >
                    <option value="mensal">Mensal</option>
                    <option value="diaria">Diária</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Valor (R$)</Label>
                  <Input name="valor" type="number" min={0} step="0.01" />
                </div>
                <div className="space-y-1">
                  <Label>Contato</Label>
                  <Input name="contato" />
                </div>
                <div className="space-y-1">
                  <Label>Documentos</Label>
                  <Input name="documentos" />
                </div>
                <div className="space-y-1">
                  <Label>Admissão</Label>
                  <Input name="admissao" type="date" />
                </div>
                <div className="flex items-end">
                  <Button type="submit" size="sm">
                    Cadastrar
                  </Button>
                </div>
              </form>
            </section>

            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-display text-xl">Escalas da semana</h2>
              {(funcs ?? [])
                .filter((f: any) => f.ativo)
                .map((f: any) => (
                  <EscalaFunc
                    key={f.id}
                    func={f}
                    escalas={(escalas ?? []).filter((e: any) => e.funcionario_id === f.id)}
                    onSalvar={salvarEscala}
                  />
                ))}
            </section>

            <section className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-xl">Ponto — {mes}</h2>
                <Input
                  type="month"
                  value={mes}
                  onChange={(e) => setMes(e.target.value)}
                  className="ml-auto w-44"
                  aria-label="Mês"
                />
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {(pontos ?? []).slice(0, 100).map((p: any) => (
                  <li
                    key={p.id}
                    className="flex justify-between gap-2 rounded border border-border px-2 py-1"
                  >
                    <span>
                      {p.funcionarios?.nome ?? "?"} • {p.data}
                    </span>
                    <span className="text-muted-foreground">
                      in{" "}
                      {p.entrada
                        ? new Date(p.entrada).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}{" "}
                      • out{" "}
                      {p.saida
                        ? new Date(p.saida).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </span>
                  </li>
                ))}
                {(pontos ?? []).length === 0 ? (
                  <li className="text-muted-foreground">Sem registros.</li>
                ) : null}
              </ul>
            </section>

            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-display text-xl">Vales e adiantamentos</h2>
              <form onSubmit={novoVale} className="mt-2 grid gap-2 text-sm sm:grid-cols-5">
                <div className="space-y-1 sm:col-span-2">
                  <Label>Funcionário</Label>
                  <select
                    name="funcionario_id"
                    className="w-full rounded-md border border-input bg-background px-3 py-2"
                    defaultValue=""
                  >
                    <option value="">Escolha…</option>
                    {(funcs ?? [])
                      .filter((f: any) => f.ativo)
                      .map((f: any) => (
                        <option key={f.id} value={f.id}>
                          {f.nome}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Valor *</Label>
                  <Input name="valor" type="number" min={0} step="0.01" required />
                </div>
                <div className="space-y-1">
                  <Label>Data</Label>
                  <Input
                    name="data"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Descrição</Label>
                  <Input name="descricao" />
                </div>
                <div className="sm:col-span-5">
                  <Button type="submit" size="sm">
                    Registrar vale
                  </Button>
                </div>
              </form>
              <ul className="mt-2 space-y-1 text-sm">
                {(vales ?? []).map((v: any) => (
                  <li
                    key={v.id}
                    className="flex justify-between gap-2 rounded border border-border px-2 py-1"
                  >
                    <span>
                      {v.funcionarios?.nome} • {v.data}{" "}
                      {v.descontado ? <Badge variant="outline">descontado</Badge> : null}
                    </span>
                    <b>{brl(v.valor)}</b>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-display text-xl">Acerto do motoboy</h2>
              <div className="mt-2 grid gap-2 text-sm sm:grid-cols-4">
                <div className="space-y-1 sm:col-span-2">
                  <Label>Motoboy (login)</Label>
                  <select
                    value={acertoMoto}
                    onChange={(e) => setAcertoMoto(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2"
                  >
                    <option value="">Escolha…</option>
                    {(funcs ?? [])
                      .filter((f: any) => f.user_id)
                      .map((f: any) => (
                        <option key={f.user_id} value={f.user_id}>
                          {f.nome}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>De</Label>
                  <Input
                    type="date"
                    value={acertoIni}
                    onChange={(e) => setAcertoIni(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Até</Label>
                  <Input
                    type="date"
                    value={acertoFim}
                    onChange={(e) => setAcertoFim(e.target.value)}
                  />
                </div>
              </div>
              {acertoMoto ? (
                <div className="mt-2 text-sm">
                  <p>
                    {(entregasAcerto ?? []).length} entrega(s) • taxas {brl(acertoTaxas)} − vales{" "}
                    {brl(acertoVales)} = <b>{brl(acertoLiquido)}</b>
                  </p>
                  <Button size="sm" className="mt-2" onClick={fecharAcerto}>
                    Fechar acerto (desconta vales)
                  </Button>
                </div>
              ) : null}
            </section>
          </>
        ) : (
          <EmptyState titulo="Área da gestão" descricao="Você vê só seu ponto, escala e vales." />
        )}
      </div>
    </>
  );
}

function VincularBox({ onOk }: { onOk: (email: string) => void }) {
  const [email, setEmail] = useState("");
  return (
    <span className="flex items-center gap-1">
      <Input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="e-mail do login"
        className="h-8 w-44"
      />
      <Button size="sm" variant="outline" onClick={() => email.trim() && onOk(email)}>
        Vincular
      </Button>
    </span>
  );
}

function EscalaFunc({
  func,
  escalas,
  onSalvar,
}: {
  func: any;
  escalas: any[];
  onSalvar: (fid: string, dia: number, ent: string, sai: string) => void;
}) {
  const porDia = new Map(escalas.map((e: any) => [e.dia_semana, e]));
  const [vals, setVals] = useState<Record<number, { e: string; s: string }>>({});
  return (
    <div className="mt-2 rounded border border-border p-2">
      <p className="text-sm font-bold">{func.nome}</p>
      <div className="mt-1 grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
        {DIAS.map((d, i) => {
          const ex = porDia.get(i);
          return (
            <div key={i} className="flex items-center gap-1 text-xs">
              <span className="w-8 font-semibold">{d}</span>
              <input
                type="time"
                value={vals[i]?.e ?? ex?.entrada?.slice(0, 5) ?? ""}
                onChange={(e) =>
                  setVals({
                    ...vals,
                    [i]: { e: e.target.value, s: vals[i]?.s ?? ex?.saida?.slice(0, 5) ?? "" },
                  })
                }
                className="w-20 rounded border border-input bg-background px-1 py-1"
                aria-label={`Entrada ${d}`}
              />
              <input
                type="time"
                value={vals[i]?.s ?? ex?.saida?.slice(0, 5) ?? ""}
                onChange={(e) =>
                  setVals({
                    ...vals,
                    [i]: { e: vals[i]?.e ?? ex?.entrada?.slice(0, 5) ?? "", s: e.target.value },
                  })
                }
                className="w-20 rounded border border-input bg-background px-1 py-1"
                aria-label={`Saída ${d}`}
              />
              <button
                type="button"
                onClick={() =>
                  onSalvar(
                    func.id,
                    i,
                    vals[i]?.e ?? ex?.entrada?.slice(0, 5) ?? "",
                    vals[i]?.s ?? ex?.saida?.slice(0, 5) ?? "",
                  )
                }
                className="rounded border border-input px-1.5 py-1"
                aria-label={`Salvar ${d}`}
              >
                ✓
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
