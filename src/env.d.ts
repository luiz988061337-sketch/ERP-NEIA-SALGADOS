/// <reference types="vite/client" />

/**
 * Tipagem explícita das variáveis de build do ERP Néia Salgados.
 *
 * Declarar cada `VITE_*` explicitamente (em vez de depender do index
 * signature de `vite/client`) permite ACESSO POR PONTO:
 *
 *     import.meta.env.VITE_FF_CRIACAO_ATOMICA
 *
 * O acesso por ponto é o que o `define` do Vite substitui por um literal em
 * tempo de build. Com indexação (`import.meta.env["..."]`) ou com cast
 * (`(import.meta as any).env`), a substituição NÃO acontece e o minificador
 * não consegue eliminar o código morto — o caminho legado continuaria no
 * bundle publicado.
 *
 * Ver `src/lib/corte.ts` e `src/lib/versao-app.ts`.
 */
interface ImportMetaEnv {
  /** Preview protegido com dados fictícios: desativa todo o acesso ao Supabase. */
  readonly VITE_DEMO_PREVIEW?: string;
  /** Espelho no navegador do marcador SSR NEIA_AMBIENTE=teste. */
  readonly VITE_NEIA_AMBIENTE?: string;
  readonly VITE_NEIA_MOTOBOY_RPC?: string;
  readonly VITE_NEIA_PREVIEW_URL?: string;
  readonly VITE_NEIA_PREVIEW_CHAVE?: string;
  // --- Flags de integração (compile-time) -------------------------------
  readonly VITE_FF_CRIACAO_ATOMICA?: string;
  readonly VITE_FF_RESERVA_ATOMICA?: string;
  readonly VITE_FF_CONSUMO_RESERVA?: string;
  readonly VITE_FF_CANCELAMENTO_ATOMICO?: string;

  // --- Protocolo de versão do frontend ----------------------------------
  /** Versão do bundle (epoch-ms em string). */
  readonly VITE_BUILD_VERSION?: string;
  /** Versão mínima exigida pelo servidor (fallback assado no bundle). */
  readonly VITE_VERSAO_MINIMA?: string;
  /** Rótulo legível do build. */
  readonly VITE_BUILD_LABEL?: string;

  // --- Demais flags já existentes no projeto ----------------------------
  readonly VITE_FF_ACEITE_ATENDENTE?: string;
  readonly VITE_FF_ATRIBUICAO_TX?: string;
  readonly VITE_FF_LIBERACAO_COZINHA?: string;
  readonly VITE_FF_CONFERENCIA_FINAL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
