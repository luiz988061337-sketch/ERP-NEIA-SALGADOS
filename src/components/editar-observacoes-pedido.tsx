import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { podeEditarPedido } from "@/lib/pedido-status";

/**
 * Edição de observações com motivo obrigatório e auditoria no banco (migration
 * 0140). Nesta etapa nenhum outro campo do pedido é editável: a integração
 * comercial/estoque continua apenas especificada no contrato do módulo.
 */
export function EditarObservacoesPedido({
  pedidoId,
  numero,
  observacoes,
  onSalvo,
  className = "",
}: {
  pedidoId: string;
  numero: number;
  observacoes?: string | null | undefined;
  onSalvo?: (() => void | Promise<void>) | undefined;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(observacoes ?? "");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) setTexto(observacoes ?? "");
  }, [observacoes, aberto]);

  async function salvar() {
    const m = motivo.trim();
    if (m.length < 3) {
      toast.error("Informe o motivo da alteração (mínimo de 3 caracteres).");
      return;
    }
    setSalvando(true);
    try {
      const { data, error } = await supabase.rpc("editar_observacoes_pedido", {
        p_pedido_id: pedidoId,
        p_observacoes: texto,
        p_motivo: m,
      });
      if (error) throw error;
      if (data?.status === "sem_alteracao") {
        toast.info("As observações não foram alteradas.");
        setAberto(false);
        setMotivo("");
        return;
      }
      if (data?.status !== "editado") {
        toast.error(data?.status === "nao_autorizado"
          ? "Você não tem permissão para editar observações."
          : "A edição não foi registrada. Confira o pedido e tente novamente.");
        return;
      }
      toast.success(`Observações do pedido #${numero} atualizadas e auditadas.`);
      setAberto(false);
      setMotivo("");
      await onSalvo?.();
    } catch {
      toast.error("Não foi possível salvar. A edição exige a migration 0140.");
    } finally {
      setSalvando(false);
    }
  }

  const estiloDourado = {
    backgroundColor: "#FFD252",
    borderColor: "#FFD252",
    color: "#17110A",
  } as const;

  return (
    <div className="edicao-observacoes">
      <button
        type="button"
        className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 font-semibold ${className}`}
        style={estiloDourado}
        aria-expanded={aberto}
        onClick={() => {
          setTexto(observacoes ?? "");
          setMotivo("");
          setAberto((v) => !v);
        }}
      >
        <Pencil size={16} aria-hidden /> Editar pedido
      </button>
      {aberto && (
        <div className="edicao-observacoes-painel mt-2 space-y-2 rounded-lg border border-[#4e5861] bg-[#151c22] p-3 text-sm text-[#f5f7fa]">
          <label className="block">
            Observações
            <textarea
              className="mt-1 min-h-24 w-full rounded-md border border-[#4e5861] bg-[#10171d] p-2 text-sm text-[#f5f7fa]"
              maxLength={1000}
              value={texto}
              disabled={salvando}
              onChange={(e) => setTexto(e.target.value)}
            />
          </label>
          <label className="block">
            Motivo da alteração (obrigatório)
            <input
              className="mt-1 w-full rounded-md border border-[#4e5861] bg-[#10171d] p-2 text-sm text-[#f5f7fa]"
              maxLength={160}
              value={motivo}
              disabled={salvando}
              placeholder="Ex.: correção de observação informada pelo cliente"
              onChange={(e) => setMotivo(e.target.value)}
            />
          </label>
          <p className="text-xs text-[#bac5cc]">
            Nesta etapa apenas observações são alteradas. Itens, valores, pagamento,
            prazos e entrega permanecem bloqueados. O motivo fica registrado na auditoria.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex min-h-10 items-center rounded-md border border-[#4e5861] px-3 text-[#f5f7fa]"
              disabled={salvando}
              onClick={() => {
                setAberto(false);
                setMotivo("");
                setTexto(observacoes ?? "");
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="inline-flex min-h-10 items-center rounded-md border px-3 font-semibold"
              style={estiloDourado}
              disabled={salvando || motivo.trim().length < 3}
              aria-busy={salvando}
              onClick={() => void salvar()}
            >
              {salvando ? "Salvando…" : "Salvar alteração"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
