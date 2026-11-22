import { createFileRoute } from "@tanstack/react-router";
import { Bike, Check, Clock, Home, MapPin, Plus, TriangleAlert } from "lucide-react";
import { L1Badge, L1Btn, L1Root, L1Section, L1Shell, L1Stat } from "@/components/l1/ui";
import { L1_ENTREGAS, L1_MOTOBOYS, L1_ROTAS } from "@/lib/l1-data";
import l1PreviewCss from "../../l1-preview.css?url";

/**
 * L1 PREVIEW ONLY — Central de Entregas (tema claro).
 * Rota: /preview/l1-entregas. Dados fictícios, sem Supabase/GPS, sem escrita.
 */

export const Route = createFileRoute("/preview/l1-entregas")({
  head: () => ({
    meta: [{ title: "L1 Preview — Central de Entregas" }],
    links: [
      { rel: "stylesheet", href: l1PreviewCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Nunito+Sans:wght@400;600;700&display=swap",
      },
    ],
  }),
  component: L1Entregas,
});

const NAV = [
  { rotulo: "Dashboard", icone: Home },
  { rotulo: "Entregas", icone: Bike },
];

export function L1Entregas() {
  return (
    <L1Root>
      <L1Shell
        nav={NAV}
        ativo="Entregas"
        titulo="Central de Entregas"
        icone={Bike}
        subtitulo="Motoboys, rotas e entregas em tempo real."
        topo={<L1Btn cor="dark" tam="sm"><Plus /> Criar Nova Rota</L1Btn>}
      >
        <div className="l1-grid cols-auto">
          <L1Stat numero="3" texto="Aguardando motoboy" icone={Clock} fundo="#FDF0C8" />
          <L1Stat numero="2" texto="Motoboys disponíveis" icone={Bike} fundo="#E2F2E7" />
          <L1Stat numero="2" texto="Rotas em andamento" icone={MapPin} fundo="#ECE4FA" />
          <L1Stat numero="4" texto="Entregas restantes" icone={Check} fundo="#E2ECF9" />
        </div>

        <L1Section titulo="Pedidos aguardando motoboy" sub="Com horário prometido em destaque.">
          <div className="l1-grid cols-3">
            {L1_ENTREGAS.map((p) => (
              <article key={p.numero} className="l1-card" aria-label={`Pedido ${p.numero}`}>
                <span className="l1-order-num">#{p.numero}</span> <span className="l1-time">{p.prometido}</span>
                <p style={{ margin: "4px 0 0", fontSize: 14 }}><b>Cliente:</b> {p.cliente}</p>
                <p className="l1-meta"><MapPin />{p.endereco}</p>
                <p style={{ margin: "6px 0 0", fontSize: 15 }}>{p.itens}</p>
                <div className="l1-total">Total <b>{p.total} un.</b></div>
                <p style={{ marginTop: 8 }}><L1Badge cor={p.cor}>{p.estado}</L1Badge></p>
                <div className="l1-btn-row" style={{ marginTop: 8 }}>
                  <L1Btn tam="sm"><Bike /> Atribuir Motoboy</L1Btn>
                  <L1Btn tam="sm" cor="ghost"><MapPin /> Ver no mapa</L1Btn>
                </div>
              </article>
            ))}
          </div>
        </L1Section>

        <L1Section titulo="Mapa de entregas" sub="Ilustração estática com ícones de moto (sem GPS nesta etapa).">
          <div className="l1-map" role="img" aria-label="Mapa simulado das entregas">
            <svg viewBox="0 0 400 220" aria-hidden>
              <rect width="400" height="220" fill="#E9E6DD" rx="10" />
              {[40, 90, 140, 190].map((y) => (
                <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="#fff" strokeWidth="5" />
              ))}
              {[80, 180, 280].map((x) => (
                <line key={x} x1={x} y1="0" x2={x} y2="220" stroke="#fff" strokeWidth="5" />
              ))}
              <circle cx="60" cy="65" r="12" fill="#B48A36" />
              <text x="60" y="70" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#fff">N</text>
              <text x="60" y="92" textAnchor="middle" fontSize="10" fill="#B48A36">Loja</text>
              {[[180, 40, "1"], [300, 110, "2"], [220, 165, "3"]].map(([x, y, n]) => (
                <g key={n as string}>
                  <circle cx={x as number} cy={y as number} r="11" fill="#fff" stroke="#B48A36" strokeWidth="2" />
                  <text x={x as number} y={(y as number) + 4} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#252525">{n}</text>
                </g>
              ))}
              <polyline points="60,65 180,40 300,110 220,165" fill="none" stroke="#B48A36" strokeWidth="2.5" strokeDasharray="7 5" />
            </svg>
            <p className="l1-meta"><TriangleAlert /> SIMULAÇÃO — sem GPS real.</p>
          </div>
        </L1Section>

        <L1Section titulo="Motoboys" sub="Disponibilidade e retorno à base.">
          <div className="l1-grid cols-auto">
            {L1_MOTOBOYS.map((m) => (
              <div key={m.nome} className="l1-card">
                <h3>{m.nome}</h3>
                <p className="l1-meta">{m.estado}</p>
                <p className="l1-meta">{m.extra}</p>
                <div style={{ marginTop: 8 }}>
                  <L1Btn tam="sm" cor={m.acao === "Atribuir" ? "gold" : "ghost"}>{m.acao}</L1Btn>
                </div>
              </div>
            ))}
          </div>
        </L1Section>

        <L1Section titulo="Rotas do dia" sub="Organize, edite e divida rotas de até 3 paradas.">
          <div className="l1-grid cols-3">
            {L1_ROTAS.map((r) => (
              <div key={r.moto} className="l1-card">
                <h3><Bike size={16} style={{ verticalAlign: -2 }} /> {r.moto}</h3>
                <p className="l1-meta">{r.resumo}</p>
                <ol style={{ margin: "8px 0", paddingLeft: 20, fontSize: 14 }}>
                  {r.paradas.map(([t, h]) => (
                    <li key={t as string}>{t} <b style={{ color: "#B48A36" }}>{h}</b></li>
                  ))}
                </ol>
                <p className="l1-meta">Total da rota: {r.total}</p>
                <div className="l1-btn-row" style={{ marginTop: 8 }}>
                  <L1Btn tam="sm" cor="ghost">Ver no Mapa</L1Btn>
                  <L1Btn tam="sm" cor="ghost">Editar Rota</L1Btn>
                </div>
              </div>
            ))}
          </div>
        </L1Section>
      </L1Shell>
    </L1Root>
  );
}
