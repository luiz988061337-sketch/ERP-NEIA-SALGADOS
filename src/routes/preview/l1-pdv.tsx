import { createFileRoute } from "@tanstack/react-router";
import { Bike, Check, ChefHat, ClipboardList, Eye, Headset, Home, Package, Plus, Printer, Search, ShoppingCart, Users } from "lucide-react";
import { L1Alert, L1Badge, L1Btn, L1Root, L1Section, L1Shell, L1Stat } from "@/components/l1/ui";
import { L1_PEDIDOS_ACEITOS, L1_PEDIDOS_NOVOS, L1_TABELA } from "@/lib/l1-data";
import l1PreviewCss from "../../l1-preview.css?url";

/**
 * L1 PREVIEW ONLY — PDV e Atendimento (tema claro).
 * Rota: /preview/l1-pdv. Dados fictícios, sem Supabase, sem escrita.
 */

export const Route = createFileRoute("/preview/l1-pdv")({
  head: () => ({
    meta: [{ title: "L1 Preview — PDV e Atendimento" }],
    links: [
      { rel: "stylesheet", href: l1PreviewCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Nunito+Sans:wght@400;600;700&display=swap",
      },
    ],
  }),
  component: L1Pdv,
});

const NAV = [
  { rotulo: "Dashboard", icone: Home },
  { rotulo: "PDV", icone: ShoppingCart },
  { rotulo: "Pedidos", icone: ClipboardList },
  { rotulo: "Produção", icone: ChefHat },
  { rotulo: "Entregas", icone: Bike },
  { rotulo: "Clientes", icone: Users },
  { rotulo: "Produtos", icone: Package },
];

function CartaoPedido({ p, novo }: { p: (typeof L1_PEDIDOS_NOVOS)[number]; novo?: boolean }) {
  return (
    <article className="l1-card" aria-label={`Pedido ${p.numero}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="l1-order-num">#{p.numero}</span>
        <span className="l1-time">{p.prometido}</span>
        <L1Badge cor={p.corEstado}>{p.estado}</L1Badge>
        <span style={{ marginLeft: "auto" }}>
          <L1Badge cor={p.tipo === "entrega" ? "blue" : "purple"}>{p.tipo === "entrega" ? "Entrega" : "Retirada"}</L1Badge>
        </span>
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 14 }}><b>Cliente:</b> {p.cliente}</p>
      <p className="l1-meta"><Search size={14} aria-hidden />{p.telefone}{p.endereco ? ` • ${p.endereco} • ${p.dist}` : ""}</p>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 4 }}>
        <ul className="l1-flavors" style={{ flex: 1 }}>
          {p.itens.map((it, i) => (
            <li key={i}><b>{it.qtd}</b> {it.sabor}</li>
          ))}
        </ul>
        <div className="l1-total">Total<br /><b>{p.total} un.</b><br />{p.valor}</div>
      </div>
      <p className="l1-meta">{p.pagto}</p>
      {p.obs ? <p className="l1-obs">Obs.: {p.obs}</p> : null}
      <div className="l1-btn-row" style={{ marginTop: 10 }}>
        {novo ? (
          <L1Btn><Check /> Aceitar Pedido</L1Btn>
        ) : (
          <L1Btn cor="blue"><Check /> Liberar p/ cozinha</L1Btn>
        )}
        <L1Btn cor="ghost"><Eye /> Ver detalhes</L1Btn>
      </div>
      {p.extra ? <p className="l1-meta" style={{ color: "#B48A36", fontWeight: 800 }}>{p.extra}</p> : null}
    </article>
  );
}

export function L1Pdv() {
  return (
    <L1Root>
      <L1Shell
        nav={NAV}
        ativo="PDV"
        titulo="PDV e Atendimento"
        icone={Headset}
        subtitulo="Receba, confirme e acompanhe os pedidos."
        topo={
          <>
            <L1Btn cor="dark" tam="sm"><Plus /> Novo Pedido</L1Btn>
            <L1Btn cor="ghost" tam="sm"><Printer /> Caixa</L1Btn>
          </>
        }
      >
        <div className="l1-grid cols-auto">
          <L1Stat numero="6" texto="Aguardando aceitação" icone={ClipboardList} fundo="#F3E9D2" />
          <L1Stat numero="8" texto="Aceitos" icone={Check} fundo="#E2ECF9" />
          <L1Stat numero="R$ 1,2 mil" texto="Vendas do dia" icone={ShoppingCart} fundo="#E2F2E7" />
          <L1Stat numero="2" texto="Agendados" icone={Headset} fundo="#F2F0EA" />
        </div>

        <div className="l1-btn-row" style={{ marginTop: 12 }}>
          {["Todos (28)", "Aguardando aceitação (6)", "Aceitos (8)", "Agendados (2)", "Pagamento pendente"].map((f, i) => (
            <button key={f} type="button" className={`l1-pill${i === 0 ? " on" : ""}`}>{f}</button>
          ))}
          <span className="l1-field"><Search aria-hidden /><input placeholder="Buscar por número, cliente ou sabor…" aria-label="Buscar pedido" /></span>
        </div>

        <L1Alert cor="yellow">2 pedidos com pagamento pendente aguardam análise do responsável.</L1Alert>

        <L1Section titulo="Novos Pedidos" sub="Toque em Aceitar para confirmar. Botões grandes para touchscreen.">
          <div className="l1-grid cols-3">
            {L1_PEDIDOS_NOVOS.map((p) => (
              <CartaoPedido key={p.numero} p={p} novo />
            ))}
          </div>
        </L1Section>

        <L1Section titulo="Aceitos" sub="Com janela de envio à cozinha e situação do pagamento.">
          <div className="l1-grid cols-3">
            {L1_PEDIDOS_ACEITOS.map((p) => (
              <CartaoPedido key={p.numero} p={p} />
            ))}
          </div>
        </L1Section>

        <L1Section titulo="Pedidos Aceitos / Agendados" sub="Consulta rápida com exportação.">
          <div className="l1-table-wrap">
            <table className="l1-table">
              <thead>
                <tr><th>#</th><th>Horário</th><th>Cliente</th><th>Tipo</th><th>Itens</th><th>Qtd</th><th>Total</th><th>Situação</th><th>Envio</th></tr>
              </thead>
              <tbody>
                {L1_TABELA.map((r) => (
                  <tr key={r.n}>
                    <td><b>#{r.n}</b></td>
                    <td><b style={{ color: "#B48A36" }}>{r.hora}</b></td>
                    <td>{r.cliente}</td>
                    <td><L1Badge cor={r.tipo === "Entrega" ? "blue" : "purple"}>{r.tipo}</L1Badge></td>
                    <td>{r.itens}</td>
                    <td>{r.qtd}</td>
                    <td>{r.valor}</td>
                    <td><L1Badge cor="gold">{r.sit}</L1Badge></td>
                    <td>{r.envio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </L1Section>
      </L1Shell>
    </L1Root>
  );
}
