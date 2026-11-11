import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import {
  autocompletarEnderecos,
  detalharPlaceId,
  type EnderecoDetalhado,
  type PredicaoEndereco,
} from "@/components/map-view";

/**
 * Busca inteligente de endereço (0103) — reutilizável no checkout do cliente,
 * no atendimento e nas configurações da loja (origem).
 *
 * Busca por rua, avenida, CEP, condomínio e estabelecimento (conforme o
 * provedor). Ao selecionar, devolve o endereço DETALHADO (logradouro, número,
 * bairro, cidade, UF, CEP, lat/lng, place_id e nível de precisão).
 */
export function AddressAutocomplete({
  aoSelecionar,
  placeholder = "Busque: rua, avenida, CEP ou condomínio…",
  className,
  disabled,
  textoInicial = "",
}: {
  aoSelecionar: (e: EnderecoDetalhado) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  textoInicial?: string;
}) {
  const [texto, setTexto] = useState(textoInicial);
  const [sugestoes, setSugestoes] = useState<PredicaoEndereco[]>([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [selecionando, setSelecionando] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (texto.trim().length < 3 || selecionando) {
      setSugestoes([]);
      return;
    }
    setCarregando(true);
    timerRef.current = setTimeout(async () => {
      const r = await autocompletarEnderecos(texto);
      setSugestoes(r);
      setAberto(r.length > 0);
      setCarregando(false);
    }, 350);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [texto]);

  useEffect(() => {
    const fora = (ev: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(ev.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  const escolher = async (p: PredicaoEndereco) => {
    setSelecionando(true);
    setAberto(false);
    setCarregando(true);
    const detalhe = await detalharPlaceId(p.placeId);
    setCarregando(false);
    setSelecionando(false);
    if (detalhe) {
      setTexto(p.descricao);
      setSugestoes([]);
      aoSelecionar(detalhe);
    }
  };

  return (
    <div ref={boxRef} className={`relative ${className ?? ""}`}>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onFocus={() => sugestoes.length > 0 && setAberto(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-9 text-sm"
          autoComplete="off"
        />
        {carregando ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      {aberto && sugestoes.length > 0 ? (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {sugestoes.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onClick={() => void escolher(s)}
                className="flex w-full items-start gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted"
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span>{s.descricao}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
