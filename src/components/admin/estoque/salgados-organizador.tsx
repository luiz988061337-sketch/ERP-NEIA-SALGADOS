import { useMemo, useState, type DragEvent } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  categoriasSaboresEstoque,
  type CategoriaSaborEstoque,
} from "@/lib/catalogo-sabores-estoque";

export type SaborParaOrganizar = {
  chave: string;
  nome: string;
  categoria: CategoriaSaborEstoque;
  ordem: number;
};

type AcaoOrdem = "salvar" | "restaurar";

/** Reordena somente as posições da categoria visível, preservando as demais. */
function moverNaCategoria(
  sequencia: readonly string[],
  porChave: ReadonlyMap<string, SaborParaOrganizar>,
  categoria: CategoriaSaborEstoque,
  de: number,
  para: number,
): string[] {
  const posicoes = sequencia.flatMap((chave, indice) =>
    porChave.get(chave)?.categoria === categoria ? [indice] : [],
  );
  if (de < 0 || de >= posicoes.length || para < 0 || para >= posicoes.length || de === para)
    return [...sequencia];
  const visiveis = posicoes.map((indice) => sequencia[indice] ?? "");
  const reordenados = [...visiveis];
  const [item] = reordenados.splice(de, 1);
  reordenados.splice(para, 0, item ?? "");
  const proxima = [...sequencia];
  posicoes.forEach((indice, ordem) => {
    proxima[indice] = reordenados[ordem] ?? "";
  });
  return proxima;
}

export function OrganizadorSabores({
  sabores,
  fechar,
  persistir,
}: {
  sabores: readonly SaborParaOrganizar[];
  fechar: () => void;
  persistir: (chaves: string[], acao: AcaoOrdem) => Promise<void>;
}) {
  const inicial = useMemo(
    () => [...sabores].sort((a, b) => a.ordem - b.ordem).map((sabor) => sabor.chave),
    [sabores],
  );
  const [sequencia, setSequencia] = useState<string[]>(inicial);
  const [categoria, setCategoria] = useState<CategoriaSaborEstoque>(sabores[0]?.categoria ?? "fritos");
  const [confirmando, setConfirmando] = useState(false);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const porChave = useMemo(
    () => new Map(sabores.map((sabor) => [sabor.chave, sabor])),
    [sabores],
  );
  const posicoes = useMemo(
    () => new Map(sequencia.map((chave, indice) => [chave, indice + 1])),
    [sequencia],
  );
  const visiveis = sequencia.filter((chave) => porChave.get(chave)?.categoria === categoria);
  const alterada = sequencia.join("|") !== inicial.join("|");

  function mover(de: number, para: number) {
    setSequencia((atual) => moverNaCategoria(atual, porChave, categoria, de, para));
  }

  function soltar(evento: DragEvent<HTMLLIElement>, indice: number) {
    evento.preventDefault();
    const origem = Number(evento.dataTransfer.getData("text/plain"));
    if (Number.isInteger(origem)) mover(origem, indice);
    setArrastando(null);
    setSobre(null);
  }

  async function executar(chaves: string[], acao: AcaoOrdem) {
    if (ocupado) return;
    setOcupado(true);
    setErro("");
    try {
      await persistir(chaves, acao);
    } catch (falha) {
      setErro(
        falha instanceof Error ? falha.message : "Não foi possível salvar a sequência.",
      );
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !ocupado && fechar()}>
      <DialogContent className="neia-a01-dialogo est-salgados-dialogo est-organizador-dialogo">
        <DialogHeader>
          <DialogTitle>Organizar sabores</DialogTitle>
          <DialogDescription>
            Escolha uma categoria e defina a sequência de apresentação. As posições são salvas no
            cadastro oficial e não alteram o cardápio público.
          </DialogDescription>
        </DialogHeader>

        <div className="est-organizador-corpo" data-testid="organizador-sabores">
          <label>
            Categoria
            <select
              value={categoria}
              onChange={(evento) => {
                setCategoria(evento.target.value as CategoriaSaborEstoque);
                setArrastando(null);
                setSobre(null);
                setErro("");
              }}
            >
              {categoriasSaboresEstoque.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
          </label>

          <p className="est-organizador-dica" role="status">
            {alterada
              ? "Sequência alterada. Salve para persistir ou restaure a sequência inicial."
              : "Sequência atual do cadastro."}
          </p>

          <ol className="est-organizador-lista" data-categoria={categoria}>
            {visiveis.map((chave, indice) => {
              const sabor = porChave.get(chave);
              if (!sabor) return null;
              return (
                <li
                  key={chave}
                  className={[
                    "est-organizador-item",
                    arrastando === indice ? "est-organizador-arrastando" : "",
                    sobre === indice ? "est-organizador-sobre" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  data-ordem={posicoes.get(chave)}
                  draggable={!ocupado}
                  onDragStart={(evento) => {
                    evento.dataTransfer.effectAllowed = "move";
                    evento.dataTransfer.setData("text/plain", String(indice));
                    setArrastando(indice);
                  }}
                  onDragOver={(evento) => {
                    evento.preventDefault();
                    evento.dataTransfer.dropEffect = "move";
                    setSobre(indice);
                  }}
                  onDrop={(evento) => soltar(evento, indice)}
                  onDragEnd={() => {
                    setArrastando(null);
                    setSobre(null);
                  }}
                >
                  <span className="est-organizador-posicao">{posicoes.get(chave)}</span>
                  <GripVertical size={18} aria-hidden className="est-organizador-alca" />
                  <strong>{sabor.nome}</strong>
                  <span className="est-organizador-acoes">
                    <button
                      type="button"
                      aria-label={`Subir ${sabor.nome}`}
                      title="Subir"
                      disabled={ocupado || indice === 0}
                      onClick={() => mover(indice, indice - 1)}
                    >
                      <ArrowUp size={17} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Descer ${sabor.nome}`}
                      title="Descer"
                      disabled={ocupado || indice === visiveis.length - 1}
                      onClick={() => mover(indice, indice + 1)}
                    >
                      <ArrowDown size={17} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>

          {confirmando && (
            <div className="est-organizador-confirmacao" role="alertdialog" aria-label="Confirmar restauração">
              <p>Restaurar a sequência exibida quando a janela foi aberta?</p>
              <div className="est-dialog-acoes">
                <button
                  type="button"
                  className="neia-a01-dourado"
                  disabled={ocupado}
                  onClick={() => {
                    setConfirmando(false);
                    void executar(inicial, "restaurar");
                  }}
                >
                  Confirmar restauração
                </button>
                <button type="button" disabled={ocupado} onClick={() => setConfirmando(false)}>
                  Voltar
                </button>
              </div>
            </div>
          )}

          {erro && <p role="alert">{erro}</p>}

          <div className="est-dialog-acoes">
            <button
              type="button"
              className="neia-a01-dourado"
              disabled={ocupado || !alterada}
              onClick={() => void executar(sequencia, "salvar")}
            >
              Salvar sequência
            </button>
            <button
              type="button"
              disabled={ocupado || !alterada || confirmando}
              onClick={() => setConfirmando(true)}
            >
              Restaurar sequência anterior
            </button>
            <button type="button" disabled={ocupado} onClick={fechar}>
              Cancelar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
