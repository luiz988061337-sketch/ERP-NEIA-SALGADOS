/**
 * C1 — Painel Comercial (Marketing e Reativação).
 * Reproduz a referência visual no AdminShell aprovado. Dados fictícios.
 */
import {
  CalendarDays,
  ChevronRight,
  Hourglass,
  Megaphone,
  Send,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { MetricCard, SectionCard, StatusBadge } from "@/components/admin/erp-ui";
import { useComercial } from "./contexto";
import {
  BlocoSatisfacao,
  ICONES,
  ListaMotivos,
  TabelaClientesInativos,
} from "./compartilhados";
import { contarInatividade, filtrarClientes } from "./dados";

export function PainelComercial() {
  const { clientes, campanhas, filtros } = useComercial();
  const contagem = contarInatividade(clientes);
  const inativos = filtrarClientes(clientes, filtros, true);
  const rascunho = campanhas.filter((c) => c.status === "Rascunho").length;
  const aguardando = campanhas.filter((c) => c.status === "Aguardando aprovação").length;
  const recuperados = clientes.filter((c) => c.status === "Recuperado").length;

  return (
    <div data-testid="painel-comercial">
      <div className="com-cabecalho">
        <span className="com-cabecalho-icone">
          <Megaphone size={22} />
        </span>
        <div>
          <h1>Comercial — Marketing e Reativação</h1>
          <p>Recuperação de clientes inativos e campanhas com aprovação</p>
        </div>
      </div>

      <div className="com-kpis">
        <MetricCard
          icone={ICONES.calendario}
          label="30 dias sem comprar"
          valor={contagem.faixas["30-59"]}
          detalhe="faixa exclusiva 30–59 dias"
          cor="#F2CE6B"
        />
        <MetricCard
          icone={ICONES.calendario}
          label="60 dias sem comprar"
          valor={contagem.faixas["60-89"]}
          detalhe="faixa exclusiva 60–89 dias"
          cor="#F2CE6B"
        />
        <MetricCard
          icone={ICONES.calendario}
          label="90+ dias sem comprar"
          valor={contagem.faixas["90+"]}
          detalhe="faixa exclusiva 90 dias ou mais"
          cor="#F2CE6B"
        />
        <MetricCard
          icone={ICONES.megafone}
          label="Campanhas em rascunho"
          valor={rascunho}
          detalhe="aguardando envio"
          cor="#F2CE6B"
        />
        <MetricCard
          icone={ICONES.ampulheta}
          label="Aguardando aprovação"
          valor={aguardando}
          detalhe="campanhas em análise"
          cor="#F2CE6B"
        />
        <MetricCard
          icone={ICONES.recuperados}
          label="Clientes recuperados"
          valor={recuperados}
          detalhe="retorno registrado na demo"
          cor="#35C97C"
        />
      </div>
      <p className="com-nota">
        <TrendingUp size={13} /> <TrendingDown size={13} /> As faixas de 30, 60 e 90 dias são
        <b>exclusivas</b>: nenhum cliente é contado duas vezes. O acumulado ({contagem.acumulado30}{" "}
        inativos com 30 dias ou mais) aparece no rodapé da tabela. Todos os números são
        <b> fictícios, de demonstração</b>.
      </p>

      <div className="com-grade-principal">
        <SectionCard
          className="com-tabela-card"
          titulo={
            <span className="com-titulo-com-icone">
              <Users size={17} /> Segmentos de clientes inativos
            </span>
          }
          bodyClassName="p-0"
        >
          <TabelaClientesInativos clientes={inativos} />
        </SectionCard>
        <BlocoSatisfacao />
      </div>

      <div className="com-grade-inferior">
        <SectionCard
          titulo={
            <span className="com-titulo-com-icone">
              <TrendingUp size={17} /> Motivos mais citados
            </span>
          }
          acoes={<StatusBadge className="com-badge" tom="neutro">Etapa C4 · ilustrativo</StatusBadge>}
        >
          <p className="com-subtitulo">
            Principais razões informadas pelos clientes inativos (exemplo ilustrativo).
          </p>
          <ListaMotivos />
        </SectionCard>

        <SectionCard
          titulo={
            <span className="com-titulo-com-icone">
              <Megaphone size={17} /> Campanhas e aprovação
            </span>
          }
          acoes={<StatusBadge className="com-badge" tom="neutro">Etapa C2 · em preparação</StatusBadge>}
        >
          <p className="com-subtitulo">
            Crie campanhas, envie para aprovação e acompanhe os resultados.
          </p>
          <div className="com-tabela-simples-envolucro">
            <table className="com-tabela-simples">
              <thead>
                <tr>
                  <th>Campanha</th>
                  <th>Público-alvo</th>
                  <th>Status</th>
                  <th>Próxima etapa</th>
                </tr>
              </thead>
              <tbody>
                {campanhas.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.nome}</b>
                      <small>{c.quantidade} clientes</small>
                    </td>
                    <td>{c.publico}</td>
                    <td>
                      <StatusBadge
                        className="com-badge"
                        tom={
                          c.status === "Aprovada"
                            ? "ok"
                            : c.status === "Aguardando aprovação"
                              ? "atencao"
                              : "neutro"
                        }
                      >
                        {c.status}
                      </StatusBadge>
                    </td>
                    <td>
                      <StatusBadge className="com-badge" tom="neutro">C2 · ilustrativo</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="com-muted">
            A criação de campanhas, o fluxo de aprovação e os resultados detalhados entram nas
            etapas C2 e C5. Esta área é somente uma prévia visual.
          </p>
        </SectionCard>

        <div className="com-coluna-lateral">
          <SectionCard
            titulo={
              <span className="com-titulo-com-icone">
                <Hourglass size={17} /> Fluxo de aprovação
              </span>
            }
            acoes={<StatusBadge className="com-badge" tom="neutro">Etapa C2 · ilustrativo</StatusBadge>}
          >
            <p className="com-subtitulo">
              O marketing cria as campanhas, mas somente o responsável aprova o envio e libera o
              fluxo.
            </p>
            <ol className="com-fluxo">
              {[
                { icone: Megaphone, rotulo: "Marketing cria" },
                { icone: Users, rotulo: "Responsável aprova" },
                { icone: Send, rotulo: "Campanha enviada" },
                { icone: TrendingUp, rotulo: "Resultado acompanhado" },
              ].map((p, i) => (
                <li key={p.rotulo}>
                  <span className="com-fluxo-icone">
                    <p.icone size={15} />
                  </span>
                  <span className="com-fluxo-texto">{p.rotulo}</span>
                  {i < 3 ? <ChevronRight size={14} className="com-fluxo-seta" /> : null}
                </li>
              ))}
            </ol>
          </SectionCard>

          <SectionCard
            titulo={
              <span className="com-titulo-com-icone">
                <Users size={17} /> Clientes recuperados (exemplos)
              </span>
            }
          >
            <ul className="com-recuperados">
              {clientes
                .filter((c) => c.status === "Recuperado")
                .slice(0, 3)
                .map((c) => (
                  <li key={c.id}>
                    <span className="com-avatar">
                      <Users size={14} />
                    </span>
                    <span>
                      <b>{c.nome}</b>
                      <small>{c.telefone}</small>
                    </span>
                    <span className="com-retorno">
                      <TrendingUp size={13} /> Retornou
                      <small>após campanha demonstrativa</small>
                    </span>
                  </li>
                ))}
            </ul>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
