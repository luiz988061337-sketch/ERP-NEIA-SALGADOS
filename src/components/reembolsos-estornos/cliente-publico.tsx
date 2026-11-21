import { Link } from "@tanstack/react-router";
import { Crown, Headphones, ShieldCheck } from "lucide-react";
import { DEFAULT_CRM_SETTINGS, useCrmSettings } from "@/lib/crm";
import { ehModoDemo } from "@/lib/demo-preview";

/**
 * Cartão de fidelidade da R2-B. Em demonstração os números vêm da configuração
 * padrão do CRM — nunca de pontos inventados. O saldo real do cliente, quando
 * houver sessão/autorização, é passado por prop.
 */
export function FidelidadeCliente({ pontos }: { pontos?: number } = {}) {
  // Em demonstração ignoramos o resultado da consulta (a rede é bloqueada no
  // preview) e usamos apenas a configuração padrão, sem inventar saldo.
  const consultaCrm = useCrmSettings();
  const settings = ehModoDemo() ? null : consultaCrm.data;
  const cfg = {
    ativo: settings?.fid_ativo ?? DEFAULT_CRM_SETTINGS.fid_ativo,
    metaPontos: settings?.fid_meta_pontos ?? DEFAULT_CRM_SETTINGS.fid_meta_pontos,
    recompensaValor: settings?.fid_recompensa_valor ?? DEFAULT_CRM_SETTINGS.fid_recompensa_valor,
  };
  if (!cfg.ativo) return null;
  const saldo = ehModoDemo()
    ? (pontos ?? 0)
    : (pontos ?? 0);
  const meta = Math.max(1, cfg.metaPontos);
  const falta = Math.max(0, meta - saldo);
  const largura = Math.min(100, Math.round((saldo / meta) * 100));
  return (
    <aside className="r2b-loyalty" aria-label="Plano Fidelidade Néia">
      <div className="r2b-loyalty-heading">
        <Crown size={28} />
        <div><h2>Plano Fidelidade Néia</h2><p>Seus pedidos valem recompensas!</p></div>
        <strong>{saldo} <small>pontos</small></strong>
      </div>
      <div className="r2b-loyalty-reward">
        <span>Ganhe um cupom de <b>R$ {cfg.recompensaValor.toFixed(2).replace(".", ",")}</b></span>
        <span>{saldo} / {meta} pts</span>
      </div>
      <div
        className="r2b-loyalty-progress"
        role="progressbar"
        aria-label="Pontos de fidelidade"
        aria-valuenow={saldo}
        aria-valuemin={0}
        aria-valuemax={meta}
      >
        <span style={{ width: `${largura}%` }} />
      </div>
      <p className="r2b-loyalty-note">
        {ehModoDemo()
          ? "Demonstração: nenhum ponto real é creditado."
          : falta > 0
            ? `Faltam ${falta} pontos para sua próxima recompensa!`
            : "Você já pode resgatar sua recompensa!"}
      </p>
    </aside>
  );
}

export function AjudaCliente({ detalhe = false }: { detalhe?: boolean }) {
  return (
    <section className="r2b-help r2b-gradient" data-testid="r2b-ajuda">
      <div className="r2b-help-copy">
        <ShieldCheck size={32} />
        <div><h2>Precisa de ajuda com {detalhe ? "este pedido" : "algum pedido"}?</h2>
          <p>Teve algum problema com os produtos, a entrega ou o pagamento?<br />Informe o ocorrido e solicite um reembolso total ou parcial, se aplicável.</p></div>
      </div>
      <div className="r2b-help-actions">
        <Link to="/preview/reembolsos-estornos-cliente/novo" className="r2b-button r2b-button-light">{detalhe ? "Informar problema ou solicitar reembolso" : "Solicitar reembolso ou estorno"}</Link>
        {detalhe && (
          <Link to="/ajuda" className="r2b-button r2b-button-glass">
            <Headphones size={16} /> Falar com a atendente
          </Link>
        )}
      </div>
    </section>
  );
}
