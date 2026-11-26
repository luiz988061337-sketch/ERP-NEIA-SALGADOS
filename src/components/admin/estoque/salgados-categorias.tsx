import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CookingPot,
  Croissant,
  Eye,
  Flame,
  History,
  Layers,
  LockKeyhole,
  Package,
  Pencil,
  Pizza,
  Search,
  XCircle,
} from "lucide-react";
import { DarkTable, DarkTableRow } from "@/components/admin/erp-ui";
import { Input } from "@/components/ui/input";
import {
  categoriasSaboresEstoque,
  normalizarNomeSabor,
  type CategoriaSaborEstoque,
} from "@/lib/catalogo-sabores-estoque";
import { lerSituacaoSalgado, situacoesSalgados } from "@/lib/situacao-salgados";

const icones = {
  fritos: Flame,
  "mini-pasteis": Croissant,
  assados: CookingPot,
  empadas: Package,
  "mini-pizzas": Pizza,
};
const numero = new Intl.NumberFormat("pt-BR");

export function formatarQuantidade(valor: number | null) {
  return valor === null ? "—" : numero.format(valor);
}

export function FotoSabor({ imagem }: { imagem: string | null }) {
  const [falha, setFalha] = useState<string>();
  return (
    <span className="est-sabor-foto">
      {imagem && falha !== imagem ? (
        <img src={imagem} alt="" loading="lazy" onError={() => setFalha(imagem)} />
      ) : (
        <Package size={18} role="img" aria-label="Foto indisponível" />
      )}
    </span>
  );
}

type LinhaSabor = {
  chave: string;
  nome: string;
  imagem: string | null;
  produto: { id: string; ativo: boolean } | undefined;
  situacao: ReturnType<typeof lerSituacaoSalgado>;
};
type AcoesSabor = {
  onVer: (chave: string) => void;
  onHistorico: (id: string) => void;
  onInventario: (id: string) => void;
};

function TabelaSabores({
  linhas,
  onVer,
  onHistorico,
  onInventario,
}: { linhas: LinhaSabor[] } & AcoesSabor) {
  return (
    <>
      <p className="est-sabores-rolagem">Deslize a tabela para ver todos os saldos e ações.</p>
      <DarkTable
        className="est-sabores-tabela"
        colunas={[
          "Sabor",
          "Estoque físico",
          "Reservado",
          "Disponível",
          "Est. mínimo",
          "Próximo vencimento",
          "Situação",
          "Ações",
        ]}
      >
        {linhas.map(({ chave, nome, produto, imagem, situacao }) => (
          <DarkTableRow key={chave}>
            <td>
              <div className="est-sabor-identidade">
                <FotoSabor imagem={imagem} />
                <div>
                  <strong>{nome}</strong>
                  {produto?.ativo === false && <small>Produto inativo</small>}
                </div>
              </div>
            </td>
            <td>{formatarQuantidade(situacao.fisico)}</td>
            <td className="neia-a01-azul">{formatarQuantidade(situacao.reservado)}</td>
            <td
              className={
                situacao.disponivel === null
                  ? ""
                  : situacao.disponivel > 0
                    ? "neia-a01-verde"
                    : "neia-a01-vermelho"
              }
            >
              <strong>{formatarQuantidade(situacao.disponivel)}</strong>
            </td>
            <td>{formatarQuantidade(situacao.minimo)}</td>
            <td>{situacao.proximaValidade?.split("-").reverse().join("/") ?? "—"}</td>
            <td>
              <div className="est-sabor-situacoes">
                {situacao.alertas.map((alerta) => (
                  <span key={alerta} className={`neia-a01-${situacoesSalgados[alerta].tom}`}>
                    {situacoesSalgados[alerta].texto}
                  </span>
                ))}
              </div>
            </td>
            <td>
              {
                <div className="est-sabor-acoes">
                  <button
                    aria-label={`Ver lotes de ${nome}`}
                    title="Ver lotes"
                    onClick={() => onVer(chave)}
                  >
                    <Eye size={17} />
                  </button>
                  {produto && (
                    <button
                      aria-label={`Ajustar inventário de ${nome}`}
                      title="Ajustar inventário"
                      onClick={() => onInventario(produto.id)}
                    >
                      <Pencil size={17} />
                    </button>
                  )}
                  {produto && (
                    <button
                      aria-label={`Histórico de ${nome}`}
                      title="Histórico"
                      onClick={() => onHistorico(produto.id)}
                    >
                      <History size={17} />
                    </button>
                  )}
                </div>
              }
            </td>
          </DarkTableRow>
        ))}
      </DarkTable>
    </>
  );
}

function resumo(linhas: LinhaSabor[]) {
  const total = (campo: "fisico" | "reservado" | "disponivel") => {
    const valores = linhas.flatMap(({ situacao }) =>
      situacao[campo] === null ? [] : [situacao[campo]],
    );
    return valores.length ? valores.reduce((soma, valor) => soma + valor, 0) : null;
  };
  return {
    fisico: total("fisico"),
    reservado: total("reservado"),
    disponivel: total("disponivel"),
    baixos: linhas.filter(({ situacao }) => situacao.abaixo).length,
    zerados: linhas.filter(({ situacao }) => situacao.alertas.includes("zerado")).length,
    alertas: linhas.filter(({ situacao }) =>
      situacao.alertas.some((a) => situacoesSalgados[a].tom === "vermelho" || a === "vencendo"),
    ).length,
  };
}

export function EstoqueCategorias({
  sabores,
  acoes,
  cadastrados,
}: {
  sabores: (LinhaSabor & { categoria: CategoriaSaborEstoque })[];
  acoes: AcoesSabor;
  cadastrados: number;
}) {
  const [categoria, setCategoria] = useState<CategoriaSaborEstoque | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<keyof typeof situacoesSalgados | "todos">("todos");
  const [abertos, setAbertos] = useState<Set<CategoriaSaborEstoque>>(() => new Set(["fritos"]));
  const termo = normalizarNomeSabor(busca);
  const filtrando = !!termo || situacao !== "todos";
  function filtrar(linhas: LinhaSabor[]) {
    return linhas.filter(
      (linha) =>
        normalizarNomeSabor(linha.nome).includes(termo) &&
        (situacao === "todos" || linha.situacao.alertas.includes(situacao)),
    );
  }
  function abrirTodos() {
    setAbertos(new Set(categoriasSaboresEstoque.map((item) => item.id)));
  }
  function alternarGrupo(id: CategoriaSaborEstoque) {
    setAbertos((anterior) => {
      const proximo = new Set(anterior);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }
  const grupos = categoriasSaboresEstoque.map((item) => {
    const linhas = sabores.filter((sabor) => sabor.categoria === item.id);
    return {
      ...item,
      linhasVisiveis: filtrar(linhas),
      total: linhas.length,
      resumo: resumo(linhas),
    };
  });
  const gruposVisiveis = grupos.filter(
    (grupo) =>
      (categoria === "todos" || categoria === grupo.id) &&
      (!filtrando || !!grupo.linhasVisiveis.length),
  );
  const k = resumo(sabores);
  const semEstoque = sabores.filter(({ situacao }) => situacao.fisico === null).length;
  const comDados = semEstoque < sabores.length;
  const indicadores = [
    { rotulo: "Sabores cadastrados", valor: cadastrados, Icone: Package, tom: "azul" },
    { rotulo: "Sem estoque cadastrado", valor: semEstoque, Icone: Package, tom: "azul" },
    {
      rotulo: "Mínimo não definido",
      valor:
        sabores.filter(({ produto, situacao }) => produto && situacao.minimo === null).length ||
        (comDados ? 0 : null),
      Icone: AlertTriangle,
      tom: "ouro",
    },
    {
      rotulo: "Lotes próximos do vencimento",
      valor: comDados ? sabores.reduce((n, s) => n + s.situacao.vencendo, 0) : null,
      Icone: AlertTriangle,
      tom: "ouro",
    },
    {
      rotulo: "Lotes vencidos",
      valor: comDados ? sabores.reduce((n, s) => n + s.situacao.vencidos, 0) : null,
      Icone: AlertTriangle,
      tom: "vermelho",
    },
    {
      rotulo: "Reservas acima do físico",
      valor: comDados
        ? sabores.filter((s) => s.situacao.alertas.includes("excedente")).length
        : null,
      Icone: AlertTriangle,
      tom: "vermelho",
    },
    { rotulo: "Sabores oficiais", valor: sabores.length, Icone: Package, tom: "ouro" },
    { rotulo: "Estoque físico", valor: k.fisico, Icone: Layers, tom: "azul" },
    { rotulo: "Reservado", valor: k.reservado, Icone: LockKeyhole, tom: "azul" },
    { rotulo: "Disponível", valor: k.disponivel, Icone: CheckCircle2, tom: "verde" },
    {
      rotulo: "Abaixo do mínimo",
      valor: comDados ? k.baixos : null,
      Icone: AlertTriangle,
      tom: "ouro",
    },
    { rotulo: "Zerados", valor: comDados ? k.zerados : null, Icone: XCircle, tom: "vermelho" },
  ];

  return (
    <>
      <div className="est-sabores-indicadores">
        {indicadores.map(({ rotulo, valor, Icone, tom }) => (
          <div className="neia-a01-metrica" key={rotulo}>
            <span>
              <Icone size={18} className={`neia-a01-${tom}`} aria-hidden /> {rotulo}
            </span>
            <strong>{formatarQuantidade(valor)}</strong>
          </div>
        ))}
      </div>
      <div className="est-sabores-controles">
        <div
          className="neia-a02-filtros est-sabores-filtros"
          role="group"
          aria-label="Categorias de salgados"
        >
          <button aria-pressed={categoria === "todos"} onClick={() => setCategoria("todos")}>
            Todos ({sabores.length})
          </button>
          {grupos.map(({ id, nome, total }) => {
            const Icone = icones[id];
            return (
              <button
                key={id}
                aria-pressed={categoria === id}
                onClick={() => {
                  setCategoria(id);
                  setAbertos((atual) => new Set([...atual, id]));
                }}
              >
                <Icone size={17} aria-hidden /> {nome} ({total})
              </button>
            );
          })}
        </div>
        <div className="est-sabores-consulta">
          <label className="neia-a01-busca">
            <Search size={18} aria-hidden />
            <Input
              aria-label="Buscar sabor"
              placeholder="Buscar sabor"
              value={busca}
              onChange={(event) => {
                setBusca(event.target.value);
                if (!filtrando) abrirTodos();
              }}
            />
          </label>
          <select
            aria-label="Filtrar por situação"
            value={situacao}
            onChange={(event) => {
              setSituacao(event.target.value as typeof situacao);
              if (!filtrando) abrirTodos();
            }}
          >
            <option value="todos">Todas as situações</option>
            {Object.entries(situacoesSalgados).map(([chave, item]) => (
              <option key={chave} value={chave}>
                {item.texto}
              </option>
            ))}
          </select>
        </div>
      </div>
      {cadastrados !== sabores.length && (
        <p className="est-sabores-nota">
          Cadastro oficial preparado. {cadastrados} de {sabores.length} sabores registrados no
          banco.
        </p>
      )}
      <div className="est-sabores-grupos">
        {gruposVisiveis.map(({ id, nome, total, linhasVisiveis, resumo: totais }) => {
          const Icone = icones[id];
          const aberto = abertos.has(id);
          return (
            <section className="neia-a01-metrica est-sabores-grupo" key={id} data-categoria={id}>
              <h2>
                <button
                  className="est-sabores-grupo-botao"
                  aria-expanded={aberto}
                  aria-controls={`est-sabores-grupo-${id}`}
                  onClick={() => alternarGrupo(id)}
                >
                  <span className="est-sabores-grupo-titulo">
                    <Icone size={23} aria-hidden />
                    <strong>{nome}</strong>
                    <small>{total} sabores</small>
                  </span>
                  <span className="est-sabores-totais">
                    <span>
                      Físico <b>{formatarQuantidade(totais.fisico)}</b>
                    </span>
                    <span>
                      Reservado{" "}
                      <b className="neia-a01-azul">{formatarQuantidade(totais.reservado)}</b>
                    </span>
                    <span>
                      Disponível <b>{formatarQuantidade(totais.disponivel)}</b>
                    </span>
                    <span className={totais.alertas ? "neia-a01-vermelho" : ""}>
                      <AlertTriangle size={15} aria-hidden />{" "}
                      {totais.fisico === null
                        ? "Sem dados"
                        : `${totais.alertas} ${totais.alertas === 1 ? "alerta" : "alertas"}`}
                    </span>
                  </span>
                  <ChevronDown className="est-sabores-chevron" size={20} aria-hidden />
                </button>
              </h2>
              <div id={`est-sabores-grupo-${id}`} hidden={!aberto}>
                {aberto && <TabelaSabores linhas={linhasVisiveis} {...acoes} />}
              </div>
            </section>
          );
        })}
        {!gruposVisiveis.length && <p role="status">Nenhum sabor encontrado.</p>}
      </div>
    </>
  );
}
