/**
 * MARCADOR DE BUILD DE CORTE (compile-time).
 *
 * ============================================================================
 * POR QUE ISTO EXISTE
 * ============================================================================
 * As flags `VITE_FF_*` sao compile-time. Ligar a flag em um build NAO basta
 * para "tornar o caminho legado inalcancavel": o codigo legado continua
 * fisicamente no arquivo e, num bundle antigo em cache, continua executavel.
 *
 * Este modulo e o UNICO ponto de verdade sobre "este bundle e o bundle de
 * corte". Quando ligado, o bundle de corte:
 *   1. REMOVE fisicamente o caminho legado de criacao/cancelamento
 *      (o bloco legado fica atras de `if (!BUILD_DE_CORTE) { ... }`, que o
 *      bundler elimina por constant-folding - o codigo morto NAO chega ao
 *      bundle publicado);
 *   2. torna VERDADEIRA a attestation da criacao atomica
 *      (`fallback_checkout_removido`) - a afirmacao e literalmente verdadeira
 *      porque o fallback nao existe mais neste bundle;
 *   3. ativa o guard de versao (`src/lib/versao-app.ts`), que bloqueia
 *      bundles antigos que ainda estejam abertos em navegadores.
 *
 * ============================================================================
 * ATESTATION (C.3) - O QUE MUDA E POR QUE
 * ============================================================================
 * A doutrina original e: "variavel de ambiente sozinha NUNCA habilita o gate".
 * Ela continua valida: `avaliarGateCriacao`/`avaliarGate` so habilitam com
 * dependencias DECLARADAS, e `DEPENDENCIAS_*_PADRAO` continua tudo `false`.
 *
 * O que muda no bundle DE CORTE e a DECLARACAO das dependencias, e ela e
 * honesta: o codigo legado foi removido pelo mesmo interruptor de build que
 * declara a dependencia. Nao e "uma flag liga o fluxo"; e "o bundle de corte
 * nao contem o fallback, logo a dependencia `fallback_checkout_removido` e
 * verdadeira".
 *
 * Em qualquer build NAO de corte, o comportamento e identico ao de hoje:
 * dependencias `false` => gate "preparado" => nada executa.
 *
 * ============================================================================
 * ACESSO AO ENV
 * ============================================================================
 * O acesso e DIRETO (`import.meta.env.NOME`), sem casts e sem indexacao
 * dinamica. So assim o `define` do Vite substitui a expressao por um literal
 * ("on"/undefined) e o minificador consegue eliminar em tempo de build o
 * codigo morto. Um acesso via `(import.meta as any).env?.[nome]` NAO e
 * substituido e mantem o caminho legado no bundle.
 */

/** Bundle de corte: criacao atomica obrigatoria e fallback legado removido. */
export const BUILD_DE_CORTE: boolean = import.meta.env.VITE_FF_CRIACAO_ATOMICA === "on";

/** Bundle de corte: retirada de reserva explicita habilitada (0091). */
export const BUILD_DE_CORTE_CONSUMO: boolean = import.meta.env.VITE_FF_CONSUMO_RESERVA === "on";

/** Bundle de corte: cancelamento atomico obrigatorio (0093/0090). */
export const BUILD_DE_CORTE_CANCELAMENTO: boolean =
  import.meta.env.VITE_FF_CANCELAMENTO_ATOMICO === "on";

/**
 * `VITE_FF_RESERVA_ATOMICA` (0089) - arquitetura final do corte.
 *
 * A reserva de estoque e feita DENTRO da RPC `criar_pedido_com_reserva` (0095),
 * que chama `reservar_pedido_atomico` (0089) como SECURITY DEFINER. O
 * navegador NUNCA chama a 0089 diretamente. Portanto, no bundle de corte esta
 * flag e OFF de proposito: mantela-la ON seria afirmar um caminho que o cliente
 * nao exercita e abriria uma rota RPC desnecessaria.
 *
 * A reserva continua garantida - so muda quem a executa (o banco, nao o app).
 */
export const BUILD_DE_CORTE_RESERVA: boolean = import.meta.env.VITE_FF_RESERVA_ATOMICA === "on";
