import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, Bike, ChefHat, ClipboardList, DollarSign, Home, Package, Settings, ShoppingCart, Users } from "lucide-react";
import { L1Badge, L1Btn, L1Root, L1Section, L1Shell, L1Stat } from "@/components/l1/ui";
import l1PreviewCss from "../../l1-preview.css?url";

/**
 * L1 PREVIEW ONLY — Gestão Administrativa (tema claro).
 * Rota: /preview/l1-gestao. Dados fictícios, sem Supabase, sem escrita.
 */

export const Route = createFileRoute("/preview/l1-gestao")({
  head: () => ({
    meta: [{ title: "L1 Preview — Gestão Administrativa" }],
    links: [
      { rel: "stylesheet", href: l1PreviewCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Nunito+Sans:wght@400;600;700&display=swap",
      },
    ],
  }),
  component: L1Gestao,
});

const NAV = [
  { grupo: "Principal", rotulo: "Dashboard", icone: Home },
  { grupo: "Operação", rotulo: "Pedidos", icone: ClipboardList },
  { grupo: "Operação", rotulo: "PDV", icone: ShoppingCart },
  { grupo: "Operação", rotulo: "Produção", icone: ChefHat },
  { grupo: "Operação", rotulo: "Entregas", icone: Bike },
  { grupo: "Gestão", rotulo: "Financeiro", icone: DollarSign },
  { grupo: "Gestão", rotulo: "Estoque", icone: Package },
  { grupo: "Gestão", rotulo: "Clientes", icone: Users },
  { grupo: "Gestão", rotulo: "Relatórios", icone: BarChart3 },
  { grupo: "Sistema", rotulo: "Configurações", icone: Settings },
];

export function L1Gestao() {
  return (
    <L1Root>
      <L1Shell
        nav={NAV}
        ativo="Dashboard"
        titulo="Dashboard"
        icone={Home}
        subtitulo="Visão geral da operação de hoje."
        topo={<L1Btn cor="ghost" tam="sm">Exportar relatório</L1Btn>}
      >
        <div className="l1-grid cols-auto">
          <L1Stat numero="R$ 1.240" texto="Vendas do dia" icone={DollarSign} fundo="#E2F2E7" />
          <L1Stat numero="14" texto="Pedidos em andamento" icone={ClipboardList} fundo="#E2ECF9" />
          <L1Stat numero="R$ 980" texto="Faturamento − despesas" icone={BarChart3} fundo="#F3E9D2" />
          <L1Stat numero="3" texto="Alertas de estoque" icone={Package} fundo="#FDF0C8" />
        </div>

        <L1Section titulo="Pedidos em andamento" sub="Por etapa, com os mesmos dados dos cartões.">
          <div className="l1-table-wrap">
            <table className="l1-table">
              <thead>
                <tr><th>#</th><th>Cliente</th><th>Tipo</th><th>Qtd</th><th>Total</th><th>Situação</th></tr>
              </thead>
              <tbody>
                {[
                  ["1263", "Fernanda Lima", "Entrega", "65 un.", "R$ 65,00", ["Novo", "red"]],
                  ["1261", "Ana Costa", "Entrega", "50 un.", "R$ 50,00", ["Aceito", "gold"]],
                  ["1258", "Carlos Souza", "Entrega", "70 un.", "R$ 70,00", ["Em produção", "blue"]],
                  ["1249", "Roberto Lima", "Entrega", "20 un.", "R$ 20,00", ["Pronto", "green"]],
                ].map(([n, c, t, q, v, s]) => (
                  <tr key={n as string}>
                    <td><b>#{n}</b></td>
                    <td>{c}</td>
                    <td>{t}</td>
                    <td>{q}</td>
                    <td>{v}</td>
                    <td><L1Badge cor={(s as string[])[1] as "gold" | "green" | "red" | "blue"}>{(s as string[])[0]}</L1Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </L1Section>

        <L1Section titulo="Financeiro de hoje" sub="Indicadores com faturamento e despesas.">
          <div className="l1-grid cols-3">
            <div className="l1-card"><h3>Faturamento</h3><p className="l1-order-num" style={{ color: "#1e7e46" }}>R$ 1.240</p><p className="l1-meta">32 pedidos pagos</p></div>
            <div className="l1-card"><h3>Despesas</h3><p className="l1-order-num" style={{ color: "#c03535" }}>R$ 260</p><p className="l1-meta">Insumos + taxas</p></div>
            <div className="l1-card"><h3>Caixa atual</h3><p className="l1-order-num">R$ 980</p><p className="l1-meta">Sessão aberta às 08:00</p></div>
          </div>
        </L1Section>

        <L1Section titulo="Estoque e insumos" sub="Níveis baixos e compras sugeridas.">
          <div className="l1-grid cols-3">
            {[
              ["Farinha de trigo", "12 kg restantes", "yellow", "Comprar 25 kg"],
              ["Frango desfiado", "4 kg restantes", "red", "Comprar 10 kg"],
              ["Caixa 50 un.", "200 un. restantes", "green", "Estoque ok"],
            ].map(([n, q, c, a]) => (
              <div key={n as string} className="l1-card">
                <h3>{n}</h3>
                <p style={{ marginTop: 6 }}><L1Badge cor={c as "green" | "yellow" | "red"}>{q}</L1Badge></p>
                <p className="l1-meta">{a}</p>
              </div>
            ))}
          </div>
        </L1Section>

        <L1Section titulo="Equipe, clientes e relatórios" sub="Atalhos organizados por grupo.">
          <div className="l1-grid cols-3">
            <div className="l1-card"><h3>Funcionários</h3><p className="l1-meta">6 ativos • 2 em turno agora</p><div style={{ marginTop: 8 }}><L1Btn tam="sm" cor="ghost">Ver escala</L1Btn></div></div>
            <div className="l1-card"><h3>Clientes e comercial</h3><p className="l1-meta">128 ativos • 3 aniversários hoje</p><div style={{ marginTop: 8 }}><L1Btn tam="sm" cor="ghost">Ver campanhas</L1Btn></div></div>
            <div className="l1-card"><h3>Relatórios</h3><p className="l1-meta">Vendas, DRE e fechamento mensal</p><div style={{ marginTop: 8 }}><L1Btn tam="sm" cor="ghost">Abrir relatórios</L1Btn></div></div>
          </div>
        </L1Section>
      </L1Shell>
    </L1Root>
  );
}
