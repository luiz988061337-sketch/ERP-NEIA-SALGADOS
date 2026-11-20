import { useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Cloud,
  Download,
  FileText,
  FilePlus2,
  Files,
  Info,
  Save,
  Settings,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PremiumSection } from "@/components/admin/erp-ui";
import { ehModoDemo } from "@/lib/demo-preview";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const CAMPO =
  "h-9 border-[#D4A94A]/50 bg-[#141310] text-[13px] text-[#F4F1EA] placeholder:text-[#6F6A61] focus-visible:ring-[#D4A94A]";

function Campo({
  rotulo,
  name,
  placeholder,
  defaultValue,
  type = "text",
  obrigatorio = false,
  className,
  maxLength,
  inputMode,
}: {
  rotulo: string;
  name: string;
  placeholder?: string;
  defaultValue?: string | number;
  type?: string;
  obrigatorio?: boolean;
  className?: string;
  maxLength?: number;
  inputMode?: "numeric" | "text" | "decimal" | "tel" | "email" | "url" | "search" | "none";
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-[12px] font-medium text-[#A09A8E]">
        {rotulo} {obrigatorio ? <span className="text-[#F16A6A]">*</span> : null}
      </Label>
      <Input
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        maxLength={maxLength}
        inputMode={inputMode}
        className={CAMPO}
      />
    </div>
  );
}

function CampoSelect({
  rotulo,
  name,
  defaultValue,
  opcoes,
  obrigatorio = false,
  className,
}: {
  rotulo: string;
  name: string;
  defaultValue: string;
  opcoes: { value: string; label: string }[];
  obrigatorio?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-[12px] font-medium text-[#A09A8E]">
        {rotulo} {obrigatorio ? <span className="text-[#F16A6A]">*</span> : null}
      </Label>
      <select
        name={name}
        defaultValue={defaultValue}
        className={cn("w-full rounded-md px-3", CAMPO)}
      >
        {opcoes.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function MiniStatus({
  rotulo,
  valor,
  icone: Icone,
  tom,
}: {
  rotulo: string;
  valor: string;
  icone: LucideIcon;
  tom: "green" | "gold" | "blue" | "gray" | "red";
}) {
  const cor: Record<typeof tom, string> = {
    green: "#35C97C",
    gold: "#F2CE6B",
    blue: "#5B93F5",
    gray: "#A09A8E",
    red: "#F16A6A",
  };
  return (
    <div className="flex min-h-[64px] items-center gap-3 rounded-xl border border-[#D4A94A] bg-[#141310] px-4 py-2 shadow-card">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-full border"
        style={{ borderColor: `${cor[tom]}80`, color: cor[tom], backgroundColor: `${cor[tom]}18` }}
      >
        <Icone className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[12px] text-[#A09A8E]">{rotulo}</p>
        <p className="truncate text-[14px] font-bold text-[#F4F1EA]">{valor}</p>
      </div>
    </div>
  );
}

function CardComGlow({
  icone: Icone,
  titulo,
  subtitulo,
  children,
}: {
  icone: LucideIcon;
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-[#D4A94A] bg-[#17150F] shadow-card">
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-20"
        style={{ background: "radial-gradient(ellipse at top, rgba(242,206,107,.22), transparent 70%)" }}
        aria-hidden
      />
      <header className="relative z-10 flex flex-wrap items-center gap-3 border-b border-[#D4A94A] bg-[#1B1811] px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-[#D4A94A]/70 bg-[#1A1712]">
          <Icone className="size-5 text-[#F2CE6B]" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-bold text-[#F4F1EA]">{titulo}</h2>
          {subtitulo ? <p className="text-[12px] leading-snug text-[#A09A8E]">{subtitulo}</p> : null}
        </div>
      </header>
      <div className="relative z-10 p-4">{children}</div>
    </section>
  );
}

export function FiscalPremium() {
  const modoDemo = ehModoDemo();
  const [salvando, setSalvando] = useState(false);
  const [buscaDoc, setBuscaDoc] = useState("");
  const [filtroDoc, setFiltroDoc] = useState("todos");

  function salvar(e: FormEvent<HTMLFormElement>, mensagem: string) {
    e.preventDefault();
    setSalvando(true);
    toast.success(`${mensagem} (demonstração isolada — nada foi gravado).`);
    setSalvando(false);
  }

  return (
    <div className="w-full space-y-5 px-4 py-6 pb-28">
      <header className="flex flex-wrap items-center gap-4 border-b border-[#D4A94A] pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <FileText className="size-10 shrink-0 text-[#F2CE6B]" aria-hidden />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-[28px] font-bold leading-tight text-[#F4F1EA]">Fiscal</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#5B93F5]/60 bg-[#5B93F5]/15 px-3 py-1 text-[11px] font-bold text-[#5B93F5]">
                <span className="size-2 rounded-full bg-[#5B93F5]" aria-hidden /> HOMOLOGAÇÃO
              </span>
            </div>
          </div>
        </div>
        {modoDemo ? (
          <span className="ml-auto inline-flex items-center whitespace-nowrap rounded-full border border-[#D4A94A]/70 bg-[#1A1712] px-3 py-1 text-[11px] font-semibold text-[#F2CE6B]">
            MODO DEMONSTRAÇÃO · dados fictícios · nenhuma operação real
          </span>
        ) : null}
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MiniStatus rotulo="Empresa" valor="Cadastrada" icone={CheckCircle2} tom="green" />
        <MiniStatus rotulo="Provedor" valor="Focus NFe" icone={Settings} tom="gold" />
        <MiniStatus rotulo="Ambiente" valor="Homologação" icone={ShieldCheck} tom="blue" />
        <MiniStatus rotulo="Modelo" valor="—" icone={FileText} tom="gray" />
        <MiniStatus rotulo="Situação fiscal" valor="Pendente" icone={AlertTriangle} tom="red" />
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-[#F5A623] bg-[rgba(245,166,35,.12)] px-4 py-3">
        <AlertTriangle className="mt-0.5 size-6 shrink-0 text-[#F5A623]" aria-hidden />
        <p className="text-[13px] leading-snug text-[#F4F1EA]">
          <b>Configuração fiscal pendente:</b> faltam razão social, CNPJ, modelo do documento
          (55/65), provedor/API fiscal. Preencha abaixo e valide com o contador antes de emitir.
        </p>
      </div>

      <CardComGlow icone={Building2} titulo="Empresa (Administração → Fiscal)">
        <form
          onSubmit={(e) => salvar(e, "Configuração fiscal salva")}
          className="grid gap-3 sm:grid-cols-3"
        >
          <Campo rotulo="Razão social" name="razao_social" obrigatorio />
          <Campo rotulo="Nome fantasia" name="nome_fantasia" />
          <Campo rotulo="CNPJ" name="cnpj" obrigatorio inputMode="numeric" />
          <Campo rotulo="Inscrição estadual" name="ie" />
          <Campo rotulo="Inscrição municipal" name="im" />
          <Campo rotulo="Endereço (rua/av)" name="endereco" obrigatorio />
          <Campo rotulo="Número" name="numero" />
          <Campo rotulo="Complemento" name="complemento" />
          <Campo rotulo="Bairro" name="bairro" />
          <Campo rotulo="Cidade" name="cidade" />
          <CampoSelect
            rotulo="UF"
            name="uf"
            defaultValue="SP"
            opcoes={[
              { value: "SP", label: "SP" },
              { value: "RJ", label: "RJ" },
              { value: "MG", label: "MG" },
              { value: "PR", label: "PR" },
              { value: "RS", label: "RS" },
              { value: "BA", label: "BA" },
            ]}
          />
          <Campo rotulo="CEP" name="cep" />
          <Campo rotulo="Regime tributário" name="regime" placeholder="Definido pelo contador" />
          <Campo rotulo="Série" name="serie" />
          <Campo rotulo="Número inicial" name="numero_inicial" type="number" defaultValue={1} />
          <CampoSelect
            rotulo="Ambiente"
            name="ambiente"
            defaultValue="homologacao"
            obrigatorio
            opcoes={[
              { value: "homologacao", label: "🔵 Homologação" },
              { value: "producao", label: "🔴 Produção" },
            ]}
          />
          <CampoSelect
            rotulo="Modelo padrão"
            name="modelo"
            defaultValue=""
            obrigatorio
            opcoes={[
              { value: "", label: "—" },
              { value: "55", label: "NF-e 55" },
              { value: "65", label: "NFC-e 65" },
            ]}
          />
          <Campo
            rotulo="Provedor/API fiscal"
            name="provedor"
            placeholder="Ex: Focus, Nuvem Fiscal…"
            obrigatorio
          />
          <Campo rotulo="CSC/Token (NFC-e)" name="csc" type="password" />
          <Campo rotulo="Informações adicionais" name="info" className="sm:col-span-2" />
          <Button
            type="submit"
            size="sm"
            disabled={salvando}
            className="erp-btn-gold h-9 w-fit gap-1.5 px-4 text-[13px] font-bold text-[#14120C]"
          >
            <Save className="size-4" aria-hidden /> Salvar
          </Button>
        </form>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[#A09A8E]">
          <Info className="size-3.5" aria-hidden /> Certificado digital e senhas ficam no
          provedor/cofre — nunca no código nem no frontend.
        </p>
      </CardComGlow>

      <PremiumSection
        icone={Cloud}
        titulo="Provedor fiscal (transmissão SEFAZ)"
        subtitulo="Sem provedor configurado a emissão para em “rejeitada”. Comece por homologação; o certificado A1 fica no provedor/cofre, nunca aqui."
      >
        <form
          onSubmit={(e) => salvar(e, "Provedor fiscal salvo")}
          className="grid gap-3 sm:grid-cols-3"
        >
          <CampoSelect
            rotulo="Provedor"
            name="provedor_tipo"
            defaultValue="focus"
            opcoes={[
              { value: "focus", label: "Focus NFe" },
              { value: "nuvem_fiscal", label: "Nuvem Fiscal" },
              { value: "tecnospeed", label: "TecnoSpeed" },
              { value: "sefaz_direto", label: "SEFAZ direto" },
            ]}
          />
          <CampoSelect
            rotulo="Ambiente do provedor"
            name="ambiente_provedor"
            defaultValue="homologacao"
            opcoes={[
              { value: "homologacao", label: "🔵 Homologação" },
              { value: "producao", label: "🔴 Produção" },
            ]}
          />
          <Campo rotulo="Timeout (seg)" name="timeout" type="number" defaultValue={30} />
          <Campo rotulo="URL homologação" name="homologacao_url" placeholder="https://…" />
          <Campo rotulo="Token homologação" name="homologacao_token" type="password" />
          <Campo rotulo="URL produção" name="producao_url" placeholder="https://…" />
          <Campo rotulo="Token produção" name="producao_token" type="password" />
          <label className="flex items-center gap-2 text-[13px] text-[#C9C2B8] sm:col-span-3">
            <input
              type="checkbox"
              name="contingencia"
              className="size-4 accent-[#F2CE6B]"
            />
            Contingência habilitada (só com orientação do contador)
          </label>
          <Button
            type="submit"
            size="sm"
            className="erp-btn-gold h-9 w-fit gap-1.5 px-4 text-[13px] font-bold text-[#14120C]"
          >
            <Save className="size-4" aria-hidden /> Salvar provedor
          </Button>
        </form>
      </PremiumSection>

      <PremiumSection
        icone={Zap}
        titulo="Emitir (pedidos sem documento)"
        subtitulo="A emissão valida empresa + NCM/CFOP/CST com o banco antes de chamar o provedor. Sem NCM do contador ou com combo avulso, ela bloqueia com o motivo — nunca emite com tributo inventado."
      >
        <div className="space-y-2">
          {[
            { numero: 1045, cliente: "Cliente fictício", status: "recebido" },
            { numero: 1046, cliente: "Outro cliente fictício", status: "em preparo" },
          ].map((p) => (
            <div
              key={p.numero}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-[#2A2721] bg-[#141310] p-3"
            >
              <FilePlus2 className="size-4 text-[#F2CE6B]" aria-hidden />
              <span className="font-display text-[14px] font-bold text-[#F4F1EA]">Pedido #{p.numero}</span>
              <span className="text-[12px] text-[#A09A8E]">
                {p.cliente} • {p.status}
              </span>
              <Button
                type="button"
                size="sm"
                className="erp-btn-gold ml-auto h-8 gap-1.5 px-3 text-[12px] font-bold text-[#14120C]"
                onClick={() => toast.info(`Emissão do pedido #${p.numero} simulada (demonstração).`)}
              >
                <FileText className="size-4" aria-hidden /> Emitir NF-e/NFC-e
              </Button>
            </div>
          ))}
        </div>
      </PremiumSection>

      <PremiumSection
        icone={Files}
        titulo="Documentos"
        subtitulo="NF-e, NFC-e e documentos do período."
        acoes={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-[#D4A94A]/60 px-3 text-[12px] text-[#F2CE6B] hover:bg-[#1A1712]"
            onClick={() => toast.info("Exportação CSV simulada (demonstração).")}
          >
            <Download className="size-4" aria-hidden /> Exportar (CSV)
          </Button>
        }
      >
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <Input
            value={buscaDoc}
            onChange={(e) => setBuscaDoc(e.target.value)}
            placeholder="Buscar NF-e, NFC-e ou cliente..."
            aria-label="Buscar documento fiscal"
            className={CAMPO}
          />
          <select
            value={filtroDoc}
            onChange={(e) => setFiltroDoc(e.target.value)}
            aria-label="Filtrar status"
            className={cn("w-full rounded-md px-3", CAMPO)}
          >
            <option value="todos">Todos os status</option>
            <option value="autorizada">Autorizada</option>
            <option value="pendente">Pendente</option>
            <option value="rejeitada">Rejeitada</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>
        <div className="rounded-xl border border-[#2A2721] bg-[#141310] px-4 py-8 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-xl border border-[#D4A94A]/50 bg-[#1A1712]">
            <Files className="size-7 text-[#F2CE6B]" aria-hidden />
          </span>
          <p className="mt-3 font-display text-[16px] font-bold text-[#F4F1EA]">
            Nenhum documento emitido
          </p>
          <p className="mt-1 text-[12px] text-[#A09A8E]">
            Configure a empresa e o provedor, e emita uma NF-e/NFC-e a partir de um pedido.
          </p>
        </div>
      </PremiumSection>
    </div>
  );
}
