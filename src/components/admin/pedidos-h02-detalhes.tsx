import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { DarkTable, DarkTableRow } from "@/components/admin/erp-ui";
import { NotasAdmin } from "@/components/pedido-notas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import {
  brl,
  PAGAMENTO_LABEL,
  PAGAMENTO_STATUS_LABEL,
  PROD_LABEL,
  statusLabel,
} from "@/lib/format";
import { entradaJanelaProducao } from "@/lib/motor-producao";
import {
  grupoH02,
  trocoSolicitadoH02,
  unidadesSalgadosH02,
  type PedidoH02,
  type ProdutoH02,
} from "@/lib/pedidos-h02";

const dataLocal = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

export function dataH02(valor: string | Date | null | undefined) {
  if (valor == null || valor === "") return "—";
  const data = new Date(valor);
  return Number.isFinite(data.getTime()) ? dataLocal.format(data) : "—";
}

export function moedaH02(valor: number | null | undefined) {
  return typeof valor === "number" && Number.isFinite(valor) ? brl(valor) : "—";
}

export function situacaoH02(p: PedidoH02) {
  return grupoH02(p) === "aceitos"
    ? "Aceito · aguardando produção"
    : statusLabel(p.status, p.tipo_entrega);
}

function Dados({ campos }: { campos: Array<[string, ReactNode]> }) {
  return (
    <dl className="h02-dados">
      {campos.map(([nome, valor]) => (
        <div key={nome}>
          <dt>{nome}</dt>
          <dd>{valor || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

type Evento = {
  chave: string;
  rotulo: string;
  data: string;
  actor: string | null;
  motivo?: string | null;
};

export function DetalhesPedidoH02({
  pedido: p,
  produtos,
  somenteLeitura,
}: {
  pedido: PedidoH02;
  produtos: Map<string, ProdutoH02>;
  somenteLeitura: boolean;
}) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["h02-historico", p.id],
    queryFn: async ({ signal }) => {
      const [historico, motoboy] = await Promise.all([
        supabase
          .from("pedido_status_historico")
          .select("id, para_status, motivo, actor, created_at")
          .eq("pedido_id", p.id)
          .order("created_at", { ascending: true })
          .abortSignal(signal),
        p.motoboy_id
          ? supabase
              .from("motoboys")
              .select("nome")
              .eq("id", p.motoboy_id)
              .abortSignal(signal)
              .maybeSingle()
          : Promise.resolve(null),
      ]);
      const autores = [
        ...new Set(
          [
            p.aceito_por,
            p.conferido_por,
            p.liberado_por,
            p.retirado_por,
            ...(historico.data ?? []).map((evento) => evento.actor),
          ].filter((id): id is string => Boolean(id)),
        ),
      ];
      const perfis = autores.length
        ? await supabase.from("profiles").select("id, nome").in("id", autores).abortSignal(signal)
        : null;
      return {
        eventos: historico.data ?? [],
        erroHistorico: !!historico.error,
        pessoas: new Map(perfis?.data?.map((perfil) => [perfil.id, perfil.nome]) ?? []),
        motoboy: motoboy?.data?.nome,
      };
    },
  });
  const conhecido = (id: string | null) =>
    id ? data?.pessoas.get(id) || "Identificação indisponível" : "—";
  const marcos: Array<[string, string, string | null, string | null]> = [
    ["recebido", "Pedido criado", p.created_at, null],
    ["aceite", "Aceite da atendente", p.aceito_em_atendente ?? p.aceito_em, p.aceito_por],
    ["em_producao", "Início do preparo", p.preparo_em, null],
    ["pronto", "Pedido pronto", p.pronto_em, null],
    ["conferencia", "Conferência da produção", p.conferido_em, p.conferido_por],
    ["liberacao", "Liberação registrada", p.liberado_em, p.liberado_por],
    ["em_rota", "Saiu para entrega", p.saiu_em, null],
    ["retirado", "Retirada registrada", p.retirado_em, p.retirado_por],
    [
      "entregue",
      p.tipo_entrega === "retirada" ? "Retirada concluída" : "Entrega concluída",
      p.entregue_em,
      null,
    ],
  ];
  const eventos: Evento[] = marcos.flatMap(([chave, rotulo, dataMarco, actor]) =>
    dataMarco && !data?.eventos.some((e) => e.para_status === chave && e.created_at === dataMarco)
      ? [{ chave, rotulo, data: dataMarco, actor }]
      : [],
  );
  for (const e of data?.eventos ?? [])
    eventos.push({
      chave: e.id,
      rotulo: statusLabel(e.para_status, p.tipo_entrega),
      data: e.created_at,
      actor: e.actor,
      motivo: e.motivo,
    });
  eventos.sort((a, b) => a.data.localeCompare(b.data));
  const unidades = unidadesSalgadosH02(p.pedido_itens, produtos);
  const componentes = (id: string) =>
    produtos.get(id)?.nome ?? "Sabor sem identificação no catálogo";
  return (
    <Tabs defaultValue="cliente">
      <TabsList className="h02-abas" aria-label="Seções do pedido">
        {["Cliente", "Produtos", "Pagamento", "Operação", "Histórico"].map((nome, i) => (
          <TabsTrigger
            key={nome}
            value={["cliente", "produtos", "pagamento", "operacao", "historico"][i]!}
          >
            {nome}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="cliente">
        <Dados
          campos={[
            ["Nome", p.cliente_nome],
            ["Telefone", p.telefone],
            ["Modalidade", p.tipo_entrega === "retirada" ? "Retirada na loja" : "Entrega"],
            ["Endereço", [p.endereco, p.bairro, p.cidade, p.cep].filter(Boolean).join(" · ")],
            ["Complemento", p.complemento],
            [
              "Referência e acesso",
              [
                p.referencia,
                p.torre && "Torre " + p.torre,
                p.bloco && "Bloco " + p.bloco,
                p.apartamento && "Apto " + p.apartamento,
                p.andar && "Andar " + p.andar,
                p.interfone && "Interfone " + p.interfone,
              ]
                .filter(Boolean)
                .join(" · "),
            ],
            ["Pode subir", p.pode_subir == null ? "—" : p.pode_subir ? "Sim" : "Não"],
            ["Observações registradas", p.observacoes],
          ]}
        />
      </TabsContent>
      <TabsContent value="produtos">
        <p className="h02-nota">
          Total de salgados{" "}
          {unidades === null ? "indisponível para os itens registrados" : unidades + " un."}
        </p>
        <DarkTable
          className="h02-tabela"
          colunas={["Produto / composição", "Quantidade", "Preço unitário"]}
          vazio={p.pedido_itens.length ? undefined : "Nenhum item disponível."}
        >
          {p.pedido_itens.map((i) => (
            <DarkTableRow key={i.id}>
              <td>
                <strong>{i.nome}</strong>
                {!!i.pedido_item_componentes?.length && (
                  <ul>
                    {i.pedido_item_componentes.map((c) => (
                      <li key={c.produto_id}>
                        {c.quantidade} un. · {componentes(c.produto_id)}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td>{i.quantidade}</td>
              <td>{moedaH02(i.preco_unitario)}</td>
            </DarkTableRow>
          ))}
        </DarkTable>
        <Dados campos={[["Embalagem, separação e observações", p.observacoes]]} />
      </TabsContent>
      <TabsContent value="pagamento">
        <Dados
          campos={[
            ["Subtotal", moedaH02(p.subtotal)],
            ["Desconto", moedaH02(p.desconto)],
            ["Taxa de entrega", moedaH02(p.taxa_entrega)],
            ["Total", moedaH02(p.total)],
            ["Forma", PAGAMENTO_LABEL[p.forma_pagamento] ?? p.forma_pagamento],
            ["Situação", PAGAMENTO_STATUS_LABEL[p.pagamento_status] ?? p.pagamento_status],
            [
              "Modalidade",
              p.pagamento_modalidade === "na_entrega"
                ? "Na entrega ou retirada"
                : p.pagamento_modalidade === "online"
                  ? "Online"
                  : p.pagamento_modalidade,
            ],
            ["Confirmação do pagamento", dataH02(p.pagamento_em ?? p.pago_em)],
            ["Valor recebido", "Sem valor recebido no registro do pedido"],
            [
              "Saldo pendente",
              p.pagamento_status === "pago" ? brl(0) : "Sem saldo apurado no registro do pedido",
            ],
            ["Troco solicitado para", trocoSolicitadoH02(p.observacoes)],
          ]}
        />
      </TabsContent>
      <TabsContent value="operacao">
        <Dados
          campos={[
            ["Situação atual", situacaoH02(p)],
            [
              "Prazo registrado",
              p.agendado_para ? dataH02(p.agendado_para) : "Prazo não registrado",
            ],
            ["Agendamento", p.agendado_para ? dataH02(p.agendado_para) : "Assim que possível"],
            [
              "Janela de entrada na cozinha",
              p.agendado_para ? dataH02(entradaJanelaProducao(p.agendado_para)) : "—",
            ],
            ["Observações de agendamento", p.agendamento_obs],
            ["Produção", PROD_LABEL[p.producao_status] ?? p.producao_status],
            ["Aceito por", conhecido(p.aceito_por)],
            ["Conferido por", conhecido(p.conferido_por)],
            ["Liberado por", conhecido(p.liberado_por)],
            ["Motoboy", data?.motoboy],
            [
              "Atraso ou ocorrência",
              [p.atraso_descricao, p.atraso_motivo, p.problema].filter(Boolean).join(" · "),
            ],
          ]}
        />
      </TabsContent>
      <TabsContent value="historico">
        {isPending && <p role="status">Carregando histórico…</p>}
        {(isError || data?.erroHistorico) && (
          <p role="alert">
            Histórico de transições indisponível.{" "}
            <button className="h02-botao" onClick={() => void refetch()}>
              Tentar novamente
            </button>
          </p>
        )}
        <ol className="h02-eventos">
          {eventos.map((e) => (
            <li key={e.chave}>
              <strong>{e.rotulo}</strong>{" "}
              <span>
                {dataH02(e.data)}
                {e.actor && " · " + conhecido(e.actor)}
              </span>
              {e.motivo && <p>{e.motivo}</p>}
            </li>
          ))}
        </ol>
        {!somenteLeitura && <NotasAdmin pedidoId={p.id} numero={p.numero} />}
      </TabsContent>
    </Tabs>
  );
}
