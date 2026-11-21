import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  CircleHelp,
  CreditCard,
  Headphones,
  ListOrdered,
  MessageCircle,
  PackageCheck,
  Search,
  ShoppingBag,
  Snowflake,
  Truck,
} from "lucide-react";
import hero from "@/assets/hero.jpg";
import { Input } from "@/components/ui/input";
import { PublicPageHero } from "@/components/public-page-hero";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { telefoneWhatsappConfigurado, whatsappLink } from "@/lib/format";
import { prazosAtendimento, useLojaConfig } from "@/lib/loja";

export const Route = createFileRoute("/ajuda")({
  head: () => ({ meta: [{ title: "Central de Ajuda — Néia Salgados" }] }),
  component: Ajuda,
});

const PERGUNTAS_PADRAO: Array<[string, string, string]> = [
  ["pedidos", "Qual é o pedido mínimo?", "Salgados prontos: 50 unidades e múltiplos de 50 (50, 100, 150…). Congelados e bebidas seguem a unidade comercial cadastrada."],
  ["entrega", "Qual o prazo para retirada e entrega?", "Os prazos exibidos abaixo são os cadastrados pela loja. A confirmação do seu pedido mostra a janela prevista."],
  ["pagamento", "Quais são as formas de pagamento?", "PIX (QR Code e Copia e Cola), dinheiro, crédito e débito. O pedido começa pendente e a loja confirma."],
  ["entrega", "Como funciona a taxa de entrega?", "R$ 1,50 por km, com mínimo configurado, calculada depois de informar e validar o endereço no checkout. Retirada na loja não tem taxa."],
  ["agendamento", "Posso agendar meu pedido?", "Sim. Informe a data desejada no orçamento e confirme a disponibilidade com a loja. Pedidos agendados entram na preparação conforme o planejamento da equipe."],
  ["combos", "É possível personalizar um combo?", "Sim. Em Monte seu combo você escolhe os sabores de uma categoria. O total de salgados prontos deve fechar múltiplos de 50."],
  ["congelados", "Vocês vendem salgados congelados?", "Sim. Congelados são vendidos por unidade comercial cadastrada (unidade ou pacote), sem regra de múltiplos de 50."],
];

function Ajuda() {
  const [busca, setBusca] = useState("");
  const { data: cfgLoja } = useLojaConfig();
  const prazos = prazosAtendimento(cfgLoja);
  const telConfigurado = telefoneWhatsappConfigurado(cfgLoja?.telefone);
  const textoContato = "Olá! Preciso de ajuda com um pedido da Néia Salgados.";

  const { data } = useQuery({
    queryKey: ["ajuda-artigos"],
    queryFn: async () => {
      try {
        const { data } = await supabase
          .from("ajuda_artigos")
          .select("*")
          .eq("ativo", true)
          .order("categoria")
          .limit(200);
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });

  const itens = useMemo(() => {
    const base: Array<[string, string, string]> =
      (data ?? []).length > 0
        ? (data ?? []).map((a: any) => [
            String(a.categoria ?? ""),
            String(a.titulo ?? ""),
            String(a.corpo ?? ""),
          ])
        : PERGUNTAS_PADRAO.map(([c, titulo, corpo]) => [
            c,
            titulo,
            c === "entrega" && titulo.includes("prazo")
              ? `Retirada: ${prazos.retiradaMin}–${prazos.retiradaMax} min. Entrega: ${prazos.entregaMin}–${prazos.entregaMax} min.`
              : corpo,
          ]);
    const t = busca.trim().toLowerCase();
    if (!t) return base;
    return base.filter(([c, titulo, corpo]) => `${c} ${titulo} ${corpo}`.toLowerCase().includes(t));
  }, [data, busca, prazos.retiradaMin, prazos.retiradaMax, prazos.entregaMin, prazos.entregaMax]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, Array<[string, string, string]>>();
    for (const item of itens) {
      const categoria = item[0] || "geral";
      const lista = mapa.get(categoria) ?? [];
      lista.push(item);
      mapa.set(categoria, lista);
    }
    return [...mapa.entries()];
  }, [itens]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <PublicPageHero
        icon={Headphones}
        titulo="Ajuda"
        descricao="Tire suas dúvidas, veja orientações e saiba como fazer seu pedido na Néia Salgados."
        className="mt-3"
      />

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <section className="relative min-h-[180px] overflow-hidden rounded-[22px] border border-[#F0D9A8] bg-[#FFF4D8] shadow-[var(--shadow-card)]">
            <div className="relative z-10 max-w-[62%] p-6 sm:p-7">
              <h2 className="font-display text-2xl font-bold text-[#500B08] sm:text-3xl">
                Como podemos te ajudar?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#60524C] sm:text-base">
                Encontre respostas rápidas nas perguntas frequentes ou entre em contato com a nossa
                equipe.
              </p>
            </div>
            <div className="absolute inset-y-0 right-0 w-[42%]">
              <img src={hero} alt="Salgados Néia Salgados" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#FFF4D8] via-[#FFF4D8]/40 to-transparent" />
              <div className="absolute -left-8 top-3 size-24 rounded-full border-[10px] border-[#F6B300]/50" aria-hidden />
              <div className="absolute bottom-2 left-2 size-16 rounded-full border-[8px] border-[#B9000B]/25" aria-hidden />
            </div>
          </section>

          <section className="overflow-hidden rounded-[22px] border border-[#F0D9A8] bg-white shadow-[var(--shadow-card)]">
            <div className="brand-gradient flex items-center gap-2 px-4 py-3 text-white">
              <CircleHelp className="size-5" aria-hidden />
              <h2 className="font-display text-xl font-bold">Perguntas Frequentes</h2>
            </div>
            <div className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#60524C]" aria-hidden />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar dúvida…"
                  className="pl-9"
                  aria-label="Buscar dúvida"
                />
              </div>
              <div className="mt-4 space-y-3">
                {grupos.map(([categoria, perguntas]) => (
                  <div key={categoria}>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#B9000B]">
                      {categoria}
                    </p>
                    <div className="space-y-3">
                      {perguntas.map(([, titulo, corpo]) => (
                        <details
                          key={`${categoria}-${titulo}`}
                          className="group overflow-hidden rounded-2xl border border-[#F0D9A8] bg-white"
                        >
                          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden">
                            <span className="brand-gradient grid size-8 shrink-0 place-items-center rounded-xl text-white">
                              <CircleHelp className="size-4" aria-hidden />
                            </span>
                            <span className="flex-1 font-semibold text-[#500B08]">{titulo}</span>
                            <span className="text-[#D50909] transition-transform group-open:rotate-180" aria-hidden>
                              ⌄
                            </span>
                          </summary>
                          <p className="px-4 pb-4 pl-[4.25rem] text-sm leading-relaxed text-[#60524C]">
                            {corpo}
                          </p>
                        </details>
                      ))}
                    </div>
                  </div>
                ))}
                {itens.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-[#F0D9A8] p-6 text-center text-sm text-[#60524C]">
                    Nada encontrado para “{busca}”.
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="overflow-hidden rounded-[22px] border border-[#F0D9A8] bg-white shadow-[var(--shadow-card)]">
            <div className="brand-gradient flex items-center gap-2 px-4 py-3 text-white">
              <MessageCircle className="size-5" aria-hidden />
              <h2 className="font-display text-xl font-bold">Fale Conosco</h2>
            </div>
            <div className="p-5">
              <span className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
                <span className="size-2 rounded-full bg-green-500" aria-hidden /> WhatsApp
              </span>
              <p className="mt-3 text-sm leading-relaxed text-[#60524C]">
                Prefere falar com a gente? Use o canal configurado pela loja para tirar dúvidas sobre
                seu pedido ou orçamento.
              </p>
              {telConfigurado ? (
                <a
                  href={whatsappLink(telConfigurado, textoContato)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-[#F6B300] bg-[#FFFCF7] px-4 text-sm font-bold text-[#650C09] transition hover:bg-[#FFF4D8]"
                >
                  <MessageCircle className="size-4" aria-hidden /> Conversar no WhatsApp
                </a>
              ) : (
                <p className="mt-4 rounded-xl bg-[#FFF4D8] p-3 text-xs text-[#60524C]">
                  O contato de WhatsApp ainda não foi configurado pela loja. Enquanto isso, use
                  {" "}<Link to="/conta" className="font-semibold text-[#B9000B] underline">Meus pedidos</Link> para acompanhar.
                </p>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-[22px] border border-[#F0D9A8] bg-white shadow-[var(--shadow-card)]">
            <div className="brand-gradient flex items-center gap-2 px-4 py-3 text-white">
              <ListOrdered className="size-5" aria-hidden />
              <h2 className="font-display text-xl font-bold">Como fazer seu pedido?</h2>
            </div>
            <ol className="space-y-4 p-5">
              {[
                { icone: ShoppingBag, texto: "Escolha os itens ou monte seu combo no cardápio." },
                { icone: PackageCheck, texto: "Adicione ao carrinho e finalize o pedido." },
                { icone: CreditCard, texto: "Escolha entrega ou retirada e a forma de pagamento." },
              ].map(({ icone: Icone, texto }, i) => (
                <li key={texto} className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#FFC21C] text-sm font-bold text-[#500B08]">
                    {i + 1}
                  </span>
                  <div>
                    <Icone className="size-4 text-[#D50909]" aria-hidden />
                    <p className="mt-1 text-sm leading-relaxed text-[#60524C]">{texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="overflow-hidden rounded-[22px] border border-[#F0D9A8] bg-white shadow-[var(--shadow-card)]">
            <div className="brand-gradient flex items-center gap-2 px-4 py-3 text-white">
              <CircleHelp className="size-5" aria-hidden />
              <h2 className="font-display text-xl font-bold">Informações Importantes</h2>
            </div>
            <ul className="space-y-3 p-5 text-sm text-[#60524C]">
              <li className="flex gap-2"><ShoppingBag className="mt-0.5 size-4 shrink-0 text-[#D50909]" aria-hidden /> Salgados prontos: pedido mínimo de 50 unidades e múltiplos de 50.</li>
              <li className="flex gap-2"><Truck className="mt-0.5 size-4 shrink-0 text-[#D50909]" aria-hidden /> Retirada {prazos.retiradaMin}–{prazos.retiradaMax} min; entrega {prazos.entregaMin}–{prazos.entregaMax} min (cadastro da loja).</li>
              <li className="flex gap-2"><Snowflake className="mt-0.5 size-4 shrink-0 text-[#D50909]" aria-hidden /> Congelados obedecem à unidade de venda cadastrada.</li>
              <li className="flex gap-2"><CalendarClock className="mt-0.5 size-4 shrink-0 text-[#D50909]" aria-hidden /> Pedidos agendados entram na preparação conforme disponibilidade confirmada pela loja.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
