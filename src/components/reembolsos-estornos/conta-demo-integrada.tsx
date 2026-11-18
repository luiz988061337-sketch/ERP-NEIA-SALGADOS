import css from "@/components/reembolsos-estornos/cliente-publico.css?url";
import { ClientePreviewProvider } from "@/components/reembolsos-estornos/cliente-sessao";
import { MeusPedidos } from "@/routes/preview/reembolsos-estornos-cliente/index";

/**
 * Integração visual da versão R2-B de "Meus Pedidos" na rota pública /conta.
 * Usada somente no Preview de homologação. Estado e dados são fictícios.
 */
export function MinhaContaDemoR2B() {
  return (
    <>
      <link rel="stylesheet" href={css} />
      <ClientePreviewProvider>
        <MeusPedidos />
      </ClientePreviewProvider>
    </>
  );
}
