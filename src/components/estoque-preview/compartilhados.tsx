import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DarkTable, DarkTableRow, StatusBadge } from "@/components/admin/erp-ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Movimento } from "./salgados";
import { situacao, type Suprimento } from "./suprimentos";

export const numero = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
export const dinheiro = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const data = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
export const plural = (u: string, n: number) => (n === 1 ? u : u === "galão" ? "galões" : `${u}s`);
export function Campo({
  label,
  name,
  value,
  type = "text",
  min,
  step,
  required = true,
}: {
  label: string;
  name: string;
  value?: string | number;
  type?: string;
  min?: number;
  step?: string | number;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`est-${name}`}>{label}</Label>
      <Input
        id={`est-${name}`}
        name={name}
        defaultValue={value}
        type={type}
        min={min}
        step={step}
        required={required}
      />
    </div>
  );
}
export function Seletor({
  label,
  name,
  value,
  children,
}: {
  label: string;
  name: string;
  value?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`est-${name}`}>{label}</Label>
      <select id={`est-${name}`} name={name} defaultValue={value} className="est-select">
        {children}
      </select>
    </div>
  );
}
export function ModalEstoque({
  titulo,
  descricao = "Demonstração local. Nenhuma operação será enviada ao banco.",
  fechar,
  children,
}: {
  titulo: string;
  descricao?: string;
  fechar: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto) fechar();
      }}
    >
      <DialogContent className="est-dialog max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function SituacaoItem({ item }: { item: Suprimento }) {
  const status = situacao(item);
  return (
    <StatusBadge tom={status === "ok" ? "ok" : status === "zerado" ? "perigo" : "atencao"}>
      {status === "ok"
        ? "✓ OK"
        : status === "configurar"
          ? "Configurar"
          : status === "zerado"
            ? "Sem saldo"
            : "Atenção"}
    </StatusBadge>
  );
}
export function HistoricoEstoque({
  movimentos,
  nomes,
}: {
  movimentos: Movimento[];
  nomes: Record<string, string>;
}) {
  return (
    <DarkTable
      colunas={[
        "Data",
        "Item / operação",
        "Quantidade",
        "Antes → Depois",
        "Justificativa / vínculo",
      ]}
      vazio={!movimentos.length ? "Sem movimentações nesta sessão." : undefined}
    >
      {movimentos.map((m) => (
        <DarkTableRow key={m.id}>
          <td>
            {data(m.data)}
            <small>{m.data.slice(11, 16)}</small>
          </td>
          <td>
            <b>{nomes[m.itemId]}</b>
            <small>{m.tipo}</small>
          </td>
          <td>
            {numero(m.quantidade)} {m.unidade}
          </td>
          <td>
            {numero(m.antes)} → {numero(m.depois)} {m.unidade}
          </td>
          <td>
            {m.motivo}
            <small>
              {m.referencia}
              {m.lotes ? ` • ${m.lotes}` : ""}
            </small>
          </td>
        </DarkTableRow>
      ))}
    </DarkTable>
  );
}
