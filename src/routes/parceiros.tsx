import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  Building2,
  Check,
  Handshake,
  MessageCircle,
  PartyPopper,
  ShieldCheck,
  Store,
  Truck,
} from "lucide-react";
import hero from "@/assets/hero.jpg";
import catFritos from "@/assets/cat-fritos.jpg";
import catAssados from "@/assets/cat-assados.jpg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PublicPageHero } from "@/components/public-page-hero";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { telefoneWhatsappConfigurado, whatsappLink } from "@/lib/format";
import { useLojaConfig } from "@/lib/loja";

export const Route = createFileRoute("/parceiros")({
  head: () => ({ meta: [{ title: "Seja um parceiro — Néia Salgados" }] }),
  component: Parceiros,
});

const CATEGORIAS = ["buffet", "decoracao", "doces", "bolos", "fotografia", "cerimonial", "salao", "entretenimento", "outros"];

const BENEFICIOS = [
  {
    icon: ShieldCheck,
    titulo: "Qualidade e padrão",
    texto: "Salgados preparados com o padrão Néia Salgados.",
  },
  {
    icon: Handshake,
    titulo: "Atendimento e acompanhamento",
    texto: "Cada proposta é analisada e acompanhada pela loja.",
  },
  {
    icon: Truck,
    titulo: "Produção e entrega",
    texto: "Produção dos salgados com entrega ou retirada cadastradas.",
  },
];

const MODALIDADES = [
  {
    icon: Store,
    titulo: "Revendedores",
    imagem: catFritos,
    descricao: "Para quem revende os salgados Néia Salgados.",
    bullets: ["Produtos do catálogo", "Análise pela loja"],
  },
  {
    icon: Building2,
    titulo: "Empresas",
    imagem: catAssados,
    descricao: "Para empresas que desejam encomendar salgados.",
    bullets: ["Encomendas por quantidade", "Retirada ou entrega"],
  },
  {
    icon: PartyPopper,
    titulo: "Eventos",
    imagem: hero,
    descricao: "Para profissionais de eventos e celebrações.",
    bullets: ["Somente os salgados", "Combos por categoria"],
  },
];

function Parceiros() {
  const [enviando, setEnviando] = useState(false);
  const { data: cfgLoja } = useLojaConfig();
  const telConfigurado = telefoneWhatsappConfigurado(cfgLoja?.telefone);
  const textoContato = "Olá! Tenho interesse em ser parceiro da Néia Salgados.";

  const { data: lista } = useQuery({
    queryKey: ["parceiros-aprovados"],
    queryFn: async () => {
      try {
        const { data } = await supabase.from("parceiros_publicos").select("*").order("nome");
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });

  async function candidatar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setEnviando(true);
    try {
      const { error } = await supabase.from("parceiros").insert({
        responsavel: String(f.get("responsavel") ?? ""),
        whatsapp: String(f.get("whatsapp") ?? ""),
        email: String(f.get("email") ?? ""),
        nome: String(f.get("empresa") ?? ""),
        cidade: String(f.get("cidade") ?? ""),
        bairro: String(f.get("bairro") ?? ""),
        categoria: String(f.get("categoria") ?? "outros"),
        descricao: String(f.get("descricao") ?? ""),
        proposta: String(f.get("proposta") ?? ""),
        autoriza_divulgacao: String(f.get("autoriza") ?? "") === "on",
        status: "nova",
      });
      if (error) throw error;
      toast.success("Candidatura enviada! Vamos analisar e entrar em contato.");
      (e.target as HTMLFormElement).reset();
    } catch {
      if (telConfigurado) {
        toast.error(
          <span>
            Não foi possível enviar pelo formulário.{" "}
            <a
              href={whatsappLink(telConfigurado, textoContato)}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Fale no WhatsApp da loja
            </a>
          </span>,
        );
      } else {
        toast.error(
          "Não foi possível enviar. O contato de WhatsApp da loja ainda não está configurado.",
        );
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <PublicPageHero
        icon={Handshake}
        titulo="Seja um parceiro"
        descricao="Revenda, encomende para sua empresa ou evento e conte com a qualidade e tradição da Néia Salgados."
        className="mt-3"
      />

      <section className="relative mt-5 overflow-hidden rounded-[22px] border border-[#F0D9A8] bg-[#FFF4D8] shadow-[var(--shadow-card)]" aria-label="Parcerias Néia Salgados">
        <div className="relative z-10 p-6 sm:p-8 lg:max-w-[58%] lg:p-10">
          <h2 className="font-display text-2xl font-bold leading-tight text-[#500B08] sm:text-3xl lg:text-[34px]">
            Qualidade que o seu negócio pode compartilhar
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[#60524C] sm:text-base">
            Trabalhamos com revendedores, empresas e profissionais de eventos. A Néia Salgados
            fornece somente os salgados — buffet, decoração e serviço ficam por conta do parceiro e
            do organizador.
          </p>
        </div>
        <div className="relative h-56 w-full lg:absolute lg:inset-y-0 lg:right-0 lg:h-auto lg:w-[42%]">
          <img src={hero} alt="Salgados Néia Salgados" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#FFF4D8] via-[#FFF4D8]/30 to-transparent lg:bg-gradient-to-r lg:from-[#FFF4D8] lg:via-transparent lg:to-transparent" />
          <div className="absolute right-4 top-4 size-20 rounded-full border-[9px] border-[#F6B300]/50" aria-hidden />
        </div>
      </section>

      <section className="mt-5 grid gap-4 rounded-[22px] border border-[#F0D9A8] bg-white p-5 shadow-[var(--shadow-card)] sm:grid-cols-3 sm:p-0" aria-label="Nossos diferenciais">
        {BENEFICIOS.map(({ icon: Icone, titulo, texto }, i) => (
          <div
            key={titulo}
            className={`flex items-start gap-3 p-4 sm:p-5 ${i < 2 ? "sm:border-r sm:border-[#F0D9A8]" : ""}`}
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#FFF4D8] text-[#F6B300]">
              <Icone className="size-5" aria-hidden />
            </span>
            <div>
              <h3 className="font-display text-base font-bold text-[#500B08] sm:text-lg">{titulo}</h3>
              <p className="mt-1 text-sm text-[#60524C]">{texto}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-10" aria-label="Modalidades de parceria">
        <h2 className="font-display text-2xl font-bold text-[#500B08] sm:text-3xl">
          Modalidades de parceria
          <span className="mt-2 block h-1 w-16 rounded-full bg-[#F6B300]" aria-hidden />
        </h2>
        <p className="mt-3 text-sm text-[#60524C] sm:text-base">
          Escolha a opção que mais se encaixa na sua necessidade:
        </p>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {MODALIDADES.map(({ icon: Icone, titulo, imagem, descricao, bullets }) => (
            <article
              key={titulo}
              className="relative overflow-hidden rounded-[22px] border border-[#F0D9A8] border-l-4 border-l-[#F6B300] bg-white p-5 shadow-[var(--shadow-card)]"
            >
              <img
                src={imagem}
                alt=""
                aria-hidden
                className="pointer-events-none absolute -right-6 top-6 size-32 rounded-2xl object-cover opacity-20"
              />
              <div className="relative">
                <span className="grid size-12 place-items-center rounded-2xl bg-[#FFF4D8] text-[#B9000B]">
                  <Icone className="size-6" aria-hidden />
                </span>
                <h3 className="mt-4 font-display text-xl font-bold text-[#500B08]">{titulo}</h3>
                <p className="mt-2 text-sm text-[#60524C]">{descricao}</p>
                <ul className="mt-4 space-y-2">
                  {bullets.map((b) => (
                    <li key={b} className="flex items-center gap-2 text-sm text-[#60524C]">
                      <Check className="size-4 shrink-0 text-[#D50909]" aria-hidden /> {b}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8 flex flex-col gap-5 rounded-[22px] bg-gradient-to-r from-[#B9000B] via-[#F47500] to-[#F6B300] p-6 text-white shadow-[var(--shadow-float)] sm:flex-row sm:items-center sm:p-8" aria-label="Vamos firmar uma parceria">
        <Handshake className="size-12 shrink-0 sm:size-16" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">Vamos firmar uma parceria?</h2>
          <p className="mt-1 text-sm text-white/90 sm:text-base">
            Envie sua proposta pelo formulário abaixo. A loja analisa e entra em contato pelos canais
            configurados.
          </p>
        </div>
        <a
          href="#candidatura"
          className="flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[#FFF4D8] px-6 py-3 text-sm font-bold text-[#650C09] transition hover:bg-white"
        >
          Quero ser parceiro <ArrowRight className="size-4" aria-hidden />
        </a>
      </section>

      <section className="mt-10" aria-label="Parceiros aprovados">
        <h2 className="font-display text-2xl font-bold text-[#500B08]">Parceiros aprovados</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(lista ?? []).map((p: any) => (
            <article key={p.id} className="hover-lift rounded-[22px] border border-[#F0D9A8] bg-white p-4 text-sm shadow-[var(--shadow-card)]">
              <p className="font-display text-lg font-bold text-[#500B08]">{p.nome}</p>
              <p className="text-xs text-[#60524C]">
                {p.categoria}
                {p.cidade ? ` • ${p.cidade}` : ""}
                {p.bairro ? ` — ${p.bairro}` : ""}
              </p>
              {p.descricao ? <p className="mt-2 text-[#60524C]">{p.descricao}</p> : null}
            </article>
          ))}
        </div>
        {(lista ?? []).length === 0 ? (
          <p className="mt-3 rounded-[22px] border border-dashed border-[#F0D9A8] bg-[#FFFCF7] p-6 text-center text-sm text-[#60524C]">
            Em breve, parceiros aprovados aqui.{" "}
            <Link to="/calculadora" className="font-semibold text-[#B9000B] underline">
              Fazer orçamento de salgados
            </Link>
          </p>
        ) : null}
      </section>

      <section
        id="candidatura"
        className="mt-10 scroll-mt-24 overflow-hidden rounded-[22px] border border-[#F0D9A8] bg-white shadow-[var(--shadow-card)]"
        aria-label="Formulário de candidatura"
      >
        <div className="brand-gradient px-4 py-3 text-white">
          <h2 className="font-display text-xl font-bold">Quero ser parceiro</h2>
        </div>
        <div className="p-5">
          <p className="text-sm text-[#60524C]">Preencha os dados abaixo para enviar sua proposta à loja.</p>
          <form onSubmit={candidatar} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="parc-responsavel" className="font-bold text-[#500B08]">Responsável *</Label>
              <Input id="parc-responsavel" name="responsavel" required maxLength={100} className="h-[52px] rounded-[14px] border-[#E8D9BE] bg-[#FFFCF7]" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="parc-whatsapp" className="font-bold text-[#500B08]">WhatsApp *</Label>
              <Input id="parc-whatsapp" name="whatsapp" required placeholder="(11) 90000-0000" className="h-[52px] rounded-[14px] border-[#E8D9BE] bg-[#FFFCF7]" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="parc-email" className="font-bold text-[#500B08]">E-mail</Label>
              <Input id="parc-email" name="email" type="email" className="h-[52px] rounded-[14px] border-[#E8D9BE] bg-[#FFFCF7]" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="parc-empresa" className="font-bold text-[#500B08]">Empresa *</Label>
              <Input id="parc-empresa" name="empresa" required maxLength={100} className="h-[52px] rounded-[14px] border-[#E8D9BE] bg-[#FFFCF7]" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="parc-cidade" className="font-bold text-[#500B08]">Cidade</Label>
              <Input id="parc-cidade" name="cidade" maxLength={100} className="h-[52px] rounded-[14px] border-[#E8D9BE] bg-[#FFFCF7]" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="parc-bairro" className="font-bold text-[#500B08]">Bairro</Label>
              <Input id="parc-bairro" name="bairro" maxLength={100} className="h-[52px] rounded-[14px] border-[#E8D9BE] bg-[#FFFCF7]" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="parc-categoria" className="font-bold text-[#500B08]">Categoria *</Label>
              <select
                id="parc-categoria"
                name="categoria"
                className="h-[52px] w-full rounded-[14px] border border-[#E8D9BE] bg-[#FFFCF7] px-3 text-sm"
                defaultValue="outros"
              >
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="parc-descricao" className="font-bold text-[#500B08]">Proposta / descrição</Label>
              <Textarea id="parc-descricao" name="descricao" rows={3} maxLength={500} className="rounded-[14px] border-[#E8D9BE] bg-[#FFFCF7]" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="parc-regiao" className="font-bold text-[#500B08]">Região atendida</Label>
              <Input id="parc-regiao" name="proposta" maxLength={200} className="h-[52px] rounded-[14px] border-[#E8D9BE] bg-[#FFFCF7]" />
            </div>
            <label className="flex items-center gap-2 text-sm text-[#60524C] sm:col-span-2">
              <input type="checkbox" name="autoriza" className="size-4" /> Autorizo divulgar minha empresa aqui
            </label>
            <Button
              type="submit"
              className="h-[54px] rounded-[14px] bg-gradient-to-r from-[#B9000B] via-[#F47500] to-[#F6B300] font-bold text-white shadow-[var(--shadow-card)] hover:opacity-95 disabled:opacity-50 sm:col-span-2"
              disabled={enviando}
            >
              {enviando ? "Enviando…" : "Quero ser parceiro"}
            </Button>
            {telConfigurado ? (
              <a
                href={whatsappLink(telConfigurado, textoContato)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-[#B9000B] underline sm:col-span-2"
              >
                <MessageCircle className="size-4" aria-hidden /> Prefiro falar no WhatsApp
              </a>
            ) : null}
          </form>
        </div>
      </section>
    </div>
  );
}
