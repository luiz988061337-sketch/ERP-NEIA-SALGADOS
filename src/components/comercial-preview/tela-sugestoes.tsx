import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BadgeCheck, ClipboardList, Lightbulb, ShieldAlert, Ticket } from "lucide-react";
import { MetricCard } from "@/components/admin/erp-ui";
import { DEFAULT_CRM_SETTINGS } from "@/lib/crm";
import { validarCupom } from "@/lib/cupons";
import { brl } from "@/lib/format";
import { useComercial } from "./contexto";
import { candidatoCampanha } from "./candidatos-campanha";
import { calcularPublico, type PerfilDemo, type SegmentoCampanha } from "./campanhas-regras";
import { CHAVE_RASCUNHO_SUGESTAO, type RascunhoSugestao } from "./rascunho-sugestao";
import { CONVERSAO_DEMO, LOTE, LOTE_MAXIMO, MARGEM_MINIMA, quantidadeValida, simularPromocao } from "./sugestoes-regras";

const SEGMENTOS = [
  { valor: "inativos_30", nome: "Inativos · 30–59 dias", objetivo: "Convidar clientes que deixaram de comprar há pelo menos 30 dias." },
  { valor: "inativos_60", nome: "Inativos · 60–89 dias", objetivo: "Reativar clientes que deixaram de comprar há pelo menos 60 dias." },
  { valor: "inativos_90", nome: "Inativos · 90 dias ou mais", objetivo: "Retomar contato com clientes inativos há 90 dias ou mais." },
  { valor: "recorrentes", nome: "Clientes frequentes", objetivo: "Reconhecer clientes que compram com frequência." },
  { valor: "vip", nome: "Clientes VIP", objetivo: "Reconhecer os clientes VIP conforme os critérios do CRM." },
  { valor: "recompra", nome: "Próximos da recompra", objetivo: "Convidar clientes cuja próxima compra foi estimada para os próximos sete dias." },
] satisfies { valor: SegmentoCampanha; nome: string; objetivo: string }[];

const BENEFICIOS = [
  { id: "cupom", nome: "Cupom demonstrativo · 10%", tipo: "percentual", valor: 10 },
  { id: "percentual", nome: "Desconto percentual · 25%", tipo: "percentual", valor: 25 },
  { id: "fixo", nome: "Desconto fixo · R$ 10 por pedido", tipo: "fixo", valor: 10 },
  { id: "lote", nome: "Benefício por quantidade · R$ 5 por lote a partir de 100", tipo: "fixo", valor: 5 },
] as const;
const PRODUTOS = [
  { nome: "Mix tradicional · custo demonstrativo informado", preco: 180, custo: 105 },
  { nome: "Mix especial · custo não informado", preco: 220, custo: null },
] as const;
const reais = (centavos: number) => brl(centavos / 100);

export function TelaSugestoes() {
  const { clientes } = useComercial();
  const navigate = useNavigate();
  const candidatos = useMemo(() => clientes.map(candidatoCampanha), [clientes]);
  const [segmento, setSegmento] = useState(0);
  const [beneficio, setBeneficio] = useState(0);
  const [produto, setProduto] = useState(0);
  const [quantidade, setQuantidade] = useState("100");
  const [perfil, setPerfil] = useState<PerfilDemo>("marketing");
  const [revisada, setRevisada] = useState(false);
  const [erro, setErro] = useState("");
  const publicoAlvo = SEGMENTOS[segmento]!;
  const oferta = BENEFICIOS[beneficio]!;
  const item = PRODUTOS[produto]!;
  const publico = calcularPublico(candidatos, publicoAlvo.valor, DEFAULT_CRM_SETTINGS.intervalo_min_campanhas_dias);
  const qtd = Number(quantidade);
  const cupom = quantidadeValida(qtd) && (oferta.id !== "lote" || qtd >= 2 * LOTE)
    ? validarCupom(
        { codigo: "C3-DEMO", tipo: oferta.tipo, valor: oferta.id === "lote" ? oferta.valor * qtd / LOTE : oferta.valor },
        { subtotal: qtd * item.preco / 100, telefoneDigitado: "", usosRegistrados: 0, produtoIdsNoCarrinho: [] },
      )
    : null;
  const simulacao = cupom?.ok ? simularPromocao({
    elegiveis: publico.elegiveis.length, quantidade: qtd, precoUnitario: item.preco,
    custoUnitario: item.custo, desconto: Math.round(cupom.desconto * 100),
  }) : null;

  function atualizar(alterar: () => void) {
    alterar();
    setRevisada(false);
    setErro("");
  }

  async function prepararRascunho() {
    if (perfil !== "marketing" || !revisada || !simulacao?.recomendada) return;
    const descricao = oferta.id === "cupom"
      ? "Cupom demonstrativo C3-DEMO com 10% de desconto"
      : oferta.nome;
    const rascunho: RascunhoSugestao = {
      nome: publicoAlvo.nome,
      objetivo: publicoAlvo.objetivo,
      segmento: publicoAlvo.valor,
      mensagem: `Olá {{cliente}}! Preparamos uma oferta para você: ${descricao}. Simulação para um pedido de ${qtd} salgados, com ${reais(simulacao.desconto)} de desconto por pedido.`,
    };
    try {
      window.sessionStorage.setItem(CHAVE_RASCUNHO_SUGESTAO, JSON.stringify(rascunho));
      await navigate({ to: "/preview/comercial/campanhas" });
    } catch {
      setErro("Não foi possível abrir o rascunho. Confira o armazenamento local do navegador e tente novamente.");
    }
  }

  const motivo = !simulacao
    ? oferta.id === "lote" ? "Informe um múltiplo de 50 a partir de 100." : "Informe uma quantidade em múltiplos de 50."
    : item.custo === null ? "Margem não calculada. Informe um produto com custo conhecido para recomendar a oferta."
    : publico.elegiveis.length === 0 ? "Nenhum cliente elegível neste público."
    : simulacao.recomendada ? "A oferta atende à margem mínima demonstrativa."
    : "Benefício bloqueado: margem abaixo do mínimo demonstrativo.";

  return (
    <main className="c2-page c3-page">
      <div className="c2-heading">
        <span className="c2-heading-icon"><Lightbulb size={22} /></span>
        <div><p className="c2-eyebrow">COMERCIAL · C3 · SOMENTE DEMONSTRAÇÃO</p><h1>Sugestões de promoções e cupons</h1><p>Simule o público e o benefício antes de preparar um rascunho.</p></div>
      </div>
      <div className="c2-warning" role="note"><ShieldAlert size={17} /><span>Clientes, preços, custos e cupons são fictícios. Nenhum desconto é aplicado e nenhuma mensagem é enviada.</span></div>
      <section className="c2-profile">
        <div className="c2-profile-copy"><BadgeCheck size={17} /><span><b>Perfil demonstrativo</b><small>O responsável revisa a oferta. Marketing prepara o rascunho na C2.</small></span></div>
        <select aria-label="Perfil demonstrativo" value={perfil} onChange={(e) => setPerfil(e.target.value as PerfilDemo)}>
          <option value="marketing">Marina Lopes · Marketing</option><option value="responsavel">Carlos Mendes · Responsável</option>
        </select>
      </section>
      <section className="c2-list-card c3-card">
        <div className="c2-list-heading"><div><h2>Simular sugestão</h2><p>Margem mínima de {MARGEM_MINIMA}% e conversão hipotética de {CONVERSAO_DEMO}% dos elegíveis, arredondada para baixo.</p></div></div>
        <div className="c3-form c2-form-fields">
          <label>Público<select value={segmento} onChange={(e) => atualizar(() => setSegmento(Number(e.target.value)))}>{SEGMENTOS.map((s, i) => <option key={s.valor} value={i}>{s.nome}</option>)}</select></label>
          <label>Benefício<select value={beneficio} onChange={(e) => atualizar(() => setBeneficio(Number(e.target.value)))}>{BENEFICIOS.map((b, i) => <option key={b.id} value={i}>{b.nome}</option>)}</select></label>
          <label>Produto<select value={produto} onChange={(e) => atualizar(() => setProduto(Number(e.target.value)))}>{PRODUTOS.map((p, i) => <option key={p.nome} value={i}>{p.nome}</option>)}</select></label>
          <label>Salgados por pedido<input type="number" min={LOTE} step={LOTE} max={LOTE_MAXIMO} value={quantidade} onChange={(e) => atualizar(() => setQuantidade(e.target.value))} /><small>{reais(item.preco)} por unidade · custo {item.custo === null ? "não informado" : reais(item.custo) + " por unidade"}</small></label>
        </div>
        <p className="c3-caption">{publicoAlvo.objetivo} {publicoAlvo.valor === "recompra" && "Os intervalos de recompra usam datas fictícias para demonstrar o cálculo."}</p>
      </section>
      <section className="c2-kpis c3-kpis" aria-label="Resultados da simulação">
        <MetricCard icone={ClipboardList} label="Público elegível" valor={publico.elegiveis.length} detalhe={`${publico.excluidos.length} excluídos no segmento`} />
        <MetricCard icone={Ticket} label="Desconto por pedido" valor={simulacao ? reais(simulacao.desconto) : "—"} detalhe="benefício simulado" />
        <MetricCard icone={ClipboardList} label="Receita líquida estimada" valor={simulacao ? reais(simulacao.receita) : "—"} detalhe={simulacao ? `${simulacao.pedidos} pedidos hipotéticos` : "simulação incompleta"} />
        <MetricCard icone={Ticket} label="Custo da campanha" valor={simulacao ? reais(simulacao.custoCampanha) : "—"} detalhe="total estimado em descontos" />
        <MetricCard icone={BadgeCheck} label="Margem estimada" valor={simulacao?.margem == null ? "Não calculada" : `${simulacao.margem.toFixed(1)}%`} detalhe="sobre a receita após desconto" />
      </section>
      <section className="c2-list-card c3-card">
        <div className="c2-list-heading"><div><h2>Exclusões e revisão</h2><p>Opt-out e intervalo mínimo de {DEFAULT_CRM_SETTINGS.intervalo_min_campanhas_dias} dias entre contatos.</p></div></div>
        {publico.excluidos.length ? <ul className="c3-excluidos">{publico.excluidos.map((c) => <li key={c.id}><b>{c.nome}</b> · {c.motivos.join(" ")}</li>)}</ul> : <p className="c3-caption">Nenhuma exclusão neste segmento.</p>}
        <div className="c2-dialog-actions c3-actions">
          <span role="status">{revisada ? "Oferta revisada pelo responsável. A campanha ainda precisa de aprovação na C2." : motivo}</span>
          {perfil === "responsavel"
            ? <button className="c2-button c2-primary" type="button" disabled={!simulacao?.recomendada || revisada} onClick={() => setRevisada(true)}>Registrar revisão</button>
            : <button className="c2-button c2-primary" type="button" disabled={!simulacao?.recomendada || !revisada} onClick={() => void prepararRascunho()}>Abrir rascunho na C2</button>}
        </div>
        {erro && <p className="c2-inline-error" role="alert">{erro}</p>}
      </section>
    </main>
  );
}
