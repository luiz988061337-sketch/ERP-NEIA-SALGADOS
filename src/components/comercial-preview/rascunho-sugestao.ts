import type { SegmentoCampanha } from "./campanhas-regras";

export type RascunhoSugestao = {
  nome: string;
  objetivo: string;
  segmento: SegmentoCampanha;
  mensagem: string;
};

export const CHAVE_RASCUNHO_SUGESTAO = "neia-preview-comercial-c3-rascunho";
