import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, Clock3, History, LockKeyhole, Pencil, Plus, Search, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { ERP_COLORS, PremiumKpi, PremiumPageHeader, PremiumSection, StatusBadge } from "@/components/admin/erp-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { logAdmin } from "@/lib/operacao";

type Fornecedor = {
  id: string;
  nome: string;
  cnpj: string | null;
  contato: string | null;
  prazo_entrega_dias: number | null;
  condicoes_pagamento: string | null;
  ativo: boolean;
  created_at: string;
};

export function FornecedoresAdmin() {
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<Fornecedor | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [salvando, setSalvando] = useState(false);
  const queryKey = ["estoque-fornecedores"];
  const { data: lista, isError, isPending, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<Fornecedor[]> => {
      const { data, error } = await supabase.from("fornecedores").select("*").order("nome");
      if (error) throw error;
      return (data ?? []) as Fornecedor[];
    },
  });

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const f = new FormData(formulario);
    const nome = String(f.get("nome") ?? "").trim();
    if (nome.length < 2) {
      toast.error("Informe o nome do fornecedor.");
      return;
    }
    const body = {
      nome,
      cnpj: String(f.get("cnpj") ?? "").trim(),
      contato: String(f.get("contato") ?? "").trim(),
      prazo_entrega_dias: Number(f.get("prazo_entrega_dias") ?? 7) || 0,
      condicoes_pagamento: String(f.get("condicoes_pagamento") ?? "").trim(),
      ativo: f.get("ativo") === "on",
    };
    setSalvando(true);
    try {
      const { error } = editando
        ? await supabase.from("fornecedores").update(body).eq("id", editando.id)
        : await supabase.from("fornecedores").insert(body);
      if (error) throw error;
      void logAdmin(editando ? "fornecedor_alterado" : "fornecedor_criado", nome);
      setEditando(null);
      formulario.reset();
      toast.success("Fornecedor salvo.");
      await atualizarFornecedores();
    } catch {
      toast.error("Não foi possível salvar o fornecedor.");
    } finally {
      setSalvando(false);
    }
  }

  async function atualizarFornecedores() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ["estoque-fornecedores-ativos"] }),
    ]);
  }

  async function alterarSituacao(fornecedor: Fornecedor, ativo: boolean) {
    setSalvando(true);
    try {
      const { error } = await supabase.from("fornecedores").update({ ativo }).eq("id", fornecedor.id);
      if (error) throw error;
      void logAdmin("fornecedor_alterado", fornecedor.nome);
      await atualizarFornecedores();
    } catch {
      toast.error("Não foi possível atualizar a situação.");
    } finally {
      setSalvando(false);
    }
  }

  const fornecedores = lista ?? [];
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const filtrados = fornecedores.filter((f) =>
    [f.nome, f.cnpj, f.contato].some((campo) => campo?.toLocaleLowerCase("pt-BR").includes(termo)) &&
    (filtro === "todos" || (filtro === "sem-contato" ? !f.contato?.trim() : f.ativo === (filtro === "ativo"))),
  );
  const ativos = fornecedores.filter((f) => f.ativo).length;
  const prazos = fornecedores.flatMap((f) => f.prazo_entrega_dias == null ? [] : [f.prazo_entrega_dias]);
  const prazoMedio = prazos.length ? (prazos.reduce((a, b) => a + b, 0) / prazos.length).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " dias" : "—";
  const metricas = [
    { rotulo: "Fornecedores", valor: fornecedores.length, detalhe: ativos + " ativos", icone: Building2, cor: ERP_COLORS.goldStrong },
    { rotulo: "Prazo médio", valor: prazoMedio, detalhe: "prazo cadastrado", icone: Clock3, cor: ERP_COLORS.blue },
    { rotulo: "Sem contato", valor: fornecedores.filter((f) => !f.contato?.trim()).length, detalhe: "cadastros sem contato", icone: AlertTriangle, cor: ERP_COLORS.orange },
    { rotulo: "Condições cadastradas", valor: fornecedores.filter((f) => f.condicoes_pagamento?.trim()).length, detalhe: "condições de pagamento", icone: TrendingUp, cor: ERP_COLORS.green },
  ];

  return (
    <div className="min-w-0 space-y-5 pb-28">
      <PremiumPageHeader icone={Building2} titulo="Fornecedores Premium" subtitulo="Cadastro, prazos e condições de fornecimento" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricas.map((k) => <PremiumKpi key={k.rotulo} {...k} valor={lista && !isError ? k.valor : "—"} />)}
      </div>

      <PremiumSection icone={Plus} titulo={editando ? "Editar fornecedor" : "Cadastrar fornecedor"} subtitulo="Dados de contato, prazo de entrega e condições comerciais.">
        <form id="cadastro-fornecedor" onSubmit={salvar} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" key={editando?.id ?? "novo"}>
          <div className="space-y-1"><Label htmlFor="fornecedor-nome">Nome</Label><Input id="fornecedor-nome" name="nome" required defaultValue={editando?.nome ?? ""} /></div>
          <div className="space-y-1"><Label htmlFor="fornecedor-cnpj">CNPJ</Label><Input id="fornecedor-cnpj" name="cnpj" defaultValue={editando?.cnpj ?? ""} /></div>
          <div className="space-y-1"><Label htmlFor="fornecedor-contato">Contato</Label><Input id="fornecedor-contato" name="contato" defaultValue={editando?.contato ?? ""} /></div>
          <div className="space-y-1"><Label htmlFor="fornecedor-prazo">Prazo de entrega (dias)</Label><Input id="fornecedor-prazo" name="prazo_entrega_dias" type="number" min="0" defaultValue={editando?.prazo_entrega_dias ?? 7} /></div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="fornecedor-pagamento">Condições de pagamento</Label><Input id="fornecedor-pagamento" name="condicoes_pagamento" defaultValue={editando?.condicoes_pagamento ?? ""} /></div>
          <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2 xl:col-span-3">
            <div className="flex items-center gap-2"><Switch id="fornecedor-ativo" name="ativo" defaultChecked={editando?.ativo ?? true} /><Label htmlFor="fornecedor-ativo">Fornecedor ativo</Label></div>
            <div className="flex flex-wrap gap-2">
              {editando && <Button type="button" variant="outline" disabled={salvando} onClick={() => setEditando(null)}>Cancelar edição</Button>}
              <Button type="submit" className="erp-btn-gold" disabled={salvando}><Plus size={16} aria-hidden />{editando ? "Salvar alterações" : "Adicionar fornecedor"}</Button>
            </div>
          </div>
        </form>
      </PremiumSection>

      <PremiumSection icone={LockKeyhole} titulo="Lista de fornecedores" acoes={
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0">
            <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input aria-label="Buscar fornecedor" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar fornecedor" className="h-9 pl-8" />
          </div>
          <select aria-label="Situação do fornecedor" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="todos">Todos</option><option value="ativo">Ativos</option><option value="inativo">Inativos</option><option value="sem-contato">Sem contato</option>
          </select>
        </div>
      }>
        {isError ? <p role="alert" className="flex flex-wrap items-center gap-2">Falha ao carregar fornecedores. <Button variant="outline" size="sm" onClick={() => void refetch()}>Tentar novamente</Button></p>
          : isPending ? <p role="status">Carregando fornecedores…</p>
          : <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-sm">
              <thead><tr className="border-b border-[#D4A94A] bg-[#1B1811] text-left text-xs uppercase tracking-wide text-[#C9C2B8]">
                {["Fornecedor", "Contato", "Prazo", "Condições", "Situação", "Ações"].map((titulo) => <th key={titulo} scope="col" className="px-3 py-2.5">{titulo}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-[#2A2721]">{filtrados.map((f) => <tr key={f.id} className="hover:bg-[#211F18]">
                <td className="px-3 py-3"><b className="text-[#F2CE6B]">{f.nome}</b><small className="block text-muted-foreground">{f.cnpj}</small></td>
                <td className="px-3 py-3">{f.contato || "—"}</td>
                <td className="px-3 py-3">{f.prazo_entrega_dias == null ? "—" : f.prazo_entrega_dias + " dias"}</td>
                <td className="px-3 py-3">{f.condicoes_pagamento || "—"}</td>
                <td className="px-3 py-3"><StatusBadge tom={f.ativo ? "ok" : "neutro"}>{f.ativo ? "Ativo" : "Pausado"}</StatusBadge></td>
                <td className="px-3 py-3"><div className="flex items-center gap-2">
                  <Switch checked={f.ativo} disabled={salvando || editando?.id === f.id} aria-label={f.nome + " ativo"} onCheckedChange={(ativo) => void alterarSituacao(f, ativo)} />
                  <Button type="button" variant="outline" size="sm" disabled={salvando} aria-label={"Editar " + f.nome} onClick={() => { setEditando(f); requestAnimationFrame(() => document.getElementById("fornecedor-nome")?.focus()); }}><Pencil size={16} aria-hidden /></Button>
                </div></td>
              </tr>)}</tbody>
            </table>
            {!filtrados.length && <p className="p-4 text-center text-muted-foreground">Nenhum fornecedor encontrado.</p>}
          </div>}
      </PremiumSection>

      {lista && !isError && <div className="grid gap-4 lg:grid-cols-2">
        <PremiumSection icone={History} titulo="Cadastros recentes">
          <ul className="divide-y divide-border">{[...fornecedores].sort((a,b) => b.created_at.localeCompare(a.created_at)).slice(0,5).map((f) => <li key={f.id} className="flex justify-between gap-2 py-2 text-sm"><span>{f.nome}</span><time className="text-muted-foreground" dateTime={f.created_at}>{new Date(f.created_at).toLocaleDateString("pt-BR")}</time></li>)}</ul>
          {!fornecedores.length && <p className="text-sm text-muted-foreground">Nenhum cadastro disponível.</p>}
        </PremiumSection>
        <PremiumSection icone={TrendingUp} titulo="Análise comercial">
          <dl className="grid grid-cols-[1fr_auto] gap-2 text-sm">
            <dt>Fornecedores ativos</dt><dd>{ativos}</dd>
            <dt>Fornecedores pausados</dt><dd>{fornecedores.length - ativos}</dd>
            <dt>Prazo médio cadastrado</dt><dd>{prazoMedio}</dd>
          </dl>
        </PremiumSection>
      </div>}
    </div>
  );
}
