import { useState } from "react";
import { AlertTriangle, Calculator, CalendarDays, Download, Eye, FileText, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PremiumPageHeader, PremiumSection, StatusBadge } from "@/components/admin/erp-ui";
import { brl } from "@/lib/format";
import { CONTADOR_PREMIUM_DEMO } from "@/lib/contabilidade-premium-demo";
import { ehModoDemo } from "@/lib/demo-preview";
import type { LucideIcon } from "lucide-react";

type CorAlerta = "gold" | "green" | "blue" | "orange" | "red";
type KpiContadorTipo = { icone: LucideIcon; rotulo: string; valor: string; detalhe?: string; tint: "gold" | "green" | "blue" | "orange" | "red" };

const FUNDO_KPI: Record<"gold" | "green" | "blue" | "orange" | "red", string> = {
  gold: "#2A200D",
  orange: "#2A200D",
  blue: "#101C2D",
  green: "#0C2418",
  red: "#2A1114",
};

function KpiContador({ icone: Icone, rotulo, valor, detalhe, tint = "gold" }: { icone: LucideIcon; rotulo: string; valor: string; detalhe?: string | undefined; tint: "gold" | "green" | "blue" | "orange" | "red" }) {
  return (
    <div
      className="flex min-h-[92px] items-center gap-3 rounded-xl border border-[#D4A94A] px-4 py-3 shadow-card"
      style={{ backgroundColor: FUNDO_KPI[tint] }}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full border border-[#D4A94A] bg-[#1A1712]">
        <Icone className="size-5 text-[#F2CE6B]" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] text-[#A09A8E]">{rotulo}</p>
        <p className="font-display text-[22px] font-bold leading-tight text-[#F4F1EA]">{valor}</p>
        {detalhe ? <p className="truncate text-[12px] text-[#C9C2B8]">{detalhe}</p> : null}
      </div>
    </div>
  );
}

export function ContadorPremium() {
  const modoDemo = ehModoDemo();
  const c = CONTADOR_PREMIUM_DEMO;
  const [mes, setMes] = useState("2026-11");
  const [buscaDoc, setBuscaDoc] = useState("");
  const [filtroDoc, setFiltroDoc] = useState("todos");

  const kpis: KpiContadorTipo[] = [
    { icone: CalendarDays, rotulo: "Fechamento do período", valor: c.fechamento.status, detalhe: `${mes} · fechamento em aberto`, tint: "orange" },
    { icone: FileText, rotulo: "Documentos fiscais", valor: "12", detalhe: "4 autorizados · 1 pendente", tint: "blue" },
    { icone: AlertTriangle, rotulo: "Pendências documentais", valor: "3", detalhe: "para o fechamento", tint: "orange" },
    { icone: Calculator, rotulo: "Resultado (DRE)", valor: "R$ 140,50", detalhe: "margem de 100,0%", tint: "green" },
    { icone: ShieldCheck, rotulo: "Contas sem comprovante", valor: "2", detalhe: "contas pagas sem anexo", tint: "red" },
    { icone: Download, rotulo: "Exportações prontas", valor: "3", detalhe: "relatórios prontos para envio", tint: "blue" },
  ];

  const docsFiltrados = c.docs.filter((d) => {
    const q = buscaDoc.trim().toLowerCase();
    const okQ = !q || d.cliente.toLowerCase().includes(q) || d.numero.includes(q);
    const okF = filtroDoc === "todos" || d.status === filtroDoc;
    return okQ && okF;
  });

  const STATUS_DOC: Record<string, "ok" | "info" | "atencao" | "perigo" | "neutro"> = {
    AUTORIZADO: "ok",
    PENDENTE: "atencao",
    REJEITADO: "perigo",
    CANCELADO: "neutro",
  };

  return (
    <div className="space-y-5 pb-28">
      <PremiumPageHeader
        icone={FileText}
        titulo="Contador"
        subtitulo="Somente leitura fiscal e financeira, com registro de cada acesso."
        demo={modoDemo}
        acoes={
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#F2CE6B]" aria-hidden />
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              aria-label="Competência"
              className="h-9 w-52 appearance-none rounded-md border border-[#D4A94A]/60 bg-[#141310] px-3 pr-9 text-[13px] text-[#F4F1EA]"
            >
              <option value="2026-11">novembro de 2026</option>
              <option value="2026-10">outubro de 2026</option>
              <option value="2026-09">setembro de 2026</option>
            </select>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((k) => (
          <KpiContador key={k.rotulo} icone={k.icone} rotulo={k.rotulo} valor={k.valor} detalhe={k.detalhe} tint={k.tint} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <PremiumSection
            icone={CalendarDays}
            titulo="Fechamento Contábil"
            subtitulo="Série de acertos contábeis do período."
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-full bg-[#F2CE6B] px-3 py-1 text-[11px] font-bold uppercase text-[#17150F]">
                {c.fechamento.status}
              </span>
              <p className="text-[12px] text-[#A09A8E]">Competência {mes} · fechamento em aberto.</p>
            </div>

            <ol className="mt-4 space-y-0">
              {[
                { etapa: "Lançamentos", status: "concluido", cor: "#35C97C" },
                { etapa: "Revisão documental", status: "concluido", cor: "#35C97C" },
                { etapa: "Fechamento contábil", status: "em_andamento", cor: "#F5A623" },
                { etapa: "Envio ao contador", status: "pendente", cor: "#A09A8E" },
              ].map((s, i, arr) => (
                <li key={s.etapa} className="relative flex items-start gap-3 pb-5 pl-6 last:pb-0">
                  <span
                    className="absolute left-0 top-1 grid size-3.5 -translate-y-1/2 rounded-full"
                    style={{ backgroundColor: s.cor }}
                    aria-hidden
                  />
                  {i < arr.length - 1 ? <span className="absolute left-[5px] top-5 h-[calc(100%-8px)] w-px bg-[#2A2721]" aria-hidden /> : null}
                  <div>
                    <p className="text-[13px] font-semibold text-[#F4F1EA]">{s.etapa}</p>
                    <p className="text-[12px] text-[#A09A8E]">{s.status === "concluido" ? "Concluído" : s.status === "em_andamento" ? "Em andamento" : s.status === "pendente" ? "Pendente" : "Não iniciado"}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { rotulo: "Documentos rejeitados", valor: String(c.fechamento.docsRejeitados) },
                { rotulo: "Contas pagas sem comprovante", valor: String(c.fechamento.contasSemComprovante) },
                { rotulo: "DRE demonstrativo", valor: brl(c.fechamento.dre.resultado) },
              ].map((s) => (
                <div key={s.rotulo} className="rounded-lg border border-[#2A2721] bg-[#141310] px-3 py-2">
                  <p className="text-[11px] text-[#A09A8E]">{s.rotulo}</p>
                  <p className="font-display text-[16px] font-bold text-[#F4F1EA]">{s.valor}</p>
                </div>
              ))}
            </div>

            <p className="mt-3 text-[12px] leading-snug text-[#A09A8E]">{c.fechamento.observacao}</p>
            <Button type="button" className="erp-btn-gold mt-3 min-h-9 gap-2 text-[13px] font-semibold text-[#14120C]" onClick={() => toast.info("Envio ao contador simulado (demonstração).")}>
              Enviar ao contador
            </Button>
          </PremiumSection>

          <PremiumSection
            icone={FileText}
            titulo="Documentos Fiscais"
            subtitulo="NF-e do período · homologação visual."
            acoes={<Button type="button" variant="outline" size="sm" className="min-h-8 border-[#D4A94A]/60 text-[#F2CE6B] hover:bg-[#1A1712]" onClick={() => toast.info("Exportação de vendas simulada (demonstração).")}>Exportar vendas (CSV)</Button>}
          >
            <div className="mb-3 grid gap-2 sm:grid-cols-2">
              <Input
                value={buscaDoc}
                onChange={(e) => setBuscaDoc(e.target.value)}
                placeholder="Buscar NF-e ou cliente…"
                aria-label="Buscar documento fiscal"
                className="h-9 border-[#D4A94A]/50 bg-[#141310] text-[13px] text-[#F4F1EA] placeholder:text-[#A09A8E]"
              />
              <div className="flex items-center gap-2">
                <select
                  value={filtroDoc}
                  onChange={(e) => setFiltroDoc(e.target.value)}
                  aria-label="Filtrar status"
                  className="h-9 w-full rounded-md border border-[#D4A94A]/50 bg-[#141310] px-3 text-[13px] text-[#F4F1EA]"
                >
                  <option value="todos">Todos os status</option>
                  <option value="AUTORIZADO">Autorizado</option>
                  <option value="PENDENTE">Pendente</option>
                  <option value="REJEITADO">Rejeitado</option>
                  <option value="CANCELADO">Cancelado</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-[#D4A94A] bg-[#1B1811] text-left text-[11px] uppercase tracking-wide text-[#C9C2B8]">
                    <th className="px-3 py-2.5">Documento</th>
                    <th className="px-3 py-2.5">Cliente</th>
                    <th className="px-3 py-2.5">Data</th>
                    <th className="px-3 py-2.5">Valor</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A2721]">
                  {docsFiltrados.map((d) => (
                    <tr key={d.id} className="hover:bg-[#211F18]">
                      <td className="px-3 py-3 font-bold text-[#F2CE6B]">NF-e · nº {d.numero}</td>
                      <td className="px-3 py-3 text-[#C9C2B8]">{d.cliente}</td>
                      <td className="px-3 py-3 text-[#C9C2B8]">{d.data}</td>
                      <td className="px-3 py-3 font-semibold text-[#F4F1EA]">{d.valor > 0 ? brl(d.valor) : "—"}</td>
                      <td className="px-3 py-3">
                        <StatusBadge tom={STATUS_DOC[d.status] ?? "neutro"}>{d.status}</StatusBadge>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 border-[#D4A94A]/60 px-2 text-[11px] text-[#F2CE6B] hover:bg-[#1A1712]" onClick={() => toast.info(`Visualização da ${d.numero} simulada (demonstração).`)}>
                          <Eye className="size-3.5" aria-hidden /> Ver
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PremiumSection>

          <div className="grid gap-4 lg:grid-cols-2">
            <PremiumSection
              icone={FileText}
              titulo="Solicitações de Documentos"
              subtitulo="Pedidos de comprovantes ao contador."
              bodyClassName="p-3"
            >
              <div className="space-y-2">
                {c.solicitacoes.map((s) => (
                  <div key={s.id} className="rounded-lg border border-[#2A2721] bg-[#141310] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 text-[13px] text-[#C9C2B8]">{s.texto}</p>
                      <StatusBadge tom={s.status === "respondida" ? "ok" : "atencao"}>{s.status}</StatusBadge>
                    </div>
                    {s.resposta ? <p className="mt-1 text-[12px] text-[#A09A8E]">{s.resposta}</p> : null}
                  </div>
                ))}
              </div>
            </PremiumSection>

            <PremiumSection
              icone={ShieldCheck}
              titulo="Acessos Registrados"
              subtitulo="Registro de visualizações no módulo."
              bodyClassName="p-3"
            >
              <div className="space-y-1.5">
                {c.acessos.map((a, i) => (
                  <div key={i} className="rounded-lg border border-[#2A2721] bg-[#141310] px-3 py-2 text-[12px] leading-snug text-[#C9C2B8]">
                    <span className="font-semibold text-[#F4F1EA]">{a.dataHora}</span>
                    {" · "}
                    {a.usuario}
                    {" · "}
                    {a.perfil}
                    {" · "}
                    {a.acao}
                  </div>
                ))}
              </div>
            </PremiumSection>
          </div>
        </div>

        <div className="space-y-4">
          <PremiumSection
            icone={Calculator}
            titulo="Vendas por Pagamento"
            subtitulo="Recebimentos do período em dinheiro, PIX e cartão."
            bodyClassName="p-3"
          >
            <ul className="space-y-1.5">
              {c.vendasPorPagamento.map((v) => (
                <li key={v.meio} className="flex items-center justify-between rounded-lg border border-[#2A2721] bg-[#141310] px-3 py-2 text-[13px]">
                  <span className="text-[#C9C2B8]">
                    {v.meio} ({v.qtd})
                  </span>
                  <b className="text-[#F4F1EA]">{brl(v.total)}</b>
                </li>
              ))}
              <li className="flex items-center justify-between rounded-lg border border-[#D4A94A] bg-[#211B0F] px-3 py-2 text-[13px] font-bold">
                <span className="text-[#F2CE6B]">Total recebido</span>
                <span className="font-display text-[16px] text-[#F2CE6B]">{brl(c.vendasPorPagamento.reduce((s, v) => s + v.total, 0))}</span>
              </li>
            </ul>
          </PremiumSection>

          <PremiumSection
            icone={AlertTriangle}
            titulo="Alertas de Conformidade"
            subtitulo="Pontos de atenção fiscal e documental."
            bodyClassName="p-3"
          >
            <div className="space-y-2.5">
              {c.alertas.map((a) => (
                <div key={a.titulo} className="rounded-lg border border-[#2A2721] bg-[#141310] px-3 py-2">
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-[#F4F1EA]">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: a.cor }} aria-hidden />
                    {a.titulo}
                  </p>
                  <p className="mt-1 text-[12px] leading-snug text-[#A09A8E]">{a.texto}</p>
                </div>
              ))}
            </div>
          </PremiumSection>

          <PremiumSection
            icone={Download}
            titulo="Arquivos e Exportações"
            subtitulo="Relatórios prontos para o contador."
            bodyClassName="p-3"
          >
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#2A2721] bg-[#141310] px-3 py-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-[#D4A94A]/60 bg-[#1A1712]">
                <FileText className="size-5 text-[#F2CE6B]" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-[#F4F1EA]">3 relatórios disponíveis</p>
                <p className="text-[12px] text-[#A09A8E]">
                  DRE, Vendas por pagamento e documentos fiscais.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                className="erp-btn-gold h-8 gap-1.5 px-3 text-[12px] font-bold text-[#14120C]"
                onClick={() => toast.info("Download dos relatórios simulado (demonstração).")}
              >
                <Download className="size-4" aria-hidden /> Baixar todos
              </Button>
            </div>
          </PremiumSection>
        </div>
      </div>
    </div>
  );
}
