import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Slide = {
  id: string;
  imagem_url: string;
  legenda: string;
  ordem: number;
  ativo: boolean;
};

type Props = {
  slide: Slide;
  enviando: boolean;
  onAlternar: () => void;
  onSalvar: (campos: { legenda?: string; ordem?: number }) => void;
  onTrocarFoto: (file: File) => void;
  onExcluir: () => void;
};

export function SlideAdmin({
  slide,
  enviando,
  onAlternar,
  onSalvar,
  onTrocarFoto,
  onExcluir,
}: Props) {
  const [legenda, setLegenda] = useState(slide.legenda ?? "");
  const [ordem, setOrdem] = useState(slide.ordem ?? 0);
  const [editando, setEditando] = useState(false);

  // Reflete alteracoes feitas em outro lugar (ex.: outro slide deletado).
  useEffect(() => {
    setLegenda(slide.legenda ?? "");
    setOrdem(slide.ordem ?? 0);
  }, [slide.legenda, slide.ordem]);

  const sujo = legenda !== (slide.legenda ?? "") || ordem !== (slide.ordem ?? 0);

  return (
    <div className="rounded-lg border border-border p-3 text-sm">
      <div className="flex items-start gap-3">
        <img
          src={slide.imagem_url}
          alt=""
          className="h-16 w-28 shrink-0 rounded bg-muted object-contain"
        />

        <div className="min-w-0 flex-1 space-y-2">
          {editando ? (
            <>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor={`legenda-${slide.id}`}>
                  Legenda
                </label>
                <Input
                  id={`legenda-${slide.id}`}
                  value={legenda}
                  onChange={(e) => setLegenda(e.target.value)}
                  placeholder="Título que aparece sobre a foto"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor={`ordem-${slide.id}`}>
                  Ordem
                </label>
                <Input
                  id={`ordem-${slide.id}`}
                  type="number"
                  value={ordem}
                  onChange={(e) => setOrdem(Number(e.target.value) || 0)}
                  className="w-24"
                />
              </div>
            </>
          ) : (
            <div>
              <p className="font-semibold">{slide.legenda || "Sem legenda"}</p>
              <p className="text-xs text-muted-foreground">
                Ordem {slide.ordem} • {slide.ativo ? "Ativo" : "Inativo"}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {editando ? (
          <>
            <Button
              size="sm"
              disabled={!sujo}
              onClick={() => {
                onSalvar({ legenda: legenda.trim(), ordem });
                setEditando(false);
              }}
            >
              Salvar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setLegenda(slide.legenda ?? "");
                setOrdem(slide.ordem ?? 0);
                setEditando(false);
              }}
            >
              Cancelar
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
            <Pencil className="mr-1 size-3.5" /> Editar
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onAlternar}>
          {slide.ativo ? "Desativar" : "Ativar"}
        </Button>
        <Button size="sm" variant="outline" disabled={enviando} className="relative">
          Trocar foto
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            disabled={enviando}
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onTrocarFoto(file);
            }}
          />
        </Button>
        <Button size="sm" variant="ghost" onClick={onExcluir} aria-label="Excluir slide">
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
