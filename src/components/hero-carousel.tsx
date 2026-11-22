import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type HeroCarouselItem = {
  id: string;
  imagem_url: string;
  legenda: string;
  ordem: number;
};

export function useHeroCarousel() {
  const [itens, setItens] = useState<HeroCarouselItem[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data, error } = await supabase
        .from("hero_carousel")
        .select("id, imagem_url, legenda, ordem")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (!vivo) return;
      setItens(error ? [] : ((data ?? []) as HeroCarouselItem[]));
      setCarregando(false);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  return { itens, carregando };
}

/**
 * Carrossel aprovado: cada slide mostra SOMENTE a foto e o nome do salgado.
 * Sem descrição, promoções ou botões comerciais sobre a imagem.
 */
export function HeroCarousel({ itens, carregando }: { itens: HeroCarouselItem[]; carregando: boolean }) {
  const [indice, setIndice] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [emInteracao, setEmInteracao] = useState(false);
  const [reduzMovimento, setReduzMovimento] = useState(false);
  const toqueX = useRef<number | null>(null);

  // Acessibilidade (WCAG 2.2.2): respeita prefers-reduced-motion e oferece
  // controle explícito de pausa, além de pausar ao focar/hoverar o carrossel.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
    const atualizar = () => setReduzMovimento(consulta.matches);
    atualizar();
    consulta.addEventListener?.("change", atualizar);
    return () => consulta.removeEventListener?.("change", atualizar);
  }, []);

  useEffect(() => {
    if (itens.length <= 1 || pausado || emInteracao || reduzMovimento) return;
    const t = window.setInterval(() => setIndice((i) => (i + 1) % itens.length), 5000);
    return () => window.clearInterval(t);
    // `indice` reinicia o cronômetro após navegação manual (seta/dot/swipe).
  }, [itens.length, pausado, emInteracao, reduzMovimento, indice]);

  if (carregando) {
    return <div className="h-[320px] w-full animate-pulse bg-muted sm:h-[420px]" />;
  }
  if (itens.length === 0) return null;

  const irPara = (novo: number) => setIndice(((novo % itens.length) + itens.length) % itens.length);

  return (
    <section
      className="relative h-[320px] w-full overflow-hidden sm:h-[420px]"
      aria-label="Salgados em destaque"
      aria-roledescription="carousel"
      data-testid="hero-carousel"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          irPara(indice - 1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          irPara(indice + 1);
        }
      }}
      onMouseEnter={() => setEmInteracao(true)}
      onMouseLeave={() => setEmInteracao(false)}
      onFocusCapture={() => setEmInteracao(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEmInteracao(false);
      }}
      onTouchStart={(e) => {
        toqueX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const inicio = toqueX.current;
        toqueX.current = null;
        if (inicio == null) return;
        const fim = e.changedTouches[0]?.clientX ?? inicio;
        const deslocamento = fim - inicio;
        if (Math.abs(deslocamento) > 40) irPara(indice + (deslocamento < 0 ? 1 : -1));
      }}
      style={{ touchAction: "pan-y" }}
    >
      {itens.map((item, i) => (
        <div
          key={item.id}
          role="group"
          aria-roledescription="slide"
          aria-label={`${i + 1} de ${itens.length}`}
          data-testid="hero-slide"
          data-indice={i}
          data-ativo={i === indice ? "true" : "false"}
          className={`absolute inset-0 transition-opacity duration-700 ${i === indice ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          {/* fundo desfocado da mesma foto: a imagem entra inteira, sem corte */}
          <img
            src={item.imagem_url}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 size-full scale-110 object-cover blur-2xl"
          />
          <img
            src={item.imagem_url}
            alt={item.legenda || `Slide ${i + 1}`}
            loading={i === 0 ? "eager" : "lazy"}
            className="relative size-full object-contain"
          />
          {/* Cada slide traz SOMENTE a própria foto e o próprio nome. */}
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center">
            <div className="mx-auto w-full max-w-6xl px-4">
              <div className="max-w-lg text-white">
                <h2 className="font-display text-2xl leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] sm:text-4xl" data-testid="hero-slide-nome">
                  {item.legenda}
                </h2>
              </div>
            </div>
          </div>
        </div>
      ))}
      {/* Escurece só o lado do texto, para a foto aparecer limpa à direita */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#500B08]/70 via-[#500B08]/25 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-full max-w-2xl bg-gradient-to-r from-[#500B08]/60 to-transparent sm:w-3/5" />

      <button
        type="button"
        data-testid="hero-pause"
        aria-label={pausado ? "Retomar troca automática" : "Pausar troca automática"}
        aria-pressed={pausado}
        onClick={() => setPausado((p) => !p)}
        className="absolute right-2 top-2 z-10 grid size-9 place-items-center rounded-full bg-black/40 text-white transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6B300] sm:right-4 sm:top-4"
      >
        {pausado ? <Play className="size-4" /> : <Pause className="size-4" />}
      </button>

      {itens.length > 1 ? (
        <>
          <button
            type="button"
            data-testid="hero-arrow-prev"
            aria-label="Slide anterior"
            onClick={() => irPara(indice - 1)}
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6B300] md:left-4"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            data-testid="hero-arrow-next"
            aria-label="Próximo slide"
            onClick={() => irPara(indice + 1)}
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6B300] md:right-4"
          >
            <ChevronRight className="size-5" />
          </button>
          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
            {itens.map((item, i) => (
              <button
                key={item.id}
                type="button"
                data-testid="hero-dot"
                aria-label={`Ir para slide ${i + 1}`}
                aria-current={i === indice ? "true" : undefined}
                onClick={() => irPara(i)}
                className={`h-2 w-2 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6B300] ${i === indice ? "bg-white" : "bg-white/50"}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
