/**
 * Acoes de liberacao da Producao (Cozinha) — implementadas sobre o modelo
 * REAL do projeto, sem inventar status nem colunas:
 *
 * - `pedidos.conferido_em` = "conferencia final da cozinha" (migration 0084).
 * - Fluxo de retirada (`STATUS_FLOW_RETIRADA`): recebido -> em_producao ->
 *   pronto -> entregue. Retirada NUNCA passa por `aguardando_motoboy`.
 * - `pedidos.retirado_em` = confirmacao da retirada (preservada; nao e
 *   marcada automaticamente aqui).
 * - Aviso interno de caixa/balcao usa a tabela real `notificacoes`, lida pela
 *   Central de Pedidos (`op-avisos`).
 *
 * Efeitos de "Avisar caixa" (entrega): apenas notificacao interna + registro.
 * NAO altera status, NAO atribui/libera motoboy, NAO envia WhatsApp,
 * NAO mexe em estoque/cupom. O pedido continua "pronto", disponivel para o
 * fluxo correto da Central de Entregas.
 *
 * Efeitos de "Liberar retirada" (retirada): liberacao para o balcao +
 * notificacao interna. Status permanece "pronto" (= "Pronto para retirada"),
 * nunca vira `aguardando_motoboy` nem `entregue`; a confirmacao da retirada
 * continua valendo.
 */
import fs from "node:fs";

const P = "src/routes/producao.tsx";
let src = fs.readFileSync(P, "utf8");

/* ------------------------------------------------------------------ */
/* 1) Novas acoes + pre-checks (inseridas antes de mudarStatus)        */
/* ------------------------------------------------------------------ */
const MARCA = "  async function mudarStatus(pedido: any, status: OrderStatus, producao_status: ProdStatus) {";
if (!src.includes(MARCA)) throw new Error("mudarStatus nao localizada");

const novas = `  /** Tipos de aviso interno (canal \`notificacoes\` da Central de Pedidos). */
  const TIPO_AVISO_CAIXA = "pedido_pronto_caixa";
  const TIPO_AVISO_RETIRADA = "pedido_liberado_retirada";

  /** Link interno do aviso (permite checar duplicidade pelo mesmo par tipo+link). */
  function linkAviso(p: any) {
    return \`/central-entregas?pedido=\${p.id}\`;
  }

  /**
   * Pre-check local do aviso de caixa (entrega). Quem decide de verdade e o
   * banco; aqui so evitamos gravar coisa invalida e avisar duas vezes.
   */
  function elegivelAvisoCaixa(p: any): { elegivel: boolean; motivo: string } {
    if (p.tipo_entrega === "retirada")
      return { elegivel: false, motivo: "retirada usa a liberacao de retirada" };
    if (p.status !== "pronto") return { elegivel: false, motivo: "fora de Prontos" };
    if (!p.conferido_em) return { elegivel: false, motivo: "conferencia pendente" };
    return { elegivel: true, motivo: "elegivel" };
  }

  /** Pre-check local da liberacao de retirada (balcao). */
  function elegivelLiberacaoRetirada(p: any): { elegivel: boolean; motivo: string } {
    if (p.tipo_entrega !== "retirada")
      return { elegivel: false, motivo: "entrega usa o fluxo de motoboy" };
    if (p.status !== "pronto") return { elegivel: false, motivo: "fora de Prontos" };
    if (!p.conferido_em) return { elegivel: false, motivo: "conferencia pendente" };
    if (p.retirado_em) return { elegivel: false, motivo: "retirada ja confirmada" };
    return { elegivel: true, motivo: "elegivel" };
  }

  /** Registro de auditoria idempotente (mesma chave usada pelo app). */
  async function registrarAvisoInterno(p: any, canal: string) {
    try {
      const dia = new Date().toISOString().slice(0, 10);
      await supabase
        .from("notificacoes_log")
        .upsert(
          [
            {
              pedido_id: p.id,
              status: "pronto",
              canal,
              resultado: "enviado",
              mensagem: null,
              telefone_norm: null,
              idempotencia: \`\${p.id}|pronto|\${canal}|\${dia}\`,
              created_by: user?.id ?? null,
            },
          ],
          { onConflict: "idempotencia", ignoreDuplicates: true },
        );
    } catch {
      /* auditoria e best-effort (tabela pode nao existir) */
    }
  }

  /**Ja existe aviso deste tipo para este pedido? (evita duplicidade) */
  async function jaAvisado(tipo: string, link: string): Promise<boolean> {
    try {
      const { data } = await supabase
        .from("notificacoes")
        .select("id")
        .eq("tipo", tipo)
        .eq("link", link)
        .limit(1);
      return (data ?? []).length > 0;
    } catch {
      return false;
    }
  }

  /**
   * "Avisar caixa" (entrega pronta e conferida): avisa a Central de Pedidos
   * e registra o aviso. O pedido segue "pronto" — nao entra em motoboy.
   */
  async function avisarCaixa(p: any) {
    const chk = elegivelAvisoCaixa(p);
    if (!chk.elegivel) {
      toast.error(
        chk.motivo === "conferencia pendente"
          ? "Conferência pendente: conclua a conferência final antes de avisar o caixa."
          : "Só é possível avisar o caixa com o pedido pronto e conferido.",
      );
      return;
    }
    const link = linkAviso(p);
    if (await jaAvisado(TIPO_AVISO_CAIXA, link)) {
      toast.info("O caixa já foi avisado deste pedido.");
      return;
    }
    if (preview) {
      toast.info("Prévia visual: aviso de caixa desativado (nada é gravado).");
      return;
    }
    const { error } = await supabase.from("notificacoes").insert({
      tipo: TIPO_AVISO_CAIXA,
      titulo: \`Pedido #\${p.numero} pronto para entrega\`,
      detalhe: [
        \`Cliente: \${p.cliente_nome}\`,
        "Modalidade: entrega",
        p.observacoes ? \`Obs.: \${p.observacoes}\` : null,
      ]
        .filter(Boolean)
        .join(" • "),
      link,
      lida: false,
    });
    if (error) {
      toast.error(error.message || "Não foi possível avisar o caixa.");
      return;
    }
    await registrarAvisoInterno(p, "caixa");
    toast.success("Caixa avisado. O pedido segue disponível na Central de Entregas.");
    queryClient.invalidateQueries({ queryKey: ["fila-producao"] });
    queryClient.invalidateQueries({ queryKey: ["op-avisos"] });
  }

  /**
   * "Liberar retirada" (retirada pronta e conferida): libera para o balcao e
   * avisa a Central. O status permanece "pronto" (= Pronto para retirada);
   * nunca vira \`aguardando_motoboy\` nem \`entregue\`, e a confirmacao da
   * retirada (retirado_em) continua valendo.
   */
  async function liberarRetirada(p: any) {
    const chk = elegivelLiberacaoRetirada(p);
    if (!chk.elegivel) {
      toast.error(
        chk.motivo === "conferencia pendente"
          ? "Conferência pendente: conclua a conferência final antes de liberar a retirada."
          : chk.motivo === "retirada ja confirmada"
            ? "A retirada deste pedido já foi confirmada."
            : "Só é possível liberar a retirada com o pedido pronto e conferido.",
      );
      return;
    }
    const link = linkAviso(p);
    if (await jaAvisado(TIPO_AVISO_RETIRADA, link)) {
      toast.info("Este pedido já foi liberado para retirada.");
      return;
    }
    if (preview) {
      toast.info("Prévia visual: liberação de retirada desativada (nada é gravado).");
      return;
    }
    const { error } = await supabase.from("notificacoes").insert({
      tipo: TIPO_AVISO_RETIRADA,
      titulo: \`Pedido #\${p.numero} liberado para retirada\`,
      detalhe: [
        \`Cliente: \${p.cliente_nome}\`,
        "Modalidade: retirada no balcão",
        p.observacoes ? \`Obs.: \${p.observacoes}\` : null,
      ]
        .filter(Boolean)
        .join(" • "),
      link,
      lida: false,
    });
    if (error) {
      toast.error(error.message || "Não foi possível liberar a retirada.");
      return;
    }
    await registrarAvisoInterno(p, "retirada");
    toast.success("Retirada liberada no balcão. O cliente ainda confirma a retirada.");
    queryClient.invalidateQueries({ queryKey: ["fila-producao"] });
    queryClient.invalidateQueries({ queryKey: ["op-avisos"] });
  }

`;

src = src.replace(MARCA, novas + MARCA);

/* ------------------------------------------------------------------ */
/* 2) mudarStatus: opcao de conferencia final (conferido_em/conferido_por) */
/* ------------------------------------------------------------------ */
const assinaturaAntiga = `  async function mudarStatus(pedido: any, status: OrderStatus, producao_status: ProdStatus) {
    if (preview) {
      toast.info("Prévia visual: alteração de status desativada (nada é gravado).");
      return;
    }`;
const assinaturaNova = `  async function mudarStatus(
    pedido: any,
    status: OrderStatus,
    producao_status: ProdStatus,
    opts?: { conferir?: boolean },
  ) {
    if (preview) {
      toast.info("Prévia visual: alteração de status desativada (nada é gravado).");
      return;
    }`;
if (!src.includes(assinaturaAntiga)) throw new Error("assinatura de mudarStatus nao localizada");
src = src.replace(assinaturaAntiga, assinaturaNova);

const updateAntigo = `    const { error } = await supabase
      .from("pedidos")
      .update({ status, producao_status })
      .eq("id", pedido.id);`;
const updateNovo = `    // "Finalizar" = conferencia final da cozinha + pedido pronto.
    // O marcador canônico do projeto é pedidos.conferido_em ("conferencia
    // final da cozinha", migration 0084) e nao altera status por si so.
    const campos: Record<string, unknown> = { status, producao_status };
    if (opts?.conferir) {
      campos.conferido_em = new Date().toISOString();
      campos.conferido_por = user?.id ?? null;
      if (status === "pronto") campos.pronto_em = new Date().toISOString();
    }
    const { error } = await supabase
      .from("pedidos")
      .update(campos)
      .eq("id", pedido.id);`;
if (!src.includes(updateAntigo)) throw new Error("update de mudarStatus nao localizado");
src = src.replace(updateAntigo, updateNovo);

/* ------------------------------------------------------------------ */
/* 3) Botoes do card: Finalizar (com conferencia), Avisar caixa, Liberar */
/* ------------------------------------------------------------------ */
const botoesAntigos = `          {p.status === "em_producao" ? (
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
          ) : null}`;

const botoesNovos = `          {p.status === "em_producao" ? (
            <Button
              size="sm"
              onClick={() => mudarStatus(p, "pronto", "finalizado", { conferir: true })}
              className="h-11 w-full border border-[#5B93F5] bg-gradient-to-b from-[#5B93F5] to-[#2F62C8] text-sm font-bold text-white hover:brightness-105"
            >
              ✓ Finalizar
            </Button>
          ) : null}
          {pronto && !retirada ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => avisarCaixa(p)}
              disabled={!p.conferido_em}
              className="erp-btn-gold h-11 w-full border border-[#D4A94A] bg-gradient-to-b from-[#F2CE6B] to-[#D4A94A] text-sm font-bold text-[#14120C] hover:brightness-105 disabled:opacity-45"
            >
              🔔 Avisar caixa
            </Button>
          ) : null}
          {pronto && retirada ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => liberarRetirada(p)}
              disabled={!p.conferido_em}
              className="h-11 w-full border border-[#35C97C] bg-gradient-to-b from-[#35C97C] to-[#1E8F58] text-sm font-bold text-white hover:brightness-105 disabled:opacity-45"
            >
              🏪 Liberar retirada
            </Button>
          ) : null}
          {pronto && !p.conferido_em ? (
            <p className="rounded-lg border border-[#F5B301]/35 bg-[#F5B301]/10 px-2 py-1.5 text-[11px] text-[#F5B301]">
              ⚠️ Conferência pendente — conclua a conferência final para liberar.
            </p>
          ) : null}
          {p.conferido_em ? (
            <p className="text-[11px] text-muted-foreground">
              ✅ Conferido em {hora(p.conferido_em)}
            </p>
          ) : null}`;

if (!src.includes(botoesAntigos)) throw new Error("botoes do card nao localizados");
src = src.replace(botoesAntigos, botoesNovos);

fs.writeFileSync(P, src, "utf8");
console.log("acoes de liberacao implementadas;", src.length, "bytes");
