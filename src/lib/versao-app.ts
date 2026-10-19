/**
 * PROTOCOLO DE VERSÃO DO FRONTEND (corte) — módulo puro.
 *
 * ============================================================================
 * PROBLEMA
 * ============================================================================
 * As flags `VITE_FF_*` são COMPILE-TIME (`import.meta.env`). Um navegador
 * aberto ANTES do corte continua executando o bundle antigo (cache HTTP/bfcache/
 * service worker) e pode:
 *   - criar pedido pelo caminho legado (sem reserva atômica);
 *   - reservar por `reservar_estoque_atomica` (sem débito garantido);
 *   - cancelar por `UPDATE direto` (sem liberação atômica).
 *
 * Cache de navegador e variável de frontend NÃO são barreira de segurança.
 * A barreira real é o banco (revoke de DML/RPC legadas — ver
 * `docs/auditoria/homologacao-staging/pg16/cutover-lockdown.sql`).
 *
 * ============================================================================
 * SOLUÇÃO (menor solução segura)
 * ============================================================================
 * 1) Cada build recebe uma versão MONOTÔNICA e comparável
 *    (`VITE_BUILD_VERSION`, epoch-ms), gravada no bundle.
 * 2) O servidor publica `GET /api/versao` com `Cache-Control: no-store`,
 *    informando a versão MÍNIMA exigida. O valor mínimo pode ser:
 *      - `VERSAO_MINIMA` (variável de AMBIENTE do runtime — pode subir sem
 *        rebuild do cliente); ou
 *      - `VITE_VERSAO_MINIMA` (valor gravado no build — fallback).
 * 3) O bundle, ao iniciar, compara a PRÓPRIA versão (`VITE_BUILD_VERSION`) com a
 *    mínima vinda do servidor. Se `atual < minima` => a tela é BLOQUEADA e o
 *    app fica inutilizável até recarregar.
 *
 * Consequência: o bundle VELHO descobre sozinho que está velho, porque lê a
 * mínima do SERVIDOR (endpoint sempre no-store), e se auto-bloqueia. Não
 * depende de o usuário apertar F5.
 *
 * FAIL-CLOSED: se o endpoint não responder, o bundle usa a mínima assada no
 * próprio build (`VITE_VERSAO_MINIMA`) e, na ausência dela, BLOQUEIA.
 * Uma indisponibilidade de rede nunca libera um bundle velho.
 *
 * ============================================================================
 * COMPARAÇÃO
 * ============================================================================
 * A versão é epoch-ms (inteiro). A comparação é NUMÉRICA quando ambos os lados
 * são numéricos; caso contrário, comparação lexicográfica estável
 * (fallback para rótulos legados). Zero ("0") significa "build sem versão":
 *   - atual "0"  => SEMPRE bloqueado se há mínima > 0 (fail-closed);
 *   - minima "0" => não bloqueia (builds antigos sem política).
 */

/**
 * Versão deste bundle (epoch-ms). "0" = build sem versão.
 *
 * Acesso DIRETO ao env: só assim o `define` do Vite grava o literal no
 * bundle (ver `src/lib/corte.ts` para a mesma regra).
 */
export const VERSAO_BUILD: string = import.meta.env.VITE_BUILD_VERSION || "0";

/** Mínima assada no bundle (fallback fail-closed quando o endpoint falha). */
export const VERSAO_MINIMA_BUILD: string = import.meta.env.VITE_VERSAO_MINIMA || "0";

/** Rótulo legível do build (ex.: "cutover-2026-10-19T18:05Z-a1b2c3d"). */
export const ROTULO_BUILD: string = import.meta.env.VITE_BUILD_LABEL || "sem-rotulo";

/** Valor de comparação: número quando ambas as versões são numéricas. */
export function compararVersoes(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  const aNum = a !== "" && Number.isFinite(na);
  const bNum = b !== "" && Number.isFinite(nb);
  if (aNum && bNum) {
    if (na < nb) return -1;
    if (na > nb) return 1;
    return 0;
  }
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export type RespostaVersaoServidor = {
  ok: boolean;
  /** Versão mínima exigida pelo servidor. */
  minimo: string;
  /** Versão do build servido (o servidor e o cliente saem do mesmo build). */
  atual: string;
  /** Rótulo legível. */
  rotulo: string;
  /** `true` quando o servidor está em modo de corte (exige versão mínima). */
  corte: boolean;
  /** Motivo/observação operacional. */
  observacao?: string;
};

export type AvaliacaoVersao = {
  bloqueado: boolean;
  versaoAtual: string;
  versaoMinima: string;
  rotulo: string;
  motivo:
    | "ok"
    | "versao_desatualizada"
    | "sem_verificacao"
    | "servidor_sem_resposta";
};

/**
 * Avalia se o bundle em execução pode operar.
 *
 * @param versaoAtual  versão do bundle em execução (normalmente VERSAO_BUILD)
 * @param resposta     resposta de `GET /api/versao` (null se indisponível)
 * @param minimaLocal  mínima assada no bundle (usada se a resposta for null)
 */
export function avaliarVersao(
  versaoAtual: string,
  resposta: RespostaVersaoServidor | null | undefined,
  minimaLocal: string = VERSAO_MINIMA_BUILD,
): AvaliacaoVersao {
  const atual = versaoAtual || "0";
  if (!resposta || !resposta.ok) {
    // Falha do endpoint: usa a mínima local; se não houver mínima local,
    // BLOQUEIA (fail-closed) — nunca liberar bundle velho por indisponibilidade.
    const minimo = minimaLocal || "0";
    const bloqueado = compararVersoes(atual, minimo) < 0 || minimo === "0";
    return {
      bloqueado,
      versaoAtual: atual,
      versaoMinima: minimo,
      rotulo: ROTULO_BUILD,
      motivo: bloqueado ? "servidor_sem_resposta" : "ok",
    };
  }
  const minimo = resposta.minimo || minimaLocal || "0";
  const bloqueado = compararVersoes(atual, minimo) < 0;
  return {
    bloqueado,
    versaoAtual: atual,
    versaoMinima: minimo,
    rotulo: resposta.rotulo || ROTULO_BUILD,
    motivo: bloqueado ? "versao_desatualizada" : "ok",
  };
}

/** Endpoint do servidor que publica a versão mínima. */
export const ENDPOINT_VERSAO = "/api/versao";

/** Cabeçalho enviado pelo cliente ao servidor (auditoria de versão em uso). */
export const HEADER_VERSAO = "x-neia-build";

/** Normaliza a resposta HTTP do endpoint em `RespostaVersaoServidor | null`. */
export function normalizarRespostaVersao(payload: unknown): RespostaVersaoServidor | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  if (o["ok"] !== true) return null;
  const minimo = typeof o["minimo"] === "string" ? o["minimo"] : "";
  const atual = typeof o["atual"] === "string" ? o["atual"] : "";
  if (!minimo || !atual) return null;
  const observacao = typeof o["observacao"] === "string" ? o["observacao"] : undefined;
  return {
    ok: true,
    minimo,
    atual,
    rotulo: typeof o["rotulo"] === "string" ? o["rotulo"] : "",
    corte: o["corte"] === true,
    ...(observacao !== undefined ? { observacao } : {}),
  };
}
