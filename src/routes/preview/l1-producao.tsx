import { createFileRoute } from "@tanstack/react-router";
import { Bike, ChefHat, Check, ClipboardList, Clock, Flame, Home, TriangleAlert } from "lucide-react";
import { L1Alert, L1Badge, L1Btn, L1Root, L1Section, L1Shell, L1Stat } from "@/components/l1/ui";
import { L1_PRODUCAO } from "@/lib/l1-data";
import l1PreviewCss from "../../l1-preview.css?url";

/**
 * L1 PREVIEW ONLY — Produção e Cozinha (tema claro).
 * Rota: /preview/l1-producao. Dados fictícios, sem Supabase, sem escrita.
 */

export const Route = createFileRoute("/preview/l1-producao")({
  head: () => ({
    meta: [{ title: "L1 Preview — Produção e Cozinha" }],
    links: [
      { rel: "stylesheet", href: l1PreviewCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Nunito+Sans:wght@400;600;700&display=swap",
      },
    ],
  }),
  component: L1Producao,
});

const NAV = [
  { rotulo: "Dashboard", icone: Home },
  { rotulo: "Pedidos", icone: ClipboardList },
  { rotulo: "Produção", icone: ChefHat },
  { rotulo: "Entregas", icone: Bike },
];

export function L1Producao() {
  return (
    <L1Root>
      <L1Shell
        nav={NAV}
        ativo="Produção"
        titulo="Produção e Cozinha"
        icone={ChefHat}
        subtitulo="Prepare na ordem de prioridade, considerando horários."
      >
        <div className="l1-grid cols-auto">
          <L1Stat numero="4" texto="Próximos pedidos" icone={Clock} fundo="#E2ECF9" />
          <L1Stat numero="2" texto="Agendados" icone={ClipboardList} fundo="#F2F0EA" />
          <L1Stat numero="3" texto="Em preparação" icone={Flame} fundo="#FDF0C8" />
          <L1Stat numero="5" texto="Prontos" icone={Check} fundo="#E2F2E7" />
          <L1Stat numero="210 un." texto="Salgados pendentes" icone={ChefHat} fundo="#ECE4FA" />
        </div>

        <div style={{ marginTop: 12 }}>
          <L1Alert cor="red"><TriangleAlert /> Pedido #1257 atrasado 27 min — priorizar na fritura.</L1Alert>
        </div>

        <div className="l1-mobile-tabs" role="tablist" aria-label="Colunas">
          {["Próximos", "Preparo", "Prontos"].map((t, i) => (
            <button key={t} type="button" role="tab" aria-selected={i === 0} className={`l1-pill${i === 0 ? " on" : ""}`}>{t}</button>
          ))}
        </div>

        <div className="l1-kanban-scroll">
          <div className="l1-kanban">
            <div className="l1-card">
              <div className="l1-col-head blue"><h3><Clock size={16} /> Próximos Pedidos (2)</h3><p>Em ordem de horário</p></div>
              {L1_PRODUCAO.slice(0, 1).map((p) => (
                <article key={p.numero} className="l1-card" style={{ marginTop: 10 }} aria-label={`Pedido ${p.numero}`}>
                  <span className="l1-order-num">#{p.numero}</span> <span className="l1-time">{p.prometido}</span>
                  <p style={{ margin: "4px 0 0", fontSize: 14 }}><b>Cliente:</b> {p.cliente}</p>
                  <ul className="l1-flavors">
                    {p.itens.map((it, i) => (
                      <li key={i}><b>{it.qtd}</b> {it.sabor}</li>
                    ))}
                  </ul>
                  <div className="l1-total">Total <b>{p.total} un.</b></div>
                  <div className="l1-btn-row" style={{ marginTop: 10 }}>
                    <L1Btn tam="sm"><Flame /> Iniciar</L1Btn>
                    <L1Btn tam="sm" cor="ghost">Conferir</L1Btn>
                  </div>
                </article>
              ))}
            </div>
            <div className="l1-card">
              <div className="l1-col-head gold"><h3><Flame size={16} /> Em Preparação (2)</h3><p>Pedidos na cozinha</p></div>
              {L1_PRODUCAO.slice(0, 2).map((p) => (
                <article key={p.numero} className="l1-card" style={{ marginTop: 10 }} aria-label={`Pedido ${p.numero} em preparo`}>
                  <span className="l1-order-num">#{p.numero}</span> <span className="l1-time">{p.prometido}</span>
                  <p style={{ margin: "4px 0 0", fontSize: 14 }}><b>Cliente:</b> {p.cliente}</p>
                  <ul className="l1-flavors">
                    {p.itens.map((it, i) => (
                      <li key={i}><b>{it.qtd}</b> {it.sabor}</li>
                    ))}
                  </ul>
                  <p className="l1-meta">{p.detalhe}</p>
                  <div className="l1-progress" aria-hidden><span style={{ width: `${p.progresso}%` }} /></div>
                  <div className="l1-btn-row" style={{ marginTop: 10 }}>
                    <L1Btn tam="sm" cor="green"><Check /> Finalizar combo</L1Btn>
                    <L1Btn tam="sm" cor="ghost">Ver pedido</L1Btn>
                  </div>
                </article>
              ))}
            </div>
            <div className="l1-card">
              <div className="l1-col-head green"><h3><Check size={16} /> Prontos (1)</h3><p>Aguardando retirada/entrega</p></div>
              {L1_PRODUCAO.slice(2).map((p) => (
                <article key={p.numero} className="l1-card" style={{ marginTop: 10 }} aria-label={`Pedido ${p.numero} pronto`}>
                  <span className="l1-order-num">#{p.numero}</span> <span className="l1-time">{p.prometido}</span>
                  <p style={{ margin: "4px 0 0", fontSize: 14 }}><b>Cliente:</b> {p.cliente}</p>
                  <p className="l1-meta"><L1Badge cor="green">Pronto</L1Badge> {p.detalhe}</p>
                  <div className="l1-btn-row" style={{ marginTop: 10 }}>
                    <L1Btn tam="sm" cor="dark">Imprimir</L1Btn>
                  </div>
                </article>
              ))}
            </div>
            <div className="l1-card">
              <div className="l1-col-head purple"><h3><TriangleAlert size={16} /> Alertas</h3><p>Prioridade e atraso</p></div>
              <p className="l1-meta" style={{ marginTop: 10 }}>Fritura estimada agora: <b>120 un. na próxima hora</b> (orientação, sem promessa técnica).</p>
              <p className="l1-obs">Obs.: sem orégano no pedido #1263.</p>
            </div>
          </div>
        </div>

        <L1Section titulo="Sabores e observações" sub="Texto grande, sem fotos.">
          <div className="l1-grid cols-3">
            <div className="l1-card"><h3>Coxinha de Frango</h3><p className="l1-meta">105 un. pendentes</p></div>
            <div className="l1-card"><h3>Kibe</h3><p className="l1-meta">65 un. pendentes</p></div>
            <div className="l1-card"><h3>Risole de Queijo</h3><p className="l1-meta">40 un. pendentes</p></div>
          </div>
        </L1Section>
      </L1Shell>
    </L1Root>
  );
}
