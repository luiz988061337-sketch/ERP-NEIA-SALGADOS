import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ENDPOINT_VERSAO,
  HEADER_VERSAO,
  ROTULO_BUILD,
  VERSAO_BUILD,
  VERSAO_MINIMA_BUILD,
  avaliarVersao,
  normalizarRespostaVersao,
  type AvaliacaoVersao,
} from "@/lib/versao-app";

/**
 * Guarda de versão do frontend (corte).
 *
 * Compara a versão do bundle em execução com a mínima exigida pelo servidor
 * (`GET /api/versao`, sempre `no-store`). Se estiver desatualizado, a
 * aplicação fica INUTILIZÁVEL: a tela de bloqueio cobre a interface e nenhum
 * fluxo de escrita é disponibilizado.
 *
 * Não depende de o usuário apertar F5: o bundle velho descobre sozinho que
 * está velho (lê a mínima do servidor) e se bloqueia.
 */
export function GuardaVersao({ children }: { children: React.ReactNode }) {
  const [avaliacao, setAvaliacao] = useState<AvaliacaoVersao | null>(null);

  useEffect(() => {
    let cancelado = false;
    const controller = new AbortController();

    async function verificar() {
      try {
        const resp = await fetch(ENDPOINT_VERSAO, {
          cache: "no-store",
          headers: { [HEADER_VERSAO]: VERSAO_BUILD },
          signal: controller.signal,
        });
        const payload = await resp.json().catch(() => null);
        if (cancelado) return;
        setAvaliacao(avaliarVersao(VERSAO_BUILD, normalizarRespostaVersao(payload)));
      } catch {
        if (cancelado) return;
        // Endpoint indisponível => fail-closed com a mínima assada no bundle.
        setAvaliacao(avaliarVersao(VERSAO_BUILD, null, VERSAO_MINIMA_BUILD));
      }
    }

    void verificar();
    return () => {
      cancelado = true;
      controller.abort();
    };
  }, []);

  // Enquanto verifica, não bloqueia (evita flicker); o bloqueio é fail-closed
  // apenas quando há decisão explícita de bloqueio.
  if (!avaliacao || !avaliacao.bloqueado) return <>{children}</>;

  return <TelaVersaoObrigatoria avaliacao={avaliacao} />;
}

function TelaVersaoObrigatoria({ avaliacao }: { avaliacao: AvaliacaoVersao }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Atualização obrigatória
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Esta versão do aplicativo foi desativada para a operação de corte.
          Recarregue a página para continuar usando a versão atual.
        </p>
        <dl className="mt-5 space-y-1 rounded-md bg-muted/40 p-3 text-left text-xs text-muted-foreground">
          <div className="flex justify-between gap-3">
            <dt>Versão em uso</dt>
            <dd className="font-mono">{avaliacao.versaoAtual}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Versão mínima</dt>
            <dd className="font-mono">{avaliacao.versaoMinima}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Motivo</dt>
            <dd className="font-mono">{avaliacao.motivo}</dd>
          </div>
        </dl>
        <Button
          className="mt-5 w-full"
          onClick={() => {
            // Recarga forçada: descarta o bundle em cache do Service Worker/HTTP.
            if (typeof window !== "undefined" && "caches" in window) {
              void (window as unknown as { caches?: { keys: () => Promise<string[]> } })
                .caches?.keys?.()
                .then((k) => Promise.all(k.map((x) => window.caches.delete(x))))
                .catch(() => undefined);
            }
            window.location.reload();
          }}
        >
          Recarregar agora
        </Button>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Rótulo do build: {ROTULO_BUILD}
        </p>
      </div>
    </div>
  );
}
