import type { ReactNode } from "react";
import { CalendarDays, Star, UserRoundPlus, Users } from "lucide-react";
import { MetricCard } from "./erp-ui";

export function CrmResumo({
  descricao,
  total,
  inativos,
  vip,
  novos,
  rotuloVip = "Clientes VIP",
  acoes,
}: {
  descricao: string;
  total: ReactNode;
  inativos: ReactNode;
  vip: ReactNode;
  novos: ReactNode;
  rotuloVip?: string;
  acoes?: ReactNode;
}) {
  return (
    <>
      <header className="com-cabecalho flex-wrap">
        <span className="com-cabecalho-icone"><Users size={22} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h1>Clientes — Segmentação e Reativação</h1>
          <p>{descricao}</p>
        </div>
        {acoes}
      </header>
      <div className="com-kpis com-kpis-quatro" aria-label="Indicadores de clientes">
        <MetricCard icone={Users} label="Clientes na base" valor={total} />
        <MetricCard icone={CalendarDays} label="Inativos (30+ dias)" valor={inativos} />
        <MetricCard icone={Star} label={rotuloVip} valor={vip} />
        <MetricCard icone={UserRoundPlus} label="Novos clientes" valor={novos} />
      </div>
    </>
  );
}

export function PaginacaoClientes({
  total,
  pagina,
  porPagina,
  onPagina,
}: {
  total: number;
  pagina: number;
  porPagina: number;
  onPagina: (pagina: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const primeiro = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  return (
    <nav className="com-paginacao" aria-label="Paginação de clientes">
      <span>Exibindo {primeiro}–{Math.min(pagina * porPagina, total)} de {total} clientes</span>
      <span className="com-paginacao-botoes">
        <button type="button" className="com-icone" aria-label="Página anterior"
          disabled={pagina <= 1} onClick={() => onPagina(pagina - 1)}>‹</button>
        <span>{pagina} / {paginas}</span>
        <button type="button" className="com-icone" aria-label="Próxima página"
          disabled={pagina >= paginas} onClick={() => onPagina(pagina + 1)}>›</button>
      </span>
    </nav>
  );
}
