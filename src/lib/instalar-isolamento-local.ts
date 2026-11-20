/**
 * Import de inicialização da barreira local (FUNC-01-B1).
 *
 * Deve ser o primeiro import de `router.tsx` (navegador) e de `server.ts`
 * (SSR). Fora do modo `VITE_DEMO_PREVIEW=1` + `NEIA_AMBIENTE=teste` (SSR) ou
 * `VITE_NEIA_AMBIENTE=teste` (navegador), este módulo não instala nada.
 */
import { ativarBarreiraLocal } from "./isolamento-local";

ativarBarreiraLocal();
