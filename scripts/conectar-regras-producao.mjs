/**
 * Conecta a Producao (Cozinha) ao modulo puro de regras de liberacao
 * (`@/lib/producao-liberacao`), mantendo a fonte unica das regras.
 */
import fs from "node:fs";

const P = "src/routes/producao.tsx";
let src = fs.readFileSync(P, "utf8");

/* 1) Importa o modulo puro */
const importAntigo = 'import { ERP_COLORS, KanbanColumn } from "@/components/admin/erp-ui";';
const importNovo = `import { ERP_COLORS, KanbanColumn } from "@/components/admin/erp-ui";
import {
  avisoInterno,
  chaveAviso,
  elegivelAvisoCaixa,
  elegivelLiberacaoRetirada,
  linkAviso,
  TIPO_AVISO_CAIXA,
  TIPO_AVISO_RETIRADA,
} from "@/lib/producao-liberacao";`;
if (!src.includes(importAntigo)) throw new Error("import do erp-ui nao localizado");
src = src.replace(importAntigo, importNovo);

/* 2) Remove os pre-checks locais duplicados (passam a vir do modulo puro) */
const blocoLocal = `  /** Tipos de aviso interno (canal \`notificacoes\` da Central de Pedidos). */
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

`;
if (!src.includes(blocoLocal)) throw new Error("bloco local de pre-checks nao localizado");
src = src.replace(blocoLocal, "");

/* 3) Usa o modulo puro no aviso de caixa */
const avisoCaixaAntigo = `    const chk = elegivelAvisoCaixa(p);`;
const avisoCaixaNovo = `    const chk = elegivelAvisoCaixa(p);`;
if (!src.includes(avisoCaixaAntigo)) throw new Error("pre-check do aviso de caixa nao localizado");

/* 4) O insert do aviso usa o helper puro (texto centralizado) */
const insertCaixaAntigo = `    const { error } = await supabase.from("notificacoes").insert({
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
    });`;
const insertCaixaNovo = `    const { error } = await supabase
      .from("notificacoes")
      .insert(avisoInterno(p, "caixa"));`;
if (!src.includes(insertCaixaAntigo)) throw new Error("insert do aviso de caixa nao localizado");
src = src.replace(insertCaixaAntigo, insertCaixaNovo);

const insertRetiradaAntigo = `    const { error } = await supabase.from("notificacoes").insert({
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
    });`;
const insertRetiradaNovo = `    const { error } = await supabase
      .from("notificacoes")
      .insert(avisoInterno(p, "retirada"));`;
if (!src.includes(insertRetiradaAntigo)) throw new Error("insert do aviso de retirada nao localizado");
src = src.replace(insertRetiradaAntigo, insertRetiradaNovo);

/* 5) A chave de idempotencia usa o helper puro */
const chaveAntiga = `              idempotencia: \`\${p.id}|pronto|\${canal}|\${dia}\`,`;
const chaveNova = `              idempotencia: chaveAviso(p.id, canal as "caixa" | "retirada", dia),`;
if (!src.includes(chaveAntiga)) throw new Error("chave de idempotencia nao localizada");
src = src.replace(chaveAntiga, chaveNova);

/* 6) O link interno usa o helper puro */
const linkAntigo = `    const link = linkAviso(p);`;
const linkNovo = `    const link = linkAviso(p.id);`;
src = src.split(linkAntigo).join(linkNovo);

fs.writeFileSync(P, src, "utf8");
console.log("producao.tsx ligado ao modulo puro;", src.length, "bytes");
