import { deslocarDia } from "./dashboard-a01";

type LotePainel = { produto_id: string; status: string; restante: number; validade: string | null };
type ReservaPainel = { id: string; produto_id: string; quantidade: number };
type ConsumoPainel = { reserva_id: string; quantidade: number };
type SaborPainel = { id: string; estoque_minimo: number | null };

function somarPor<T>(linhas: T[], chave: (linha: T) => string, valor: (linha: T) => number) {
  const mapa = new Map<string, number>();
  for (const linha of linhas) mapa.set(chave(linha), (mapa.get(chave(linha)) ?? 0) + valor(linha));
  return mapa;
}

export function calcularEstoqueDashboard(
  lotes: LotePainel[],
  reservasAtivas: ReservaPainel[],
  consumos: ConsumoPainel[],
  hoje: string,
) {
  const produtosComLote = new Set(lotes.map((lote) => lote.produto_id));
  const lotesAtivos = lotes.filter((lote) => lote.status === "ativo" && lote.restante > 0);
  const fisicos = somarPor(
    lotesAtivos,
    (lote) => lote.produto_id,
    (lote) => lote.restante,
  );
  const retirados = somarPor(
    consumos,
    (consumo) => consumo.reserva_id,
    (consumo) => consumo.quantidade,
  );
  const reservas = somarPor(
    reservasAtivas,
    (reserva) => reserva.produto_id,
    (reserva) => Math.max(0, reserva.quantidade - (retirados.get(reserva.id) ?? 0)),
  );
  const validades = new Map<string, string>();
  for (const lote of lotesAtivos) {
    const anterior = validades.get(lote.produto_id);
    if (lote.validade && (!anterior || lote.validade < anterior))
      validades.set(lote.produto_id, lote.validade);
  }
  const limite = deslocarDia(hoje, 7);

  return (produto: SaborPainel) => {
    const fisico = produtosComLote.has(produto.id) ? (fisicos.get(produto.id) ?? 0) : null;
    const reservado = reservas.get(produto.id) ?? 0;
    const disponivel = fisico === null ? null : fisico - reservado;
    const minimo =
      produto.estoque_minimo && produto.estoque_minimo > 0 ? produto.estoque_minimo : null;
    const validadeProxima = validades.get(produto.id) ?? null;
    const abaixo = disponivel !== null && minimo !== null && disponivel < minimo;
    const repor = disponivel !== null && (disponivel <= 0 || abaixo);
    const vencido = validadeProxima !== null && validadeProxima < hoje;
    const vence = validadeProxima !== null && validadeProxima <= limite && !vencido;

    const estado = [
      { quando: vencido, texto: "Lote vencido", peso: 8, tom: "vermelho" },
      {
        quando: disponivel !== null && disponivel < 0,
        texto: "Reserva acima do físico",
        peso: 7,
        tom: "vermelho",
      },
      { quando: fisico === 0, texto: "Estoque zerado", peso: 6, tom: "vermelho" },
      {
        quando: fisico !== 0 && disponivel === 0,
        texto: "Sem saldo disponível",
        peso: 5,
        tom: "vermelho",
      },
      { quando: abaixo, texto: "Abaixo do mínimo", peso: 4, tom: "vermelho" },
      { quando: fisico === null, texto: "Sem lote cadastrado", peso: 3, tom: "ouro" },
      { quando: vence, texto: "Vence em breve", peso: 2, tom: "ouro" },
      { quando: minimo === null, texto: "Sem mínimo definido", peso: 1, tom: "ouro" },
    ];
    const alertas = estado.filter((item) => item.quando);
    return {
      fisico,
      reservado,
      disponivel,
      minimo,
      validadeProxima,
      repor,
      vencido,
      vence,
      alertas,
      prioridade: alertas[0]?.peso ?? 0,
    };
  };
}
