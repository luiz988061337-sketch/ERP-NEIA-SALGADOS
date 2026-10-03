import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
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

export function HeroCarousel({ itens, carregando }: { itens: HeroCarouselItem[]; carregando: boolean }) {
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    if (itens.length <= 1) return;
    const t = setInterval(() => setIndice((i) => (i + 1) % itens.length), 5000);
    return () => clearInterval(t);
  }, [itens.length]);

  if (carregando) {
    return <div className="h-[320px] w-full animate-pulse bg-muted sm:h-[420px]" />;
  }
  if (itens.length === 0) return null;

  return (
    <section className="relative h-[320px] w-full overflow-hidden sm:h-[420px]" aria-label="Destaques">
      {itens.map((item, i) => (
        <img
          key={item.id}
          src={item.imagem_url}
          alt={item.legenda || `Slide ${i + 1}`}
          loading={i === 0 ? "eager" : "lazy"}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${i === indice ? "opacity-100" : "pointer-events-none opacity-0"}`}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-r from-foreground/85 via-foreground/55 to-transparent" />
      <div className="absolute inset-0 flex items-center">
        <div className="mx-auto w-full max-w-6xl px-4">
          <div className="max-w-lg text-white">
            <h1 className="font-display text-3xl leading-tight sm:text-5xl">
              {itens[indice]?.legenda || "Salgados quentinhos na sua porta"}
            </h1>
            <p className="mt-3 text-sm text-white/85 sm:text-base">
              Fritos, assados, congelados e kits para festa. Peça agora e receba em minutos.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link to="/combo" className="rounded-full bg-white/20 px-4 py-2 text-sm font-semibold backdrop-blur hover:bg-white/30">
                Monte seu combo
              </Link>
            </div>
          </div>
        </div>
      </div>
      {itens.length > 1 ? (
        <>
          <button
            type="button"
            aria-label="Slide anterior"
            onClick={() => setIndice((i) => (i - 1 + itens.length) % itens.length)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 md:left-4"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Próximo slide"
            onClick={() => setIndice((i) => (i + 1) % itens.length)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 md:right-4"
          >
            <ChevronRight className="size-5" />
          </button>
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
            {itens.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Ir para slide ${i + 1}`}
                onClick={() => setIndice(i)}
                className={`h-2 w-2 rounded-full ${i === indice ? "bg-white" : "bg-white/50"}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
