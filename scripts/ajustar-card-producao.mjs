/**
 * Reescreve o card de pedido da Producao no padrao da referencia aprovada:
 * numero + badge + prazo/finalizado no topo, modalidade, produtos com
 * quantidade, total de salgados, observacoes, avisos e botoes de destaque
 * (Iniciar preparo / Finalizar / Avisar caixa / Liberar retirada).
 * O tempo tecnico interno fica oculto (decisao do proprietario).
 */
import fs from "node:fs";

const P = "src/routes/producao.tsx";
let src = fs.readFileSync(P, "utf8");

const inicio = src.indexOf("  function cardPedido(p: any) {");
const fim = src.indexOf("  function recarregarReservas() {");
if (inicio < 0 || fim < 0 || fim < inicio) throw new Error("cardPedido nao localizado");

const novo = `  function cardPedido(
    p: any,
    ctx: { cor: string; coluna: "fazer" | "preparo" | "pronto" },
  ) {
    const calc = calcDe(p);
    const estado = estadoDe(p);
    const meta = NIVEL_META_PRODUCAO[estado.nivel];
    const retirada = p.tipo_entrega === "retirada";
    const qtdTotal = (p.pedido_itens ?? []).reduce(
      (s: number, i: any) => s + (Number(i.quantidade) || 0),
      0,
    );
    const pronto = p.status === "pronto";
    // Canto superior direito: "até HH:MM" na fila, "Finalizado HH:MM" quando pronto.
    const prazo = p.agendado_para
      ? hora(p.agendado_para)
      : p.created_at
        ? hora(limiteImediatoProducao(p.created_at).toISOString())
        : "--:--";
    return (
      <article
        key={p.id}
        className="rounded-xl border-2 bg-[#121110] p-3 shadow-card"
        style={{ borderColor: \`\${ctx.cor}66\` }}
      >
        {/* Linha 1: numero + badge de prioridade + prazo/finalizado */}
        <div className="flex items-center gap-2">
          <h3 className="font-display text-lg font-bold leading-none text-foreground">
            #{p.numero}
          </h3>
          {estado.nivel !== "normal" ? (
            <span
              className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
              style={{
                backgroundColor:
                  estado.nivel === "atrasado"
                    ? "rgba(241,106,106,.18)"
                    : estado.nivel === "risco"
                      ? "rgba(245,166,35,.18)"
                      : "rgba(212,169,74,.16)",
                color:
                  estado.nivel === "atrasado"
                    ? "#F16A6A"
                    : estado.nivel === "risco"
                      ? "#F5B301"
                      : "#F2CE6B",
              }}
              title={meta.rotulo}
            >
              {estado.nivel === "atrasado"
                ? "Atrasado"
                : estado.nivel === "risco"
                  ? "Atraso"
                  : estado.nivel === "atencao"
                    ? "Atenção"
                    : "Urgente"}
            </span>
          ) : null}
          <span className="ml-auto inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-[#C9C2B8]">
            {pronto ? (
              <>
                <CircleCheck className="size-4 text-[#35C97C]" aria-hidden />
                Finalizado {p.pronto_em ? hora(p.pronto_em) : "--:--"}
              </>
            ) : (
              <>
                <Clock className="size-4 text-[#F2CE6B]" aria-hidden />
                até {prazo}
              </>
            )}
          </span>
        </div>

        {/* Linha 2: modalidade (entrega/retirada) + cliente */}
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-full border border-[#2A2721] bg-[#17150F] px-2 py-0.5 font-bold text-[#F4F1EA]">
            {retirada ? "🏪 Retirada" : "🚚 Entrega"}
          </span>
          <span className="text-muted-foreground">• {p.cliente_nome}</span>
        </p>

        {/* Produtos e quantidades */}
        <ul className="mt-2 space-y-0.5 text-xs">
          {(p.pedido_itens ?? []).map((i: any) => {
            const cls = classificarProcesso({
              nome: String(i.nome ?? ""),
              categoriaSlug:
                i.produtos?.categoria_id != null
                  ? ((slugPorCategoria.get(i.produtos.categoria_id) as string | undefined) ?? null)
                  : null,
            });
            const emoji = EMOJI_PROCESSO[cls] ?? "•";
            return (
              <li key={i.id} className="flex items-center gap-1.5">
                <span className="text-[#F2CE6B]">{emoji}</span>
                <span className="font-bold text-foreground">{i.quantidade}x</span>
                <span className="min-w-0 flex-1 truncate text-[#F4F1EA]">{i.nome}</span>
              </li>
            );
          })}
        </ul>
        {qtdTotal > 0 ? (
          <p className="mt-1.5 text-xs">
            <b className="text-foreground">Total:</b>{" "}
            <b className="text-[#F2CE6B]">
              {qtdTotal} salgado{qtdTotal > 1 ? "s" : ""}
            </b>
          </p>
        ) : null}

        {/* Observacoes */}
        {p.observacoes ? (
          <p className="mt-2 rounded-lg border border-[#2A2721] bg-[#17150F] px-2 py-1.5 text-[11px] text-[#C9C2B8]">
            <b className="text-[#F2CE6B]">💬 Obs.:</b> {p.observacoes}
          </p>
        ) : null}

        {/* Prazos do cliente (tempo tecnico interno oculto por decisao) */}
        {calc?.tecnicoMin != null ? (
          <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
            <p>
              👤 Prazo cliente:{" "}
              {p.agendado_para ? (
                <>solicitado {hora(p.agendado_para)}</>
              ) : (
                <>
                  até{" "}
                  {p.created_at
                    ? hora(limiteImediatoProducao(p.created_at).toISOString())
                    : "--:--"}{" "}
                  (40–60 min)
                </>
              )}
            </p>
            <p>
              {p.agendado_para ? (
                <>
                  ▶️ Início recomendado:{" "}
                  {hora(inicioRecomendadoProducao(p.agendado_para, calc.tecnicoMin).toISOString())}
                </>
              ) : (
                <>⏱️ Resta {formatarMinutosProducao(estado.restanteMin)}</>
              )}
              {p.tipo_entrega !== "retirada" && p.endereco ? \` • \${p.endereco}\` : ""}
            </p>
          </div>
        ) : (
          <p className="mt-1 text-[11px] font-semibold text-[#F5B301]">
            ⚠️ Sem tempo estimado (
            {calc?.motivoSemTempo === "vazio"
              ? "pedido sem itens"
              : "sem processo reconhecido — validar cadastro"}
            ).
          </p>
        )}
        {(calc?.naoReconhecidos?.length ?? 0) > 0 ? (
          <p className="mt-1.5 rounded-lg border border-[#F5B301]/35 bg-[#F5B301]/10 px-2 py-1.5 text-[11px] text-[#F5B301]">
            ⚠️ Não reconhecido:{" "}
            {(calc?.naoReconhecidos ?? []).map((n) => \`\${n.nome} (\${n.quantidade})\`).join(", ")}
          </p>
        ) : null}
        {estado.nivel !== "normal" && !pronto ? (
          <p
            className="mt-2 rounded-lg px-2 py-1.5 text-[11px] font-bold"
            style={{
              backgroundColor:
                estado.nivel === "atrasado"
                  ? "rgba(241,106,106,.14)"
                  : estado.nivel === "risco"
                    ? "rgba(245,166,35,.14)"
                    : "rgba(212,169,74,.12)",
              color:
                estado.nivel === "atrasado"
                  ? "#F16A6A"
                  : estado.nivel === "risco"
                    ? "#F5B301"
                    : "#F2CE6B",
            }}
          >
            {estado.nivel === "hora-preparar"
              ? \`🔔 HORA DE PREPARAR — estimado \${calc?.tecnicoMin ?? "?"} min. INICIAR PREPARO.\`
              : null}
            {estado.nivel === "atencao"
              ? \`⚠️ ATENÇÃO — faltam \${formatarMinutosProducao(estado.restanteMin)} para o limite.\`
              : null}
            {estado.nivel === "risco"
              ? \`🚨 RISCO DE ATRASO — restante \${formatarMinutosProducao(estado.restanteMin)}, estimado \${calc?.tecnicoMin ?? "?"} min.\`
              : null}
            {estado.nivel === "atrasado"
              ? \`🔴 ATRASADO \${formatarMinutosProducao(estado.restanteMin)}.\`
              : null}
          </p>
        ) : null}

        {FLAGS_INTEGRACAO.consumo && (reservasPorPedido.get(String(p.id))?.length ?? 0) > 0 ? (
          <details className="mt-2 rounded-lg border border-[#2A2721] bg-[#17150F] p-2">
            <summary className="cursor-pointer text-[11px] font-semibold text-[#C9C2B8]">
              Retirada fisica do freezer ({reservasPorPedido.get(String(p.id))!.length} produto(s))
            </summary>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Registre SOMENTE o que saiu fisicamente. O restante continua reservado e o
              pedido nao muda de status por esta acao.
            </p>
            <div className="mt-2 space-y-2">
              {reservasPorPedido
                .get(String(p.id))!
                .filter((r) => r.restante > 0)
                .map((r) => (
                  <RetiradaReserva key={r.id} reserva={r} onAtualizado={recarregarReservas} />
                ))}
            </div>
          </details>
        ) : null}

        {/* Acoes de preparo/finalizacao (destaque total, como na referencia) */}
        <div className="mt-2.5 flex flex-col gap-1.5">
          {p.status === "recebido" ? (
            <Button
              size="sm"
              onClick={() => mudarStatus(p, "em_producao", "produzindo")}
              className="erp-btn-gold h-11 w-full border border-[#D4A94A] bg-gradient-to-b from-[#F2CE6B] to-[#D4A94A] text-sm font-bold text-[#14120C] hover:brightness-105"
            >
              ▶ Iniciar preparo
            </Button>
          ) : null}
          {p.status === "em_producao" ? (
            <Button
              size="sm"
              onClick={() => mudarStatus(p, "pronto", "finalizado")}
              className="h-11 w-full border border-[#5B93F5] bg-gradient-to-b from-[#5B93F5] to-[#2F62C8] text-sm font-bold text-white hover:brightness-105"
            >
              ✓ Finalizar
            </Button>
          ) : null}
          {pronto && !retirada ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => mudarStatus(p, "aguardando_motoboy", "finalizado")}
              className="erp-btn-gold h-11 w-full border border-[#D4A94A] bg-gradient-to-b from-[#F2CE6B] to-[#D4A94A] text-sm font-bold text-[#14120C] hover:brightness-105"
            >
              🔔 Avisar caixa
            </Button>
          ) : null}
          {pronto && retirada ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => mudarStatus(p, "aguardando_motoboy", "finalizado")}
              className="h-11 w-full border border-[#35C97C] bg-gradient-to-b from-[#35C97C] to-[#1E8F58] text-sm font-bold text-white hover:brightness-105"
            >
              🏪 Liberar retirada
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => imprimirDireto(p)}
            className="h-8 w-full px-2 text-[11px] text-[#C9C2B8] hover:bg-[#F2CE6B]/12 hover:text-[#F2CE6B]"
          >
            <Printer className="mr-1 size-4" /> Imprimir
          </Button>
        </div>
      </article>
    );
  }

`;

src = src.slice(0, inicio) + novo + src.slice(fim);

// Chamadas: cardPedido agora recebe o contexto da coluna
src = src.replace(
  "filaFazer.map((p: any) => cardPedido(p))",
  'filaFazer.map((p: any) => cardPedido(p, { cor: ERP_COLORS.orange, coluna: "fazer" }))',
);
src = src.replace(
  "preparoLista.map((p: any) => cardPedido(p))",
  'preparoLista.map((p: any) => cardPedido(p, { cor: ERP_COLORS.blue, coluna: "preparo" }))',
);
src = src.replace(
  "[...prontosEntrega, ...prontosRetirada].map((p: any) => cardPedido(p))",
  '[...prontosEntrega, ...prontosRetirada].map((p: any) => cardPedido(p, { cor: ERP_COLORS.green, coluna: "pronto" }))',
);

// Icones dos cabecalhos das colunas
src = src.replace(
  'titulo="A Fazer"\n            contador={filaFazer.length}\n            cor={ERP_COLORS.orange}',
  'titulo="A Fazer"\n            contador={filaFazer.length}\n            cor={ERP_COLORS.orange}\n            icone={AlarmClock}',
);
src = src.replace(
  'titulo="Em Preparo"\n            contador={preparoLista.length}\n            cor={ERP_COLORS.blue}',
  'titulo="Em Preparo"\n            contador={preparoLista.length}\n            cor={ERP_COLORS.blue}\n            icone={UtensilsCrossed}',
);
src = src.replace(
  'titulo="Pronto"\n            contador={prontosEntrega.length + prontosRetirada.length}\n            cor={ERP_COLORS.green}',
  'titulo="Pronto"\n            contador={prontosEntrega.length + prontosRetirada.length}\n            cor={ERP_COLORS.green}\n            icone={CircleCheck}',
);

// Importa os icones usados
if (!/AlarmClock/.test(src.split("export const Route")[0])) {
  src = src.replace(/(\n\s+ChefHat,)/, "$1\n  AlarmClock,\n  CircleCheck,");
}
if (!/UtensilsCrossed/.test(src.split("export const Route")[0])) {
  src = src.replace(/(\n\s+Users,)/, "$1\n  UtensilsCrossed,");
}
if (!/Clock,/.test(src.split("export const Route")[0])) {
  src = src.replace(/(\n\s+ChefHat,)/, "$1\n  Clock,");
}

fs.writeFileSync(P, src, "utf8");
console.log("cardPedido reescrito;", src.length, "bytes");
