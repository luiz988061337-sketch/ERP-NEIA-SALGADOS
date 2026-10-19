import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "@/styles.css";
import { PreviewPedidosAtendente } from "@/routes/preview/pedidos-atendente-v2";
import { PreviewProducaoPainel } from "@/routes/preview/producao-painel";
import { PreviewCentralEntregasV2 } from "@/routes/preview/central-entregas-v2";

/**
 * Hub dos previews APROVADOS (K7.2/K8.2/K9), dados fictícios.
 * Não importa shell, autenticação, carrinho, Supabase, router do app
 * nem variáveis de ambiente. Nada aqui toca rede ou banco.
 * Tema claro = inversão com preservação de matiz, só na moldura;
 * os arquivos aprovados permanecem intocados.
 */

const ABAS = [
  { id: "atendente", rotulo: "Atendente (K9)" },
  { id: "producao", rotulo: "Produção (K7.2)" },
  { id: "entregas", rotulo: "Central de Entregas (K8.2)" },
] as const;

function Hub() {
  const [aba, setAba] = useState<(typeof ABAS)[number]["id"]>("atendente");
  const [claro, setClaro] = useState(false);
  return (
    <>
      <style>{`
.fundo-branco{--color-neutral-950:#EFE9DC;--color-neutral-900:#FFFFFF;--color-neutral-800:#E7E0CF;--color-neutral-700:#D5CCB6;--color-neutral-600:#C9C0A9;--color-neutral-100:#252525;--color-neutral-200:#3A3A3A;--color-neutral-300:#4F4A3E;--color-neutral-400:#6B655A;--color-white:#252525;--color-yellow-400:#9A6B00;--color-yellow-300:#8a6d1c;--color-yellow-200:#7A5F00;--color-sky-200:#075985;--color-purple-200:#5B21B6;--color-green-200:#166534;--color-green-300:#15803d;--color-amber-200:#92400e;--color-amber-300:#B45309;--color-red-200:#B91C1C;--color-red-300:#B91C1C;--color-blue-200:#1D4ED8;--color-orange-200:#9A3412;--color-orange-300:#C2410C;background:#EFE9DC;}
.fundo-branco .bg-\\[\\#101013\\],.fundo-branco .bg-\\[\\#09090b\\]{background-color:#fff !important;}
.fundo-branco .bg-red-600.text-white,.fundo-branco .bg-sky-600.text-white,.fundo-branco .bg-purple-600.text-white,.fundo-branco .bg-green-600.text-white,.fundo-branco .bg-green-700.text-white,.fundo-branco .bg-blue-600.text-white,.fundo-branco .bg-amber-700.text-white,.fundo-branco .bg-sky-700.text-white,.fundo-branco .bg-orange-600.text-white{color:#fff !important;}
.fundo-branco .bg-white\\/20.text-white{color:#fff !important;background-color:rgb(255 255 255/.25) !important;}
.fundo-branco :is(.bg-black,.bg-neutral-950,.bg-green-950,.bg-yellow-950,.bg-red-950,.bg-sky-950,.bg-purple-950,.bg-blue-950,.bg-orange-950,.bg-amber-950,.bg-sky-600,.bg-purple-600,.bg-green-600) :is(.text-white,.text-white\\/80){color:#fff !important;}
.fundo-branco :is(.bg-black,.bg-neutral-950,.bg-green-950,.bg-yellow-950,.bg-red-950,.bg-sky-950,.bg-purple-950,.bg-blue-950,.bg-orange-950,.bg-amber-950,.bg-sky-600,.bg-purple-600,.bg-green-600) :is(.text-neutral-100){color:#f5f5f5 !important;}
.fundo-branco :is(.bg-black,.bg-neutral-950,.bg-green-950,.bg-yellow-950,.bg-red-950,.bg-sky-950,.bg-purple-950,.bg-blue-950,.bg-orange-950,.bg-amber-950,.bg-sky-600,.bg-purple-600,.bg-green-600) :is(.text-neutral-200){color:#e5e5e5 !important;}
.fundo-branco :is(.bg-black,.bg-neutral-950,.bg-green-950,.bg-yellow-950,.bg-red-950,.bg-sky-950,.bg-purple-950,.bg-blue-950,.bg-orange-950,.bg-amber-950,.bg-sky-600,.bg-purple-600,.bg-green-600) :is(.text-neutral-300){color:#d4d4d4 !important;}
.fundo-branco :is(.bg-black,.bg-neutral-950,.bg-green-950,.bg-yellow-950,.bg-red-950,.bg-sky-950,.bg-purple-950,.bg-blue-950,.bg-orange-950,.bg-amber-950,.bg-sky-600,.bg-purple-600,.bg-green-600) :is(.text-neutral-400){color:#a3a3a3 !important;}
.fundo-branco :is(.bg-black,.bg-neutral-950,.bg-green-950,.bg-yellow-950,.bg-red-950,.bg-sky-950,.bg-purple-950,.bg-blue-950,.bg-orange-950,.bg-amber-950,.bg-sky-600,.bg-purple-600,.bg-green-600) :is(.text-yellow-400){color:#facc15 !important;}
.fundo-branco :is(.bg-black,.bg-neutral-950,.bg-green-950,.bg-yellow-950,.bg-red-950,.bg-sky-950,.bg-purple-950,.bg-blue-950,.bg-orange-950,.bg-amber-950,.bg-sky-600,.bg-purple-600,.bg-green-600) :is(.text-yellow-300){color:#fde047 !important;}
.fundo-branco :is(.bg-black,.bg-neutral-950,.bg-green-950,.bg-yellow-950,.bg-red-950,.bg-sky-950,.bg-purple-950,.bg-blue-950,.bg-orange-950,.bg-amber-950,.bg-sky-600,.bg-purple-600,.bg-green-600) :is(.text-yellow-200){color:#fef08a !important;}
.fundo-branco :is(.bg-black,.bg-neutral-950,.bg-green-950,.bg-yellow-950,.bg-red-950,.bg-sky-950,.bg-purple-950,.bg-blue-950,.bg-orange-950,.bg-amber-950,.bg-sky-600,.bg-purple-600,.bg-green-600) :is(.text-sky-200){color:#bae6fd !important;}
.fundo-branco :is(.bg-black,.bg-neutral-950,.bg-green-950,.bg-yellow-950,.bg-red-950,.bg-sky-950,.bg-blue-950,.bg-orange-950,.bg-amber-950,.bg-sky-600,.bg-purple-600,.bg-green-600) :is(.text-purple-200){color:#e9d5ff !important;}
.fundo-branco :is(.bg-black,.bg-neutral-950,.bg-green-950,.bg-yellow-950,.bg-red-950,.bg-sky-950,.bg-purple-950,.bg-blue-950,.bg-orange-950,.bg-amber-950,.bg-sky-600,.bg-purple-600,.bg-green-600) :is(.text-green-200){color:#bbf7d0 !important;}
.fundo-branco :is(.bg-black,.bg-neutral-950,.bg-green-950,.bg-yellow-950,.bg-red-950,.bg-sky-950,.bg-purple-950,.bg-blue-950,.bg-orange-950,.bg-amber-950,.bg-sky-600,.bg-purple-600,.bg-green-600) :is(.text-green-300){color:#86efac !important;}
.fundo-branco :is(.bg-black,.bg-neutral-950,.bg-green-950,.bg-yellow-950,.bg-red-950,.bg-sky-950,.bg-purple-950,.bg-blue-950,.bg-orange-950,.bg-amber-950,.bg-sky-600,.bg-purple-600,.bg-green-600) :is(.text-amber-200){color:#fde68a !important;}
.fundo-branco :is(.bg-black,.bg-neutral-950,.bg-green-950,.bg-yellow-950,.bg-red-950,.bg-sky-950,.bg-purple-950,.bg-blue-950,.bg-orange-950,.bg-amber-950,.bg-sky-600,.bg-purple-600,.bg-green-600) :is(.text-red-200){color:#fecaca !important;}
.fundo-branco :is(.bg-black,.bg-neutral-950,.bg-green-950,.bg-yellow-950,.bg-red-950,.bg-sky-950,.bg-purple-950,.bg-blue-950,.bg-orange-950,.bg-amber-950,.bg-sky-600,.bg-purple-600,.bg-green-600) :is(.text-blue-200){color:#bfdbfe !important;}
.fundo-branco .comanda-print{background-color:#fff !important;color:#000 !important;}
`}</style>
      <nav
        aria-label="Painéis aprovados"
        style={{
          display: "flex",
          gap: 8,
          padding: "10px 12px",
          background: "#09090b",
          borderBottom: "1px solid #facc15",
          position: "sticky",
          top: 0,
          zIndex: 40,
          overflowX: "auto",
          alignItems: "center",
        }}
      >
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            aria-pressed={aba === a.id}
            style={{
              minHeight: 44,
              padding: "8px 16px",
              borderRadius: 999,
              border: "1px solid #facc15",
              background: aba === a.id ? "#facc15" : "transparent",
              color: aba === a.id ? "#000" : "#fff",
              fontWeight: 800,
              fontSize: 14,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {a.rotulo}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setClaro((v) => !v)}
          aria-pressed={claro}
          style={{
            minHeight: 44,
            padding: "8px 16px",
            borderRadius: 999,
            border: "1px solid #fff",
            background: "transparent",
            color: "#fff",
            fontWeight: 800,
            fontSize: 14,
            cursor: "pointer",
            whiteSpace: "nowrap",
            marginLeft: "auto",
          }}
        >
          {claro ? "Colunas brancas" : "Preto original"}
        </button>
      </nav>
      <div className={claro ? "fundo-branco" : undefined}>
        {aba === "atendente" ? <PreviewPedidosAtendente /> : null}
        {aba === "producao" ? <PreviewProducaoPainel /> : null}
        {aba === "entregas" ? <PreviewCentralEntregasV2 /> : null}
      </div>
    </>
  );
}

const el = document.getElementById("root");
if (!el) throw new Error("root ausente");
createRoot(el).render(
  <StrictMode>
    <Hub />
  </StrictMode>,
);
