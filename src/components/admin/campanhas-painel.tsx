import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Hourglass, Megaphone, MessageCircle, UserCheck, Users } from "lucide-react";
import { MetricCard, SectionCard, StatusBadge } from "@/components/admin/erp-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CustomerStats } from "@/lib/crm";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";

export function PainelCampanhas({ clientes, aptos, abrirCampanhas }: {
  clientes: CustomerStats[] | undefined;
  aptos: number | null;
  abrirCampanhas: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [faixa, setFaixa] = useState("todas");
  const { data: campanhas, isError, isPending, refetch } = useQuery({
    queryKey: ["crm-campanhas-painel"],
    queryFn: async () => {
      const { data, error } = await supabase.from("crm_campaigns").select("id, nome, segmento, status").order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string; segmento: string; status: string }[];
    },
  });
  const inativos = (clientes ?? []).filter((cliente) => (cliente.dias_sem_comprar ?? 0) >= 30);
  const faixas = [
    { inicio: 30, fim: 59, rotulo: "30 dias sem comprar", detalhe: "faixa de 30–59 dias" },
    { inicio: 60, fim: 89, rotulo: "60 dias sem comprar", detalhe: "faixa de 60–89 dias" },
    { inicio: 90, fim: Infinity, rotulo: "90+ dias sem comprar", detalhe: "90 dias ou mais" },
  ];
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const filtrados = inativos.filter((c) => {
    const dias = c.dias_sem_comprar ?? 0;
    const selecionada = faixas.find((f) => String(f.inicio) === faixa);
    return c.nome.toLocaleLowerCase("pt-BR").includes(termo) &&
      (!selecionada || (dias >= selecionada.inicio && dias <= selecionada.fim));
  });
  const rotuloCampanha = (status: string) => ({ rascunho: "Rascunho", pronta: "Pronta", enviada: "Enviada" }[status] ?? status);

  return (
    <div className="space-y-4">
      <header className="com-cabecalho">
        <span className="com-cabecalho-icone"><Megaphone size={22} aria-hidden /></span>
        <div><h1>Comercial — Marketing e Reativação</h1><p>Recuperação de clientes inativos e campanhas com aprovação</p></div>
      </header>
      <div className="com-kpis">
        {faixas.map(({ inicio, fim, rotulo, detalhe }) => <MetricCard key={inicio} icone={CalendarDays} label={rotulo} detalhe={detalhe} cor="#F2CE6B"
          valor={clientes ? inativos.filter((c) => (c.dias_sem_comprar ?? 0) >= inicio && (c.dias_sem_comprar ?? 0) <= fim).length : "—"} />)}
        <MetricCard icone={Megaphone} label="Campanhas em rascunho" valor={campanhas ? campanhas.filter((c) => c.status === "rascunho").length : "—"} detalhe="entre as 30 campanhas mais recentes" cor="#F2CE6B" />
        <MetricCard icone={Hourglass} label="Campanhas prontas" valor={campanhas ? campanhas.filter((c) => c.status === "pronta").length : "—"} detalhe="entre as 30 campanhas mais recentes" cor="#F2CE6B" />
        <MetricCard icone={UserCheck} label="Clientes aptos" valor={aptos ?? "—"} detalhe="conforme os filtros da campanha" cor="#35C97C" />
      </div>
      <p className="com-nota">As faixas de 30, 60 e 90 dias são exclusivas. Cada cliente aparece em uma faixa.</p>
      <div className="com-grade-principal">
        <SectionCard className="com-tabela-card min-w-0" titulo={<span className="com-titulo-com-icone"><Users size={17} aria-hidden />Segmentos de clientes inativos</span>}>
          <div className="mb-3 flex flex-wrap gap-2">
            <select aria-label="Faixa de inatividade" value={faixa} onChange={(e) => setFaixa(e.target.value)} className="min-h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="todas">Todas as faixas</option>
              {faixas.map((f) => <option key={f.inicio} value={f.inicio}>{f.rotulo}</option>)}
            </select>
            <Input aria-label="Buscar cliente" placeholder="Buscar cliente" value={busca} onChange={(e) => setBusca(e.target.value)} className="h-9 sm:w-44" />
          </div>
          <div className="com-tabela-simples-envolucro">
            <table className="com-tabela-simples"><thead><tr><th scope="col">Cliente</th><th scope="col">Último pedido</th><th scope="col">Dias sem comprar</th><th scope="col">Contato</th></tr></thead>
              <tbody>{filtrados.slice(0, 10).map((c) => <tr key={c.telefone_norm}>
                <td><b>{c.nome}</b></td>
                <td>{c.ultimo_pedido ? new Date(c.ultimo_pedido).toLocaleDateString("pt-BR") : "—"}</td>
                <td><StatusBadge tom={(c.dias_sem_comprar ?? 0) >= 90 ? "perigo" : "atencao"}>{c.dias_sem_comprar} dias</StatusBadge></td>
                <td>{c.opt_out ? "Opt-out" : c.tipo_cliente}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <p className="com-nota">{clientes ? (filtrados.length ? "Exibindo até 10 de " + filtrados.length + " clientes." : "Nenhum cliente nesta seleção.") : "Aguardando dados de clientes."}</p>
        </SectionCard>
        <SectionCard titulo={<span className="com-titulo-com-icone"><MessageCircle size={17} aria-hidden />Reativação de clientes</span>}>
          <p className="com-subtitulo">Selecione o público, revise a mensagem e registre a aprovação antes de abrir conversas individuais.</p>
          <Button type="button" className="erp-btn-gold" onClick={abrirCampanhas}>Preparar campanha</Button>
          <p className="com-nota">O envio continua manual pelo WhatsApp.</p>
        </SectionCard>
      </div>
      <SectionCard titulo="Campanhas e aprovação" acoes={<Button type="button" variant="outline" size="sm" onClick={abrirCampanhas}>Campanhas</Button>}>
        {isError ? <p role="alert">Falha ao carregar campanhas. <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>Tentar novamente</Button></p>
          : isPending ? <p role="status">Carregando campanhas…</p>
          : <div className="com-tabela-simples-envolucro"><table className="com-tabela-simples">
            <thead><tr><th scope="col">Campanha</th><th scope="col">Segmento</th><th scope="col">Status</th></tr></thead>
            <tbody>{campanhas?.map((campanha) => <tr key={campanha.id}><td><b>{campanha.nome}</b></td><td>{campanha.segmento}</td><td><StatusBadge tom={campanha.status === "pronta" ? "ok" : "neutro"}>{rotuloCampanha(campanha.status)}</StatusBadge></td></tr>)}</tbody>
          </table>{!campanhas?.length && <p className="com-nota">Nenhuma campanha cadastrada.</p>}</div>}
      </SectionCard>
    </div>
  );
}
