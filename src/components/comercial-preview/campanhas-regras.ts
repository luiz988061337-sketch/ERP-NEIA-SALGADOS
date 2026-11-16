export type SegmentoCampanha =
  | "todos"
  | "inativos_30"
  | "inativos_60"
  | "inativos_90"
  | "vip"
  | "recorrentes"
  | "reclamacoes";

export type PerfilDemo = "marketing" | "responsavel";
export type StatusCampanha = "Rascunho" | "Aguardando aprovação" | "Aprovada" | "Rejeitada";

export type CandidatoCampanha = {
  id: string;
  nome: string;
  diasSemComprar: number;
  vip: boolean;
  recorrente: boolean;
  reclamacao: boolean;
  optOut: boolean;
  diasDesdeContato: number | null;
};

export type DestinatarioExcluido = CandidatoCampanha & { motivos: string[] };

export function pertenceAoSegmento(c: CandidatoCampanha, segmento: SegmentoCampanha) {
  switch (segmento) {
    case "inativos_30":
      return c.diasSemComprar >= 30 && c.diasSemComprar < 60;
    case "inativos_60":
      return c.diasSemComprar >= 60 && c.diasSemComprar < 90;
    case "inativos_90":
      return c.diasSemComprar >= 90;
    case "vip":
      return c.vip;
    case "recorrentes":
      return c.recorrente;
    case "reclamacoes":
      return c.reclamacao;
    default:
      return true;
  }
}

export function calcularPublico(
  clientes: CandidatoCampanha[],
  segmento: SegmentoCampanha,
  intervaloMinimoDias: number,
) {
  const selecionados = clientes.filter((c) => pertenceAoSegmento(c, segmento));
  const elegiveis: CandidatoCampanha[] = [];
  const excluidos: DestinatarioExcluido[] = [];

  for (const cliente of selecionados) {
    const motivos: string[] = [];
    if (cliente.optOut) motivos.push("Opt-out: cliente pediu para não receber campanhas.");
    if (
      cliente.diasDesdeContato !== null &&
      cliente.diasDesdeContato < intervaloMinimoDias
    ) {
      motivos.push(
        `Contato há ${cliente.diasDesdeContato} dia(s); intervalo mínimo de ${intervaloMinimoDias} dias.`,
      );
    }
    if (motivos.length) excluidos.push({ ...cliente, motivos });
    else elegiveis.push(cliente);
  }

  return { selecionados, elegiveis, excluidos };
}

export function podeDecidir(
  campanha: { status: StatusCampanha; criador: string },
  perfilAtual: PerfilDemo,
  nomeAtual: string,
) {
  return (
    campanha.status === "Aguardando aprovação" &&
    perfilAtual === "responsavel" &&
    campanha.criador !== nomeAtual
  );
}

export function substituirCamposMensagem(
  mensagem: string,
  cliente: Pick<CandidatoCampanha, "nome" | "diasSemComprar"> | null,
  cupom: string,
) {
  const texto = cupom
    ? mensagem
    : mensagem.replace(/(^|(?<=[.!?\n]))[^.!?\r\n]*\{\{cupom\}\}[^.!?\r\n]*[.!?]*/g, "").trim();
  return texto
    .replaceAll("{{cliente}}", cliente?.nome.split(" ")[0] ?? "[cliente]")
    .replaceAll("{{dias_sem_comprar}}", String(cliente?.diasSemComprar ?? "[dias]"))
    .replaceAll("{{cupom}}", cupom);
}

function dataValida(data: string) {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const instante = new Date(data + "T00:00:00.000Z");
  return Number.isFinite(instante.getTime()) && instante.toISOString().slice(0, 10) === data;
}

export function periodoCampanhaValido(inicio: string, fim: string) {
  return dataValida(inicio) && dataValida(fim) && inicio <= fim;
}
